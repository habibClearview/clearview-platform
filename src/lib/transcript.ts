// ============================================================
// TURNING THE TRACKS INTO A TRANSCRIPT
//
// Each device recorded its own microphone into its own file, so what comes
// back from transcription is one voice at a time with timings measured from
// the moment that device started. This file is what turns those into a single
// transcript of a conversation: every passage placed on the recording's own
// timeline by its track's offset, sorted, and labelled with the name of the
// person who said it.
//
// WHY THE SPEAKER IS KNOWN RATHER THAN GUESSED. Almost every transcription
// product records one mixed track and then asks software to work out how many
// people there were and which is which. It is unreliable at the best of times
// and it is worse across accents, which is the whole difficulty Habib named:
// three accents on one call. Here the question never arises. A track is a
// device, a device is a person, and the name is already on the track.
//
// WHY THE AUDIO IS SOMETIMES SPLIT. The transcription service takes a file of
// a certain size and no more. A long session goes over it, so the track is
// sent in parts. The parts cannot simply be cut, because the recording's
// header sits at the front of the first piece and without it the rest is not a
// playable file. So each part after the first is given that header and nothing
// else of the first piece, which is what makes a cut in the middle of a
// session decodable rather than silence.
//
// No network, no database and no browser in this file, so all of it is tested.
// ============================================================
import { CHUNK_MS } from './recording'

/** What the transcription service will accept in one request, with room to spare. */
export const MAX_TRANSCRIBE_BYTES = 24 * 1024 * 1024

/**
 * How many bytes at the front of a WebM recording are its header.
 *
 * A WebM file is a header followed by clusters of audio. The header carries
 * what the audio is and how to read it, and it appears once, at the front of
 * the very first piece a recorder produces. Everything from the first cluster
 * onwards is audio.
 *
 * Returns 0 when no cluster is found, which means the whole piece is header or
 * the file is not WebM. The caller treats 0 as "do not split", so a format
 * this does not understand is sent whole rather than sent broken.
 */
export function webmHeaderLength(bytes: Uint8Array): number {
  // The Cluster element identifier, 0x1F43B675, byte for byte.
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 0x1f && bytes[i + 1] === 0x43 && bytes[i + 2] === 0xb6 && bytes[i + 3] === 0x75) return i
  }
  return 0
}

export interface TranscriptionPart {
  /** Which recorded pieces go in this part, as indexes into the track's list. */
  chunkIndexes: number[]
  /** Milliseconds into the track that this part begins. */
  offsetMs: number
  /** Whether the first piece's header has to be put in front of it. */
  needsHeader: boolean
}

/**
 * How to send one track's audio, in as few parts as the size limit allows.
 *
 * Sizes are the recorded pieces in order. A part is filled until adding the
 * next piece would go over the limit, and then a new part begins. The first
 * part carries the header already; every later part is marked as needing it.
 */
export function planTranscriptionParts(
  sizes: number[],
  headerBytes = 0,
  limit = MAX_TRANSCRIBE_BYTES,
): TranscriptionPart[] {
  const parts: TranscriptionPart[] = []
  let current: number[] = []
  let bytes = 0

  for (let i = 0; i < sizes.length; i++) {
    const overhead = parts.length === 0 && current.length === 0 ? 0 : headerBytes
    const wouldBe = (current.length === 0 ? overhead : bytes) + sizes[i]
    if (current.length > 0 && wouldBe > limit) {
      parts.push({
        chunkIndexes: current, offsetMs: current[0] * CHUNK_MS, needsHeader: parts.length > 0,
      })
      current = []
      bytes = 0
    }
    if (current.length === 0) bytes = (parts.length === 0 ? 0 : headerBytes)
    current.push(i)
    bytes += sizes[i]
  }
  if (current.length) {
    parts.push({ chunkIndexes: current, offsetMs: current[0] * CHUNK_MS, needsHeader: parts.length > 0 })
  }
  return parts
}

export interface RawSegment {
  start: number   // seconds, from the start of the audio that was sent
  end: number
  text: string
}

export interface Segment {
  /** Seconds from the start of the whole recording. */
  start: number
  end: number
  speaker: string
  text: string
  /**
   * A remark about the recording rather than something anybody said.
   *
   * 12 September 2026. A device that captured nothing had its note written in
   * as a passage of speech, and because the note carried the same speaker name
   * as the person's other device, it was joined onto the end of their words:
   * "Really good responses. Habib Onifade: no audible sound was captured on
   * this device."
   *
   * That is a transcript putting words in somebody's mouth, on the one
   * document this platform asks people to sign. A note is kept apart from
   * speech and printed apart from it.
   */
  note?: boolean
}

/**
 * Put one track's passages on the recording's own timeline.
 *
 * Two offsets are added: where in the recording the device started, and where
 * in the track this part of the audio began. Get either wrong and the answer
 * lands before the question.
 */
export function placeSegments(
  raw: RawSegment[], speaker: string, trackOffsetMs: number, partOffsetMs = 0,
): Segment[] {
  const shift = (trackOffsetMs + partOffsetMs) / 1000
  return raw
    .filter((s) => s && typeof s.text === 'string' && s.text.trim().length > 0)
    .map((s) => ({
      start: Math.max(0, (Number(s.start) || 0) + shift),
      end: Math.max(0, (Number(s.end) || 0) + shift),
      speaker,
      text: s.text.trim(),
    }))
}

/**
 * Every track's passages, in the order the room heard them.
 *
 * Sorted by when each passage began. Two people talking over each other sort
 * by who started first, which is what actually happened.
 */
export function mergeSegments(all: Segment[][]): Segment[] {
  return all.flat().sort((a, b) => a.start - b.start || a.speaker.localeCompare(b.speaker))
}

/** A timestamp a person can read, and find in the audio. */
export function stamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`
}

/**
 * The transcript as it is read and corrected.
 *
 * Consecutive passages by the same person are joined into one paragraph, which
 * is how a person speaking for two minutes should read. A new speaker starts a
 * new paragraph with a timestamp, so a passage can always be found in the
 * audio and a correction can always be checked against what was said.
 */
export function formatTranscript(segments: Segment[]): string {
  const out: string[] = []
  let speaker: string | null = null
  let started = 0
  let buffer: string[] = []

  const flush = () => {
    if (!buffer.length) return
    out.push(`[${stamp(started)}] ${speaker}: ${buffer.join(' ')}`)
    buffer = []
  }

  // Speech first, in the order the room heard it. A note about the recording
  // is not speech and is never joined onto the end of anybody's words.
  for (const s of segments) {
    if (s.note) continue
    if (s.speaker !== speaker) { flush(); speaker = s.speaker; started = s.start }
    buffer.push(s.text)
  }
  flush()

  const notes = segments.filter((s) => s.note).map((s) => s.text)
  if (notes.length) {
    out.push('About this recording')
    for (const n of notes) out.push(n)
  }

  return out.join('\n\n')
}

/**
 * What the transcription service is told before it starts.
 *
 * Names and terms it would otherwise spell as it hears them. This is what
 * stops an organisation's name, a programme's name and a person's name coming
 * back three different ways in one transcript, and it does more for accuracy
 * across accents than any other single setting.
 */
export function transcriptionHint(clientName: string, names: string[] = [], extra: string[] = []): string {
  const words = [clientName, ...names, ...extra].filter(Boolean)
  const unique = Array.from(new Set(words.map((w) => String(w).trim()))).filter((w) => w.length > 1)
  if (!unique.length) return ''
  return `This is a business conversation. Names and terms used: ${unique.join(', ')}.`
}


/**
 * WHETHER A TRACK IS SILENCE, JUDGED BY ITS OWN SIZE.
 *
 * 10 September 2026. A session was recorded, uploaded and transcribed, and
 * every second of it was silence. What came back was "For more UN videos visit
 * www.un.org", which is what the transcription service produces when handed
 * nothing, and it was written into the record as though somebody had said it.
 * That is worse than an error: it is a false record of a conversation.
 *
 * Speech at the rate this platform records runs at tens of kilobits a second.
 * The encoder drops to one or two when there is nothing to encode, so thirty
 * seconds of silence is about seven kilobytes where speech is about a hundred
 * and twenty. The gap is an order of magnitude, so the test does not need to be
 * clever, and the threshold sits far below any real speech.
 *
 * Deliberately silent about short pieces. A four second answer has too little
 * to judge, and refusing to transcribe something real is worse than paying to
 * transcribe a little silence.
 */
export const SILENT_BITS_PER_SECOND = 4_000

export function soundsLikeSilence(bytes: number, seconds: number): boolean {
  if (!Number.isFinite(bytes) || !Number.isFinite(seconds)) return false
  if (seconds < 10) return false
  if (bytes <= 0) return true
  return (bytes * 8) / seconds < SILENT_BITS_PER_SECOND
}

/** What the record says instead of a machine's guess at silence. */
export function silenceNote(speaker: string): string {
  return `${speaker}: no audible sound was captured on this device. `
    + 'Nothing has been transcribed for it, because a transcript of silence is a false record '
    + 'rather than an empty one.'
}
