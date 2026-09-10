// ============================================================
// RECORDING WHAT WAS ACTUALLY SAID
//
// The method rests on verbatim. Until now that meant somebody typing fast
// enough, which is a reconstruction rather than a record. Habib's words: the
// verbatim answers cannot be captured as the answers come through.
//
// ONE MODEL FOR EVERY KIND OF RECORDING, because they are the same thing. A
// pre-engagement conversation with the Executive Director and the funder in
// three countries, a room full of people working a block, and a field
// interviewer alone with one customer are all: a recording attached to the
// engagement, one track per device, transcribed once, read and signed by the
// people who were there.
//
// WHY ONE TRACK PER DEVICE. Each device records only its own microphone. That
// gives one voice per file, so the transcript can say who spoke without
// software guessing; it gives full quality regardless of the call's line; and
// a dropped connection costs one track rather than the session.
//
// WHAT MAKES THEM PLAY AS ONE ROOM. The server stamps the moment the recording
// opens. Each device measures how long after that stamp its own recording
// began and reports that offset. The tracks are laid on one timeline by those
// offsets, never by when a button was pressed, so devices starting seconds
// apart is not a problem to solve.
//
// This file is the arithmetic and the rules. It touches no database, no
// browser and no network, so all of it can be tested directly.
// ============================================================

export type RecordingStatus = 'opening' | 'recorded' | 'merged' | 'transcribed' | 'failed'
export type TrackStatus = 'recording' | 'uploaded' | 'failed'
export type ConsentMethod = 'written' | 'spoken' | 'refused'

export interface RecordingTrack {
  id: string
  device_id: string
  party_id?: string | null
  speaker_name?: string | null
  offset_ms: number
  duration_seconds?: number | null
  status: TrackStatus
  failure_reason?: string | null
}

/** What the audio is stored as. Opus in a WebM container: every browser that
 *  can record produces it, and it is about ten times smaller than the
 *  uncompressed alternative for speech, which is what makes a two hour session
 *  a file rather than a problem. */
export const AUDIO_MIME = 'audio/webm;codecs=opus'
export const AUDIO_EXTENSION = 'webm'

/**
 * How long a chunk is before it is uploaded.
 *
 * Thirty seconds. Short enough that a phone dying loses half a minute rather
 * than an afternoon, and that uploading happens throughout instead of as one
 * large transfer when everybody is trying to leave. Long enough that a two
 * hour session is 240 uploads rather than thousands.
 */
export const CHUNK_MS = 30_000

/** Where a track's audio lives. One folder per engagement, then per recording,
 *  so a recording can be found and removed as a whole. */
/**
 * AN IPHONE DOES NOT RECORD WEBM. 10 September 2026.
 *
 * Habib: people would use this for interview capture on the phone, and that is
 * the field work this platform exists for. Safari on iOS records mp4 and
 * nothing else, so an interview captured on an iPhone produced mp4 audio
 * stored under a .webm name and offered to the transcription service as WebM.
 *
 * The format a device actually produced therefore travels with the track, and
 * everything downstream reads it rather than assuming.
 */
export function extensionFor(mimeType: string | null | undefined): string {
  const m = String(mimeType || '').toLowerCase()
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'mp4'
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('wav')) return 'wav'
  return AUDIO_EXTENSION
}

/** The plain type, without the codec note a browser adds. */
export function baseMime(mimeType: string | null | undefined): string {
  const m = String(mimeType || '').split(';')[0].trim().toLowerCase()
  return m || AUDIO_MIME
}

/**
 * Whether this format can be cut into parts and still be playable.
 *
 * WebM can, by carrying its header forward. Mp4 keeps what it needs to be read
 * in one piece, so cutting it produces something no player will open. A long
 * mp4 recording is sent whole and refused by the service if it is too large,
 * which is an answer somebody can act on; a silently unplayable file is not.
 */
export function canBeSplit(mimeType: string | null | undefined): boolean {
  return baseMime(mimeType).includes('webm')
}

export function trackStoragePath(
  clientId: string,
  recordingId: string,
  deviceId: string,
  chunkIndex: number,
  mimeType?: string | null,
): string {
  // A dot is allowed inside a name and never at the start, and two dots in a
  // row are never allowed at all. Without that ".." survives the sanitiser and
  // a client id could climb out of its own folder. Caught by its own test.
  const safe = (s: string) => String(s)
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^[.]+/, '_')
    .slice(0, 80)
  const n = String(Math.max(0, Math.trunc(chunkIndex))).padStart(5, '0')
  return `${safe(clientId)}/${safe(recordingId)}/${safe(deviceId)}/${n}.${extensionFor(mimeType)}`
}

/**
 * A device's offset against the recording's own clock.
 *
 * Deliberately clamped at zero. A device whose clock is behind the server's
 * would otherwise report a negative offset and be laid before the recording
 * began, which is how one late joiner drags the whole timeline backwards. A
 * device that genuinely started first is the one the server stamped, so zero
 * is the floor by definition.
 */
export function trackOffsetMs(recordingStartedAt: string, trackStartedAt: string): number {
  const start = Date.parse(recordingStartedAt)
  const began = Date.parse(trackStartedAt)
  if (!Number.isFinite(start) || !Number.isFinite(began)) return 0
  return Math.max(0, Math.round(began - start))
}

/**
 * How long the whole recording runs, which is the furthest any track reaches.
 * A track with no duration yet contributes nothing rather than breaking the
 * sum, because a session is often looked at while it is still running.
 */
export function recordingSpanSeconds(tracks: RecordingTrack[]): number {
  let furthest = 0
  for (const t of tracks) {
    if (!t.duration_seconds) continue
    const end = t.offset_ms / 1000 + t.duration_seconds
    if (end > furthest) furthest = end
  }
  return Math.round(furthest)
}

export interface LiveTrackState {
  /** The name to show, whoever this device belongs to. */
  who: string
  ok: boolean
  /** Why not, in words the person running the session can act on. */
  problem?: string
  minutes: number
}

/**
 * WHAT THE PERSON RUNNING THE SESSION SEES WHILE IT RUNS.
 *
 * This is the whole answer to "what if somebody's recording silently fails".
 * Every device reports its own state, and this turns those into a line per
 * person: green and how many minutes captured, or red and why. A failure is
 * found in the first minute rather than the following week.
 */
export function liveTrackState(tracks: RecordingTrack[]): LiveTrackState[] {
  return tracks.map((t) => ({
    who: t.speaker_name || 'Unnamed device',
    ok: t.status !== 'failed',
    problem: t.status === 'failed' ? (t.failure_reason || 'their device could not record') : undefined,
    minutes: Math.floor((t.duration_seconds || 0) / 60),
  }))
}

/** True when every device in the recording is capturing. */
export function everyoneIsRecording(tracks: RecordingTrack[]): boolean {
  return tracks.length > 0 && tracks.every((t) => t.status !== 'failed')
}

/** The people whose recording is not working, by name, for saying out loud. */
export function whoIsNotRecording(tracks: RecordingTrack[]): string[] {
  return tracks.filter((t) => t.status === 'failed').map((t) => t.speaker_name || 'an unnamed device')
}

/**
 * THE CONSENT SENTENCE, READ BEFORE RECORDING BEGINS.
 *
 * Short enough to be read aloud without stumbling, and it says the four things
 * a person is entitled to know: that it is being recorded, what for, who will
 * hear it, and that they may say no. Written as one sentence to be spoken
 * rather than a paragraph to be skipped.
 */
export function consentSentence(clientName: string): string {
  return `Before we start: I would like to record this conversation so that ${clientName}'s record is your own words rather than my notes. `
    + 'It is stored privately against this engagement, it is transcribed so you can read and correct it, '
    + 'and only the people on this engagement can hear it. Are you happy for me to record?'
}

/**
 * Whether this recording may begin.
 *
 * The rule is simple and it is not negotiable: nobody who has refused is
 * recorded, and a party who has never been asked is not assumed to agree.
 * A person with no answer recorded is named so they can be asked rather than
 * silently included.
 */
export interface ConsentCheck {
  mayRecord: boolean
  refused: string[]
  notAsked: string[]
  reason?: string
}

export function consentCheck(
  people: { name?: string | null; recording_consent?: ConsentMethod | null }[],
): ConsentCheck {
  const refused = people.filter((p) => p.recording_consent === 'refused').map((p) => p.name || 'somebody')
  const notAsked = people.filter((p) => !p.recording_consent).map((p) => p.name || 'somebody')
  if (refused.length) {
    return {
      mayRecord: false,
      refused,
      notAsked,
      reason: `${refused.join(', ')} ${refused.length === 1 ? 'has' : 'have'} said they do not want to be recorded. `
        + 'Hold this session without recording.',
    }
  }
  if (notAsked.length) {
    return {
      mayRecord: false,
      refused,
      notAsked,
      reason: `${notAsked.join(', ')} ${notAsked.length === 1 ? 'has' : 'have'} not been asked about recording yet. `
        + 'Read the consent sentence and record their answer, or hold this session without recording.',
    }
  }
  return { mayRecord: true, refused, notAsked }
}
