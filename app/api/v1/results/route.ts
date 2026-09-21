// ============================================================
// GET /api/v1/results
//
// The worked-out figures, month by month, for a funder's or a lender's own
// system to read rather than being sent a document.
//
// Nothing here is recalculated for the API. It runs the same engine the
// workspace runs, on the same stored figures, so a number read here and the
// same number on screen can never disagree. A second calculation would be a
// second answer, and the one that got quoted would be whichever was asked
// first.
//
// It also reports how much of the declared revenue independent payments
// actually confirm, because a revenue figure with no statement of how well
// evidenced it is, is the thing this platform exists to replace.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { requireApiKey, noteKeyUse, apiError } from '@/lib/api-gate'
import { runGenericModel, buildMonthLabels, type GenericModelConfig } from '@/lib/generic-engine'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireApiKey(req, 'results.read')
  if (gate instanceof NextResponse) return gate
  const { key, supabase } = gate

  try {
    const [{ data: configRow }, { data: providerTx }] = await Promise.all([
      supabase.from('generic_model_config')
        .select('client_id, business_name, currency, start_date, planning_months, business_units, plan_lines, shared_lines, settings')
        .eq('client_id', key.client_id).maybeSingle(),
      supabase.from('provider_transactions')
        .select('amount, reconciliation_state, provider_id').eq('client_id', key.client_id),
    ])

    if (!configRow) {
      return apiError(409, 'no_model', 'This business has no financial model set up yet, so there are no figures to read.')
    }

    const config: GenericModelConfig = {
      client_id: configRow.client_id,
      business_name: configRow.business_name,
      currency: configRow.currency,
      start_date: configRow.start_date,
      planning_months: configRow.planning_months,
      business_units: configRow.business_units || [],
      plan_lines: configRow.plan_lines || [],
      shared_lines: configRow.shared_lines || [],
      settings: configRow.settings || {},
    }

    const result = runGenericModel(config)
    const labels = buildMonthLabels(config.start_date, config.planning_months)

    // Declared is the model's own revenue. Verified is only what a payment
    // record was actually paired with. Money that arrived but was never paired
    // is counted separately and never quietly added to either -- it is the
    // number that tempts everyone, and counting it as verified would make the
    // verified share a claim rather than a measurement.
    const declared = result.metrics.total_revenue || 0
    const txns = (providerTx || []) as any[]
    const sumOf = (state: string) => txns
      .filter((t) => t.reconciliation_state === state)
      .reduce((s, t) => s + Number(t.amount || 0), 0)
    const verified = sumOf('matched')
    const unattributed = sumOf('unattributed_inbound')

    // A payment the business's own software asserted is not the same evidence
    // as one a provider confirmed to us. Reported separately so a reader can
    // judge it, rather than folded in silently.
    const selfReported = txns
      .filter((t) => typeof t.provider_id === 'string' && t.provider_id.startsWith('api:'))
      .reduce((s, t) => s + Number(t.amount || 0), 0)

    const months = labels.map((label: string, i: number) => ({
      month: label,
      revenue: result.con.rev[i] ?? 0,
      gross_profit: result.con.gp[i] ?? 0,
      ebitda: result.con.ebitda[i] ?? 0,
      cash_close: result.cf.close[i] ?? 0,
      is_actual: result.con.act_ebitda[i] !== null,
    }))

    await noteKeyUse(supabase, key.id)

    return NextResponse.json({
      business: { name: config.business_name, currency: config.currency },
      months,
      totals: {
        revenue: declared,
        gross_profit: result.metrics.total_gp ?? 0,
        ebitda: result.metrics.total_ebitda ?? 0,
      },
      evidence: {
        declared_revenue: declared,
        verified_revenue: verified,
        verified_share: declared > 0 ? verified / declared : 0,
        unattributed_inbound: unattributed,
        of_which_self_reported: selfReported,
        note: 'Verified revenue counts only payments paired with a recorded sale. Money received but not yet paired is reported separately and is not counted as verified. Payments sent through this API by the business\'s own software are included in of_which_self_reported so they can be judged differently from a payment a provider confirmed independently.',
      },
    })
  } catch (e) {
    console.error('GET /api/v1/results failed:', e)
    return apiError(500, 'server_error', 'Something failed at our end. Try again.')
  }
}
