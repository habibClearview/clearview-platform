// ============================================================
// API ROUTE: /api/session-recording/audio
//
// LISTENING BACK. A recording nobody can play is not a record, it is a bill
// for storage. This is what hands one person's track back as one file that a
// browser will play.
//
// The pieces are joined here rather than being made into a merged file when
// the session stops, for one reason: a merge that happens at the end is a
// thing that can fail at the end, silently, on the one occasion it matters.
// Joining on the way out means the audio is playable from the moment the first
// piece lands, including while the session is still running.
//
// The audio never leaves the platform's own address. There is no public link
// to a recording of somebody's voice, so there is nothing to forward, nothing
// to guess and nothing that keeps working after somebody is taken off the
// engagement.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, requireAccess, refuseAccess } from '@/lib/auth/api-authz'
import { AUDIO_MIME } from '@/lib/recording'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const trackId = url.searchParams.get('trackId') || ''
    if (!trackId) return NextResponse.json({ error: 'Which track?' }, { status: 400 })

    const admin = getAdminClient()
    const { data: track } = await admin.from('recording_tracks')
      .select('id,recording_id,speaker_name,storage_path').eq('id', trackId).maybeSingle()
    if (!track?.storage_path) return NextResponse.json({ error: 'That track has no audio' }, { status: 404 })

    const { data: recording } = await admin.from('session_recordings')
      .select('id,client_id').eq('id', track.recording_id).maybeSingle()
    if (!recording) return NextResponse.json({ error: 'That recording is not on file' }, { status: 404 })

    // Everybody on the engagement may listen. Nobody else may, and there is no
    // link that works without this check.
    const access = await requireAccess(req, admin, recording.client_id, 'view', {
      deniedMessage: 'You are not on this engagement',
    })
    if (!access.ok) return refuseAccess(access)

    const { data: listed, error } = await admin.storage.from('recordings')
      .list(track.storage_path, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const names = (listed || []).map((f) => f.name).filter((n) => n.endsWith('.webm')).sort()
    if (!names.length) return NextResponse.json({ error: 'That track has no audio' }, { status: 404 })

    const pieces: Uint8Array[] = []
    for (const name of names) {
      const { data } = await admin.storage.from('recordings').download(`${track.storage_path}/${name}`)
      if (data) pieces.push(new Uint8Array(await data.arrayBuffer()))
    }
    const total = pieces.reduce((n, p) => n + p.length, 0)
    const joined = new Uint8Array(total)
    let at = 0
    for (const p of pieces) { joined.set(p, at); at += p.length }

    return new NextResponse(joined, {
      headers: {
        'Content-Type': AUDIO_MIME,
        'Content-Length': String(total),
        'Content-Disposition': `inline; filename="${(track.speaker_name || 'track').replace(/[^A-Za-z0-9 _.-]/g, '')}.webm"`,
        // A recording of somebody's voice is never cached by anything in
        // between, and never by a shared cache at all.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}
