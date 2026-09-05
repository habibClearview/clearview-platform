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
import { briefFromConfig } from '@/lib/engagement-brief'
import {
  emailAvailable,
  sendEmail,
  buildScopeEmail,
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
    const { clientId, stage, recipients, journeyUrl, preview, audience, recipientName } = (await req.json()) as {
      clientId?: string
      stage?: Stage
      recipients?: string[]
      journeyUrl?: string
      preview?: boolean
      audience?: 'payer' | 'served'
      recipientName?: string
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
      .select('party_role, name')
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

    const brand = (config?.brand_overrides as Record<string, unknown> | null) || null
    const brandTitle = typeof brand?.engagement_title === 'string' ? brand.engagement_title : null
    const leadConsultant = (parties || []).find((p) => p.party_role === 'lead_consultant')

    const clientName = client.name
    const engagementTitle = brandTitle || programmeName || client.name
    const coachName = leadConsultant?.name || actor?.full_name || 'The Canvas Coach'

    const cfg: EngagementEmailConfig = {
      engagementTitle,
      clientName,
      coachName,
      journeyUrl,
      engagementMode: (client as { engagement_mode?: string }).engagement_mode || 'canvas',
      brief: briefFromConfig(config?.brand_overrides),
      audience: audience === 'payer' ? 'payer' : 'served',
      recipientName: typeof recipientName === 'string' ? recipientName.trim().slice(0, 80) || undefined : undefined,
    }

    const { subject, html } = stage === 'scope' ? buildScopeEmail(cfg) : buildTriPartyEmail(cfg)

    // Read it before anybody else does. Built by the line above, so there is
    // no second version of this email anywhere.
    if (isPreview) {
      return NextResponse.json({ ok: true, preview: true, stage, subject, html })
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

    const result = await sendEmail({ to: cleaned.recipients, subject, html })
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
