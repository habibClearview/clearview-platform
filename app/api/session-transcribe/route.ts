// ============================================================
// API ROUTE: /api/session-transcribe
//
// The audio becomes words. One track at a time, because a track is one person
// and one person is what makes the transcript able to say who spoke without
// software guessing at a voice. Habib's difficulty was exactly this: three
// accents on one call. The question never arises here, because the name is
// already on the track.
//
// ONE TRACK PER REQUEST, ON PURPOSE. A two hour session is a lot of audio and
// a server request has a time limit. Doing the whole recording in one call is
// how a long session ends with nothing at all. Each call takes the next track
// that has not been done, writes what it produced, and says how many are left,
// so the screen can ask again and a long recording finishes in pieces that
// each fit.
//
// WHAT IT COSTS, SAID PLAINLY. Transcription is charged by the minute of
// audio, at roughly twenty pence an hour per track. A two hour session with
// three people is about six track hours, so somewhere near one pound twenty.
//
// WITHOUT THE KEY THIS SAYS SO. Until OPENAI_API_KEY is in the environment
// this returns a sentence explaining that, and the audio is untouched and
// still there to be transcribed later.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, requireAccess, refuseAccess } from '@/lib/auth/api-authz'
import {
  webmHeaderLength, planTranscriptionParts, placeSegments, mergeSegments,
  formatTranscript, transcriptionHint, soundsLikeSilence, silenceNote, type Segment,
} from '@/lib/transcript'
import { baseMime, extensionFor, canBeSplit } from '@/lib/recording'

export const dynamic = 'force-dynamic'
// A track of an hour takes a few minutes to come back. This is the ceiling the
// platform allows a request; going over it is what the one track at a time
// rule exists to prevent.
export const maxDuration = 300

const MODEL = 'whisper-1'

/** Every piece of one track's audio, in the order it was spoken. */
async function loadTrackAudio(admin: ReturnType<typeof getAdminClient>, folder: string) {
  const { data: listed, error } = await admin.storage.from('recordings').list(folder, {
    limit: 1000, sortBy: { column: 'name', order: 'asc' },
  })
  if (error) throw new Error(error.message)
  // Any audio the device produced, whatever the format, in the order it was
  // spoken. Filtering to .webm silently ignored every iPhone recording.
  const names = (listed || []).map((f) => f.name)
    .filter((n) => /\.(webm|mp4|m4a|ogg|wav)$/i.test(n)).sort()
  const pieces: Uint8Array[] = []
  for (const name of names) {
    const { data, error: dlErr } = await admin.storage.from('recordings').download(`${folder}/${name}`)
    if (dlErr || !data) throw new Error(dlErr?.message || `Could not read ${name}`)
    pieces.push(new Uint8Array(await data.arrayBuffer()))
  }
  return pieces
}

function join(pieces: Uint8Array[], header?: Uint8Array): Uint8Array {
  const total = (header?.length || 0) + pieces.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  if (header) { out.set(header, 0); at = header.length }
  for (const p of pieces) { out.set(p, at); at += p.length }
  return out
}

/** Send one part of one track and get back its passages, with their timings. */
async function transcribePart(
  bytes: Uint8Array, hint: string, mime: string,
): Promise<{ start: number; end: number; text: string }[]> {
  const form = new FormData()
  // join() always allocates an array of exactly the right length, so the
  // underlying buffer is the audio and nothing else.
  // NAMED FOR WHAT IT IS. The service decides how to read a file from its
  // name and its type, so an iPhone's mp4 offered as audio.webm is refused or,
  // worse, misread. Safari on iOS records mp4 and nothing else, and interview
  // capture on a phone is the point of this.
  form.append('file', new Blob([bytes.buffer as ArrayBuffer], { type: mime }), `audio.${extensionFor(mime)}`)
  form.append('model', MODEL)
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')
  if (hint) form.append('prompt', hint.slice(0, 900))

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Transcription refused (${res.status}). ${detail.slice(0, 300)}`)
  }
  const json = await res.json() as { segments?: { start: number; end: number; text: string }[]; text?: string }
  if (Array.isArray(json.segments) && json.segments.length) return json.segments
  // A service that returned words but no timings still gives a usable record.
  return json.text ? [{ start: 0, end: 0, text: json.text }] : []
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        error: 'Transcription is not switched on yet. OPENAI_API_KEY is not in the environment. The audio is safe and can be transcribed once it is.',
        notConfigured: true,
      }, { status: 503 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const recordingId = String(body.recordingId || '')
    if (!recordingId) return NextResponse.json({ error: 'Which recording?' }, { status: 400 })

    const admin = getAdminClient()
    const { data: recording } = await admin.from('session_recordings')
      .select('id,client_id,status,started_at').eq('id', recordingId).maybeSingle()
    if (!recording) return NextResponse.json({ error: 'That recording is not on file' }, { status: 404 })

    const access = await requireAccess(req, admin, recording.client_id, 'manage', {
      deniedMessage: 'Only the coaching team can produce a transcript',
      rateLimit: { key: 'transcribe', max: 200, windowSeconds: 3600 },
    })
    if (!access.ok) return refuseAccess(access)

    const { data: tracks } = await admin.from('recording_tracks')
      .select('id,speaker_name,offset_ms,duration_seconds,storage_path,status,mime_type').eq('recording_id', recording.id).order('offset_ms')
    const usable = (tracks || []).filter((t) => t.storage_path && t.status !== 'failed')
    if (!usable.length) {
      return NextResponse.json({ error: 'There is no audio on this recording to transcribe' }, { status: 409 })
    }

    // What has already been done, so a second call does the next track rather
    // than the same one again.
    const { data: existing } = await admin.from('session_transcripts')
      .select('id,segments,status').eq('recording_id', recording.id).order('version', { ascending: false })
      .limit(1).maybeSingle()
    const held = (existing?.segments as { done?: string[]; items?: Segment[] } | null) || {}
    const done: string[] = Array.isArray(held.done) ? held.done : []
    const items: Segment[] = Array.isArray(held.items) ? held.items : []

    const next = usable.find((t) => !done.includes(t.id))
    if (!next) {
      return NextResponse.json({ done: true, remaining: 0, transcriptId: existing?.id || null })
    }

    // Names, so an organisation and the people in it are spelled the same way
    // throughout instead of three ways in one transcript.
    const { data: client } = await admin.from('engagement_clients')
      .select('name').eq('id', recording.client_id).maybeSingle()
    const hint = transcriptionHint(client?.name || '', usable.map((t) => t.speaker_name || '').filter(Boolean))

    const pieces = await loadTrackAudio(admin, next.storage_path as string)
    if (!pieces.length) {
      // A track with a folder and nothing in it is recorded as done, so it
      // cannot stall the rest of the recording for ever.
      done.push(next.id)
    } else {
      // A TRACK WITH NO SOUND IN IT IS NOT SENT. 10 September 2026. The service
      // answers silence with whatever its training makes of nothing, and what
      // came back was "For more UN videos visit www.un.org", written into an
      // engagement as though a person had said it. That is a false record, and
      // a false record is worse than a missing one. It also costs money to buy.
      const totalBytes = pieces.reduce((n, p) => n + p.length, 0)
      const heardSeconds = next.duration_seconds || 0
      if (soundsLikeSilence(totalBytes, heardSeconds)) {
        items.push({
          start: (next.offset_ms || 0) / 1000,
          end: (next.offset_ms || 0) / 1000 + heardSeconds,
          speaker: next.speaker_name || 'Unnamed speaker',
          text: silenceNote(next.speaker_name || 'This device'),
          // Not speech. Without this it was joined onto the end of the same
          // person's words on their other device, which is a transcript
          // putting words in somebody's mouth.
          note: true,
        })
        await admin.from('recording_tracks').update({
          status: 'failed',
          failure_reason: 'no audible sound was captured on this device',
          updated_at: new Date().toISOString(),
        }).eq('id', next.id)
        done.push(next.id)
      } else {
      const mime = baseMime(next.mime_type)
      const speaker = next.speaker_name || 'Unnamed speaker'

      if (!canBeSplit(mime)) {
        // Mp4 keeps what it needs to be read in one piece, so cutting it makes
        // something no player will open. It goes whole, and if it is too large
        // the service says so, which is an answer somebody can act on.
        const raw = await transcribePart(join(pieces), hint, mime)
        items.push(...placeSegments(raw, speaker, next.offset_ms || 0, 0))
      } else {
        const headerLength = webmHeaderLength(pieces[0])
        const header = headerLength > 0 ? pieces[0].slice(0, headerLength) : undefined
        const parts = planTranscriptionParts(pieces.map((p) => p.length), header?.length || 0)
        for (const part of parts) {
          const audio = join(
            part.chunkIndexes.map((i) => pieces[i]),
            part.needsHeader ? header : undefined,
          )
          const raw = await transcribePart(audio, hint, mime)
          items.push(...placeSegments(raw, speaker, next.offset_ms || 0, part.offsetMs))
        }
      }
      done.push(next.id)
      }
    }

    const merged = mergeSegments([items])
    const remaining = usable.filter((t) => !done.includes(t.id)).length
    const finished = remaining === 0

    const patch = {
      recording_id: recording.id,
      client_id: recording.client_id,
      body: finished ? formatTranscript(merged) : null,
      segments: { done, items: merged },
      produced_by: MODEL,
      language: 'en',
      status: 'draft',
      updated_at: new Date().toISOString(),
    }

    let transcriptId = existing?.id || null
    if (transcriptId) {
      const { error } = await admin.from('session_transcripts').update(patch).eq('id', transcriptId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { data, error } = await admin.from('session_transcripts').insert(patch).select('id').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      transcriptId = data.id
    }

    if (finished) {
      await admin.from('session_recordings')
        .update({ status: 'transcribed', updated_at: new Date().toISOString() }).eq('id', recording.id)
    }

    return NextResponse.json({
      done: finished, remaining, transcriptId,
      justDone: next.speaker_name || 'a track',
      passages: merged.length,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}

// ─── READING WHAT CAME BACK ──────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const admin = getAdminClient()
    const recordingId = new URL(req.url).searchParams.get('recordingId') || ''
    if (!recordingId) return NextResponse.json({ error: 'Which recording?' }, { status: 400 })

    const { data: recording } = await admin.from('session_recordings')
      .select('id,client_id,status').eq('id', recordingId).maybeSingle()
    if (!recording) return NextResponse.json({ error: 'That recording is not on file' }, { status: 404 })

    const access = await requireAccess(req, admin, recording.client_id, 'view')
    if (!access.ok) return refuseAccess(access)

    const { data: transcript } = await admin.from('session_transcripts')
      .select('id,body,segments,status,version,issued_at,produced_by')
      .eq('recording_id', recording.id).order('version', { ascending: false }).limit(1).maybeSingle()

    return NextResponse.json({ transcript: transcript || null, canManage: access.canManage })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}
