// ============================================================
// API ROUTE: /api/tor-extract
//
// Takes the signed Scope of Work or Purchase Order and reads the few facts the
// welcome letter needs out of it, so they are not retyped from a document that
// is already on the coach's desk.
//
// IT STORES NOTHING. The file is read in memory, the text is thrown away with
// the request, and only the extracted fields come back — which the coach then
// sees, corrects and saves. There is no bucket to configure and no document
// sitting on the platform that somebody has to remember to delete. When there
// is somewhere proper to keep contracts, this is the route that will put them
// there; until then, not storing is better than storing badly.
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

    return NextResponse.json({ fields: parseTor(text) })
  } catch (e: any) {
    console.error('tor-extract: unexpected error', e)
    return NextResponse.json({ error: 'Could not read that document.' }, { status: 500 })
  }
}
