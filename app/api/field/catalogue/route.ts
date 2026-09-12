// ============================================================
// API ROUTE: /api/field/catalogue
//
// Adding an item, and photographing one, from the phone itself.
// 12 September 2026.
//
// Habib: it should be both, able to add on the phone and the laptop. And: let
// adding a photo or product be a right or permission that can be assigned to a
// field operator.
//
// A field operator has no login. They hold a link with a token in it, which is
// the whole point of the field app: no password to remember and it opens on
// any phone. So the two rights live on the operator's own record and are
// granted from the Operators screen, the same way a platform user's rights are
// granted from Team.
//
// WHAT AN OPERATOR CANNOT DO HERE, EVER.
//
//   Set a price, or a cost price. The catalogue exists so that a price is set
//   once by somebody who may set it and picked rather than typed by everybody
//   else. An item added here is marked as needing a price and is inactive, so
//   it cannot be sold, and it does not come back down to any phone, including
//   the phone that added it, until somebody prices it.
//
//   Touch an item belonging to another business, or another business unit.
//   The operator's own client and unit are read off their token and written
//   onto the row; neither is taken from the request.
//
//   Choose a revenue category freely. It must be one of their own unit's
//   active revenue lines, or the figures would roll up into the wrong place.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getFieldSupabase, validateFieldToken } from '@/lib/field-auth'
import {
  cleanAttributes, catalogueImagePath, extensionForImage,
  IMAGE_TYPES, MAX_IMAGE_BYTES,
} from '@/lib/catalogue-item'

export const dynamic = 'force-dynamic'

const BUCKET = 'catalogue-images'

/** The revenue categories this operator's own unit rolls up into. */
async function categoriesFor(supabase: any, clientId: string, unitId: string) {
  const { data: config } = await supabase.from('generic_model_config')
    .select('plan_lines').eq('client_id', clientId).maybeSingle()
  return ((config?.plan_lines || []) as any[])
    .filter((l) => l.unit_id === unitId && l.category === 'revenue' && l.active)
    .map((l) => ({ id: l.id, name: l.name }))
}

/**
 * What the phone needs to draw the form: whether this operator may use it at
 * all, and which categories they may file a new item under.
 */
export async function GET(req: NextRequest) {
  try {
    const header = req.headers.get('authorization')
    const token = (header?.startsWith('Bearer ') ? header.slice(7) : null)
      || req.nextUrl.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    const operator = await validateFieldToken(token)
    if (!operator) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })

    const supabase = getFieldSupabase()
    return NextResponse.json({
      canAddProducts: operator.can_add_catalogue_products === true,
      canAddPictures: operator.can_add_catalogue_products === true
        || operator.can_add_catalogue_pictures === true,
      categories: operator.can_add_catalogue_products === true
        ? await categoriesFor(supabase, operator.client_id, operator.business_unit_id)
        : [],
    })
  } catch (err) {
    console.error('Field catalogue GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/**
 * Add an item, or put a picture on one.
 *
 * Both arrive as form data because a picture does. An item and its picture can
 * come in one request, which matters on a bad connection: somebody standing in
 * a store photographing a new product should press once, not twice.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const token = String(form.get('token') || '')
    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    const operator = await validateFieldToken(token)
    if (!operator) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })

    const supabase = getFieldSupabase()
    const file = form.get('file')
    const itemId = String(form.get('itemId') || '')
    const name = String(form.get('name') || '').trim()

    const mayProducts = operator.can_add_catalogue_products === true
    const mayPictures = mayProducts || operator.can_add_catalogue_pictures === true

    // ── A picture on an item that already exists ──────────
    if (itemId) {
      if (!mayPictures) {
        return NextResponse.json({ error: 'You have not been given permission to add pictures.' }, { status: 403 })
      }
      const { data: item } = await supabase.from('field_catalogue')
        .select('id,client_id,business_unit_id,image_url').eq('id', itemId).maybeSingle()
      if (!item) return NextResponse.json({ error: 'That item is not in the catalogue' }, { status: 404 })
      // The operator's own business and their own unit, both off the token.
      if (item.client_id !== operator.client_id || item.business_unit_id !== operator.business_unit_id) {
        return NextResponse.json({ error: 'That item is not one of yours' }, { status: 403 })
      }
      const stored = await storePicture(supabase, file, operator.client_id, itemId)
      if ('error' in stored) return NextResponse.json({ error: stored.error }, { status: stored.status })

      await supabase.from('field_catalogue')
        .update({ image_url: stored.path, updated_at: new Date().toISOString() }).eq('id', itemId)
      if (item.image_url && item.image_url !== stored.path) {
        await supabase.storage.from(BUCKET).remove([item.image_url])
      }
      return NextResponse.json({ ok: true, itemId, path: stored.path })
    }

    // ── A new item ────────────────────────────────────────
    if (!mayProducts) {
      return NextResponse.json({ error: 'You have not been given permission to add products.' }, { status: 403 })
    }
    if (!name) return NextResponse.json({ error: 'Give the item a name' }, { status: 400 })

    const categoryId = String(form.get('plan_line_id') || '')
    const categories = await categoriesFor(supabase, operator.client_id, operator.business_unit_id)
    if (!categories.some((c) => c.id === categoryId)) {
      return NextResponse.json({
        error: 'Choose which kind of sale this is, from the list.',
      }, { status: 400 })
    }

    let attributes: unknown = []
    try { attributes = JSON.parse(String(form.get('attributes') || '[]')) } catch { attributes = [] }

    const { data: created, error } = await supabase.from('field_catalogue').insert({
      client_id: operator.client_id,
      business_unit_id: operator.business_unit_id,
      plan_line_id: categoryId,
      name,
      item_type: String(form.get('item_type') || '') === 'service' ? 'service' : 'product',
      unit_label: String(form.get('unit_label') || '').trim() || null,
      attributes: cleanAttributes(attributes),
      // No price, and therefore not sellable, and therefore not sent back down
      // to any phone until somebody who may price it does.
      price: 0,
      needs_price: true,
      active: false,
    }).select('id').single()
    if (error) {
      console.error('Field catalogue insert error:', error.message)
      return NextResponse.json({ error: 'That item could not be added. Try again once you have signal.' }, { status: 500 })
    }

    if (file instanceof Blob && file.size > 0 && mayPictures) {
      const stored = await storePicture(supabase, file, operator.client_id, created.id)
      // The item is already added by this point. A picture that will not save
      // must not read as an item that was not added, or somebody adds it twice.
      if (!('error' in stored)) {
        await supabase.from('field_catalogue')
          .update({ image_url: stored.path, updated_at: new Date().toISOString() }).eq('id', created.id)
      }
    }

    return NextResponse.json({
      ok: true,
      itemId: created.id,
      message: 'Added. It is waiting for a price before it can be sold.',
    }, { status: 201 })
  } catch (err) {
    console.error('Field catalogue POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/** Check a photograph and put it away. The path is built here, never taken. */
async function storePicture(supabase: any, file: unknown, clientId: string, itemId: string) {
  if (!(file instanceof Blob)) return { error: 'No picture was sent', status: 400 as const }
  const type = String((file as File).type || '')
  if (!IMAGE_TYPES.includes(type)) {
    return { error: 'That file is not a photograph the app can read.', status: 400 as const }
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: 'That picture is too big to send.', status: 413 as const }
  }
  const path = catalogueImagePath(clientId, itemId, extensionForImage(type))
  const bytes = Buffer.from(await file.arrayBuffer())
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, bytes, { contentType: type, upsert: false })
  if (error) return { error: `The picture could not be saved. ${error.message}`, status: 500 as const }
  return { path }
}
