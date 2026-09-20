// ============================================================
// POST /api/v1/payments
//
// Money that actually moved, as a payment channel saw it. This is the half of
// the platform that turns "the business says it sold this" into "the money
// confirms it", and until now there was no way for anything outside to send
// one.
//
// AN HONEST DISTINCTION, AND WHY IT IS KEPT.
//
// A payment ClearView receives directly from a provider's own webhook is
// evidence from a third party. A payment sent through this endpoint is a claim
// made by whoever holds the key, which is usually the business itself or its
// own software. Those are not the same quality of evidence, and the whole
// value of this platform rests on not pretending they are.
//
// So a payment sent here is stored with its channel recorded as "api:<name>",
// never as the bare provider name a real webhook would write. The two can
// always be told apart afterwards, by anyone, without asking us.
//
// WHAT HAPPENS NEXT.
//
// A payment arrives as unattributed inbound money and waits in the business's
// own payment review queue for somebody to pair it with a sale. Nothing is
// matched automatically here. Claiming a match this endpoint has not actually
// made would be the one failure this platform cannot recover from.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { requireApiKey, noteKeyUse, readJson, itemsFrom, apiError, MAX_BATCH } from '@/lib/api-gate'
import { externalRef, finiteNumber, isoMoment } from '@/lib/api-writes'
import { park } from '@/lib/api-inbox'

export const dynamic = 'force-dynamic'

/** A channel name we are willing to store, kept short and free of surprises. */
function channelName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40)
  return clean || null
}

export async function POST(req: NextRequest) {
  const gate = await requireApiKey(req, 'payments.write')
  if (gate instanceof NextResponse) return gate
  const { key, supabase } = gate

  const body = await readJson(req)
  const items = itemsFrom(body, 'payments')
  if (!items) {
    return apiError(400, 'bad_request',
      'Send a JSON body shaped { "payments": [ ... ] }, or a bare array of payments.')
  }
  if (items.length === 0) {
    return NextResponse.json({ accepted: 0, parked: 0, accepted_refs: [], parked_items: [] })
  }
  if (items.length > MAX_BATCH) {
    return apiError(413, 'batch_too_large', `One call may carry ${MAX_BATCH} payments.`)
  }

  try {
    const { data: config } = await supabase
      .from('generic_model_config')
      .select('currency')
      .eq('client_id', key.client_id)
      .maybeSingle()
    const defaultCurrency = (config?.currency as string) || 'UGX'

    const rows: any[] = []
    const parked: { external_ref: string | null; reason: string }[] = []
    const toPark: any[] = []
    const acceptedRefs: string[] = []

    for (const item of items) {
      const ref = externalRef(item?.external_ref)
      const complain = (reason: string) => {
        parked.push({ external_ref: ref, reason })
        toPark.push({ external_ref: ref, payload: item, reason })
      }

      if (!ref) {
        complain('No external_ref was sent. A payment needs the channel\'s own reference for that payment, otherwise the same payment cannot be told apart from a second one for the same amount.')
        continue
      }
      const channel = channelName(item?.channel)
      if (!channel) {
        complain('No channel was sent. Name the payment channel this came from, for example "mtn_momo", "airtel_money" or "bank".')
        continue
      }
      const amount = finiteNumber(item?.amount)
      if (amount === null || amount <= 0) {
        complain('The amount is missing or is not a number above zero.')
        continue
      }
      const occurred = isoMoment(item?.occurred_at)
      if (!occurred) {
        complain('No usable occurred_at was sent. A payment must say when it happened, or it cannot be paired with a sale.')
        continue
      }
      const direction = item?.direction === 'outbound' ? 'outbound' : 'inbound'

      rows.push({
        client_id: key.client_id,
        // Prefixed so a payment asserted through this API is never mistaken
        // for one a provider confirmed to us directly. See the note above.
        provider_id: `api:${channel}`,
        external_ref: ref,
        amount,
        currency: typeof item?.currency === 'string' && item.currency ? item.currency : defaultCurrency,
        occurred_at: occurred,
        direction,
        raw_payload: item,
        // Left to wait for a human in the payment review queue. Nothing here
        // matches anything.
        reconciliation_state: 'unattributed_inbound',
      })
      acceptedRefs.push(ref)
    }

    let written: any[] = []
    if (rows.length > 0) {
      // A replayed send books once. The unique index on
      // (provider_id, external_ref) is what makes a retry safe.
      const { data, error } = await supabase
        .from('provider_transactions')
        .upsert(rows, { onConflict: 'provider_id,external_ref', ignoreDuplicates: true })
        .select('external_ref')
      if (error) {
        console.error('POST /api/v1/payments write failed:', error.message)
        return apiError(500, 'write_failed',
          'The payments could not be stored. Nothing was saved. Send them again.')
      }
      written = data || []
    }

    if (toPark.length > 0) await park(supabase, key, 'payment', toPark)
    await noteKeyUse(supabase, key.id)

    const duplicates = acceptedRefs.length - written.length
    return NextResponse.json({
      accepted: acceptedRefs.length,
      duplicates: duplicates > 0 ? duplicates : 0,
      parked: parked.length,
      accepted_refs: acceptedRefs,
      parked_items: parked,
      note: 'Each payment is waiting to be paired with a sale in this business\'s payment review screen. Nothing is paired automatically.',
    })
  } catch (e) {
    console.error('POST /api/v1/payments failed:', e)
    return apiError(500, 'server_error', 'Something failed at our end. Try again.')
  }
}
