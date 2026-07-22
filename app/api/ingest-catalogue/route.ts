// ============================================================
// API ROUTE: /api/ingest-catalogue
// Writes the product catalogue captured on a v8 data-capture spreadsheet into
// field_catalogue (+ catalogue_value_lists for category/type). These tables
// are service-role-only writes, so this route is the trust boundary: it
// authenticates the caller and confirms they may act on the target client
// before writing anything. Called by SpreadsheetUpload right after it creates
// the client + financial model, so the catalogue items can be linked to the
// revenue lines that upload just created.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getFieldSupabase as getSupabase } from '@/lib/field-auth'
import { resolveFieldAdminActor, actorMayAccessClient } from '@/lib/auth/field-admin-authz'

interface IncomingRow {
  business_unit_id: string
  plan_line_id: string | null
  cogs_plan_line_id: string | null
  name: string
  category?: string
  product_type?: string
  unit_label?: string
  price?: number
  cost_price?: number | null
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { clientId?: string; items?: IncomingRow[] }
    const clientId = body.clientId
    const items = Array.isArray(body.items) ? body.items : []
    if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
    if (items.length === 0) return NextResponse.json({ inserted: 0, unmatched: [] })
    // A single client's catalogue is small; a huge payload means something is
    // wrong. Refuse rather than let one request write thousands of rows.
    if (items.length > 1000) return NextResponse.json({ error: 'Too many catalogue items in one upload' }, { status: 400 })

    const supabase = getSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, clientId)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const norm = (s: string) => s.trim().toLowerCase()

    // 1) Ensure a catalogue_value_lists entry exists for every distinct
    //    category / type name (scoped to its business unit), then map each
    //    name back to its id. Upsert on the table's own unique key so a
    //    re-used name doesn't duplicate.
    const wanted = new Map<string, { business_unit_id: string; kind: 'category' | 'type'; name: string }>()
    for (const it of items) {
      const bu = String(it.business_unit_id || '')
      const cat = (it.category || '').trim()
      const typ = (it.product_type || '').trim()
      if (cat) { const k = `${bu}|category|${norm(cat)}`; if (!wanted.has(k)) wanted.set(k, { business_unit_id: bu, kind: 'category', name: cat }) }
      if (typ) { const k = `${bu}|type|${norm(typ)}`; if (!wanted.has(k)) wanted.set(k, { business_unit_id: bu, kind: 'type', name: typ }) }
    }

    const valueListIdByKey = new Map<string, string>()
    if (wanted.size > 0) {
      const rows = Array.from(wanted.values()).map(w => ({
        client_id: clientId, business_unit_id: w.business_unit_id, kind: w.kind, name: w.name, active: true,
      }))
      const { data: upserted, error: vlErr } = await supabase
        .from('catalogue_value_lists')
        .upsert(rows, { onConflict: 'client_id,business_unit_id,kind,name' })
        .select('id,business_unit_id,kind,name')
      if (vlErr) { console.error('ingest-catalogue: value list upsert failed', vlErr.message); return NextResponse.json({ error: 'Could not save the product categories.' }, { status: 500 }) }
      for (const r of upserted || []) valueListIdByKey.set(`${r.business_unit_id}|${r.kind}|${norm(String(r.name))}`, r.id as string)
    }

    // 2) Build the field_catalogue rows. A cost price is only written when it
    //    is a valid non-negative number AND there is a cost-of-sales line to
    //    post it against — the database enforces that pairing.
    const nowIso = new Date().toISOString()
    const unmatched: string[] = []
    const catRows = items
      .map(it => {
        const bu = String(it.business_unit_id || '')
        const cat = (it.category || '').trim()
        const typ = (it.product_type || '').trim()
        const category_id = cat ? (valueListIdByKey.get(`${bu}|category|${norm(cat)}`) || null) : null
        const type_id = typ ? (valueListIdByKey.get(`${bu}|type|${norm(typ)}`) || null) : null
        const price = Number(it.price)
        const cost = Number(it.cost_price)
        const hasCost = it.cost_price != null && Number.isFinite(cost) && cost >= 0 && !!it.cogs_plan_line_id
        const name = String(it.name || '').trim()
        if (name && !it.plan_line_id) unmatched.push(name)
        // A malformed/missing price is coerced to 0 so the row still loads,
        // but log it — a "free" product is usually a data-entry slip, not intent.
        if (name && !(Number.isFinite(price) && price >= 0)) console.warn(`ingest-catalogue: item "${name}" had an invalid price (${JSON.stringify(it.price)}); defaulted to 0`)
        return {
          client_id: clientId,
          business_unit_id: bu,
          plan_line_id: it.plan_line_id || null,
          name,
          product_name: name,
          item_type: 'product',
          price: Number.isFinite(price) && price >= 0 ? price : 0,
          unit_label: it.unit_label || null,
          category_id,
          type_id,
          cost_price: hasCost ? cost : null,
          cogs_plan_line_id: hasCost ? it.cogs_plan_line_id : null,
          cost_price_updated_at: hasCost ? nowIso : null,
          active: true,
        }
      })
      .filter(r => r.name)

    if (catRows.length > 0) {
      const { error: insErr } = await supabase.from('field_catalogue').insert(catRows)
      if (insErr) { console.error('ingest-catalogue: field_catalogue insert failed', insErr.message); return NextResponse.json({ error: 'Could not save the catalogue items.' }, { status: 500 }) }
    }

    return NextResponse.json({ inserted: catRows.length, unmatched })
  } catch (e: any) {
    console.error('ingest-catalogue: unexpected error', e)
    return NextResponse.json({ error: 'Could not save the catalogue.' }, { status: 500 })
  }
}
