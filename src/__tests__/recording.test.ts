// ============================================================
// THE ARITHMETIC THAT MAKES THREE COUNTRIES PLAY AS ONE ROOM
//
// Habib's questions were all about the practicalities, and they were the right
// ones: what if records start at different moments, what if somebody mutes,
// what if a device fails silently, what if nobody notices until afterwards.
//
// Every one of those is answered here rather than in a screen, so every one of
// them can be tested. The rules that matter:
//
//   alignment is by time, never by when a button was pressed
//   a failing device is named while the session runs, not afterwards
//   nobody who refused is recorded, and silence is never taken as agreement
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  AUDIO_MIME, CHUNK_MS, trackStoragePath, trackOffsetMs, recordingSpanSeconds,
  liveTrackState, everyoneIsRecording, whoIsNotRecording, consentSentence, consentCheck,
  type RecordingTrack,
} from '@/lib/recording'

const track = (over: Partial<RecordingTrack> = {}): RecordingTrack => ({
  id: 'trk', device_id: 'dev', offset_ms: 0, status: 'recording', ...over,
})

describe('records starting at different moments', () => {
  const opened = '2026-09-09T14:00:00.000Z'

  it('a device that starts three seconds later is placed three seconds in', () => {
    expect(trackOffsetMs(opened, '2026-09-09T14:00:03.000Z')).toBe(3000)
  })

  it('a device that joins twenty minutes late is placed twenty minutes in', () => {
    expect(trackOffsetMs(opened, '2026-09-09T14:20:00.000Z')).toBe(1_200_000)
  })

  it('a device whose clock is behind the server is placed at the start, not before it', () => {
    // One late joiner with a slow clock would otherwise drag the whole
    // timeline backwards.
    expect(trackOffsetMs(opened, '2026-09-09T13:59:55.000Z')).toBe(0)
  })

  it('an unreadable time is treated as the start rather than as a crash', () => {
    expect(trackOffsetMs(opened, 'not a time')).toBe(0)
    expect(trackOffsetMs('not a time', opened)).toBe(0)
  })
})

describe('how long the recording runs', () => {
  it('is the furthest any track reaches, not the longest track', () => {
    // Somebody joining late and staying longest ends the session, even though
    // their own track is shorter than the person who was there from the start.
    const tracks = [
      track({ offset_ms: 0, duration_seconds: 600 }),
      track({ offset_ms: 300_000, duration_seconds: 500 }),
    ]
    expect(recordingSpanSeconds(tracks)).toBe(800)
  })

  it('ignores a track still running rather than reporting nothing', () => {
    const tracks = [track({ duration_seconds: 120 }), track({ duration_seconds: null })]
    expect(recordingSpanSeconds(tracks)).toBe(120)
  })

  it('is zero when nothing has been captured', () => {
    expect(recordingSpanSeconds([])).toBe(0)
  })
})

describe('a device that fails is named while the session is running', () => {
  it('reports each person, whether they are capturing, and how long for', () => {
    const state = liveTrackState([
      track({ speaker_name: 'Ovo Ugbebor', duration_seconds: 754 }),
      track({ speaker_name: 'The funder', status: 'failed', failure_reason: 'microphone blocked' }),
    ])
    expect(state[0]).toEqual({ who: 'Ovo Ugbebor', ok: true, problem: undefined, minutes: 12 })
    expect(state[1].ok).toBe(false)
    expect(state[1].problem).toBe('microphone blocked')
  })

  it('says something useful when a device fails without saying why', () => {
    const state = liveTrackState([track({ status: 'failed' })])
    expect(state[0].problem).toBe('their device could not record')
  })

  it('names who is not recording, for saying out loud', () => {
    const tracks = [
      track({ speaker_name: 'Ovo Ugbebor' }),
      track({ speaker_name: 'Maureen Munjua', status: 'failed' }),
    ]
    expect(whoIsNotRecording(tracks)).toEqual(['Maureen Munjua'])
    expect(everyoneIsRecording(tracks)).toBe(false)
  })

  it('an empty room is not "everyone is recording"', () => {
    // Otherwise a session where nobody's device started reads as healthy.
    expect(everyoneIsRecording([])).toBe(false)
  })

  it('a device that has uploaded is still a device that recorded', () => {
    expect(everyoneIsRecording([track({ status: 'uploaded' })])).toBe(true)
  })
})

describe('nobody is recorded who did not agree', () => {
  it('refuses when anybody has said no, and names them', () => {
    const check = consentCheck([
      { name: 'Ovo Ugbebor', recording_consent: 'written' },
      { name: 'Maureen Munjua', recording_consent: 'refused' },
    ])
    expect(check.mayRecord).toBe(false)
    expect(check.refused).toEqual(['Maureen Munjua'])
    expect(check.reason).toContain('do not want to be recorded')
  })

  it('refuses when somebody has never been asked, rather than assuming', () => {
    // Silence is not agreement. This is the whole point.
    const check = consentCheck([
      { name: 'Ovo Ugbebor', recording_consent: 'written' },
      { name: 'A new person' },
    ])
    expect(check.mayRecord).toBe(false)
    expect(check.notAsked).toEqual(['A new person'])
    expect(check.reason).toContain('not been asked')
  })

  it('allows it when everybody has agreed, written or spoken', () => {
    const check = consentCheck([
      { name: 'Ovo Ugbebor', recording_consent: 'written' },
      { name: 'A customer', recording_consent: 'spoken' },
    ])
    expect(check.mayRecord).toBe(true)
    expect(check.reason).toBeUndefined()
  })

  it('a refusal outranks a missing answer, so the message says the worse thing', () => {
    const check = consentCheck([{ name: 'A' , recording_consent: 'refused' }, { name: 'B' }])
    expect(check.reason).toContain('do not want to be recorded')
  })

  it('an empty room may record, because there is nobody to object', () => {
    expect(consentCheck([]).mayRecord).toBe(true)
  })
})

describe('the consent sentence', () => {
  const said = consentSentence('Ikore International Development Ltd')

  it('names the organisation whose record it is', () => {
    expect(said).toContain('Ikore International Development Ltd')
  })

  it('says the four things a person is entitled to know', () => {
    expect(said).toContain('record this conversation')
    expect(said).toContain('your own words')
    expect(said).toContain('only the people on this engagement')
    expect(said).toContain('Are you happy for me to record?')
  })

  it('is short enough to read aloud without stumbling', () => {
    expect(said.length).toBeLessThan(420)
  })
})

describe('where the audio is kept', () => {
  it('is one folder per engagement, then per recording, then per device', () => {
    expect(trackStoragePath('client_1', 'rec_2', 'dev_3', 7))
      .toBe('client_1/rec_2/dev_3/00007.webm')
  })

  it('numbers chunks so they sort in the order they were spoken', () => {
    const a = trackStoragePath('c', 'r', 'd', 9)
    const b = trackStoragePath('c', 'r', 'd', 10)
    expect([b, a].sort()).toEqual([a, b])
  })

  it('refuses to let a name escape its folder', () => {
    const path = trackStoragePath('../../etc', 'r', 'd', 0)
    expect(path).not.toContain('..')
    expect(path.startsWith('_')).toBe(true)
  })

  it('records speech in a format every browser produces', () => {
    expect(AUDIO_MIME).toContain('opus')
  })

  it('uploads often enough that a dying phone loses half a minute', () => {
    expect(CHUNK_MS).toBe(30_000)
  })
})
