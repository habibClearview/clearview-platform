// ============================================================
// API ROUTE: /api/deliverables
// The commercial layer: what was contracted, which decision gates evidence
// it, and what still has to happen before it can be claimed.
//
// THE POINT OF MAPPING DELIVERABLES TO GATES. The canvas never changes. Every
// engagement runs the same nine decision blocks in the same order. What
// changes from one contract to the next is what the funder called the
// milestones and what they attached payment to. Mapping one to the other means
// the method stays fixed while the paperwork bends to whoever is paying, which
// is the only way the same platform serves a second client.
//
// AND WHY A PERSON APPROVES EVERY MAPPING. A proposal is a reading of a
// document. It can misread a milestone, attach it to the wrong gate, or invent
// a requirement the contract never made. Every proposed row is written with
// approved = false and source = 'ai', and it does not count towards anything
// until somebody with manage rights has read it and approved it. Rejecting is
// one click and leaves nothing behind.
//
//   GET    ?clientId=   the deliverables, their mappings and their packs
//   POST   action: 'propose'          read a pasted ToR and propose mappings
//          action: 'add_deliverable'  add one by hand
//          action: 'add_mapping'      attach a gate by hand
//   PATCH  edit a deliverable, or approve or edit a mapping
//   DELETE remove a deliverable or reject a mapping
//
// Everything here requires manage rights. The fee and the milestones are
// between the consultant and whoever pays, and the organisation being coached
// has no part in them.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { CLEARVIEW_STYLE } from '@/lib/ai-style'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'

const DP_IDS = [
  'setup', 'phase_0',
  'dp01', 'dp02', 'dp03', 'dp04', 'dp05', 'dp06', 'dp07', 'dp08', 'dp09',
  'handover',
]

// What each gate produces. This is the method, not the contract, so it is the
// same for every engagement and it is what a proposal has to map onto.
const GATE_OUTPUTS: Record<string, string> = {
  setup: 'Pre-engagement diagnostic record, signed by the Executive Director, the board chair and the funder representative',
  phase_0: 'Assumption inventory, problem owner and budget mapping, hypotheses shortlist, signal against story, continue pause or kill decision',
  dp01: 'Service inventory with activity level analysis and the recalibrated commercial hypothesis',
  dp02: 'Prioritised customer segments, problem scoring, and the customer validation conversations with their synthesis',
  dp03: 'Value propositions per segment, tested with clients, with differentiation that can be proved',
  dp04: 'Cost floor, break even by tier, pricing tiers stress tested, and the financial model handed over',
  dp05: 'Market entry approach, tested messages, channel plan and the pipeline',
  dp06: 'Commercial identity statement, identity stress test and the partner map',
  dp07: 'Two pilot iterations with client sessions, debriefs, and the iteration comparison',
  dp08: 'Scale pathway with the segments, channels and infrastructure named, and the revenue projection',
  dp09: 'Commercial readiness diagnostic scored at baseline, mid point and close, signed jointly with the funder',
  handover: 'Handover record, independence tests, and the completion record signed by all parties',
}

const MAX_TOR_CHARS = 40000


type Admin = ReturnType<typeof getAdminClient>

/**
 * Manage rights on this engagement, through the one shared helper. This used
 * to be a local copy in every route, in slightly different shapes, which is
 * how a fix lands in one place and leaves the hole in six others.
 */
async function requireManager(req: NextRequest, admin: Admin, clientId: string) {
  return requireAccess(req, admin, clientId, 'manage', {
    deniedMessage: 'The deliverables and the fee are not part of what you can see',
    rateLimit: { key: 'deliverables', max: 60, windowSeconds: 3600 },
  })
}

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const [deliverables, mappings, packs] = await Promise.all([
      admin.from('engagement_deliverables').select('*').eq('client_id', clientId).order('sort_order'),
      admin.from('deliverable_gate_map').select('*').eq('client_id', clientId),
      admin.from('engagement_invoice_packs').select('id, deliverable_id, reference, amount, currency, status, assembled_at, sent_at')
        .eq('client_id', clientId).order('assembled_at', { ascending: false }),
    ])

    return NextResponse.json({
      deliverables: deliverables.data || [],
      mappings: mappings.data || [],
      packs: packs.data || [],
      gateOutputs: GATE_OUTPUTS,
    })
  } catch (e: any) {
    console.error('deliverables GET: unexpected error', e)
    return NextResponse.json({ error: 'Could not load the deliverables' }, { status: 500 })
  }
}

/**
 * Read a pasted Terms of Reference and propose the milestones it contains and
 * the gates that evidence each one. Writes proposals, never decisions.
 */
async function propose(admin: Admin, clientId: string, torText: string) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return NextResponse.json(
      { error: 'Reading a Terms of Reference automatically is not configured here. Add the deliverables by hand, which works exactly the same afterwards.' },
      { status: 503 },
    )
  }
  if (torText.length > MAX_TOR_CHARS) {
    return NextResponse.json(
      { error: 'That document is too long to read in one go. Paste the deliverables and milestones section on its own.' },
      { status: 400 },
    )
  }

  const system = [
    'You are reading a Terms of Reference or contract for a consulting engagement and extracting its deliverables.',
    'You work only from the document supplied. Never invent a deliverable, a milestone number, an amount, a date or a payment term that is not in the text.',
    'If an amount or a date is not stated, leave it null. A missing figure is not a reason to estimate one.',
    'You then map each deliverable to the decision gates of a fixed method. The gates and what each one produces are listed below. Choose the gates whose output actually evidences that deliverable. A deliverable may need more than one gate, and a gate may serve more than one deliverable.',
    'For each mapping, state in one sentence what evidence from that gate the funder would need to see. Base it on what the gate produces, not on what would be convenient.',
    'If a deliverable does not correspond to anything the method produces, map it to no gates and say so in its description. Reporting that a deliverable falls outside the method is a correct and useful answer.',
    '',
    'The gates and their outputs:',
    ...DP_IDS.map((d) => `${d}: ${GATE_OUTPUTS[d]}`),
    '',
    CLEARVIEW_STYLE,
    '',
    'Return JSON only, with no prose around it, in exactly this shape:',
    '{"deliverables":[{"code":string|null,"title":string,"description":string|null,"milestoneNo":number|null,"milestoneLabel":string|null,"amount":number|null,"currency":string|null,"dueWindow":string|null,"gates":[{"dpId":string,"requiredEvidence":string}]}]}',
  ].join('\n')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: torText }],
    }),
  })

  if (!response.ok) {
    console.error('deliverables propose: model call failed', response.status)
    return NextResponse.json({ error: 'Could not read the document. Try again, or add the deliverables by hand.' }, { status: 502 })
  }

  const json = await response.json()
  const text = (json?.content || []).map((c: any) => c?.text || '').join('').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return NextResponse.json({ error: 'Could not make sense of that document. Add the deliverables by hand.' }, { status: 422 })
  }

  let parsed: any
  try { parsed = JSON.parse(text.slice(start, end + 1)) }
  catch { return NextResponse.json({ error: 'Could not make sense of that document. Add the deliverables by hand.' }, { status: 422 }) }

  const proposed = Array.isArray(parsed?.deliverables) ? parsed.deliverables : []
  if (proposed.length === 0) {
    return NextResponse.json({ error: 'No deliverables were found in that text. Paste the deliverables or milestones section.' }, { status: 422 })
  }

  // Existing rows are left alone. A proposal adds to the list; it does not
  // rewrite what the coach has already approved.
  const { data: existing } = await admin
    .from('engagement_deliverables').select('sort_order').eq('client_id', clientId)
  let order = (existing || []).reduce((m: number, r: any) => Math.max(m, r.sort_order || 0), 0)

  let addedDeliverables = 0
  let addedMappings = 0

  for (const d of proposed) {
    if (!d || typeof d.title !== 'string' || !d.title.trim()) continue
    order += 1
    const { data: made, error } = await admin
      .from('engagement_deliverables')
      .insert({
        client_id: clientId,
        code: typeof d.code === 'string' ? d.code : null,
        title: d.title.trim(),
        description: typeof d.description === 'string' ? d.description : null,
        milestone_no: Number.isFinite(d.milestoneNo) ? Math.trunc(d.milestoneNo) : null,
        milestone_label: typeof d.milestoneLabel === 'string' ? d.milestoneLabel : null,
        payment_amount: Number.isFinite(d.amount) ? d.amount : null,
        payment_currency: typeof d.currency === 'string' && d.currency ? d.currency : 'USD',
        due_window: typeof d.dueWindow === 'string' ? d.dueWindow : null,
        sort_order: order,
        status: 'proposed',
      })
      .select('id')
      .single()
    if (error || !made) continue
    addedDeliverables += 1

    const gates = Array.isArray(d.gates) ? d.gates : []
    const rows = gates
      .filter((g: any) => g && DP_IDS.includes(g.dpId))
      .map((g: any) => ({
        client_id: clientId,
        deliverable_id: made.id,
        dp_id: g.dpId,
        required_evidence: typeof g.requiredEvidence === 'string' ? g.requiredEvidence : null,
        approved: false,
        source: 'ai',
      }))
    if (rows.length > 0) {
      const { error: mapErr } = await admin.from('deliverable_gate_map').insert(rows)
      if (!mapErr) addedMappings += rows.length
    }
  }

  if (addedDeliverables === 0) {
    return NextResponse.json({ error: 'Nothing could be saved from that document. Add the deliverables by hand.' }, { status: 422 })
  }

  return NextResponse.json({
    ok: true,
    addedDeliverables,
    addedMappings,
    note: 'These are proposals. Nothing counts until you approve each mapping.',
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId, action } = body as { clientId?: string; action?: string }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    if (action === 'propose') {
      const torText = typeof body.torText === 'string' ? body.torText.trim() : ''
      if (!torText) return NextResponse.json({ error: 'Paste the deliverables section first' }, { status: 400 })
      // Record that a document was read against this engagement, so the
      // Charter and the cover can say where the deliverables came from.
      await admin.from('engagement_config')
        .update({ tor_uploaded: true, tor_reference: typeof body.torReference === 'string' ? body.torReference : null, updated_at: new Date().toISOString() })
        .eq('client_id', clientId)
      return await propose(admin, clientId, torText)
    }

    if (action === 'add_deliverable') {
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      if (!title) return NextResponse.json({ error: 'A deliverable needs a title' }, { status: 400 })
      const { data: existing } = await admin
        .from('engagement_deliverables').select('sort_order').eq('client_id', clientId)
      const order = (existing || []).reduce((m: number, r: any) => Math.max(m, r.sort_order || 0), 0) + 1
      const { data, error } = await admin
        .from('engagement_deliverables')
        .insert({
          client_id: clientId,
          code: typeof body.code === 'string' ? body.code : null,
          title,
          description: typeof body.description === 'string' ? body.description : null,
          milestone_no: Number.isFinite(body.milestoneNo) ? Math.trunc(body.milestoneNo) : null,
          milestone_label: typeof body.milestoneLabel === 'string' ? body.milestoneLabel : null,
          payment_amount: Number.isFinite(body.amount) ? body.amount : null,
          payment_currency: typeof body.currency === 'string' && body.currency ? body.currency : 'USD',
          due_window: typeof body.dueWindow === 'string' ? body.dueWindow : null,
          sort_order: order,
          status: 'agreed',
        })
        .select('id').single()
      if (error) {
        console.error('deliverables add: write failed', error)
        return NextResponse.json({ error: 'Could not add the deliverable' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, id: data.id })
    }

    if (action === 'add_mapping') {
      const { deliverableId, dpId } = body as { deliverableId?: string; dpId?: string }
      if (!deliverableId || !dpId || !DP_IDS.includes(dpId)) {
        return NextResponse.json({ error: 'Choose a deliverable and a gate' }, { status: 400 })
      }
      const { data: owner } = await admin
        .from('engagement_deliverables').select('id, client_id').eq('id', deliverableId).maybeSingle()
      if (!owner || owner.client_id !== clientId) {
        return NextResponse.json({ error: 'That deliverable is not on this engagement' }, { status: 404 })
      }
      // Added by hand means the coach has already decided, so it is approved
      // on arrival. Only a proposal needs a separate approval step.
      const { data, error } = await admin
        .from('deliverable_gate_map')
        .insert({
          client_id: clientId,
          deliverable_id: deliverableId,
          dp_id: dpId,
          required_evidence: typeof body.requiredEvidence === 'string' ? body.requiredEvidence : GATE_OUTPUTS[dpId],
          approved: true,
          approved_by: auth.userId,
          approved_at: new Date().toISOString(),
          source: 'manual',
        })
        .select('id').single()
      if (error) {
        console.error('deliverables add_mapping: write failed', error)
        return NextResponse.json({ error: 'Could not attach that gate' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, id: data.id })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    console.error('deliverables POST: unexpected error', e)
    return NextResponse.json({ error: 'That did not work' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId, kind, id } = body as { clientId?: string; kind?: string; id?: string }
    if (!clientId || !id) return NextResponse.json({ error: 'Missing clientId or id' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    if (kind === 'mapping') {
      const { data: row } = await admin
        .from('deliverable_gate_map').select('id, client_id').eq('id', id).maybeSingle()
      if (!row || row.client_id !== clientId) {
        return NextResponse.json({ error: 'That mapping is not on this engagement' }, { status: 404 })
      }
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (typeof body.dpId === 'string') {
        if (!DP_IDS.includes(body.dpId)) return NextResponse.json({ error: 'That is not a gate' }, { status: 400 })
        patch.dp_id = body.dpId
      }
      if (typeof body.requiredEvidence === 'string') patch.required_evidence = body.requiredEvidence
      if (typeof body.approved === 'boolean') {
        patch.approved = body.approved
        patch.approved_by = body.approved ? auth.userId : null
        patch.approved_at = body.approved ? new Date().toISOString() : null
      }
      const { error } = await admin.from('deliverable_gate_map').update(patch).eq('id', id)
      if (error) {
        console.error('deliverables PATCH mapping: write failed', error)
        return NextResponse.json({ error: 'Could not save that mapping' }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    const { data: row } = await admin
      .from('engagement_deliverables').select('id, client_id').eq('id', id).maybeSingle()
    if (!row || row.client_id !== clientId) {
      return NextResponse.json({ error: 'That deliverable is not on this engagement' }, { status: 404 })
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.code === 'string') patch.code = body.code
    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim()
    if (typeof body.description === 'string') patch.description = body.description
    if (Number.isFinite(body.milestoneNo)) patch.milestone_no = Math.trunc(body.milestoneNo)
    if (typeof body.milestoneLabel === 'string') patch.milestone_label = body.milestoneLabel
    if (body.amount === null || Number.isFinite(body.amount)) patch.payment_amount = body.amount
    if (typeof body.currency === 'string' && body.currency) patch.payment_currency = body.currency
    if (typeof body.dueWindow === 'string') patch.due_window = body.dueWindow
    if (typeof body.status === 'string') patch.status = body.status

    const { error } = await admin.from('engagement_deliverables').update(patch).eq('id', id)
    if (error) {
      console.error('deliverables PATCH: write failed', error)
      return NextResponse.json({ error: 'Could not save the deliverable' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('deliverables PATCH: unexpected error', e)
    return NextResponse.json({ error: 'Could not save that' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId, kind, id } = body as { clientId?: string; kind?: string; id?: string }
    if (!clientId || !id) return NextResponse.json({ error: 'Missing clientId or id' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const table = kind === 'mapping' ? 'deliverable_gate_map' : 'engagement_deliverables'
    const { data: row } = await admin.from(table).select('id, client_id').eq('id', id).maybeSingle()
    if (!row || row.client_id !== clientId) {
      return NextResponse.json({ error: 'That is not on this engagement' }, { status: 404 })
    }

    // A deliverable that has already been claimed stays, because the pack that
    // claimed it points at it.
    if (kind !== 'mapping') {
      const { count } = await admin
        .from('engagement_invoice_packs').select('id', { count: 'exact', head: true })
        .eq('deliverable_id', id).neq('status', 'withdrawn')
      if ((count || 0) > 0) {
        return NextResponse.json(
          { error: 'This deliverable has been claimed already, so it cannot be removed. Withdraw the claim first.' },
          { status: 409 },
        )
      }
    }

    const { error } = await admin.from(table).delete().eq('id', id)
    if (error) {
      console.error('deliverables DELETE: write failed', error)
      return NextResponse.json({ error: 'Could not remove that' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('deliverables DELETE: unexpected error', e)
    return NextResponse.json({ error: 'Could not remove that' }, { status: 500 })
  }
}
