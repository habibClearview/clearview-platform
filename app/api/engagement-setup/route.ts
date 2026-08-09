// ============================================================
// API ROUTE: /api/engagement-setup
// Puts the scaffolding under a new GtCV engagement.
//
// WHAT WAS MISSING. A coach could create a client and choose Full GtCV Canvas,
// and the client row appeared. Nothing else did. The engagement had no config
// row, no gate record, and no Charter, and there was no way to make the first
// Charter at all: the versioning route can issue and re-issue one, but it
// takes a charter id and refuses when it cannot find it. So the second
// engagement stalled at the first screen that mattered. The first engagement
// only worked because a migration had put those rows there by hand, which is
// not a thing that can happen twice.
//
// WHAT IT CREATES, AND WHAT IT DELIBERATELY DOES NOT.
//   the config row       so the engagement has somewhere to hold its own
//                        settings, created with the method's defaults
//   the twelve gates     one row per gate, in order, named as the method names
//                        them, all not started
//   a draft Charter      version one, so there is something to edit, comment on
//                        and issue
//
// It does not create parties. A party is a named person with a role and
// sometimes an account, and inventing a row called "Executive Director" gives
// the coach a placeholder that looks like a record and is not one. The first
// engagement carries exactly those placeholders and they read as unfinished
// every time somebody opens it. Adding a party takes seconds and means the
// name is right.
//
// IT NEVER OVERWRITES. Every write is create-if-absent. Run it on an
// engagement that is already set up and it reports that there was nothing to
// do rather than resetting a gate somebody has moved or replacing a Charter
// somebody has signed. That matters because the button is on the setup tab
// where a coach may well press it twice.
//
// Manage rights, because setting up an engagement decides what the parties
// will be asked to agree to.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'
import { GATES } from '@/lib/gtcv-gates'

export async function POST(req: NextRequest) {
  try {
    const { clientId } = (await req.json()) as { clientId?: string }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireAccess(req, admin, clientId, 'manage', {
      deniedMessage: 'Only the lead consultant can set an engagement up',
      rateLimit: { key: 'engagement-setup', max: 20, windowSeconds: 3600 },
    })
    if (!auth.ok) return refuseAccess(auth)

    const { data: client } = await admin
      .from('engagement_clients')
      .select('id, name, engagement_mode')
      .eq('id', clientId)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'That engagement does not exist' }, { status: 404 })

    const created: string[] = []
    const alreadyThere: string[] = []

    // 1. The config row. Upsert with ignoreDuplicates so an existing row keeps
    //    whatever the coach has already set rather than being reset to the
    //    defaults.
    const { data: existingConfig } = await admin
      .from('engagement_config').select('client_id').eq('client_id', clientId).maybeSingle()
    if (existingConfig) {
      alreadyThere.push('settings')
    } else {
      const { error } = await admin.from('engagement_config').insert({ client_id: clientId })
      if (error) {
        console.error('engagement-setup: config insert failed', error)
        return NextResponse.json({ error: 'Could not create the engagement settings' }, { status: 500 })
      }
      created.push('settings')
    }

    // 2. The twelve gates. Only the ones that are not already there, so a gate
    //    a coach has already moved keeps its status and its label.
    const { data: existingGates } = await admin
      .from('canvas_decision_points').select('dp_id').eq('client_id', clientId)
    const have = new Set((existingGates || []).map((g: { dp_id: string }) => g.dp_id))
    const missing = GATES.filter((g) => !have.has(g.id))
    if (missing.length === 0) {
      alreadyThere.push('the twelve gates')
    } else {
      const { error } = await admin.from('canvas_decision_points').insert(
        missing.map((g, i) => ({
          id: `${clientId}-${g.id}`,
          client_id: clientId,
          dp_id: g.id,
          label: g.label,
          status: 'not_started',
          sort_order: GATES.findIndex((x) => x.id === g.id) + 1,
        })),
      )
      if (error) {
        console.error('engagement-setup: gate insert failed', error)
        return NextResponse.json({ error: 'Could not create the gate record' }, { status: 500 })
      }
      created.push(missing.length === GATES.length ? 'the twelve gates' : `${missing.length} missing gates`)
    }

    // 3. The first Charter, as a draft. Only when there is none at all: a
    //    superseded one still means the engagement has a Charter history and a
    //    new version belongs to the re-issue path, not to setting up.
    const { data: existingCharter } = await admin
      .from('engagement_charters').select('id').eq('client_id', clientId).limit(1).maybeSingle()
    if (existingCharter) {
      alreadyThere.push('the Charter')
    } else {
      const { error } = await admin.from('engagement_charters').insert({
        client_id: clientId,
        version: 1,
        status: 'draft',
        title: `How we work together and what commercial viability will ask of ${client.name}`,
        content: {},
      })
      if (error) {
        console.error('engagement-setup: charter insert failed', error)
        return NextResponse.json({ error: 'Could not create the Charter' }, { status: 500 })
      }
      created.push('a draft Charter')
    }

    return NextResponse.json({ ok: true, created, alreadyThere })
  } catch (e: any) {
    console.error('engagement-setup POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not set the engagement up' }, { status: 500 })
  }
}
