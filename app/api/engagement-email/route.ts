// ============================================================
// API ROUTE: /api/engagement-email
// Sends one of the two config-driven engagement emails (see
// buildScopeEmail / buildTriPartyEmail in src/lib/email.ts):
//   * stage 'scope'    -- coach to client, setting out the journey.
//   * stage 'triparty' -- to all parties, the Charter is ready to review.
//
// Service-role route (it reads the engagement config, parties and programme
// across tables), so it authenticates the caller itself and only allows a
// super_coach or an assigned co-implementer -- the same set can_manage_client_access
// grants, re-derived here server-side. Recipients, subjects, the client
// name, the engagement title and the coach name are all loaded from the
// engagement, so nothing is hardcoded to any one client.
//
// When email is not configured (no RESEND_API_KEY) it does NOT crash: it
// returns a clear JSON with emailConfigured=false so the caller can fall
// back to showing the journey link on screen.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cleanRecipients, isWebUrl } from '@/lib/validate-input'
import { getBearerToken } from '@/lib/auth/api-authz'
import { resolveClientAccess } from '@/lib/auth/engagement-access'
import { checkRateLimit } from '@/lib/rate-limit'
import { briefFromConfig, briefIntoConfig } from '@/lib/engagement-brief'
import { signInLinkFor } from '@/lib/signin-link'
import {
  emailAvailable,
  sendEmail,
  buildScopeEmail,
  letterText,
  buildTriPartyEmail,
  type EngagementEmailConfig,
} from '@/lib/email'

type Stage = 'scope' | 'triparty'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const { clientId, stage, recipients, journeyUrl, preview, audience, recipientName, recipientTitle, wantText, includeSignIn, onlyEmails } = (await req.json()) as {
      clientId?: string
      stage?: Stage
      recipients?: string[]
      journeyUrl?: string
      preview?: boolean
      audience?: 'payer' | 'served' | 'co_implementer'
      recipientName?: string
      recipientTitle?: string
      wantText?: boolean
      includeSignIn?: boolean
      /**
       * SENDING TO ONE PERSON WITHOUT WRITING TO EVERYBODY AGAIN.
       * 8 September 2026.
       *
       * Somebody added to an engagement after the letters have gone needs the
       * letter. There was no way to send it to them alone: the send walked
       * every saved recipient, so the only way to reach the new person was to
       * post a second copy to the people who already had one.
       *
       * These addresses narrow the send. They never widen it: each one has to
       * already be a saved recipient on this engagement, so this cannot become
       * a way to send the platform's letter to an arbitrary address.
       */
      onlyEmails?: string[]
    }
    // A PREVIEW IS THE SAME EMAIL, NOT A SECOND COPY OF IT. 4 September 2026.
    // Habib asked where he could read the welcome before it went to a client.
    // Building it twice — once to show, once to send — is how the two drift
    // apart and the reassuring preview stops being what anybody receives. So
    // this is the same route, the same authorisation and the same builder,
    // stopping one line short of handing it to the provider.
    const isPreview = preview === true

    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    // Who is asking is settled before anything about what they asked for.
    // This used to validate the stage, the recipient list and the link first,
    // so a caller with no login learned the shape of a valid request and which
    // parts of theirs were wrong. Nothing was ever sent, but answering a
    // stranger's questions is not the job of a route that refuses them.
    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const admin = getAdminClient()
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    if (stage !== 'scope' && stage !== 'triparty') {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
    }
    // An unbounded recipient list turns one authorised send into a mailshot,
    // and a link that is not a web address is a way to hand a reader something
    // other than the page they think they are opening.
    // Nothing is addressed on a preview, so an empty list is not an error.
    const cleaned = isPreview && (!recipients || recipients.length === 0)
      ? { ok: true as const, recipients: [] as string[] }
      : cleanRecipients(recipients)
    if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 })
    if (!isWebUrl(journeyUrl)) {
      return NextResponse.json({ error: 'The journey link must be a web address' }, { status: 400 })
    }

    // Authorization goes through resolveClientAccess, the same helper every
    // other route uses. This block used to re-derive the rule by hand, reading
    // the profile and the co-implementer's client list itself. It agreed with
    // the helper, but two copies of an access rule is one copy too many: the
    // day the rule changes, whichever copy nobody remembers becomes a hole.
    const access = await resolveClientAccess(admin, user.id, clientId)
    if (!access.canManage) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    const actor = { full_name: access.fullName, role: access.role }

    // Each send fans out to a list of recipients; cap how many sends one
    // account can trigger per hour so the endpoint can't spray mail.
    const rl = isPreview
      ? { allowed: true, retryAfter: 0 }
      : await checkRateLimit(admin, `engagement-email:${user.id}`, 30, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many emails sent recently. Please wait a while before sending more.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    // Load the engagement to fill the template. Everything is config driven:
    //   clientName -- the client (LSP) being coached.
    //   engagementTitle -- a per-engagement brand override, else the programme
    //                      name, else the client name.
    //   coachName       -- the lead consultant party, else the sender's name.
    const { data: client, error: clientErr } = await admin
      .from('engagement_clients')
      .select('name, programme_id, engagement_mode')
      .eq('id', clientId)
      .single()
    if (clientErr || !client) {
      return NextResponse.json({ error: 'Could not load the engagement client' }, { status: 404 })
    }

    const { data: config } = await admin
      .from('engagement_config')
      .select('brand_overrides')
      .eq('client_id', clientId)
      .maybeSingle()

    const { data: parties } = await admin
      .from('engagement_parties')
      .select('party_role, name, email')
      .eq('client_id', clientId)

    let programmeName: string | null = null
    if (client.programme_id) {
      const { data: programme } = await admin
        .from('programmes')
        .select('name')
        .eq('id', client.programme_id)
        .maybeSingle()
      programmeName = programme?.name ?? null
    }

    const brief = briefFromConfig(config?.brand_overrides)
    const brand = (config?.brand_overrides as Record<string, unknown> | null) || null
    const brandTitle = typeof brand?.engagement_title === 'string' ? brand.engagement_title : null
    const leadConsultant = (parties || []).find((p) => p.party_role === 'lead_consultant')

    const clientName = client.name
    const engagementTitle = brandTitle || programmeName || client.name
    const coachName = leadConsultant?.name || actor?.full_name || 'The Canvas Coach'
    // A funder's finance lead replying to a signed consulting letter should not
    // hit an address whose own name tells them not to expect an answer.
    const replyAddress = (leadConsultant as { email?: string } | undefined)?.email
      || 'habib@habibonifade.com'

    const cfg: EngagementEmailConfig = {
      engagementTitle,
      clientName,
      coachName,
      journeyUrl,
      engagementMode: (client as { engagement_mode?: string }).engagement_mode || 'canvas',
      brief,
      signInIncluded: includeSignIn === true,
      audience: audience === 'payer' ? 'payer' : audience === 'co_implementer' ? 'co_implementer' : 'served',
      recipientName: typeof recipientName === 'string' ? recipientName.trim().slice(0, 120) || undefined : undefined,
      recipientTitle: typeof recipientTitle === 'string' ? recipientTitle.trim().slice(0, 16) || undefined : undefined,
    }

    const { subject, html } = stage === 'scope' ? buildScopeEmail(cfg) : buildTriPartyEmail(cfg)

    // Read it before anybody else does. Built by the line above, so there is
    // no second version of this email anywhere. wantText also returns the
    // GENERATED letter as editable text, which is what the editor loads when
    // there is nothing saved to edit yet.
    if (isPreview) {
      return NextResponse.json({
        ok: true, preview: true, stage, subject, html,
        ...(wantText && stage === 'scope' ? { text: letterText(cfg) } : {}),
      })
    }

    // Outbound email not being configured is not a crash: say so plainly, so
    // the caller can share the journey link instead. Checked here rather than
    // at the top so a preview still works on an environment that cannot send.
    if (!emailAvailable()) {
      return NextResponse.json({
        ok: false,
        emailConfigured: false,
        message: 'Email is not configured on this environment. Share the journey link directly instead.',
      })
    }

    // ONE LETTER, WITH THE WAY IN INSIDE IT. A client holding a letter about a
    // platform they cannot open, waiting on a second message from a different
    // sender, is the opposite of the first impression this is for. When the
    // sign-in is included, each recipient gets their own one-time link as the
    // button, so the letter has to be built and sent per person.
    // EVERYONE, BY NAME, AT THE SAME TIME.
    //
    // An engagement is not two people. Tanager alone has the overall lead, the
    // procurement lead, the country representative and the finance lead, and
    // all of them should receive this together rather than one forwarding it.
    // Each person is sent their own letter: their salutation, the copy for
    // their side of the engagement, and their own one-time sign-in link. That
    // rules out To/CC, which would put one salutation and one link in front of
    // everybody and expose the whole list to each of them.
    // ONE LIST OF PEOPLE. 9 September 2026. Who gets a letter is read off the
    // engagement's party list, where their name, title and address already
    // live, instead of a second list of the same names kept in the brief.
    const { data: partyRows } = await admin
      .from('engagement_parties')
      .select('id, name, title, email, letter')
      .eq('client_id', clientId)
      .order('sort_order', { ascending: true })
    const fromParties = (partyRows || [])
      .filter((p) => (p.letter === 'payer' || p.letter === 'served') && p.email)
      .map((p) => ({
        id: p.id as string,
        email: p.email as string,
        name: (p.name as string) || undefined,
        title: (p.title as string) || undefined,
        audience: p.letter as 'payer' | 'served' | 'co_implementer',
      }))

    const saved = fromParties.length
      ? fromParties
      : cleaned.recipients.map((email) => ({
          email,
          name: recipientName,
          title: recipientTitle,
          audience: (audience === 'payer' ? 'payer' : audience === 'co_implementer' ? 'co_implementer' : 'served') as 'payer' | 'served' | 'co_implementer',
        }))

    // Narrowed, never widened. An address that is not already on this
    // engagement is refused by name rather than silently dropped, because
    // silently sending to fewer people than asked is how somebody is missed.
    let list = saved
    if (Array.isArray(onlyEmails) && onlyEmails.length) {
      const wanted = new Set(onlyEmails.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))
      const known = new Set(saved.map((p) => p.email.toLowerCase()))
      const strangers = Array.from(wanted).filter((e) => !known.has(e))
      if (strangers.length) {
        return NextResponse.json({
          error: `${strangers.join(', ')} ${strangers.length === 1 ? 'is not' : 'are not'} on this engagement. Add them to the recipients and save before sending.`,
        }, { status: 400 })
      }
      list = saved.filter((p) => wanted.has(p.email.toLowerCase()))
      if (!list.length) {
        return NextResponse.json({ error: 'Nobody was chosen to send to' }, { status: 400 })
      }
    }

    if (stage === 'scope' && (includeSignIn || (brief.recipients && brief.recipients.length))) {
      const sentTo: string[] = []
      const failed: { email: string; reason: string }[] = []
      for (const person of list) {
        try {
          let cta = journeyUrl as string
          if (includeSignIn) {
            const linked = await signInLinkFor(admin, person.email, journeyUrl as string, {
              full_name: person.name || null,
            })
            // Wrapped so a mail scanner's GET cannot spend the token. See
            // app/welcome/page.tsx for what that costs and why.
            const origin = new URL(journeyUrl as string).origin
            cta = `${origin}/welcome#to=${encodeURIComponent(linked.link)}`
            // A LINK WITHOUT A ROLE IS A DOOR INTO AN EMPTY ROOM.
            //
            // The link signs them in. Without a user_profiles row saying who
            // they are, they arrive scoped to nothing: no engagement, no
            // programme, an empty dashboard, and a first impression spent.
            //
            // The two sides get the two roles the platform already has. Someone
            // on the served organisation's letter is its chief executive, scoped
            // to this engagement. Someone on the payer's letter is a funder,
            // scoped to the programme and read only everywhere by
            // resolveClientAccess. Nobody is given anything by being emailed a
            // letter that they could not have been given by being invited.
            //
            // Only ever created, never downgraded: a person who already has a
            // login keeps the role they have, so sending a second copy of the
            // welcome cannot demote a super_coach to a funder.
            const { data: already } = await admin
              .from('user_profiles').select('id, role').eq('id', linked.userId || '').maybeSingle()
            // A CO-IMPLEMENTER IS NOT GIVEN ACCESS BY BEING SENT A LETTER.
            // 9 September 2026. A co-implementer manages the clients assigned
            // to them, which is the strongest access this platform hands out
            // short of the lead consultant's own. Creating that from "send the
            // welcome letter" would make an email into a grant of manage
            // rights. They are added under the co-implementer screen, which is
            // where somebody is choosing to give it, and the letter follows.
            if (linked.userId && !already && person.audience === 'co_implementer') {
              throw new Error(
                'they do not have a login yet. Add them under the co-implementer screen first, '
                + 'which is where their access is granted, then send this letter',
              )
            }
            if (linked.userId && !already) {
              const isPayer = person.audience === 'payer'
              const { error: profErr } = await admin.from('user_profiles').insert({
                id: linked.userId,
                role: isPayer ? 'funder' : 'ceo',
                full_name: person.name || person.email,
                email: person.email,
                engagement_client_id: isPayer ? null : clientId,
                funder_programme_id: isPayer ? (client.programme_id || null) : null,
                assigned_unit_ids: [],
                co_implementer_id: null,
                status: 'invited',
              })
              if (profErr) {
                // Sending anyway would hand this person a working link into an
                // empty account, which is worse than not sending to them. It is
                // only a reason to skip THIS recipient: the loop below records
                // it against their address and carries on with the rest.
                throw new Error(`the login could not be set up (${profErr.message})`)
              }
            }
          }
          const personal = buildScopeEmail({
            ...cfg,
            audience: person.audience,
            recipientName: person.name,
            recipientTitle: person.title,
            journeyUrl: cta,
            signInIncluded: includeSignIn === true,
          })
          const one = await sendEmail({
            to: person.email, subject: personal.subject, html: personal.html,
            replyTo: replyAddress, text: letterText({ ...cfg, audience: person.audience }),
            // A COPY IN THE SENDER'S OWN INBOX. These letters go out through
            // the email provider under the platform's own address, so they
            // never appear in Habib's Sent folder and he has no record of what
            // each person actually received. A blind copy to the lead
            // consultant is that record, and it is blind so no recipient sees
            // it or sees the rest of the list.
            bcc: replyAddress,
          })
          if (one.sent) sentTo.push(person.email)
          else failed.push({ email: person.email, reason: one.reason || 'the provider refused it' })
        } catch (e: unknown) {
          failed.push({ email: person.email, reason: (e as Error)?.message || 'no sign-in link could be made' })
        }
      }
      // WRITE DOWN WHO ACTUALLY GOT IT. Only the addresses the provider
      // accepted, and on the person themselves, so the record sits beside
      // every other fact about them. A person sent to twice keeps the later
      // stamp, which is the one that answers "when did they last hear from us".
      if (sentTo.length && fromParties.length) {
        const justSent = new Set(sentTo.map((e) => e.toLowerCase()))
        const stampedAt = new Date().toISOString()
        for (const person of fromParties) {
          if (!justSent.has(person.email.toLowerCase())) continue
          const { error: stampError } = await admin
            .from('engagement_parties')
            .update({ letter_sent_at: stampedAt, updated_at: stampedAt })
            .eq('id', person.id)
          // A letter that went out and a note that did not is worth saying out
          // loud: the next send will offer to write to that person again.
          if (stampError) console.error('engagement-email: could not record the send against', person.email, stampError)
        }
      }

      if (!sentTo.length) {
        return NextResponse.json({
          ok: false, emailConfigured: true,
          reason: failed.map((f) => `${f.email}: ${f.reason}`).join('; ') || 'nothing was sent',
        }, { status: 502 })
      }
      return NextResponse.json({
        ok: true, stage, recipients: sentTo.length, sentTo, failed,
        // Named, so a partial send is never reported as a whole one.
        reason: failed.length
          ? `Sent to ${sentTo.length}. Not sent to ${failed.map((f) => `${f.email} (${f.reason})`).join('; ')}`
          : undefined,
      })
    }

    // ONE MESSAGE PER PERSON, ALWAYS. A shared To: header on the tri-party
    // Charter email showed the payer's and the served organisation's addresses
    // to each other, which for two commercially separate parties is a
    // confidentiality lapse rather than a style problem.
    const results = await Promise.all(cleaned.recipients.map((one) =>
      sendEmail({ to: one, subject, html, replyTo: replyAddress })))
    const result = results.find((r) => r.sent) || results[0] || { sent: false, reason: 'nobody to send to' }
    if (!result.sent) {
      // The provider rejected the send (bad key, provider error). Report it
      // without crashing so the caller can retry or show the link.
      return NextResponse.json({ ok: false, emailConfigured: true, reason: result.reason }, { status: 502 })
    }

    return NextResponse.json({ ok: true, stage, recipients: cleaned.recipients.length })
  } catch (e: any) {
    console.error('engagement-email: unexpected error', e)
    return NextResponse.json({ error: 'Could not send the engagement email' }, { status: 500 })
  }
}
