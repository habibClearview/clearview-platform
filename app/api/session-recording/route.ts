// ============================================================
// API ROUTE: /api/session-recording
//
// The recording's own record. Opening one, joining a device to it, saying how
// far each device has got, saying when a device has failed, and closing it.
// The audio itself goes to /api/session-recording/chunk; this route never
// touches a byte of it.
//
// WHO MAY DO WHAT, AND WHY THEY DIFFER.
//
//   opening and closing a recording needs manage rights, because it is the
//   coaching team who runs a session and it is their record.
//
//   joining a device, reporting progress and reporting a failure needs only
//   view rights. The funder and the Executive Director are on the call and
//   their own microphones are the point; a rule that only the coach may
//   record would leave two of the three voices out. A person can only ever
//   write to their own device's track, so view rights buy exactly one voice.
//
// CONSENT IS CHECKED WHEN THE RECORDING OPENS, not when a device joins, so
// nobody is refused in front of the room. If anybody on the engagement has
// refused, or has never been asked, opening is refused and the answer names
// them. Silence is never taken as agreement.
//
// THE OFFSET IS THE WHOLE TRICK. The server stamped started_at when the
// recording opened. A device reports the moment its own recorder began and
// the difference is stored once, on the track. Nothing downstream has to
// think about when buttons were pressed.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, requireAccess, refuseAccess } from '@/lib/auth/api-authz'
import { trackOffsetMs, consentCheck, liveTrackState, recordingSpanSeconds, type ConsentMethod } from '@/lib/recording'

export const dynamic = 'force-dynamic'

type Action = 'open' | 'join' | 'progress' | 'fail' | 'finish' | 'stop' | 'consent'

/** Find the recording and the engagement it belongs to, or say it is not there. */
async function loadRecording(admin: ReturnType<typeof getAdminClient>, recordingId: string) {
  if (!recordingId) return null
  const { data } = await admin
    .from('session_recordings')
    .select('id,client_id,started_at,ended_at,status,title,session_id,interview_id,dp_id')
    .eq('id', recordingId).maybeSingle()
  return data || null
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action || '') as Action
    const admin = getAdminClient()

    // ─── Opening one ───────────────────────────────────────
    if (action === 'open') {
      const clientId = String(body.clientId || '')
      if (!clientId) return NextResponse.json({ error: 'Which engagement is this for?' }, { status: 400 })

      const access = await requireAccess(req, admin, clientId, 'manage', {
        deniedMessage: 'Only the coaching team can start a recording',
        rateLimit: { key: 'recording-open', max: 30, windowSeconds: 3600 },
      })
      if (!access.ok) return refuseAccess(access)

      // CONSENT IS ASKED OF THE PEOPLE WHO WILL BE RECORDED, and of nobody
      // else. For a planned session that is its attendees: a board chair who
      // is not in the room has no view to give about a conversation they are
      // not in, and requiring one would stop the session for no reason. Where
      // a session has no attendee list, and for a field interview, it falls
      // back to everybody on the engagement, which is the cautious answer.
      const { data: parties } = await admin
        .from('engagement_parties')
        .select('id,name,recording_consent')
        .eq('client_id', clientId)

      let mustAgree = parties || []
      if (body.sessionId) {
        const { data: attending } = await admin.from('gtcv_session_attendance')
          .select('party_id').eq('session_id', String(body.sessionId))
        const ids = new Set((attending || []).map((a) => a.party_id).filter(Boolean))
        if (ids.size > 0) mustAgree = mustAgree.filter((p) => ids.has(p.id))
      }
      const consent = consentCheck(mustAgree)
      if (!consent.mayRecord && body.force !== true) {
        return NextResponse.json({
          error: consent.reason, refused: consent.refused, notAsked: consent.notAsked, needsConsent: true,
        }, { status: 409 })
      }

      const sessionId = body.sessionId ? String(body.sessionId) : null
      const interviewId = body.interviewId ? String(body.interviewId) : null

      // A session that is already being recorded is joined, not started twice.
      if (sessionId) {
        const { data: live } = await admin.from('session_recordings')
          .select('id,client_id,started_at,status,title')
          .eq('session_id', sessionId).eq('status', 'opening').maybeSingle()
        if (live) return NextResponse.json({ recording: live, alreadyOpen: true })
      }

      const { data: created, error } = await admin.from('session_recordings').insert({
        client_id: clientId,
        session_id: sessionId,
        interview_id: interviewId,
        dp_id: body.dpId ? String(body.dpId) : null,
        title: body.title ? String(body.title).slice(0, 200) : null,
        started_by: access.userId,
        status: 'opening',
      }).select('id,client_id,started_at,status,title').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({ recording: created })
    }

    // ─── Consent taken before anything is open ─────────────
    //
    // Consent belongs to the person, not to the session, and it is usually
    // taken long before a recording exists: in the Charter, or in the sentence
    // read at the top of the first call. This is that answer, recorded against
    // the party so it never has to be asked again.
    if (action === 'consent' && !body.recordingId) {
      const clientId = String(body.clientId || '')
      const partyId = String(body.partyId || '')
      if (!clientId || !partyId) {
        return NextResponse.json({ error: 'Which engagement and which person?' }, { status: 400 })
      }
      const access = await requireAccess(req, admin, clientId, 'manage', {
        deniedMessage: 'Only the coaching team can record an answer about recording',
      })
      if (!access.ok) return refuseAccess(access)

      const method = String(body.method || '') as ConsentMethod
      if (!['written', 'spoken', 'refused'].includes(method)) {
        return NextResponse.json({ error: 'Say whether it was written, spoken or refused' }, { status: 400 })
      }
      const { error } = await admin.from('engagement_parties')
        .update({ recording_consent: method, recording_consent_at: new Date().toISOString() })
        .eq('id', partyId).eq('client_id', clientId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // Everything below acts on an existing recording.
    const recordingId = String(body.recordingId || '')
    const recording = await loadRecording(admin, recordingId)
    if (!recording) return NextResponse.json({ error: 'That recording is not on file' }, { status: 404 })

    // ─── Joining a device ──────────────────────────────────
    if (action === 'join') {
      const access = await requireAccess(req, admin, recording.client_id, 'view', {
        deniedMessage: 'You are not on this engagement',
      })
      if (!access.ok) return refuseAccess(access)

      const deviceId = String(body.deviceId || '').slice(0, 120)
      if (!deviceId) return NextResponse.json({ error: 'This device has no identifier' }, { status: 400 })
      if (recording.status !== 'opening') {
        return NextResponse.json({ error: 'That recording has already been closed' }, { status: 409 })
      }

      const offset = trackOffsetMs(recording.started_at, String(body.startedAt || new Date().toISOString()))
      const { data: track, error } = await admin.from('recording_tracks').upsert({
        recording_id: recording.id,
        device_id: deviceId,
        party_id: body.partyId ? String(body.partyId) : null,
        // WHO WAS IN THE ROOM, AS AN ACCOUNT. The room is the list of devices
        // that recorded, and a transcript is signed by the people whose words
        // it is. Without this the lead consultant, who is always in the room
        // and is not always a party, could not sign his own words.
        user_id: access.userId,
        speaker_name: body.speakerName ? String(body.speakerName).slice(0, 160) : (access.fullName || null),
        offset_ms: offset,
        status: 'recording',
        failure_reason: null,
        // What the browser says it actually opened. Kept on the record, not
        // only on a screen, so a session that captured nothing can be
        // explained afterwards instead of argued about.
        device_report: body.deviceReport && typeof body.deviceReport === 'object' ? body.deviceReport : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'recording_id,device_id' })
        .select('id,device_id,speaker_name,offset_ms,status').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({ track, startedAt: recording.started_at })
    }

    // ─── How far this device has got, and whether it broke ─
    if (action === 'progress' || action === 'fail' || action === 'finish') {
      const access = await requireAccess(req, admin, recording.client_id, 'view', {
        deniedMessage: 'You are not on this engagement',
      })
      if (!access.ok) return refuseAccess(access)

      const deviceId = String(body.deviceId || '').slice(0, 120)
      if (!deviceId) return NextResponse.json({ error: 'This device has no identifier' }, { status: 400 })

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (typeof body.durationSeconds === 'number' && body.durationSeconds >= 0) {
        patch.duration_seconds = Math.round(body.durationSeconds)
      }
      if (action === 'fail') {
        patch.status = 'failed'
        patch.failure_reason = String(body.reason || 'their device could not record').slice(0, 300)
      }
      if (action === 'finish') {
        patch.status = 'uploaded'
        patch.failure_reason = null
      }

      const { error } = await admin.from('recording_tracks')
        .update(patch).eq('recording_id', recording.id).eq('device_id', deviceId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ─── Recording somebody's answer to the consent sentence ─
    if (action === 'consent') {
      const access = await requireAccess(req, admin, recording.client_id, 'view', {
        deniedMessage: 'You are not on this engagement',
      })
      if (!access.ok) return refuseAccess(access)

      const method = String(body.method || '') as ConsentMethod
      if (!['written', 'spoken', 'refused'].includes(method)) {
        return NextResponse.json({ error: 'Say whether it was written, spoken or refused' }, { status: 400 })
      }
      const partyId = body.partyId ? String(body.partyId) : null

      const { error } = await admin.from('recording_consent').insert({
        recording_id: recording.id,
        party_id: partyId,
        person_name: body.personName ? String(body.personName).slice(0, 160) : null,
        method,
        spoken_at_offset_ms: typeof body.spokenAtOffsetMs === 'number' ? Math.round(body.spokenAtOffsetMs) : null,
        agreed: method !== 'refused',
        recorded_by: access.userId,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Consent is a property of the person, taken once, so it is written back
      // to the party and does not have to be asked again next session.
      if (partyId) {
        await admin.from('engagement_parties')
          .update({ recording_consent: method, recording_consent_at: new Date().toISOString() })
          .eq('id', partyId).eq('client_id', recording.client_id)
      }
      return NextResponse.json({ ok: true })
    }

    // ─── Closing it ────────────────────────────────────────
    if (action === 'stop') {
      const access = await requireAccess(req, admin, recording.client_id, 'manage', {
        deniedMessage: 'Only the coaching team can stop a recording',
      })
      if (!access.ok) return refuseAccess(access)

      const { data: tracks } = await admin.from('recording_tracks')
        .select('id,device_id,speaker_name,offset_ms,duration_seconds,status,failure_reason')
        .eq('recording_id', recording.id)

      // A device still marked recording has stopped now, because the room has.
      await admin.from('recording_tracks')
        .update({ status: 'uploaded', updated_at: new Date().toISOString() })
        .eq('recording_id', recording.id).eq('status', 'recording')

      const seconds = recordingSpanSeconds((tracks || []) as never)
      const { error } = await admin.from('session_recordings').update({
        status: 'recorded',
        ended_at: new Date().toISOString(),
        merged_seconds: seconds,
        updated_at: new Date().toISOString(),
      }).eq('id', recording.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({ ok: true, seconds, tracks: liveTrackState((tracks || []) as never) })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}

// ─── WHAT THE ROOM LOOKS LIKE RIGHT NOW ──────────────────────
//
// This is what the panel on screen polls. It is the answer to "what if
// somebody's recording silently fails": a line per person, green with the
// minutes captured or red with the reason, while the session is still running.
export async function GET(req: NextRequest) {
  try {
    const admin = getAdminClient()
    const url = new URL(req.url)
    const recordingId = url.searchParams.get('recordingId') || ''
    const sessionId = url.searchParams.get('sessionId') || ''
    const interviewId = url.searchParams.get('interviewId') || ''
    const clientId = url.searchParams.get('clientId') || ''

    // EVERY RECORDING ON THIS ENGAGEMENT, IN ONE LIST. 10 September 2026.
    // Habib: there is no list anywhere on the page or on the client page to
    // show what has been recorded and who was on it. There was not, so a
    // recording could only be found by remembering which session it belonged
    // to and opening that session's room.
    if (url.searchParams.get('list') === '1') {
      const forClient = url.searchParams.get('clientId') || ''
      if (!forClient) return NextResponse.json({ error: 'Which engagement?' }, { status: 400 })
      const access = await requireAccess(req, admin, forClient, 'view')
      if (!access.ok) return refuseAccess(access)

      const { data: rows } = await admin.from('session_recordings')
        .select('id,session_id,interview_id,dp_id,title,status,started_at,ended_at,merged_seconds')
        .eq('client_id', forClient).order('started_at', { ascending: false }).limit(200)

      const ids = (rows || []).map((r) => r.id)
      const [{ data: tracks }, { data: transcripts }, { data: sessions }] = await Promise.all([
        ids.length
          ? admin.from('recording_tracks').select('recording_id,speaker_name,duration_seconds,status')
            .in('recording_id', ids)
          : Promise.resolve({ data: [] as never[] }),
        ids.length
          ? admin.from('session_transcripts').select('id,recording_id,status,version').in('recording_id', ids)
          : Promise.resolve({ data: [] as never[] }),
        admin.from('gtcv_sessions').select('id,title').eq('client_id', forClient),
      ])

      const titleFor = new Map((sessions || []).map((x) => [x.id, x.title]))
      const recordings = (rows || []).map((r) => ({
        ...r,
        heading: r.title || titleFor.get(r.session_id) || (r.interview_id ? 'Customer conversation' : 'Working session'),
        who: (tracks || []).filter((t) => t.recording_id === r.id)
          .map((t) => ({ name: t.speaker_name || 'Unnamed', minutes: Math.floor((t.duration_seconds || 0) / 60), ok: t.status !== 'failed' })),
        transcript: (transcripts || []).find((t) => t.recording_id === r.id) || null,
      }))
      return NextResponse.json({ recordings, canManage: access.canManage })
    }

    let recording = recordingId ? await loadRecording(admin, recordingId) : null

    // A device arriving at a session asks by the session, because it does not
    // know the recording's id until somebody has opened one.
    if (!recording && sessionId) {
      const { data } = await admin.from('session_recordings')
        .select('id,client_id,started_at,ended_at,status,title,session_id,interview_id,dp_id')
        .eq('session_id', sessionId).order('started_at', { ascending: false }).limit(1).maybeSingle()
      recording = data || null
    }

    // A field interviewer's device asks by the interview, for the same reason.
    if (!recording && interviewId) {
      const { data } = await admin.from('session_recordings')
        .select('id,client_id,started_at,ended_at,status,title,session_id,interview_id,dp_id')
        .eq('interview_id', interviewId).order('started_at', { ascending: false }).limit(1).maybeSingle()
      recording = data || null
    }

    if (!recording) {
      // NOTHING OPEN IS NOT NOTHING TO SAY. 10 September 2026.
      //
      // This returned the empty answer without canManage, and the session room
      // reads canManage from exactly this call to decide whether to offer Start
      // recording. Before the first recording exists there is no recording, so
      // this branch always answered, so canManage was always false, so the
      // button never appeared and the whole feature was unreachable from the
      // screen built for it. The lead consultant opened a session room and was
      // shown a heading with nothing under it.
      if (!clientId) return NextResponse.json({ recording: null, tracks: [], canManage: false })
      const access = await requireAccess(req, admin, clientId, 'view')
      if (!access.ok) return refuseAccess(access)
      return NextResponse.json({
        recording: null, tracks: [], live: [], seconds: 0, canManage: access.canManage,
      })
    }

    const access = await requireAccess(req, admin, recording.client_id, 'view')
    if (!access.ok) return refuseAccess(access)

    const { data: tracks } = await admin.from('recording_tracks')
      .select('id,device_id,party_id,speaker_name,offset_ms,duration_seconds,status,failure_reason')
      .eq('recording_id', recording.id).order('offset_ms')

    return NextResponse.json({
      recording,
      tracks: tracks || [],
      live: liveTrackState((tracks || []) as never),
      seconds: recordingSpanSeconds((tracks || []) as never),
      canManage: access.canManage,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}
