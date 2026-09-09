// ============================================================
// API ROUTE: /api/session-recording/chunk
//
// Where the audio actually lands. A device sends half a minute at a time, and
// each half minute is written to the private recordings bucket as its own
// object under that device's folder.
//
// WHY IN PIECES RATHER THAN ONE FILE AT THE END. A phone that dies, a browser
// tab that is closed, a laptop that runs out of battery: with one file at the
// end, all of those lose the session. In pieces they lose at most the last
// thirty seconds, and the upload happens throughout rather than as one large
// transfer at the moment everybody is trying to leave.
//
// The pieces are numbered with leading zeros so they sort back into the order
// they were spoken, and the folder is one per engagement, then per recording,
// then per device, so a recording can be found, replayed and removed whole.
//
// A DEVICE CAN ONLY WRITE TO A TRACK THAT EXISTS. The device identifier comes
// from the browser, so on its own it would be a name anybody could choose.
// The track must already have been joined to this recording, which is the
// step that requires being on the engagement.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, requireAccess, refuseAccess } from '@/lib/auth/api-authz'
import { trackStoragePath, AUDIO_MIME } from '@/lib/recording'

export const dynamic = 'force-dynamic'

/** Thirty seconds of speech is about a hundred kilobytes. Ten megabytes is a
 *  very large margin, and a limit is what stops the bucket being a free disk. */
const MAX_CHUNK_BYTES = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'No audio in the request' }, { status: 400 })

    const recordingId = String(form.get('recordingId') || '')
    const deviceId = String(form.get('deviceId') || '').slice(0, 120)
    const chunkIndex = Number(form.get('chunkIndex') || 0)
    const file = form.get('file')

    if (!recordingId || !deviceId) {
      return NextResponse.json({ error: 'Which recording and which device?' }, { status: 400 })
    }
    if (!(file instanceof Blob)) return NextResponse.json({ error: 'No audio in the request' }, { status: 400 })
    if (file.size === 0) return NextResponse.json({ error: 'That piece of audio is empty' }, { status: 400 })
    if (file.size > MAX_CHUNK_BYTES) {
      return NextResponse.json({ error: 'That piece of audio is too large' }, { status: 413 })
    }

    const admin = getAdminClient()
    const { data: recording } = await admin.from('session_recordings')
      .select('id,client_id,status').eq('id', recordingId).maybeSingle()
    if (!recording) return NextResponse.json({ error: 'That recording is not on file' }, { status: 404 })

    const access = await requireAccess(req, admin, recording.client_id, 'view', {
      deniedMessage: 'You are not on this engagement',
    })
    if (!access.ok) return refuseAccess(access)

    const { data: track } = await admin.from('recording_tracks')
      .select('id,storage_path').eq('recording_id', recording.id).eq('device_id', deviceId).maybeSingle()
    if (!track) {
      return NextResponse.json({ error: 'This device has not joined the recording' }, { status: 409 })
    }

    const path = trackStoragePath(recording.client_id, recording.id, deviceId, chunkIndex)
    const bytes = new Uint8Array(await file.arrayBuffer())

    const { error: upErr } = await admin.storage.from('recordings')
      .upload(path, bytes, { contentType: AUDIO_MIME, upsert: true })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    // The track remembers its folder, so the pieces can be found without
    // having to reconstruct the path from four separate values.
    if (!track.storage_path) {
      const folder = path.slice(0, path.lastIndexOf('/'))
      await admin.from('recording_tracks')
        .update({ storage_path: folder, updated_at: new Date().toISOString() }).eq('id', track.id)
    }

    return NextResponse.json({ ok: true, path, bytes: bytes.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}
