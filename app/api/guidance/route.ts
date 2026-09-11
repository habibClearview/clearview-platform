// ============================================================
// API ROUTE: /api/guidance — the method's own manuals
//
// 11 September 2026. Habib asked where a co-implementer gets the guidance
// notes and manuals, and whether she should have access to his Gmail folder
// that holds them.
//
// She should not. A mail folder is reached through a mail account, and that
// account holds his commercial terms, his other clients and everything else.
// Access to a folder is access to an account. So the manuals live here.
//
// NOT AGAINST A CLIENT. These are the method, not anybody's engagement. One
// library, read by the coaching team wherever they are working, which is also
// what stops the same manual being uploaded onto six clients and corrected on
// one of them.
//
// WHO SEES IT. The lead consultant and the co-implementers. A client or a
// funder never sees the coach's guidance, which is the rule the Coach quick
// reference already follows. Only the lead consultant changes it.
//
// THE FILE NEVER GETS AN ADDRESS OF ITS OWN. A manual is downloaded through
// this route, behind the same check as everything else, so there is no link
// that keeps working for somebody who has left the team.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, getBearerToken } from '@/lib/auth/api-authz'
import { GUIDANCE_CATEGORIES, guidanceStoragePath, isGuidanceCategory } from '@/lib/guidance'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** A manual is a large file by the standards of this platform. */
const MAX_BYTES = 50 * 1024 * 1024

type Who = { ok: true; userId: string; role: string; isLead: boolean } | { ok: false; error: string; status: 401 | 403 }

/**
 * The coaching team reads, the lead consultant writes.
 *
 * Resolved from the bearer token and the profile, never from the request, and
 * failing closed: an unknown role reads nothing.
 */
async function who(req: NextRequest, admin: ReturnType<typeof getAdminClient>): Promise<Who> {
  const token = getBearerToken(req)
  if (!token) return { ok: false, error: 'Not authenticated', status: 401 }
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return { ok: false, error: 'Not authenticated', status: 401 }

  const { data: profile } = await admin
    .from('user_profiles').select('role').eq('id', user.id).maybeSingle()
  const role = profile?.role || ''
  if (!['super_coach', 'coach', 'co_implementer'].includes(role)) {
    return { ok: false, error: 'The guidance library is for the coaching team', status: 403 }
  }
  return { ok: true, userId: user.id, role, isLead: role === 'super_coach' }
}

// ─── READING THE LIBRARY ─────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const admin = getAdminClient()
    const auth = await who(req, admin)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    // One document, fetched to be read. It comes through this route rather
    // than from an address of its own, so nothing keeps working for somebody
    // who has left the team.
    const wantFile = new URL(req.url).searchParams.get('download')
    if (wantFile) {
      const { data: doc } = await admin.from('guidance_documents')
        .select('id,title,file_path,mime_type').eq('id', wantFile).maybeSingle()
      if (!doc?.file_path) return NextResponse.json({ error: 'That document is not on file' }, { status: 404 })

      const { data: blob, error } = await admin.storage.from('guidance').download(doc.file_path)
      if (error || !blob) return NextResponse.json({ error: error?.message || 'It could not be read' }, { status: 500 })

      const bytes = new Uint8Array(await blob.arrayBuffer())
      const safeName = String(doc.title || 'document').replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, 80)
      const extension = doc.file_path.split('.').pop() || 'pdf'
      return new NextResponse(bytes, {
        headers: {
          'Content-Type': doc.mime_type || 'application/octet-stream',
          'Content-Length': String(bytes.length),
          'Content-Disposition': `inline; filename="${safeName}.${extension}"`,
          'Cache-Control': 'private, no-store',
        },
      })
    }

    const { data: documents, error } = await admin.from('guidance_documents')
      .select('id,title,description,category,file_path,url,mime_type,size_bytes,sort_order,created_at')
      .order('category').order('sort_order').order('created_at')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      documents: documents || [],
      categories: GUIDANCE_CATEGORIES,
      canManage: auth.isLead,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}

// ─── ADDING TO IT ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const admin = getAdminClient()
    const auth = await who(req, admin)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (!auth.isLead) {
      return NextResponse.json({ error: 'Only the lead consultant can add to the guidance library' }, { status: 403 })
    }

    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'Nothing was sent' }, { status: 400 })

    const title = String(form.get('title') || '').trim().slice(0, 200)
    if (!title) return NextResponse.json({ error: 'Give the document a title' }, { status: 400 })

    const category = String(form.get('category') || 'method')
    if (!isGuidanceCategory(category)) {
      return NextResponse.json({ error: 'That is not one of the sections' }, { status: 400 })
    }

    const description = String(form.get('description') || '').trim().slice(0, 600) || null
    const link = String(form.get('url') || '').trim()
    const file = form.get('file')

    // Exactly one source. A document that is both a file and a link is two
    // documents that will disagree.
    const hasFile = file instanceof Blob && file.size > 0
    if (hasFile === Boolean(link)) {
      return NextResponse.json({
        error: 'Either upload the document or give a link to it, not both and not neither.',
      }, { status: 400 })
    }

    let filePath: string | null = null
    let mimeType: string | null = null
    let sizeBytes: number | null = null

    if (hasFile) {
      const blob = file as Blob
      if (blob.size > MAX_BYTES) {
        return NextResponse.json({ error: 'That file is larger than 50MB' }, { status: 413 })
      }
      const name = (form.get('filename') ? String(form.get('filename')) : 'document')
      filePath = guidanceStoragePath(category, title, name)
      mimeType = blob.type || 'application/octet-stream'
      sizeBytes = blob.size
      const { error } = await admin.storage.from('guidance')
        .upload(filePath, new Uint8Array(await blob.arrayBuffer()), { contentType: mimeType, upsert: true })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else if (!/^https?:\/\//i.test(link)) {
      return NextResponse.json({ error: 'A link has to begin with http or https' }, { status: 400 })
    }

    const { data, error } = await admin.from('guidance_documents').insert({
      title, description, category,
      file_path: filePath, url: filePath ? null : link,
      mime_type: mimeType, size_bytes: sizeBytes,
      uploaded_by: auth.userId,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, id: data.id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}

// ─── TAKING SOMETHING OUT ────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const admin = getAdminClient()
    const auth = await who(req, admin)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (!auth.isLead) {
      return NextResponse.json({ error: 'Only the lead consultant can remove a document' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Which document?' }, { status: 400 })

    const { data: doc } = await admin.from('guidance_documents')
      .select('id,file_path').eq('id', id).maybeSingle()
    if (!doc) return NextResponse.json({ error: 'That document is not on file' }, { status: 404 })

    // The file first, so a failure leaves a row pointing at nothing rather
    // than a file nobody can see or reach.
    if (doc.file_path) {
      const { error } = await admin.storage.from('guidance').remove([doc.file_path])
      if (error) {
        return NextResponse.json({
          error: `The file could not be removed, so nothing has been deleted. ${error.message}`,
        }, { status: 500 })
      }
    }
    const { error: delErr } = await admin.from('guidance_documents').delete().eq('id', id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}
