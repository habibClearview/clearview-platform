// ============================================================
// GATHERING ONE MONTH'S READINGS.
//
// The work the scheduled job does, kept out of the route file. Next.js route
// files may only export the handler names, so anything else that lives beside
// them breaks the build, which is exactly what it did on 20 September when
// this was written there.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAllClientSnapshots } from '@/lib/portfolio-snapshot-loader'
import { statusIsComplete } from '@/lib/gtcv-gates'
import {
  monthKey, stillToTake, financialRow, coachingRow, skippedRow,
  type SnapshotRow, type CoachingProgress,
} from '@/lib/monthly-snapshot'

/** How far the coaching side of one engagement had got, this month. */
async function coachingProgressFor(admin: SupabaseClient, clientId: string): Promise<CoachingProgress> {
  const [gates, readings] = await Promise.all([
    admin.from('gtcv_gate_signoffs').select('gate_id, status').eq('client_id', clientId),
    admin.from('gtcv_readiness_scores').select('checkpoint').eq('client_id', clientId),
  ])
  const rows = (gates.data || []) as { gate_id: string; status: string }[]
  const signed = rows.filter((r) => statusIsComplete(r.status)).length
  const checkpoints = new Set(((readings.data || []) as { checkpoint: string }[]).map((r) => r.checkpoint))
  return {
    decisionPointsSigned: signed,
    decisionPointsTotal: rows.length,
    readinessCheckpointsTaken: checkpoints.size,
  }
}

/**
 * How much of what the business says it earned a second record agreed with.
 *
 * ONE RULE, IN ONE PLACE. The confidence scoring already decides what counts
 * (src/lib/portfolio-snapshot-loader.ts, buildPeriodSignals): declared is the
 * revenue the financial model produces, verified is the provider transactions
 * in state 'matched', and unattributed inbound money is counted separately
 * rather than folded into either. Anything else is 'ignored' and counts
 * nowhere. This follows that rule exactly, because two places deciding what
 * "verified" means is how a figure comes to mean two different things.
 *
 * An earlier version of this called the sum of every provider transaction
 * "declared revenue". That is the payment side, not what the business
 * declared, and it would have put a wrong number into a record that is never
 * corrected afterwards.
 */
async function verifiedMoneyFor(admin: SupabaseClient, clientId: string) {
  const { data } = await admin
    .from('provider_transactions')
    .select('amount, reconciliation_state')
    .eq('client_id', clientId)
  const rows = (data || []) as { amount: number; reconciliation_state: string }[]
  if (rows.length === 0) return { verifiedRevenue: null, unattributedRevenue: null }
  let matched = 0
  let unattributed = 0
  rows.forEach((r) => {
    const amount = Number(r.amount) || 0
    if (r.reconciliation_state === 'matched') matched += amount
    else if (r.reconciliation_state === 'unattributed_inbound') unattributed += amount
  })
  return { verifiedRevenue: matched, unattributedRevenue: unattributed }
}

/**
 * Takes this month's reading for every engagement that does not have one yet.
 * Returns what it did, in plain counts, so the caller can say so.
 */
export async function takeMonthlySnapshot(admin: SupabaseClient, month = monthKey()) {
  const { data: clients, error } = await admin
    .from('engagement_clients')
    .select('id, sector, country, programme_id, engagement_mode, portfolio_consent_named')
  if (error) throw new Error('Could not read the engagements')
  const all = (clients || []) as any[]

  const { data: taken } = await admin
    .from('portfolio_snapshots')
    .select('client_id')
    .eq('snapshot_month', month)

  const outstanding = stillToTake(all.map((c) => c.id), (taken || []) as { client_id: string }[])
  if (outstanding.length === 0) {
    return { month, alreadyDone: true, written: 0, skipped: 0, total: all.length }
  }

  // The financial reading is one whole-platform calculation, so it is done
  // once rather than per engagement.
  let snapshotsById: Record<string, any> = {}
  let financialFailure: string | null = null
  try {
    const snapshots = await loadAllClientSnapshots(admin, true)
    snapshotsById = Object.fromEntries(snapshots.map((s) => [s.clientId, s]))
  } catch (err: any) {
    financialFailure = String(err?.message || 'the financial reading could not be taken')
  }

  const rows: SnapshotRow[] = []
  for (const id of outstanding) {
    const client = all.find((c) => c.id === id)
    try {
      const coaching = await coachingProgressFor(admin, id)
      const snap = snapshotsById[id]
      if (snap) {
        const money = await verifiedMoneyFor(admin, id)
        rows.push(financialRow(snap, month, {
          declaredRevenue: snap.annualRevenue ?? null,
          verifiedRevenue: money.verifiedRevenue,
          unattributedRevenue: money.unattributedRevenue,
          coaching,
        }))
      } else if (client?.engagement_mode === 'financial') {
        // A FINANCIAL ENGAGEMENT WITH NO READING IS A FAILURE, NOT A COACHING
        // ENGAGEMENT. This first branched on whether the whole-platform load
        // had thrown, which only happens when every client fails at once. One
        // client whose model cannot be built is dropped quietly by that loader
        // instead, so a real financial engagement would have been filed as a
        // coaching one, with no reason given, in a table that is never
        // corrected afterwards. The engagement's own mode decides this, and
        // nothing else does.
        rows.push(skippedRow(
          id, month,
          financialFailure || 'the financial model could not be read this month',
          'financial',
        ))
      } else {
        rows.push(coachingRow(client, month, coaching, !!client?.portfolio_consent_named))
      }
    } catch (err: any) {
      rows.push(skippedRow(id, month, String(err?.message || 'unknown'), client?.engagement_mode || 'canvas'))
    }
  }

  // One reading per engagement per month, so a repeat run replaces rather than
  // duplicating. That is what makes running this every day safe.
  const { error: writeErr } = await admin
    .from('portfolio_snapshots')
    .upsert(rows, { onConflict: 'client_id,snapshot_month' })
  if (writeErr) throw new Error('Could not file the readings: ' + writeErr.message)

  return {
    month,
    alreadyDone: false,
    written: rows.filter((r) => !r.skipped_reason).length,
    skipped: rows.filter((r) => !!r.skipped_reason).length,
    total: all.length,
  }
}

