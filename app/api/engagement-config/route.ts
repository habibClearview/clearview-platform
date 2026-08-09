// ============================================================
// API ROUTE: /api/engagement-config
// The settings that shape how one engagement runs.
//
// These decide what the app calls things, how many conversations a segment is
// expected to hold, and whether the engagement is on track, slipping or
// stopped. Every one of them was previously reachable only by writing SQL,
// which meant an engagement could not be adjusted by the person running it.
//
// WHY THE MOMENTUM STATUS IS HERE AND NOT COMPUTED. It would be easy to derive
// it from how many gates are late, and it would be wrong. Momentum is the lead
// consultant's read of whether this engagement is going to arrive, which takes
// account of a leadership team distracted by a funding round, a field season,
// or a signature that is travelling. A number cannot see any of that. The
// coach sets it and the app reports it.
//
// WHY THE CONVERSATION MINIMUM IS SETTABLE AND CONVERGENCE IS NOT. The minimum
// is what this engagement agreed to do, so it belongs to the engagement.
// Convergence, three conversations pointing the same way, is the point at
// which a pattern stops being an anecdote, and that does not change because an
// engagement agreed to hold fewer. See src/lib/interview-report.ts.
//
// Manage rights, because these settings change what the Charter says and what
// the gates require.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'

const TERMINOLOGY = ['zone', 'dp']
const MOMENTUM = ['green', 'amber', 'red']
const INDEPENDENCE_SETS = ['engagement', 'tools']

/**
 * A ceiling on the conversation minimum. Not a judgement about what is right,
 * just a guard against a typo turning 5 into 500 and making every segment
 * permanently short.
 */
const MAX_CONVERSATION_MINIMUM = 100


type Admin = ReturnType<typeof getAdminClient>

/**
 * Manage rights on this engagement, through the one shared helper. This used
 * to be a local copy in every route, in slightly different shapes, which is
 * how a fix lands in one place and leaves the hole in six others.
 */
async function requireManager(req: NextRequest, admin: Admin, clientId: string) {
  return requireAccess(req, admin, clientId, 'manage', {
    deniedMessage: 'Only the lead consultant can change how this engagement runs',
    rateLimit: { key: 'engagement-config', max: 60, windowSeconds: 3600 },
  })
}

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const { data } = await admin
      .from('engagement_config')
      .select('client_id, tor_reference, tor_uploaded, terminology, momentum_status, validation_min_per_segment, independence_test_set, showcase_enabled, showcase_name_client, updated_at')
      .eq('client_id', clientId)
      .maybeSingle()

    return NextResponse.json({ config: data || null })
  } catch (e: any) {
    console.error('engagement-config GET: unexpected error', e)
    return NextResponse.json({ error: 'Could not load the settings' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId } = body as { clientId?: string }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.terminology !== undefined) {
      if (!TERMINOLOGY.includes(body.terminology)) {
        return NextResponse.json({ error: 'That is not a naming choice' }, { status: 400 })
      }
      patch.terminology = body.terminology
    }

    if (body.momentumStatus !== undefined) {
      if (!MOMENTUM.includes(body.momentumStatus)) {
        return NextResponse.json({ error: 'That is not a momentum state' }, { status: 400 })
      }
      patch.momentum_status = body.momentumStatus
    }

    if (body.independenceTestSet !== undefined) {
      if (!INDEPENDENCE_SETS.includes(body.independenceTestSet)) {
        return NextResponse.json({ error: 'That is not an independence test set' }, { status: 400 })
      }
      patch.independence_test_set = body.independenceTestSet
    }

    if (body.validationMinPerSegment !== undefined) {
      // null means "use the method's default", which is a real answer and
      // different from zero. Zero is an engagement that agreed no minimum.
      if (body.validationMinPerSegment === null) {
        patch.validation_min_per_segment = null
      } else if (
        !Number.isFinite(body.validationMinPerSegment) ||
        body.validationMinPerSegment < 0 ||
        body.validationMinPerSegment > MAX_CONVERSATION_MINIMUM
      ) {
        return NextResponse.json(
          { error: `The conversation minimum has to be a whole number between 0 and ${MAX_CONVERSATION_MINIMUM}` },
          { status: 400 },
        )
      } else {
        patch.validation_min_per_segment = Math.trunc(body.validationMinPerSegment)
      }
    }

    if (body.currency !== undefined) {
      // A short code, upper cased, or null to go back to bare numbers. Not
      // validated against a list of world currencies: an engagement is free to
      // work in whatever its client actually prices in, and a list would be one
      // more thing to be out of date. Length is capped so the column cannot be
      // used as a second notes field.
      const raw = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : ''
      if (raw.length > 8) {
        return NextResponse.json({ error: 'A currency is a short code, such as NGN or USD' }, { status: 400 })
      }
      patch.currency = raw || null
    }

    if (typeof body.torReference === 'string') {
      patch.tor_reference = body.torReference.trim().slice(0, 200) || null
    }

    // An engagement with no config row at all is a real state on an older
    // client, so this creates one rather than failing on a row that is simply
    // not there yet.
    const { error } = await admin
      .from('engagement_config')
      .upsert({ client_id: clientId, ...patch }, { onConflict: 'client_id' })
    if (error) {
      console.error('engagement-config PATCH: write failed', error)
      return NextResponse.json({ error: 'Could not save that setting' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('engagement-config PATCH: unexpected error', e)
    return NextResponse.json({ error: 'Could not save that setting' }, { status: 500 })
  }
}
