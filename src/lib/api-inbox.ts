// ============================================================
// The holding pen.
//
// 20 September 2026.
//
// Anything well-formed that we cannot file goes here with the reason and the
// original payload, rather than being dropped. Every integration eventually
// sends something unrecognised -- a new product, a renamed one, a typo -- and
// the first time it happens the connection looks broken to the business,
// because figures simply go missing with no trace of where.
//
// Parking never fails a request. An item that could not even be parked is
// logged and the sender still gets an honest count, because the alternative is
// refusing a batch of good sales over one bad one.
// ============================================================
import type { ApiKeyRow } from '@/lib/api-keys'
import type { Parked } from '@/lib/api-writes'

export type InboxKind = 'sale' | 'cost' | 'actual' | 'payment'

export async function park(
  supabase: any,
  key: ApiKeyRow,
  kind: InboxKind,
  items: Parked[],
): Promise<void> {
  if (items.length === 0) return
  try {
    await supabase.from('api_inbox').upsert(
      items.map((p) => ({
        client_id: key.client_id,
        business_unit_id: key.business_unit_id,
        api_key_id: key.id,
        kind,
        external_ref: p.external_ref,
        payload: p.payload as any,
        reason: p.reason,
      })),
      // The same unmapped item arriving on every retry parks once, not once a
      // minute for a week. Items with no reference of their own are outside
      // the partial unique index and so are always inserted -- there is no way
      // to tell two of them apart, and losing one would be worse.
      { onConflict: 'client_id,kind,external_ref', ignoreDuplicates: true },
    )
  } catch (e) {
    console.error('Could not park unmapped items:', e)
  }
}
