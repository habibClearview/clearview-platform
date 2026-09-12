// ============================================================
// API ROUTE: /api/field/admin/catalogue-image
//
// The picture on a catalogue item. 12 September 2026.
//
// Habib: in the catalogue there is no add image option, but I think this would
// be really good to have, especially on the field operation app.
//
// The field app was already built to show one. Every tile looks for a picture
// and falls back to a symbol when it finds none, so the only missing half was
// somewhere to put one. This is that.
//
// WHY THE PICTURES ARE PRIVATE. A photograph taken in a field can catch a
// face, a compound or a vehicle plate by accident, and open storage means
// anybody holding the address can see it for ever. These sit in a private
// bucket like the receipts and the recordings, and are handed out one signed
// address at a time, which expires.
//
// WHO MAY PUT ONE THERE. Anybody granted the picture right, which a CEO or
// Finance Manager can give to a field operator without giving them anything
// else. The right is checked here rather than trusted from the screen.
//
// THE PATH IS BUILT HERE AND NEVER TAKEN FROM THE BROWSER, so a picture cannot
// be written into another business's folder by asking nicely.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getFieldSupabase as getSupabase } from '@/lib/field-auth'
import {
  resolveFieldAdminActor, actorMayAccessClient, actorMayAddCataloguePictures,
} from '@/lib/auth/field-admin-authz'
import {
  catalogueImagePath, extensionForImage, IMAGE_TYPES, MAX_IMAGE_BYTES,
} from '@/lib/catalogue-item'

export const dynamic = 'force-dynamic'

const BUCKET = 'catalogue-images'

/** A picture to look at. Signed, so it expires rather than living for ever. */
export async function GET(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get('path') || ''
    if (!path) return NextResponse.json({ error: 'Which picture?' }, { status: 400 })

    const supabase = getSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // The first part of the path is the business the picture belongs to, which
    // is the same check as everywhere else: you see your own business's
    // pictures and nobody else's.
    const owner = String(path).split('/')[0] || ''
    const { data: item } = await supabase.from('field_catalogue')
      .select('client_id').eq('image_url', path).limit(1).maybeSingle()
    const clientId = item?.client_id || owner
    if (!actorMayAccessClient(actor, clientId)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'That picture could not be opened' }, { status: 404 })
    }
    return NextResponse.json({ url: data.signedUrl })
  } catch (err) {
    console.error('Catalogue image GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/** Put a picture on an item. */
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file')
    const itemId = String(form.get('itemId') || '')
    const clientId = String(form.get('clientId') || '')
    if (!(file instanceof Blob)) return NextResponse.json({ error: 'No picture was sent' }, { status: 400 })
    if (!clientId) return NextResponse.json({ error: 'Which business?' }, { status: 400 })

    if (!actorMayAccessClient(actor, clientId)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (!actorMayAddCataloguePictures(actor)) {
      return NextResponse.json({
        error: 'You do not have permission to add pictures to the catalogue.',
      }, { status: 403 })
    }

    const type = String((file as File).type || '')
    if (!IMAGE_TYPES.includes(type)) {
      return NextResponse.json({
        error: 'That file is not a photograph the platform can read. Use a JPEG, a PNG or a WebP.',
      }, { status: 400 })
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({
        error: 'That picture is too big. The app shrinks a photo before sending it, so this one did not come from the camera button.',
      }, { status: 413 })
    }

    // An item id that belongs to a different business would put one business's
    // picture on another's item, so the item is looked up rather than trusted.
    let ownerId = clientId
    if (itemId) {
      const { data: item } = await supabase.from('field_catalogue')
        .select('id,client_id').eq('id', itemId).maybeSingle()
      if (!item) return NextResponse.json({ error: 'That item is not in the catalogue' }, { status: 404 })
      if (item.client_id !== clientId) {
        return NextResponse.json({ error: 'That item belongs to a different business' }, { status: 403 })
      }
      ownerId = item.client_id
    }

    const path = catalogueImagePath(ownerId, itemId || 'new', extensionForImage(type))
    const bytes = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, bytes, { contentType: type, upsert: false })
    if (upErr) {
      return NextResponse.json({ error: `The picture could not be saved. ${upErr.message}` }, { status: 500 })
    }

    // The old picture goes, so an item that has been photographed five times
    // is not five pictures in storage with four of them unreachable.
    if (itemId) {
      const { data: before } = await supabase.from('field_catalogue')
        .select('image_url').eq('id', itemId).maybeSingle()
      await supabase.from('field_catalogue')
        .update({ image_url: path, updated_at: new Date().toISOString() })
        .eq('id', itemId)
      const old = before?.image_url
      if (old && old !== path) {
        await supabase.storage.from(BUCKET).remove([old]).catch(() => {})
      }
    }

    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
    return NextResponse.json({ path, url: signed?.signedUrl || null }, { status: 201 })
  } catch (err) {
    console.error('Catalogue image POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/** Take the picture off an item, and out of storage with it. */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const itemId = String((body as Record<string, unknown>).itemId || '')
    if (!itemId) return NextResponse.json({ error: 'Which item?' }, { status: 400 })

    const supabase = getSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: item } = await supabase.from('field_catalogue')
      .select('id,client_id,image_url').eq('id', itemId).maybeSingle()
    if (!item) return NextResponse.json({ error: 'That item is not in the catalogue' }, { status: 404 })
    if (!actorMayAccessClient(actor, item.client_id)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (!actorMayAddCataloguePictures(actor)) {
      return NextResponse.json({ error: 'You do not have permission to change catalogue pictures.' }, { status: 403 })
    }

    // The picture first and the record of it second, so a delete that fails
    // half way leaves a row pointing at nothing rather than a picture nobody
    // can see or reach.
    if (item.image_url) {
      const { error } = await supabase.storage.from(BUCKET).remove([item.image_url])
      if (error) {
        return NextResponse.json({
          error: `The picture could not be removed, so nothing has changed. ${error.message}`,
        }, { status: 500 })
      }
    }
    await supabase.from('field_catalogue')
      .update({ image_url: null, updated_at: new Date().toISOString() }).eq('id', itemId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Catalogue image DELETE error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
