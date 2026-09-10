// ============================================================
// API ROUTE: /api/transcript-sign
//
// A transcript that nobody has confirmed is a machine's opinion of a
// conversation. What makes it a record is that the people who were there read
// it and put their names to it.
//
// THREE THINGS HAPPEN HERE.
//
//   correct  the coaching team fixes what came back wrong. Only while it is a
//            draft, because correcting words somebody has already signed is
//            not a correction.
//   issue    the draft is locked and everyone who was in the room is asked to
//            sign. From this moment the words cannot change.
//   sign     a person types their own name. That is the signature: not a
//            tick, not a button, their name in their own hand.
//
// A SIGNATURE BELONGS TO A VERSION. If a correction is needed after signing,
// the transcript goes back to draft as a NEW version, and the signatures on
// the old one stay against the words that were actually signed. Nobody's name
// is ever moved onto words they did not read.
//
// WHO MAY SIGN. Everybody on the engagement, not only its named signatories.
// A Charter is signed by the people whose office is to sign it; a transcript
// is signed by the people whose words it is, and those are different lists.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, requireAccess, refuseAccess } from '@/lib/auth/api-authz'
import { resolveSigner, isRefusal } from '@/lib/auth/signing-party'

export const dynamic = 'force-dynamic'

async function loadTranscript(admin: ReturnType<typeof getAdminClient>, id: string) {
  const { data } = await admin.from('session_transcripts')
    .select('id,recording_id,client_id,body,status,version,issued_at').eq('id', id).maybeSingle()
  return data || null
}


/**
 * THE SIGNED TRANSCRIPT BECOMES EVIDENCE, BY ITSELF.
 *
 * A transcript everybody has signed is the strongest evidence an engagement
 * can hold: not somebody's account of a conversation, the conversation. Making
 * the coach remember to copy it into the evidence library is how it does not
 * get there, so it puts itself there the moment the last signature lands.
 *
 * The reference is computed from what is already recorded, and a clash is
 * retried, because two entries sharing one reference makes a claim ambiguous
 * in a funder pack.
 */
async function fileAsEvidence(
  admin: ReturnType<typeof getAdminClient>,
  transcript: { id: string; client_id: string; recording_id: string; version: number | null },
  sessionId: string | null,
  when: string | null,
) {
  const url = sessionId ? `/call/${sessionId}` : null
  // Already there from an earlier version, so it is not filed twice.
  const { data: already } = await admin.from('evidence_library')
    .select('id').eq('client_id', transcript.client_id)
    .eq('description', evidenceDescription(transcript)).maybeSingle()
  if (already) return

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: current } = await admin.from('evidence_library')
      .select('reference').eq('client_id', transcript.client_id)
    const highest = (current || []).reduce((max, r) => {
      const m = /^E-(\d+)$/.exec(String(r.reference || '').trim())
      return m ? Math.max(max, Number(m[1])) : max
    }, 0)
    const reference = `E-${String(highest + 1).padStart(3, '0')}`

    const { error } = await admin.from('evidence_library').insert([{
      client_id: transcript.client_id,
      reference,
      date: (when || new Date().toISOString()).split('T')[0],
      type: 'client_conversation',
      description: evidenceDescription(transcript),
      url,
      status: 'active',
      // The people who were in the room signed it, which is as close to the
      // thing itself as evidence gets.
      reliability: 'firsthand',
    }])
    if (!error) return
    if (error.code !== '23505') return
  }
}

function evidenceDescription(t: { id: string; version: number | null }) {
  return `Signed transcript of a recorded session (version ${t.version || 1}, transcript ${t.id})`
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action || 'sign')
    const transcriptId = String(body.transcriptId || '')
    if (!transcriptId) return NextResponse.json({ error: 'Which transcript?' }, { status: 400 })

    const admin = getAdminClient()
    const transcript = await loadTranscript(admin, transcriptId)
    if (!transcript) return NextResponse.json({ error: 'That transcript is not on file' }, { status: 404 })

    // ─── Correcting what came back ─────────────────────────
    if (action === 'correct') {
      const access = await requireAccess(req, admin, transcript.client_id, 'manage', {
        deniedMessage: 'Only the coaching team can correct a transcript',
      })
      if (!access.ok) return refuseAccess(access)

      if (transcript.status !== 'draft') {
        return NextResponse.json({
          error: 'This transcript has been issued for signature, so the words cannot change. Reopen it as a new version first.',
        }, { status: 409 })
      }
      const { error } = await admin.from('session_transcripts')
        .update({ body: String(body.body ?? ''), updated_at: new Date().toISOString() })
        .eq('id', transcript.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ─── Locking it for signature ──────────────────────────
    if (action === 'issue') {
      const access = await requireAccess(req, admin, transcript.client_id, 'manage', {
        deniedMessage: 'Only the coaching team can issue a transcript for signature',
      })
      if (!access.ok) return refuseAccess(access)

      if (!transcript.body || !transcript.body.trim()) {
        return NextResponse.json({ error: 'There is nothing in this transcript to sign' }, { status: 409 })
      }
      const { error } = await admin.from('session_transcripts').update({
        status: 'issued', issued_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', transcript.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ─── Reopening it, as a new version ────────────────────
    if (action === 'reopen') {
      const access = await requireAccess(req, admin, transcript.client_id, 'manage', {
        deniedMessage: 'Only the coaching team can reopen a transcript',
      })
      if (!access.ok) return refuseAccess(access)

      // A new version number, so the signatures already given stay against the
      // words they were given for and are not carried onto the correction.
      const { error } = await admin.from('session_transcripts').update({
        status: 'draft', version: (transcript.version || 1) + 1,
        issued_at: null, updated_at: new Date().toISOString(),
      }).eq('id', transcript.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, version: (transcript.version || 1) + 1 })
    }

    // ─── Signing it ────────────────────────────────────────
    if (action === 'sign') {
      const access = await requireAccess(req, admin, transcript.client_id, 'view', {
        deniedMessage: 'You are not on this engagement',
      })
      if (!access.ok) return refuseAccess(access)

      if (transcript.status !== 'issued') {
        return NextResponse.json({
          error: 'This transcript is not open for signature yet.',
        }, { status: 409 })
      }

      const signer = await resolveSigner(admin, {
        clientId: transcript.client_id,
        userId: access.userId,
        canManage: access.canManage,
        onBehalfOfPartyId: body.onBehalfOfPartyId ? String(body.onBehalfOfPartyId) : null,
        // A transcript is signed by whoever was in the room.
        requireSignatory: false,
      })

      // THE PERSON WHO WAS IN THE ROOM COULD NOT SIGN. 10 September 2026.
      //
      // Signing resolved the signer against the engagement's party list, which
      // is right for a Charter: it is signed by people holding an office. A
      // transcript is signed by the people whose words it is, and that is a
      // different list. The lead consultant recorded the session, spoke on it,
      // read his own words back, and was told he is not recorded as a party on
      // this engagement and cannot sign.
      //
      // Being in the room is now enough, and being in the room means having
      // recorded a track on this recording, which nobody can fake: the track
      // was written by the server from the verified session at the moment the
      // device joined.
      let inTheRoom: { name: string } | null = null
      if (isRefusal(signer) && !body.onBehalfOfPartyId) {
        const { data: ownTrack } = await admin.from('recording_tracks')
          .select('id,speaker_name').eq('recording_id', transcript.recording_id)
          .eq('user_id', access.userId).maybeSingle()
        if (ownTrack) {
          inTheRoom = { name: ownTrack.speaker_name || access.fullName || 'A participant' }
        }
      }
      if (isRefusal(signer) && !inTheRoom) {
        return NextResponse.json({
          error: `${signer.error} You can also sign a transcript of a session you recorded on, and this account has no recording on it.`,
        }, { status: signer.status })
      }
      // Either the party list resolved somebody, or they were in the room.
      const party = isRefusal(signer) ? null : signer

      // The name they typed has to be their own. Anything else is somebody
      // signing as somebody else, whatever they intended by it.
      const typed = String(body.typedName || '').trim()
      const expected = (inTheRoom ? inTheRoom.name : party!.party.name || '').trim()
      const loosely = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
      if (!typed) return NextResponse.json({ error: 'Type your name to sign' }, { status: 400 })
      if (loosely(typed) !== loosely(expected)) {
        return NextResponse.json({
          error: `Sign with your own name as it is recorded on this engagement: ${expected}.`,
        }, { status: 400 })
      }

      const { error } = await admin.from('transcript_signatures').insert(inTheRoom ? {
        transcript_id: transcript.id,
        client_id: transcript.client_id,
        party_id: null,
        version: transcript.version || 1,
        signer_role: access.role,
        signer_name: inTheRoom.name,
        signer_user_id: access.userId,
        signature_method: 'typed',
        typed_name: typed,
        recorded_by: access.userId,
      } : {
        transcript_id: transcript.id,
        client_id: transcript.client_id,
        party_id: party!.party.id,
        version: transcript.version || 1,
        signer_role: party!.party.party_role,
        signer_name: party!.party.name,
        signer_email: party!.party.email,
        signer_user_id: party!.signerUserId,
        signature_method: party!.mode === 'in_room' ? 'in_room' : 'typed',
        typed_name: typed,
        recorded_by: party!.recordedBy,
      })
      if (error) {
        // Signing twice is a mistake rather than a stronger signature, and the
        // database says so. Saying it plainly beats reporting a constraint.
        if (String(error.message).includes('transcript_signatures_once')) {
          return NextResponse.json({ error: 'That signature is already on this version' }, { status: 409 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Everybody on the engagement who was in the room has signed, so the
      // transcript is no longer waiting on anybody.
      // WHO STILL HAS TO SIGN IS THE ROOM, COUNTED HONESTLY. This counted
      // parties only, so a room where nobody was a formal party wanted nobody,
      // and the transcript could never become signed and so never reached the
      // evidence library. A person in the room is a party when they have one
      // and an account when they do not.
      const [{ data: signatures }, { data: tracks }] = await Promise.all([
        admin.from('transcript_signatures').select('party_id,signer_user_id')
          .eq('transcript_id', transcript.id).eq('version', transcript.version || 1),
        admin.from('recording_tracks').select('party_id,user_id').eq('recording_id', transcript.recording_id),
      ])
      const who = (r: { party_id?: string | null; user_id?: string | null; signer_user_id?: string | null }) =>
        r.party_id || r.user_id || r.signer_user_id || null
      const wanted = new Set((tracks || []).map(who).filter(Boolean))
      const have = new Set((signatures || []).map(who).filter(Boolean))
      const complete = wanted.size > 0 && Array.from(wanted).every((p) => have.has(p))
      if (complete) {
        await admin.from('session_transcripts')
          .update({ status: 'signed', updated_at: new Date().toISOString() }).eq('id', transcript.id)

        const { data: recording } = await admin.from('session_recordings')
          .select('session_id,started_at').eq('id', transcript.recording_id).maybeSingle()
        // Filing it must never be the reason a signature fails, so this is not
        // allowed to throw into the response.
        await fileAsEvidence(
          admin, transcript, recording?.session_id || null, recording?.started_at || null,
        ).catch(() => null)
      }

      return NextResponse.json({ ok: true, complete, signedBy: inTheRoom ? inTheRoom.name : party!.party.name })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}

// ─── WHO HAS SIGNED, SEEN BY EVERYBODY ───────────────────────
//
// Habib asked for this on the Charter: all signatories should see the signing
// as it happens. It is the same rule here.
export async function GET(req: NextRequest) {
  try {
    const admin = getAdminClient()
    const transcriptId = new URL(req.url).searchParams.get('transcriptId') || ''
    if (!transcriptId) return NextResponse.json({ error: 'Which transcript?' }, { status: 400 })

    const transcript = await loadTranscript(admin, transcriptId)
    if (!transcript) return NextResponse.json({ error: 'That transcript is not on file' }, { status: 404 })

    const access = await requireAccess(req, admin, transcript.client_id, 'view')
    if (!access.ok) return refuseAccess(access)

    const { data: signatures } = await admin.from('transcript_signatures')
      .select('id,party_id,signer_user_id,signer_name,signer_role,signature_method,signed_at,version')
      .eq('transcript_id', transcript.id).eq('version', transcript.version || 1)
      .order('signed_at')

    const { data: tracks } = await admin.from('recording_tracks')
      .select('party_id,user_id,speaker_name').eq('recording_id', transcript.recording_id)

    return NextResponse.json({
      transcript, signatures: signatures || [], wereInTheRoom: tracks || [], canManage: access.canManage,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}
