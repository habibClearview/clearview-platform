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
} from '@/lib/transcript'

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
