// ============================================================
// API ROUTE: /api/transcript-document
// The signed transcript as a file somebody can keep.
//
// 11 September 2026. Habib: I think there is a need to make sure the evidence
// is downloadable or shareable so it can be presented without the platform.
//
// A transcript that exists only behind a login is not evidence a funder, an
// auditor or a board can be shown. This is the same shape as the Charter
// document, and for the same reason: a party who cannot obtain the record they
// signed is being asked to take it on trust.
//
// VIEW RIGHTS, NOT MANAGE RIGHTS. Everybody on the engagement was either in the
// room or works under what was decided in it. It carries nothing they are not
// already entitled to see.
//
// THE AUDIO DOES NOT TRAVEL. The words do. A recording of somebody's voice that
// can be forwarded cannot afterwards be withdrawn, and consent to be recorded
// was given for this engagement rather than for anywhere the file might reach.
// The document says where the audio is instead of pretending it does not exist.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'
import { buildTranscriptDocument } from '@/lib/transcript-document'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const transcriptId = req.nextUrl.searchParams.get('transcriptId') || ''
    if (!transcriptId) return NextResponse.json({ error: 'Which transcript?' }, { status: 400 })

    const admin = getAdminClient()
    const { data: transcript } = await admin.from('session_transcripts')
      .select('id,recording_id,client_id,body,status,version,issued_at')
      .eq('id', transcriptId).maybeSingle()
    if (!transcript) return NextResponse.json({ error: 'That transcript is not on file' }, { status: 404 })

    const auth = await requireAccess(req, admin, transcript.client_id, 'view', {
      rateLimit: { key: 'transcript-document', max: 60, windowSeconds: 3600 },
    })
    if (!auth.ok) return refuseAccess(auth)

    const [{ data: client }, { data: recording }, { data: signatures }, { data: tracks }] = await Promise.all([
      admin.from('engagement_clients').select('name').eq('id', transcript.client_id).maybeSingle(),
      admin.from('session_recordings')
        .select('id,session_id,title,started_at,merged_seconds').eq('id', transcript.recording_id).maybeSingle(),
      // Only the signatures given on the version being downloaded. A signature
      // from an earlier version belongs to the words that version carried.
      admin.from('transcript_signatures')
        .select('signer_name,signer_role,signature_method,signed_at,version')
        .eq('transcript_id', transcript.id).eq('version', transcript.version || 1)
        .order('signed_at'),
      admin.from('recording_tracks').select('speaker_name').eq('recording_id', transcript.recording_id),
    ])

    let sessionTitle = recording?.title || ''
    if (!sessionTitle && recording?.session_id) {
      const { data: session } = await admin.from('gtcv_sessions')
        .select('title').eq('id', recording.session_id).maybeSingle()
      sessionTitle = session?.title || ''
    }

    // The evidence library entry this is, so the paper and the entry match.
    const { data: evidence } = await admin.from('evidence_library')
      .select('reference').eq('client_id', transcript.client_id)
      .ilike('description', `%${transcript.id}%`).maybeSingle()

    const { buffer, fileName } = await buildTranscriptDocument({
      organisation: client?.name || 'This engagement',
      sessionTitle: sessionTitle || 'Working session',
      recordedAt: recording?.started_at || null,
      seconds: recording?.merged_seconds ?? null,
      version: transcript.version || 1,
      status: transcript.status || 'draft',
      issuedAt: transcript.issued_at || null,
      body: transcript.body || '',
      wereInTheRoom: (tracks || []).map((t) => t.speaker_name).filter(Boolean) as string[],
      signatures: signatures || [],
      reference: evidence?.reference || null,
    })

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}
