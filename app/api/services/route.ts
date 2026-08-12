// ============================================================
// SERVICES, ACTIVITIES AND PROBLEMS  (C1 to C19)
//
// One route for the whole hierarchy, because the three levels are not three
// separate things: moving an activity is a fact about a service, and stating a
// problem is a fact about an activity. Splitting them into three routes would
// mean three places where the rule "an activity belongs to exactly one
// service" could be enforced differently.
//
// WHAT IT WILL NOT DO. It will not create an activity with no service (C2), it
// will not delete without being told to in so many words (C13), and it will not
// let a removal that named no action destroy anything (C16). Park is the
// default and delete is never it.
//
// MANAGE RIGHTS THROUGHOUT.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'
import { DEFAULT_REMOVAL, refuseOrphanActivity, type RemovalAction } from '@/lib/service-anchor'

export const dynamic = 'force-dynamic'

type Admin = ReturnType<typeof getAdminClient>

const SERVICE_STATES = ['current', 'redesigned', 'new']
/** C29 as amended: the platform's four words, at every level. */
const DECISIONS = ['keep', 'redesign', 'pause', 'stop']

async function requireManager(req: NextRequest, admin: Admin, clientId: string) {
  return requireAccess(req, admin, clientId, 'manage', {
    deniedMessage: 'Only the lead consultant can change the services',
    rateLimit: { key: 'services', max: 600, windowSeconds: 3600 },
  })
}

/**
 * Everything the block needs to draw itself: the services, their activities,
 * and every problem, in one read.
 *
 * ONE READ RATHER THAN THREE, because the tools are drawn together and a
 * screen assembled from three requests can show a service that has an activity
 * the next request has not heard of yet.
 */
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const [{ data: services }, { data: activities }, { data: problems }, { data: state }, sources] =
      await Promise.all([
        admin.from('gtcv_service_inventory')
          .select('id, service_name, what_it_delivers, service_state, decision, sort_order')
          .eq('client_id', clientId).order('sort_order', { ascending: true }),
        admin.from('gtcv_assumptions')
          .select('id, service_id, service_name, activity, delivers, who_pays, assumption, disproof, parked_at, decision, sort_order')
          .eq('client_id', clientId).order('sort_order', { ascending: true }),
        admin.from('gtcv_problem_owner_budget')
          .select('id, activity_id, problem, experienced_by, accountable, budget_holder, cost_of_not_solving, budget_mechanism, parked_at, decision, sort_order')
          .eq('client_id', clientId).order('sort_order', { ascending: true }),
        admin.from('gtcv_room_state').select('current_service_id')
          .eq('client_id', clientId).maybeSingle(),
        // C26 as replaced. What each hypothesis is built from. Read in the same
        // request as everything else, for the same reason the other three are:
        // a screen assembled from separate requests can draw a link to an
        // activity the next request has not heard of yet.
        //
        // The table arrived on 12 August 2026. Until its migration has run this
        // read fails, and a failure here must not take the whole block down —
        // Tools 1 and 2 do not depend on it. So it degrades to an empty list.
        admin.from('gtcv_hypothesis_sources')
          .select('id, hypothesis_id, activity_id, problem_id')
          .eq('client_id', clientId)
          .then((r) => r, () => ({ data: [] as unknown[] })),
      ])

    return NextResponse.json({
      services: services || [],
      activities: activities || [],
      problems: problems || [],
      hypothesisSources: (sources as { data?: unknown[] })?.data || [],
      currentServiceId: state?.current_service_id || null,
    })
  } catch (e) {
    console.error('services GET: unexpected error', e)
    return NextResponse.json({ error: 'Could not load the services' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      clientId?: string
      action?: string
      id?: string
      serviceId?: string | null
      activityId?: string | null
      problemId?: string | null
      name?: string
      serviceState?: string
      decision?: string
      field?: string
      value?: string
      activityIds?: string[]
      table?: string
      removal?: RemovalAction
    }
    const clientId = body.clientId
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    /** Anything named in a request has to belong to this engagement. */
    const owns = async (table: string, id: string) => {
      const { data } = await admin.from(table).select('id, client_id').eq('id', id).maybeSingle()
      return Boolean(data && data.client_id === clientId)
    }

    switch (body.action) {
      // C8, C17. A service can be added at any time, and can start empty.
      case 'addService': {
        const { data, error } = await admin.from('gtcv_service_inventory')
          .insert({
            client_id: clientId,
            service_name: (body.name || '').trim() || 'New service',
            service_state: SERVICE_STATES.includes(body.serviceState || '') ? body.serviceState : 'current',
          })
          .select('id').single()
        if (error) throw error
        return NextResponse.json({ ok: true, id: data.id })
      }

      // C19. The state is changeable at any time, never fixed at creation.
      case 'setServiceState': {
        if (!body.id || !(await owns('gtcv_service_inventory', body.id))) {
          return NextResponse.json({ error: 'That service is not on this engagement' }, { status: 404 })
        }
        if (!SERVICE_STATES.includes(body.serviceState || '')) {
          return NextResponse.json({ error: 'That is not one of current, redesigned or new' }, { status: 400 })
        }
        const { error } = await admin.from('gtcv_service_inventory')
          .update({ service_state: body.serviceState, updated_at: new Date().toISOString() })
          .eq('id', body.id).eq('client_id', clientId)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      // C29 as amended. The service-level decision IS the existing decision
      // field, with its existing words. No second column was added and none
      // should be.
      case 'setDecision': {
        const table = body.activityId ? 'gtcv_assumptions'
          : body.serviceId ? 'gtcv_service_inventory'
          : body.id ? 'gtcv_problem_owner_budget' : null
        const id = body.activityId || body.serviceId || body.id
        if (!table || !id || !(await owns(table, id))) {
          return NextResponse.json({ error: 'That is not on this engagement' }, { status: 404 })
        }
        if (body.decision && !DECISIONS.includes(body.decision)) {
          return NextResponse.json({ error: 'That is not one of keep, redesign, pause or stop' }, { status: 400 })
        }
        const { error } = await admin.from(table)
          .update({ decision: body.decision || null, updated_at: new Date().toISOString() })
          .eq('id', id).eq('client_id', clientId)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      // C2, C9. An activity, and never one without a parent service.
      case 'addActivity': {
        const refusal = refuseOrphanActivity(body.serviceId)
        if (refusal) return NextResponse.json({ error: refusal }, { status: 400 })
        if (!(await owns('gtcv_service_inventory', body.serviceId!))) {
          return NextResponse.json({ error: 'That service is not on this engagement' }, { status: 404 })
        }
        const { data: svc } = await admin.from('gtcv_service_inventory')
          .select('service_name').eq('id', body.serviceId!).maybeSingle()
        const { data, error } = await admin.from('gtcv_assumptions')
          .insert({
            client_id: clientId,
            service_id: body.serviceId,
            // The text name is kept in step because it already exists and other
            // screens read it. Both are held: the text is what the room said,
            // the reference is what it was reconciled to.
            service_name: svc?.service_name || null,
            activity: (body.name || '').trim() || null,
          })
          .select('id').single()
        if (error) throw error
        return NextResponse.json({ ok: true, id: data.id })
      }

      // C10, C21, C25. A problem, belonging to an activity. Stating it here IS
      // stating it in Tool 2: one row, read by both tools, never two copies.
      case 'addProblem': {
        if (!body.activityId || !(await owns('gtcv_assumptions', body.activityId))) {
          return NextResponse.json({ error: 'That activity is not on this engagement' }, { status: 404 })
        }
        const { data, error } = await admin.from('gtcv_problem_owner_budget')
          .insert({
            client_id: clientId,
            activity_id: body.activityId,
            problem: (body.name || '').trim() || null,
          })
          .select('id').single()
        if (error) throw error
        return NextResponse.json({ ok: true, id: data.id })
      }

      // C11, C27. Editing one field. Editing a problem here changes it in both
      // tools, because there is only one of it.
      case 'edit': {
        const table = body.field && body.activityId ? 'gtcv_assumptions'
          : body.serviceId ? 'gtcv_service_inventory'
          : 'gtcv_problem_owner_budget'
        const id = body.activityId || body.serviceId || body.id
        const ALLOWED: Record<string, string[]> = {
          gtcv_assumptions: ['activity', 'delivers', 'who_pays', 'assumption', 'disproof'],
          gtcv_service_inventory: ['service_name', 'what_it_delivers', 'notes'],
          gtcv_problem_owner_budget: [
            'problem', 'experienced_by', 'accountable', 'budget_holder',
            'cost_of_not_solving', 'budget_mechanism',
          ],
        }
        if (!id || !body.field || !(ALLOWED[table] || []).includes(body.field)) {
          return NextResponse.json({ error: 'That is not a field of this table' }, { status: 400 })
        }
        if (!(await owns(table, id))) {
          return NextResponse.json({ error: 'That is not on this engagement' }, { status: 404 })
        }
        const { error } = await admin.from(table)
          .update({ [body.field]: (body.value || '').slice(0, 4000), updated_at: new Date().toISOString() })
          .eq('id', id).eq('client_id', clientId)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      // C12 to C16. THE THREE REMOVALS, and the one that runs when nobody said.
      case 'remove': {
        // C11 and C28. All five tools, so Park means the same thing everywhere
        // and nothing has to be destroyed to get it off a table.
        const ROW_TABLES = [
          'gtcv_assumptions', 'gtcv_problem_owner_budget',
          'gtcv_hypotheses_shortlist', 'gtcv_signal_story', 'gtcv_continue_pause_kill',
        ]
        const table = body.activityId
          ? 'gtcv_assumptions'
          : (body.table && ROW_TABLES.includes(body.table) ? body.table : 'gtcv_problem_owner_budget')
        const id = body.activityId || body.id
        if (!id || !(await owns(table, id))) {
          return NextResponse.json({ error: 'That is not on this engagement' }, { status: 404 })
        }

        // C16. An unnamed removal PARKS. It never deletes. A default that
        // destroys is a default that destroys somebody's work in a live room,
        // at speed, in front of twenty people, with no way back.
        const action: RemovalAction =
          body.removal === 'delete' || body.removal === 'move' ? body.removal : DEFAULT_REMOVAL

        if (action === 'delete') {
          // C13. Nothing left behind. The problems go with the activity by the
          // cascade on activity_id, which is what "leaves nothing behind" means.
          const { error } = await admin.from(table).delete().eq('id', id).eq('client_id', clientId)
          if (error) throw error
          return NextResponse.json({ ok: true, did: 'delete' })
        }

        if (action === 'move') {
          if (table !== 'gtcv_assumptions') {
            return NextResponse.json({ error: 'Only an activity moves between services' }, { status: 400 })
          }
          if (!body.serviceId || !(await owns('gtcv_service_inventory', body.serviceId))) {
            return NextResponse.json({ error: 'Choose which service to move it to' }, { status: 400 })
          }
          const { data: svc } = await admin.from('gtcv_service_inventory')
            .select('service_name').eq('id', body.serviceId).maybeSingle()
          // C14. The problems are not touched, so they arrive by not moving.
          // They hang off the activity and have no service of their own.
          const { error } = await admin.from('gtcv_assumptions')
            .update({
              service_id: body.serviceId,
              service_name: svc?.service_name || null,
              parked_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', id).eq('client_id', clientId)
          if (error) throw error
          return NextResponse.json({ ok: true, did: 'move' })
        }

        // C15. Park. Out of the service, into the bucket, still visible, and
        // recoverable into any service including one made afterwards.
        const patch: Record<string, unknown> = {
          parked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        if (table === 'gtcv_assumptions') patch.service_id = null
        const { error } = await admin.from(table).update(patch).eq('id', id).eq('client_id', clientId)
        if (error) throw error
        return NextResponse.json({ ok: true, did: 'park' })
      }

      // C15, C17, C18. Pulling things into a service, whether from the bucket
      // or from another service, and whether the service is new or not.
      case 'moveMany': {
        if (!body.serviceId || !(await owns('gtcv_service_inventory', body.serviceId))) {
          return NextResponse.json({ error: 'That service is not on this engagement' }, { status: 404 })
        }
        const ids = (body.activityIds || []).filter((i) => typeof i === 'string').slice(0, 200)
        if (ids.length === 0) return NextResponse.json({ error: 'Nothing chosen' }, { status: 400 })
        const { data: svc } = await admin.from('gtcv_service_inventory')
          .select('service_name').eq('id', body.serviceId).maybeSingle()
        const { error } = await admin.from('gtcv_assumptions')
          .update({
            service_id: body.serviceId,
            service_name: svc?.service_name || null,
            parked_at: null,
            updated_at: new Date().toISOString(),
          })
          .in('id', ids).eq('client_id', clientId)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      // C18. A NEW SERVICE MADE OUT OF ACTIVITIES THAT ALREADY EXIST.
      //
      // ONE ACTION, not "add a service" followed by "move these into it". Two
      // requests can half-succeed, and the half that lands first is a service
      // with nothing in it and a room wondering where their activities went. A
      // failure here leaves an empty service at worst, which C17 says is a
      // legitimate thing to have, and never a moved activity with no parent.
      case 'createServiceFromActivities': {
        const ids = (body.activityIds || []).filter((i) => typeof i === 'string').slice(0, 200)
        if (ids.length === 0) {
          return NextResponse.json({ error: 'Choose the activities the service is made of' }, { status: 400 })
        }
        const name = (body.name || '').trim()
        if (!name) return NextResponse.json({ error: 'Name the new service' }, { status: 400 })

        const { data: created, error: createError } = await admin.from('gtcv_service_inventory')
          .insert({
            client_id: clientId,
            service_name: name,
            // C19. The state is changeable afterwards, so this is only a start.
            service_state: SERVICE_STATES.includes(body.serviceState || '') ? body.serviceState : 'new',
          })
          .select('id').single()
        if (createError) throw createError

        // The items keep their identity and their problems. This is a change of
        // parent, never a copy: a copy would leave the room looking at the same
        // activity twice, unable to say which one was real. Parking is cleared
        // because the activity now has a home.
        const { error: moveError } = await admin.from('gtcv_assumptions')
          .update({
            service_id: created.id,
            service_name: name,
            parked_at: null,
            updated_at: new Date().toISOString(),
          })
          .in('id', ids).eq('client_id', clientId)
        if (moveError) throw moveError

        return NextResponse.json({ ok: true, id: created.id })
      }

      // C28 as amended. Giving a Tool 3, 4 or 5 row a service, which is how a
      // row leaves the Parked area. Nothing is hidden for lack of a service, so
      // this is a way OUT of the bucket, never a condition of being seen.
      case 'setRowService': {
        const ANCHORABLE = ['gtcv_hypotheses_shortlist', 'gtcv_signal_story', 'gtcv_continue_pause_kill']
        const table = body.table && ANCHORABLE.includes(body.table) ? body.table : null
        if (!table || !body.id || !(await owns(table, body.id))) {
          return NextResponse.json({ error: 'That row is not on this engagement' }, { status: 404 })
        }
        if (body.serviceId && !(await owns('gtcv_service_inventory', body.serviceId))) {
          return NextResponse.json({ error: 'That service is not on this engagement' }, { status: 404 })
        }
        const { error } = await admin.from(table)
          .update({
            service_id: body.serviceId || null,
            parked_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', body.id).eq('client_id', clientId)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      // C26 as replaced. Naming an activity or a problem a hypothesis is built
      // from, and taking the name off again.
      case 'linkHypothesisSource':
      case 'unlinkHypothesisSource': {
        if (!body.id || !(await owns('gtcv_hypotheses_shortlist', body.id))) {
          return NextResponse.json({ error: 'That hypothesis is not on this engagement' }, { status: 404 })
        }
        const isProblem = Boolean(body.problemId)
        const targetId = body.problemId || body.activityId
        const targetTable = isProblem ? 'gtcv_problem_owner_budget' : 'gtcv_assumptions'
        if (!targetId || !(await owns(targetTable, targetId))) {
          return NextResponse.json({ error: 'That is not on this engagement' }, { status: 404 })
        }
        const column = isProblem ? 'problem_id' : 'activity_id'

        // The table arrived with the C26 rebuild on 12 August 2026 and its
        // migration is applied by hand. Said plainly rather than as "Could not
        // do that", because the fix is one migration and the message should
        // name it instead of sending somebody to the logs.
        const MISSING_TABLE =
          'The link table is not in the database yet. Run the migration 2026_08_12_c26_hypothesis_sources.sql, then this works.'
        const tableMissing = (message: string) =>
          /relation .* does not exist|could not find the table|schema cache/i.test(message)

        if (body.action === 'unlinkHypothesisSource') {
          const { error } = await admin.from('gtcv_hypothesis_sources')
            .delete().eq('client_id', clientId)
            .eq('hypothesis_id', body.id).eq(column, targetId)
          if (error) {
            if (tableMissing(error.message || '')) {
              return NextResponse.json({ error: MISSING_TABLE }, { status: 503 })
            }
            throw error
          }
          return NextResponse.json({ ok: true })
        }

        // Naming the same thing twice is the same fact twice. The unique index
        // refuses it; this reports it as done rather than as a failure, because
        // from the room's point of view it already is.
        const { error } = await admin.from('gtcv_hypothesis_sources').insert({
          client_id: clientId,
          hypothesis_id: body.id,
          [column]: targetId,
        })
        if (error) {
          if (tableMissing(error.message || '')) {
            return NextResponse.json({ error: MISSING_TABLE }, { status: 503 })
          }
          if (!String(error.message || '').includes('duplicate')) throw error
        }
        return NextResponse.json({ ok: true })
      }

      // C5. Which service every tool below is showing.
      case 'setCurrentService': {
        if (body.serviceId && !(await owns('gtcv_service_inventory', body.serviceId))) {
          return NextResponse.json({ error: 'That service is not on this engagement' }, { status: 404 })
        }
        const { error } = await admin.from('gtcv_room_state')
          .upsert({
            client_id: clientId,
            current_service_id: body.serviceId || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'client_id' })
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e) {
    console.error('services POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not do that' }, { status: 500 })
  }
}
