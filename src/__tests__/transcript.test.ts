// ============================================================
// A TRANSCRIPT OF A CONVERSATION, NOT THREE MONOLOGUES
//
// Three people recorded on three devices produce three files, each timed from
// the moment that device started. Turning them into one readable record is
// arithmetic, and getting the arithmetic wrong puts the answer before the
// question, which is worse than having no transcript at all.
//
// The rules being held here:
//
//   a passage is placed by its track's offset plus its part's offset
//   the room's order is who started speaking first
//   a long session is cut into parts that are still playable files
//   the speaker is known from the device, never guessed from the voice
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  webmHeaderLength, planTranscriptionParts, placeSegments, mergeSegments,
  stamp, formatTranscript, transcriptionHint, MAX_TRANSCRIBE_BYTES,
  soundsLikeSilence, silenceNote, SILENT_BITS_PER_SECOND,
} from '@/lib/transcript'
import { extensionFor, baseMime, canBeSplit, trackStoragePath } from '@/lib/recording'

describe('finding the header at the front of a recording', () => {
  it('finds where the audio starts', () => {
    // Twelve bytes of header, then the Cluster marker.
    const bytes = new Uint8Array([...Array(12).fill(0x1a), 0x1f, 0x43, 0xb6, 0x75, 0x99, 0x99])
    expect(webmHeaderLength(bytes)).toBe(12)
  })

  it('says zero when it cannot find one, so the audio is sent whole', () => {
    // Zero means do not split, which is safer than splitting in the wrong place.
    expect(webmHeaderLength(new Uint8Array([1, 2, 3, 4, 5]))).toBe(0)
  })

  it('does not run off the end of a very short file', () => {
    expect(webmHeaderLength(new Uint8Array([0x1f, 0x43]))).toBe(0)
  })
})

describe('sending a long session in parts', () => {
  const MB = 1024 * 1024

  it('sends a short session in one part', () => {
    const parts = planTranscriptionParts([MB, MB, MB], 5000)
    expect(parts).toHaveLength(1)
    expect(parts[0].needsHeader).toBe(false)
    expect(parts[0].offsetMs).toBe(0)
  })

  it('starts a new part rather than going over the limit', () => {
    const sizes = new Array(30).fill(MB)
    const parts = planTranscriptionParts(sizes, 5000, 10 * MB)
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(p.chunkIndexes.length * MB).toBeLessThanOrEqual(10 * MB)
  })

  it('gives every part after the first its header, so it is still a file', () => {
    const parts = planTranscriptionParts(new Array(20).fill(MB), 5000, 6 * MB)
    expect(parts[0].needsHeader).toBe(false)
    expect(parts.slice(1).every((p) => p.needsHeader)).toBe(true)
  })

  it('knows how far into the session each part begins', () => {
    // Pieces are half a minute each, so the seventh piece is three minutes in.
    const parts = planTranscriptionParts(new Array(20).fill(MB), 5000, 6 * MB)
    expect(parts[1].offsetMs).toBe(parts[1].chunkIndexes[0] * 30_000)
  })

  it('never loses a piece of the recording', () => {
    const parts = planTranscriptionParts(new Array(37).fill(MB), 5000, 7 * MB)
    const covered = parts.flatMap((p) => p.chunkIndexes)
    expect(covered).toEqual(Array.from({ length: 37 }, (_, i) => i))
  })

  it('sends a single oversized piece rather than dropping it', () => {
    // Better a request that may be refused than a silent gap in the record.
    const parts = planTranscriptionParts([50 * MB], 5000, 10 * MB)
    expect(parts).toHaveLength(1)
    expect(parts[0].chunkIndexes).toEqual([0])
  })

  it('leaves real room under the service limit', () => {
    expect(MAX_TRANSCRIBE_BYTES).toBeLessThan(25 * 1024 * 1024)
  })
})

describe('placing a passage on the recording timeline', () => {
  it('adds the offset of the device that recorded it', () => {
    // Somebody who joined five minutes late says something one minute into
    // their own track. It belongs at six minutes.
    const placed = placeSegments([{ start: 60, end: 64, text: 'We tried that last year.' }], 'Ovo Ugbebor', 300_000)
    expect(placed[0].start).toBe(360)
    expect(placed[0].speaker).toBe('Ovo Ugbebor')
  })

  it('adds where in the track this part of the audio began', () => {
    const placed = placeSegments([{ start: 10, end: 12, text: 'Yes.' }], 'A funder', 0, 600_000)
    expect(placed[0].start).toBe(610)
  })

  it('drops empty passages rather than printing a name with nothing after it', () => {
    const placed = placeSegments(
      [{ start: 1, end: 2, text: '   ' }, { start: 3, end: 4, text: 'Real words.' }], 'X', 0,
    )
    expect(placed).toHaveLength(1)
  })

  it('never places a passage before the recording began', () => {
    expect(placeSegments([{ start: -5, end: 0, text: 'x' }], 'X', 0)[0].start).toBe(0)
  })
})

describe('the order the room heard it in', () => {
  it('is by who started speaking first, across all the devices', () => {
    const merged = mergeSegments([
      placeSegments([{ start: 0, end: 3, text: 'What is the biggest problem?' }], 'Coach', 0),
      placeSegments([{ start: 0, end: 4, text: 'Getting paid on time.' }], 'Ovo Ugbebor', 5_000),
    ])
    expect(merged.map((s) => s.speaker)).toEqual(['Coach', 'Ovo Ugbebor'])
    expect(merged[1].start).toBe(5)
  })

  it('puts the question before the answer even when the answer was recorded first', () => {
    // The answering device's file may be handed back first. What matters is
    // when the words were said, not which file arrived first.
    const merged = mergeSegments([
      placeSegments([{ start: 0, end: 2, text: 'Yes, exactly.' }], 'Funder', 30_000),
      placeSegments([{ start: 0, end: 2, text: 'So the delay is the funder?' }], 'Coach', 0),
    ])
    expect(merged[0].text).toContain('So the delay')
  })
})

describe('the transcript as somebody reads it', () => {
  it('joins a person speaking at length into one paragraph', () => {
    const body = formatTranscript([
      { start: 0, end: 2, speaker: 'Ovo Ugbebor', text: 'We work with smallholders.' },
      { start: 2, end: 5, speaker: 'Ovo Ugbebor', text: 'Mostly in the middle belt.' },
      { start: 6, end: 8, speaker: 'Coach', text: 'How many?' },
    ])
    expect(body).toContain('[00:00] Ovo Ugbebor: We work with smallholders. Mostly in the middle belt.')
    expect(body).toContain('[00:06] Coach: How many?')
  })

  it('stamps every paragraph so a passage can be found in the audio', () => {
    expect(stamp(0)).toBe('00:00')
    expect(stamp(65)).toBe('01:05')
    expect(stamp(3725)).toBe('1:02:05')
  })

  it('is empty rather than wrong when nothing was said', () => {
    expect(formatTranscript([])).toBe('')
  })
})

describe('telling the service the names before it starts', () => {
  it('names the organisation and the people, so they are spelled once', () => {
    const hint = transcriptionHint('Ikore International Development Ltd', ['Ovo Ugbebor', 'Nkemjika Onuoha'])
    expect(hint).toContain('Ikore International Development Ltd')
    expect(hint).toContain('Ovo Ugbebor')
  })

  it('says each name once however many times it was given', () => {
    const hint = transcriptionHint('Ikore', ['Ovo', 'Ovo'])
    expect(hint.match(/Ovo/g)).toHaveLength(1)
  })

  it('is empty when there is nothing worth saying', () => {
    expect(transcriptionHint('', [])).toBe('')
  })
})

// ============================================================
// A TRANSCRIPT OF SILENCE IS A FALSE RECORD, NOT AN EMPTY ONE
//
// 10 September 2026. A whole session recorded silence. Every part reported
// success and the transcript came back reading "For more UN videos visit
// www.un.org", which is what the service emits when handed nothing, and it was
// written into the engagement as though somebody had said it.
// ============================================================
describe('recognising a track that has no sound in it', () => {
  // The real numbers, from the recordings that caused this: thirty seconds of
  // silence was 7,016 bytes. Thirty seconds of speech is about 120,000.
  it('knows the silence that actually happened', () => {
    expect(soundsLikeSilence(7016, 30)).toBe(true)
  })

  it('leaves real speech alone', () => {
    expect(soundsLikeSilence(120_000, 30)).toBe(false)
    expect(soundsLikeSilence(29_580, 6 * 5)).toBe(false)
  })

  it('treats an empty file as silence', () => {
    expect(soundsLikeSilence(0, 60)).toBe(true)
  })

  it('says nothing about a piece too short to judge', () => {
    // A four second answer has too little to go on, and refusing to transcribe
    // something real is worse than paying to transcribe a little silence.
    expect(soundsLikeSilence(500, 4)).toBe(false)
  })

  it('sits far below any real speech', () => {
    expect(SILENT_BITS_PER_SECOND).toBeLessThan(16_000)
  })

  it('survives numbers that are not numbers', () => {
    expect(soundsLikeSilence(NaN, 30)).toBe(false)
    expect(soundsLikeSilence(1000, NaN)).toBe(false)
  })
})

describe('what the record says instead', () => {
  const note = silenceNote('Ovo Ugbebor')

  it('names whose device it was', () => {
    expect(note).toContain('Ovo Ugbebor')
  })

  it('says nothing was captured, and why nothing was invented', () => {
    expect(note).toContain('no audible sound')
    expect(note).toContain('false record')
  })
})

// ============================================================
// AN IPHONE DOES NOT RECORD WEBM
//
// 10 September 2026. Habib: people would use this for interview capture on the
// phone, and that is the field work this platform exists for. Safari on iOS
// records mp4 and nothing else, so an interview captured on an iPhone produced
// mp4 audio stored under a .webm name and offered to the transcription service
// as WebM. Every one of those steps was wrong, and none of them said so.
// ============================================================
describe('the format a device actually produced', () => {
  it('names an iPhone recording mp4, not webm', () => {
    expect(extensionFor('audio/mp4')).toBe('mp4')
    expect(extensionFor('audio/mp4;codecs=mp4a.40.2')).toBe('mp4')
  })

  it('still names a desktop recording webm', () => {
    expect(extensionFor('audio/webm;codecs=opus')).toBe('webm')
    expect(extensionFor('')).toBe('webm')
    expect(extensionFor(null)).toBe('webm')
  })

  it('strips the codec note a browser adds, which no service wants', () => {
    expect(baseMime('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(baseMime('audio/mp4; codecs="mp4a.40.2"')).toBe('audio/mp4')
  })

  it('refuses to cut an mp4 into parts', () => {
    // Mp4 keeps what it needs to be read in one piece. Cutting it produces
    // something no player will open, and nothing would have said so.
    expect(canBeSplit('audio/mp4')).toBe(false)
    expect(canBeSplit('audio/webm;codecs=opus')).toBe(true)
  })

  it('keeps a track in its own folder whatever the format', () => {
    expect(trackStoragePath('c', 'r', 'd', 0, 'audio/mp4')).toBe('c/r/d/00000.mp4')
    expect(trackStoragePath('c', 'r', 'd', 0, 'audio/webm')).toBe('c/r/d/00000.webm')
  })
})

describe('what the routes do with it', () => {
  const fs = require('fs')
  const TR = fs.readFileSync('app/api/session-transcribe/route.ts', 'utf8')
  const CH = fs.readFileSync('app/api/session-recording/chunk/route.ts', 'utf8')
  const AU = fs.readFileSync('app/api/session-recording/audio/route.ts', 'utf8')

  it('offers the file to the service under its real name', () => {
    expect(TR).toContain('`audio.${extensionFor(mime)}`')
  })

  it('reads every audio a device might have produced, not only webm', () => {
    // Filtering to .webm silently ignored every iPhone recording, and the
    // track then looked like it had no audio at all.
    for (const f of [TR, AU]) expect(f).toContain('webm|mp4|m4a|ogg|wav')
  })

  it('stores a chunk as what it is', () => {
    expect(CH).toContain('contentType: mime')
    expect(CH).toContain('mime_type: mime')
  })

  it('sends the format up with the audio', () => {
    const REC = fs.readFileSync('src/lib/recorder-client.ts', 'utf8')
    expect(REC).toContain("form.append('mimeType'")
    expect(REC).toContain('mimeType: this.mime')
  })
})

// ============================================================
// A NOTE ABOUT THE RECORDING IS NOT SOMETHING SOMEBODY SAID
//
// 12 September 2026. Habib joined the same session on his laptop and his
// phone. The laptop captured nothing, so its note was written into the
// transcript as a passage of speech, and because both devices carried his
// name it was joined onto the end of his own words:
//
//   "Really good responses. Habib Onifade: no audible sound was captured on
//    this device."
//
// That is a transcript putting words in somebody's mouth, on the one document
// this platform asks people to read and sign.
// ============================================================
describe('a remark about the recording is kept apart from speech', () => {
  const spoken = { start: 0, end: 3, speaker: 'Habib Onifade', text: 'Really good responses.' }
  const note = {
    start: 0, end: 15, speaker: 'Habib Onifade', note: true,
    text: 'Habib Onifade: no audible sound was captured on this device.',
  }

  it('never joins a note onto the end of somebody words', () => {
    const body = formatTranscript([spoken, note])
    expect(body).toContain('[00:00] Habib Onifade: Really good responses.')
    expect(body).not.toContain('Really good responses. Habib Onifade: no audible sound')
  })

  it('prints notes under their own heading, after the words', () => {
    const body = formatTranscript([spoken, note])
    expect(body.indexOf('About this recording')).toBeGreaterThan(body.indexOf('Really good responses'))
    expect(body).toContain('no audible sound was captured')
  })

  it('says nothing extra when every device worked', () => {
    expect(formatTranscript([spoken])).not.toContain('About this recording')
  })

  it('still produces a readable transcript when every device was silent', () => {
    const body = formatTranscript([note])
    expect(body).toContain('About this recording')
    expect(body.startsWith('About this recording')).toBe(true)
  })

  it('is marked as a note by the route, not guessed at by its wording', () => {
    const fs = require('fs')
    expect(fs.readFileSync('app/api/session-transcribe/route.ts', 'utf8')).toContain('note: true')
  })
})

describe('what one device does, the other sees', () => {
  const fs = require('fs')
  const PANEL = fs.readFileSync('src/components/gtcv/TranscriptPanel.tsx', 'utf8')

  it('keeps itself current instead of reading once', () => {
    // The transcript produced on a phone left the laptop showing "Produce the
    // transcript" as though nothing had happened.
    expect(PANEL).toContain('WHAT ONE DEVICE DOES, THE OTHER SHOULD SEE')
    expect(PANEL).toContain('setInterval')
  })

  it('does not move under the hands of somebody correcting it', () => {
    expect(PANEL).toContain("if (!next || next.status !== 'draft') setDraft(next?.body || '')")
  })

  it('redraws only when something actually changed', () => {
    expect(PANEL).toContain('if (same) return prev')
  })
})
