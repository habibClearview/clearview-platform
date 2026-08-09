// ============================================================
// API ROUTE: /api/invoice-pack
// Assembling, approving and sending a milestone claim.
//
// WHAT A PACK IS. A claim against a deliverable, with the decision gates that
// evidence it, the evidence entries that closed those gates, and the
// signatures that closed them. A funder should be able to read it and check
// the claim without asking for anything else.
//
// WHAT ASSEMBLY WILL NOT DO. It will not assemble a pack for a deliverable
// whose gate mappings have not been approved, because an unapproved mapping is
// a suggestion and a claim built on a suggestion is a claim built on nothing.
// It will not quietly leave out a gate that has no evidence either. Missing
// evidence is reported in the pack, so the person approving it sees the gap
// before the funder does.
//
// WHY THE PACK IS A SNAPSHOT. What was claimed has to stay what was claimed.
// Evidence edited a month later must not change a claim already submitted, so
// assembly copies the evidence as it stands and re-assembling makes a new pack
// rather than rewriting the old one.
//
// THE APPROVAL STEP IS NOT OPTIONAL. The covering note may be drafted with
// assistance, but nothing is sent until a person has read the pack and pressed
// approve, and the record says who did.
//
//   POST   action: 'assemble' | 'approve' | 'send' | 'withdraw'
//   GET    ?packId=  one pack in full
//
// Manage rights throughout. The fee is between the consultant and whoever
// pays, and the organisation being coached has no part in it.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { CLEARVIEW_STYLE } from '@/lib/ai-style'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'
import { buildClaimPack } from '@/lib/claim-pack-builder'
import { brandedEmail, emailAvailable, escapeHtml, raw, sendEmail } from '@/lib/email'


type Admin = ReturnType<typeof getAdminClient>

/**
 * Manage rights on this engagement, through the one shared helper. This used
 * to be a local copy in every route, in slightly different shapes, which is
 * how a fix lands in one place and leaves the hole in six others.
 */
async function requireManager(req: NextRequest, admin: Admin, clientId: string) {
  return requireAccess(req, admin, clientId, 'manage', {
    deniedMessage: 'The fee and the claims are not part of what you can see',
    rateLimit: { key: 'invoice-pack', max: 40, windowSeconds: 3600 },
  })
}

function money(amount: number | null, currency: string) {
  if (amount === null || amount === undefined) return 'Amount not stated'
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

/** Draft the covering note. Assistance is optional; the pack works without it. */
async function draftCoveringNote(payload: unknown): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 900,
        system: [
          'You are drafting the covering note for a milestone claim on a consulting engagement.',
          'Work only from the pack supplied. Never claim a piece of evidence that is not listed, and never describe work that is not in the pack.',
          'Say in the first sentence what is being claimed and against which deliverable.',
          'Then, in one short paragraph, say what was delivered and name the evidence that supports it, referring to the evidence by its reference.',
          'If a gate in the pack has no evidence recorded, or is not signed, say so plainly in its own sentence. Do not soften it and do not omit it. The person reading this needs to see the gap before the funder does.',
          'End with one sentence on what happens next.',
          'Four short paragraphs at most. This is a covering note, not a report.',
          CLEARVIEW_STYLE,
        ].join(' '),
        messages: [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const text = (json?.content || []).map((c: any) => c?.text || '').join('').trim()
    return text || null
  } catch {
    return null
  }
}

async function assemble(admin: Admin, clientId: string, deliverableId: string) {
  const { data: deliverable } = await admin
    .from('engagement_deliverables').select('*').eq('id', deliverableId).maybeSingle()
  if (!deliverable || deliverable.client_id !== clientId) {
    return NextResponse.json({ error: 'That deliverable is not on this engagement' }, { status: 404 })
  }

  const { data: mappings } = await admin
    .from('deliverable_gate_map').select('*').eq('deliverable_id', deliverableId)

  const all = mappings || []
  const approved = all.filter((m: any) => m.approved)

  if (all.length === 0) {
    return NextResponse.json(
      { error: 'This deliverable is not mapped to any decision gate yet, so there is nothing to evidence the claim.' },
      { status: 409 },
    )
  }
  if (approved.length === 0) {
    return NextResponse.json(
      { error: 'The gate mappings on this deliverable are still proposals. Approve the ones that are right before claiming against them.' },
      { status: 409 },
    )
  }

  const dpIds = approved.map((m: any) => m.dp_id)

  const [gatesRes, evidenceRes, sigsRes] = await Promise.all([
    admin.from('canvas_decision_points')
      .select('dp_id, label, status, evidence_summary, ceo_signed_off, completed_at')
      .eq('client_id', clientId).in('dp_id', dpIds),
    // The column names here are the ones evidence_library actually has. They
    // used to be date_captured and captured_by, which do not exist on it, so
    // the query failed, the failure was swallowed by `|| []` below, and every
    // claim pack ever assembled carried zero evidence while looking like it had
    // simply found none. Only the gates it maps to and their signatures came
    // through. Found by assembling a real claim on an engagement holding twelve
    // evidence entries and getting an empty list back.
    admin.from('evidence_library')
      .select('reference, date, uploaded_by, type, description, reliability, status, dp_id')
      .eq('client_id', clientId).in('dp_id', dpIds),
    admin.from('gtcv_gate_signoffs')
      .select('dp_id, signer_role, signer_name, decision, signed_at')
      .eq('client_id', clientId).in('dp_id', dpIds),
  ])

  // A failed read here is not the same as a gate with nothing behind it, and
  // the difference decides whether the pack reports a gap or hides one. The
  // three that make up the claim are refused rather than quietly turned into an
  // empty pack, because a claim that says "no evidence" when the evidence is
  // there is worse than a claim that will not assemble.
  const readFailure = gatesRes.error || evidenceRes.error || sigsRes.error
  if (readFailure) {
    console.error('invoice-pack assemble: could not read the evidence', readFailure)
    return NextResponse.json(
      { error: 'Could not read the evidence behind this claim, so nothing was assembled. Nothing has been saved.' },
      { status: 500 },
    )
  }

  const gateRows = gatesRes.data || []
  const evidenceRows = evidenceRes.data || []
  const sigRows = sigsRes.data || []

  // A gate with no evidence and no signature is a gap, and the pack says so
  // rather than presenting a claim that looks complete.
  const gates = approved.map((m: any) => {
    const gate = gateRows.find((g: any) => g.dp_id === m.dp_id)
    const evidence = evidenceRows.filter((e: any) => e.dp_id === m.dp_id && e.status !== 'archived')
    const signatures = sigRows.filter((s: any) => s.dp_id === m.dp_id && s.decision === 'signed')
    return {
      dp_id: m.dp_id,
      label: gate?.label || m.dp_id,
      required_evidence: m.required_evidence,
      gate_status: gate?.status || 'not_started',
      what_it_established: gate?.evidence_summary || null,
      evidence_count: evidence.length,
      signature_count: signatures.length,
      gap: evidence.length === 0
        ? 'No evidence is recorded against this gate'
        : signatures.length === 0
          ? 'This gate has evidence but has not been signed'
          : null,
    }
  })

  const packEvidence = evidenceRows.filter((e: any) => dpIds.includes(e.dp_id) && e.status !== 'archived')
  const packSignatures = sigRows.filter((s: any) => s.decision === 'signed')

  const { count: priorPacks } = await admin
    .from('engagement_invoice_packs').select('id', { count: 'exact', head: true }).eq('client_id', clientId)
  const reference = `CLM-${String((priorPacks || 0) + 1).padStart(3, '0')}`

  const coveringNote = await draftCoveringNote({
    reference,
    deliverable: {
      code: deliverable.code,
      title: deliverable.title,
      description: deliverable.description,
      milestone: deliverable.milestone_label || deliverable.milestone_no,
      amount: deliverable.payment_amount,
      currency: deliverable.payment_currency,
    },
    gates,
    evidence: packEvidence,
    signatures: packSignatures,
  })

  const { data: made, error } = await admin
    .from('engagement_invoice_packs')
    .insert({
      client_id: clientId,
      deliverable_id: deliverableId,
      reference,
      amount: deliverable.payment_amount,
      // No fallback. A claim whose deliverable has no currency shows the
      // amount as a plain number, which is what the deliverable itself does.
      currency: deliverable.payment_currency || null,
      period_label: deliverable.due_window,
      gates,
      evidence: packEvidence,
      signatures: packSignatures,
      covering_note: coveringNote,
      status: 'draft',
    })
    .select('id, reference')
    .single()

  if (error) {
    console.error('invoice-pack assemble: write failed', error)
    return NextResponse.json({ error: 'Could not assemble the claim' }, { status: 500 })
  }

  const gaps = gates.filter((g: any) => g.gap)
  return NextResponse.json({
    ok: true,
    id: made.id,
    reference: made.reference,
    gaps: gaps.map((g: any) => `${g.label}: ${g.gap}`),
    draftedNote: Boolean(coveringNote),
  })
}

export async function GET(req: NextRequest) {
  try {
    const packId = req.nextUrl.searchParams.get('packId')
    const clientId = req.nextUrl.searchParams.get('clientId')
    const format = req.nextUrl.searchParams.get('format')
    if (!packId || !clientId) return NextResponse.json({ error: 'Missing packId or clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const { data } = await admin.from('engagement_invoice_packs').select('*').eq('id', packId).maybeSingle()
    if (!data || data.client_id !== clientId) {
      return NextResponse.json({ error: 'That claim is not on this engagement' }, { status: 404 })
    }

    // A funder receives a document, not a screen. Built from the stored pack
    // and nothing else, so what downloads today is what was claimed then, even
    // if the evidence has been edited since.
    if (format === 'docx') {
      const [{ data: deliverable }, { data: client }, { data: config }] = await Promise.all([
        admin.from('engagement_deliverables')
          .select('title, code, milestone_label, milestone_no').eq('id', data.deliverable_id).maybeSingle(),
        admin.from('engagement_clients').select('name, programme_id').eq('id', clientId).maybeSingle(),
        admin.from('engagement_config').select('tor_reference').eq('client_id', clientId).maybeSingle(),
      ])

      let programme: string | null = null
      if (client?.programme_id) {
        const { data: p } = await admin.from('programmes').select('name').eq('id', client.programme_id).maybeSingle()
        programme = p?.name ?? null
      }

      const { buffer, fileName } = await buildClaimPack(data as any, {
        organisation: client?.name || 'This engagement',
        programme,
        deliverableTitle: deliverable?.title || 'Deliverable',
        deliverableCode: deliverable?.code || null,
        milestone: deliverable?.milestone_label
          || (deliverable?.milestone_no != null ? `Milestone ${deliverable.milestone_no}` : null),
        torReference: config?.tor_reference || null,
      })

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    return NextResponse.json({ pack: data })
  } catch (e: any) {
    console.error('invoice-pack GET: unexpected error', e)
    return NextResponse.json({ error: 'Could not load the claim' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId, action } = body as { clientId?: string; action?: string }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    if (action === 'assemble') {
      const deliverableId = typeof body.deliverableId === 'string' ? body.deliverableId : ''
      if (!deliverableId) return NextResponse.json({ error: 'Choose a deliverable' }, { status: 400 })
      return await assemble(admin, clientId, deliverableId)
    }

    const packId = typeof body.packId === 'string' ? body.packId : ''
    if (!packId) return NextResponse.json({ error: 'Missing packId' }, { status: 400 })

    const { data: pack } = await admin
      .from('engagement_invoice_packs').select('*').eq('id', packId).maybeSingle()
    if (!pack || pack.client_id !== clientId) {
      return NextResponse.json({ error: 'That claim is not on this engagement' }, { status: 404 })
    }

    const now = new Date().toISOString()

    if (action === 'approve') {
      if (pack.status !== 'draft') {
        return NextResponse.json({ error: 'Only a draft claim can be approved' }, { status: 409 })
      }
      const patch: Record<string, unknown> = {
        status: 'approved', approved_by: auth.userId, approved_at: now, updated_at: now,
      }
      // Approving is also where the covering note is committed, since the
      // person approving may have rewritten it.
      if (typeof body.coveringNote === 'string') patch.covering_note = body.coveringNote
      const { error } = await admin.from('engagement_invoice_packs').update(patch).eq('id', packId)
      if (error) return NextResponse.json({ error: 'Could not approve the claim' }, { status: 500 })
      return NextResponse.json({ ok: true, status: 'approved' })
    }

    if (action === 'send') {
      if (pack.status !== 'approved') {
        return NextResponse.json(
          { error: 'Read the claim and approve it before it is sent. Nothing goes out unread.' },
          { status: 409 },
        )
      }
      const recipients: string[] = Array.isArray(body.recipients)
        ? body.recipients.filter((r: unknown) => typeof r === 'string' && r.includes('@'))
        : []
      if (recipients.length === 0) {
        return NextResponse.json({ error: 'Name at least one recipient' }, { status: 400 })
      }
      if (!emailAvailable()) {
        return NextResponse.json({
          ok: false,
          emailConfigured: false,
          error: 'Email is not configured here, so the claim has not been sent. Mark it sent once you have sent it yourself.',
        })
      }

      const gates = Array.isArray(pack.gates) ? pack.gates : []
      const gapLines = gates.filter((g: any) => g.gap).map((g: any) => `${g.label}: ${g.gap}`)
      // The covering note and the gate labels are text a person typed, so they
      // are escaped. Only the markup this route writes itself is passed raw.
      const paragraphs: any[] = [
        ...(pack.covering_note
          ? String(pack.covering_note).split(/\n{2,}/).map((p: string) => p.trim()).filter(Boolean)
          : []),
        raw(`<b>Amount claimed:</b> ${escapeHtml(money(pack.amount, pack.currency))}`),
        raw('<b>Decision gates evidencing this claim</b>'),
        raw(gates.map((g: any) =>
          `${escapeHtml(g.label)}: ${g.evidence_count} evidence ${g.evidence_count === 1 ? 'entry' : 'entries'}, ${g.signature_count} ${g.signature_count === 1 ? 'signature' : 'signatures'}`,
        ).join('<br/>')),
      ]
      if (gapLines.length > 0) {
        paragraphs.push(raw('<b>Noted gaps</b>'))
        paragraphs.push(raw(gapLines.map((l: string) => escapeHtml(l)).join('<br/>')))
      }

      const html = brandedEmail({
        heading: `Milestone claim ${pack.reference}`,
        paragraphs,
        footNote: 'Grant-to-Commercial Viability Canvas. The Canvas Coach.',
      })

      const sent = await sendEmail({
        to: recipients,
        subject: `Milestone claim ${pack.reference}`,
        html,
      })
      if (!sent.sent) {
        console.error('invoice-pack send: email failed', sent.reason)
        return NextResponse.json({ error: 'The claim could not be sent. Try again.' }, { status: 502 })
      }

      await admin.from('engagement_invoice_packs')
        .update({ status: 'sent', sent_at: now, sent_to: recipients.join(', '), updated_at: now })
        .eq('id', packId)
      await admin.from('engagement_deliverables')
        .update({ status: 'invoiced', invoiced_at: now, updated_at: now })
        .eq('id', pack.deliverable_id)

      return NextResponse.json({ ok: true, status: 'sent', recipients })
    }

    if (action === 'mark_sent' || action === 'mark_paid') {
      const status = action === 'mark_paid' ? 'paid' : 'sent'
      if (status === 'sent' && pack.status !== 'approved') {
        return NextResponse.json({ error: 'Approve the claim first' }, { status: 409 })
      }
      await admin.from('engagement_invoice_packs')
        .update({ status, ...(status === 'sent' ? { sent_at: now } : {}), updated_at: now })
        .eq('id', packId)
      await admin.from('engagement_deliverables')
        .update(status === 'paid'
          ? { status: 'paid', paid_at: now, updated_at: now }
          : { status: 'invoiced', invoiced_at: now, updated_at: now })
        .eq('id', pack.deliverable_id)
      return NextResponse.json({ ok: true, status })
    }

    if (action === 'withdraw') {
      await admin.from('engagement_invoice_packs')
        .update({ status: 'withdrawn', updated_at: now }).eq('id', packId)
      return NextResponse.json({ ok: true, status: 'withdrawn' })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    console.error('invoice-pack POST: unexpected error', e)
    return NextResponse.json({ error: 'That did not work' }, { status: 500 })
  }
}
