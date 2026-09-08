// ============================================================
// API ROUTE: /api/tor-extract
//
// Takes the signed Scope of Work or Purchase Order and reads the few facts the
// welcome letter needs out of it, so they are not retyped from a document that
// is already on the coach's desk.
//
// IT KEEPS THE DOCUMENT. Until 8 September there was nowhere to put a signed
// contract, so the file was read for its details and discarded. There is a
// private 'contracts' bucket now, so the paper the engagement rests on is kept
// beside the engagement rather than living only in somebody's mail.
//
// Storing is best effort. A bucket that is missing or refuses the write must
// never cost the coach the extraction they were actually asking for, so a
// failure to store is reported alongside the fields rather than instead of
// them.
//
// Manager-only, on a client they manage, and size-capped: PDF parsing is the
// kind of work an open endpoint should never be handed.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken } from '@/lib/auth/api-authz'
import { resolveClientAccess } from '@/lib/auth/engagement-access'
import { checkRateLimit } from '@/lib/rate-limit'
import { parseTor } from '@/lib/tor-parse'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MAX_BYTES = 12 * 1024 * 1024

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** Every page's text, joined. No rendering, so no canvas and no fonts needed. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  // The legacy build is the one that runs outside a browser.
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({
    data: bytes,
    useSystemFonts: false,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise
  const pages: string[] = []
  const limit = Math.min(doc.numPages, 40)
  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((it: any) => (typeof it.str === 'string' ? it.str : '')).join(' '))
  }
  await doc.destroy?.()
  return pages.join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const form = await req.formData().catch(() => null)
    const clientId = String(form?.get('clientId') || '')
    const file = form?.get('file')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Attach the document as a file.' }, { status: 400 })
    }

    const admin = getAdminClient()
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const access = await resolveClientAccess(admin, user.id, clientId)
    if (!access.canManage) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const rl = await checkRateLimit(admin, `tor-extract:${user.id}`, 40, 3600)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'That is a lot of documents at once. Try again shortly.' }, { status: 429 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'That file is larger than 12MB.' }, { status: 413 })
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    // %PDF- — checked rather than trusting the name or the browser's mime type.
    const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
    const text = isPdf
      ? await pdfText(bytes)
      : new TextDecoder('utf-8', { fatal: false }).decode(bytes)

    if (!text.trim()) {
      return NextResponse.json({
        fields: {},
        note: 'Nothing readable came out of that file. If it is a scan rather than a text PDF, type the details in instead.',
      })
    }

    // <clientId>/<timestamp>-<name>, so one engagement's papers cannot land in
    // another's folder and two uploads of the same name cannot overwrite.
    let stored: string | null = null
    let storeProblem: string | null = null
    try {
      const safeName = (file.name || 'contract').replace(/[^A-Za-z0-9._-]/g, '_').slice(-80)
      const path = `${clientId}/${Date.now()}-${safeName}`
      const { error: upErr } = await admin.storage.from('contracts')
        .upload(path, bytes, { contentType: file.type || 'application/octet-stream', upsert: false })
      if (upErr) storeProblem = upErr.message
      else stored = path
    } catch (e: unknown) {
      storeProblem = (e as Error)?.message || 'could not be stored'
    }

    return NextResponse.json({ fields: parseTor(text), stored, storeProblem })
  } catch (e: any) {
    console.error('tor-extract: unexpected error', e)
    return NextResponse.json({ error: 'Could not read that document.' }, { status: 500 })
  }
}
