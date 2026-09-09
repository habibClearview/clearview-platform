// ============================================================
// WHAT THE RECORDING MUST NEVER DO
//
// A recording is somebody's voice. It is the most sensitive thing this
// platform will ever hold, and the ways it can go wrong are not subtle: audio
// written into another client's folder, a person let into a call they are not
// on, a transcript signed by somebody who was not there, words changed after
// they were signed.
//
// Each of those is a line of code that has to stay as it is. These tests hold
// those lines, so that removing one is a failing test rather than a discovery
// six months later.
// ============================================================
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { callRoomName, callConfigured } from '@/lib/call'

const OPEN = fs.readFileSync('app/api/session-recording/route.ts', 'utf8')
const CHUNK = fs.readFileSync('app/api/session-recording/chunk/route.ts', 'utf8')
const CALL = fs.readFileSync('app/api/call-token/route.ts', 'utf8')
const TRANSCRIBE = fs.readFileSync('app/api/session-transcribe/route.ts', 'utf8')
const SIGN = fs.readFileSync('app/api/transcript-sign/route.ts', 'utf8')

describe('who may start and stop a recording', () => {
  it('takes manage rights to open one, and to close one', () => {
    expect(OPEN).toContain("'manage'")
    expect(OPEN).toContain('Only the coaching team can start a recording')
    expect(OPEN).toContain('Only the coaching team can stop a recording')
  })

  it('refuses to open one until everybody who will be recorded has answered', () => {
    // The whole rule lives in consentCheck, which refuses a refusal and
    // refuses silence. If this call goes, so does the rule.
    expect(OPEN).toContain('consentCheck(')
    expect(OPEN).toContain('needsConsent')
  })

  it('asks only the people who will be in the room', () => {
    expect(OPEN).toContain('gtcv_session_attendance')
  })

  it('lets a person on the engagement record their own voice without manage rights', () => {
    // The funder and the Executive Director are on the call and their own
    // microphones are the point. A rule that only the coach may record would
    // leave two of the three voices out of the record.
    expect(OPEN).toContain("'view'")
  })
})

describe('where a piece of audio is allowed to land', () => {
  it('builds the path itself and never takes one from the browser', () => {
    expect(CHUNK).toContain('trackStoragePath(recording.client_id, recording.id, deviceId, chunkIndex)')
    expect(CHUNK).not.toMatch(/form\.get\(['"](path|storagePath)['"]\)/)
  })

  it('will not accept audio for a device that has not joined the recording', () => {
    expect(CHUNK).toContain('This device has not joined the recording')
  })

  it('checks the caller is on the engagement before writing anything', () => {
    const authorised = CHUNK.indexOf('requireAccess')
    const upload = CHUNK.indexOf("storage.from('recordings')")
    expect(authorised).toBeGreaterThan(-1)
    expect(upload).toBeGreaterThan(authorised)
  })

  it('has a size limit, so the bucket is not a free disk', () => {
    expect(CHUNK).toContain('MAX_CHUNK_BYTES')
  })
})

describe('who is let into a call', () => {
  it('derives the room from the engagement, so it cannot be asked for', () => {
    expect(callRoomName('client_a', 'sess_1')).toBe('cv_client_a_sess_1')
    expect(callRoomName('client_b', null)).toBe('cv_client_b')
  })

  it('two engagements never share a room', () => {
    expect(callRoomName('a', 's')).not.toBe(callRoomName('b', 's'))
  })

  it('keeps no punctuation from a strange id, so a name cannot be a path', () => {
    const room = callRoomName('../other', '../../elsewhere')
    expect(room).not.toContain('/')
    expect(room).not.toContain('.')
    expect(room.startsWith('cv_')).toBe(true)
  })

  it('is not configured until all three settings are present', () => {
    expect(callConfigured({ LIVEKIT_API_KEY: 'k' })).toBe(false)
    expect(callConfigured({ LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' })).toBe(false)
    expect(callConfigured({ LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's', NEXT_PUBLIC_LIVEKIT_URL: 'wss://x' })).toBe(true)
  })

  it('names the person from their account and never from the request', () => {
    expect(CALL).toContain('identity: access.userId')
    expect(CALL).not.toMatch(/identity:\s*body\./)
  })

  it('says plainly when the call has not been switched on', () => {
    expect(CALL).toContain('notConfigured')
    expect(CALL).toContain('The call is not switched on yet')
  })
})

describe('producing the transcript', () => {
  it('does one track per request, so a long session finishes', () => {
    expect(TRANSCRIBE).toContain('const next = usable.find((t) => !done.includes(t.id))')
    expect(TRANSCRIBE).toContain('remaining')
  })

  it('takes manage rights', () => {
    expect(TRANSCRIBE).toContain('Only the coaching team can produce a transcript')
  })

  it('leaves the audio alone and says so when the key is missing', () => {
    expect(TRANSCRIBE).toContain('OPENAI_API_KEY')
    expect(TRANSCRIBE).toContain('The audio is safe')
  })

  it('never transcribes a track that failed to record', () => {
    expect(TRANSCRIBE).toContain("t.status !== 'failed'")
  })
})

describe('signing what was said', () => {
  it('is open to everybody who was in the room, not only the named signatories', () => {
    expect(SIGN).toContain('requireSignatory: false')
  })

  it('refuses a name that is not the signer’s own', () => {
    expect(SIGN).toContain('Sign with your own name as it is recorded on this engagement')
  })

  it('will not let the words change once they are issued', () => {
    expect(SIGN).toContain('so the words cannot change')
  })

  it('binds a signature to a version, and a correction makes a new one', () => {
    expect(SIGN).toContain("version: transcript.version || 1")
    expect(SIGN).toContain('version: (transcript.version || 1) + 1')
  })

  it('will not sign a transcript that has not been issued', () => {
    expect(SIGN).toContain('not open for signature yet')
  })
})
