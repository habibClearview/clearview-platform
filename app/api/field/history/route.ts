import { NextRequest, NextResponse } from 'next/server'
import { getFieldSupabase, validateFieldToken, clampHistoryLimit } from '@/lib/field-auth'

export const dynamic = 'force-dynamic'

// Returns a field operator's own recent transactions -- sales and
// costs alike -- so they can see what they've actually recorded, not
// just the pending sync queue (which only shows unsynced entries and
// disappears the moment something syncs successfully). Scoped to this
// specific operator's own entries, not the whole business unit's --
// least-privilege by default; a unit-wide view is a CEO/coach concern,
// not something an individual operator's phone needs.
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const token = headerToken || req.nextUrl.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    const operator = await validateFieldToken(token)
    if (!operator) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })

    const supabase = getFieldSupabase()
    const limit = clampHistoryLimit(req.nextUrl.searchParams.get('limit'))

    const { data, error } = await supabase
      .from('field_transactions')
      .select('id, transaction_type, category, plan_line_name, amount, quantity, unit_price, unit_label, transaction_date, synced_at, notes, price_alert')
      .eq('operator_id', operator.id)
      .order('synced_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Field history fetch error:', error.message)
      return NextResponse.json({ error: 'Could not load transaction history' }, { status: 500 })
    }

    return NextResponse.json({ transactions: data || [] })
  } catch (err: any) {
    console.error('Field history error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
