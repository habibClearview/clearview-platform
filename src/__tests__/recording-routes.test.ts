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
const AUDIO = fs.readFileSync('app/api/session-recording/audio/route.ts', 'utf8')
const CALLUI = fs.readFileSync('src/components/gtcv/SessionCall.tsx', 'utf8')
const PAGE = fs.readFileSync('app/call/[sessionId]/page.tsx', 'utf8')
const PANEL = fs.readFileSync('src/components/gtcv/TranscriptPanel.tsx', 'utf8')

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
    // The identity is built from the verified session. 10 September 2026 added
    // a device to the end of it, because identity is unique in a room and the
    // account alone meant a phone threw the laptop out. The front of it is
    // still server derived, so it can never be somebody else.
    expect(CALL).toContain('${access.userId}::')
    expect(CALL).not.toMatch(/identity:\s*body\./)
    expect(CALL).not.toMatch(/identity:\s*`?\$?\{?body/)
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

describe('listening back to a recording', () => {
  it('checks the listener is on the engagement before sending a byte', () => {
    const authorised = AUDIO.indexOf('requireAccess')
    const send = AUDIO.indexOf('new NextResponse(joined')
    expect(authorised).toBeGreaterThan(-1)
    expect(send).toBeGreaterThan(authorised)
  })

  it('never hands out an address that works without signing in', () => {
    // A signed storage link to somebody's voice keeps working after they are
    // taken off the engagement, and can be forwarded to anybody.
    expect(AUDIO).not.toContain('createSignedUrl')
    expect(AUDIO).not.toContain('getPublicUrl')
  })

  it('is never cached by anything in between', () => {
    expect(AUDIO).toContain("'Cache-Control': 'private, no-store'")
  })

  it('is fetched with the sign in carried on the request', () => {
    // An audio tag cannot carry one, which is why the file is fetched and
    // played from the browser's own memory instead.
    expect(PANEL).toContain('Bearer ${data.session.access_token}')
    expect(PANEL).toContain('URL.createObjectURL')
  })

  it('is only fetched when somebody asks for it', () => {
    expect(PANEL).toContain('Play this person')
  })
})

describe('the signed transcript files itself as evidence', () => {
  it('does it when the last signature lands, not when somebody remembers', () => {
    expect(SIGN).toContain('fileAsEvidence(')
    expect(SIGN).toContain('evidence_library')
  })

  it('is recorded as a conversation, first hand', () => {
    expect(SIGN).toContain("type: 'client_conversation'")
    expect(SIGN).toContain("reliability: 'firsthand'")
  })

  it('is not filed twice when a corrected version is signed again', () => {
    expect(SIGN).toContain('Already there from an earlier version')
  })

  it('never costs somebody their signature when it fails', () => {
    // Filing is a convenience. A signature is the thing that was asked for.
    expect(SIGN).toContain('.catch(() => null)')
  })
})

// ============================================================
// THE THINGS A SERVER TEST CANNOT SEE
//
// 10 September 2026. The session room was opened by a real person for the
// first time and three faults appeared at once, none of which any of the 1,712
// tests could have caught, because all of them tested answers rather than
// screens.
// ============================================================
describe('the button that starts a recording', () => {
  it('is offered before the first recording exists', () => {
    // The room reads canManage from the very call that answers "nothing is
    // open". That answer left canManage out, so it was always false, so the
    // button never appeared, so the feature was unreachable from the screen
    // built for it.
    const get = OPEN.slice(OPEN.indexOf('export async function GET'))
    const branch = get.slice(get.indexOf('if (!recording) {'), get.indexOf('const { data: tracks }'))
    expect(branch).toContain('canManage: access.canManage')
  })

  it('never quietly reports manage rights nobody checked', () => {
    // The one path that answers without asking says so explicitly.
    expect(OPEN).toContain('canManage: false')
  })

  it('is the value the room actually reads', () => {
    expect(PAGE).toContain('setCanManage(Boolean(json?.canManage))')
  })
})

describe('one person on two devices', () => {
  it('does not let a second device throw the first out', () => {
    // The media service treats identity as unique in a room and removes the
    // older connection. On the account id alone, joining on a phone silently
    // ended the call on the laptop.
    expect(CALL).toContain('identity: `${access.userId}::${device}`')
    expect(CALL).not.toContain('identity: access.userId,')
  })

  it('still builds the identity from the verified session, never the request', () => {
    // The device only separates one of a person's own connections from
    // another. It can never make them somebody else.
    expect(CALL).toContain('access.userId')
    expect(CALL).toContain("replace(/[^A-Za-z0-9_-]/g, '')")
  })

  it('sends the device from the browser that is joining', () => {
    expect(CALLUI).toContain('deviceId: deviceId()')
  })
})

describe('a call that ends says why', () => {
  it('does not put the join button back with nothing said', () => {
    // A failure that looks exactly like a click that did nothing is the worst
    // of both: no call, and no reason to look for one.
    expect(CALLUI).toContain('setErr(disconnectReason(reason))')
  })

  it('says the one that actually happened, in words', () => {
    expect(CALLUI).toContain('You joined this call on another device')
  })
})

describe('what is reachable on a call', () => {
  it('offers the camera and screen sharing, not the minimal bar', () => {
    expect(CALLUI).toContain('screenShare: true')
    expect(CALLUI).not.toContain('variation="minimal"')
  })

  it('says who is on the call in words, not only as tiles', () => {
    // On an audio call every tile is a grey placeholder, so "is the funder here
    // yet" cannot be answered by looking at them.
    expect(CALLUI).toContain('On the call:')
    expect(CALLUI).toContain('You are the only one here so far')
  })
})

// ============================================================
// THE PERSON WHOSE WORDS THEY ARE COULD NOT SIGN THEM
//
// 10 September 2026. Habib recorded a session, read his own words back, typed
// his name, and was told he is not recorded as a party on this engagement and
// cannot sign. He was in the room. He was the only one in it.
// ============================================================
describe('signing a transcript of a session you were on', () => {
  it('accepts somebody who recorded on it, party or not', () => {
    // Being in the room means having recorded a track, which nobody can fake:
    // the track is written by the server from the verified session at the
    // moment the device joins.
    expect(SIGN).toContain("from('recording_tracks')")
    expect(SIGN).toContain(".eq('user_id', access.userId)")
  })

  it('still refuses somebody who was neither a party nor in the room', () => {
    expect(SIGN).toContain('this account has no recording on it')
  })

  it('records the account rather than inventing a party', () => {
    expect(SIGN).toContain('party_id: null')
    expect(SIGN).toContain('signer_user_id: access.userId')
  })

  it('counts who still has to sign by the room, not by the party list', () => {
    // Counting parties only meant a room where nobody held a party row wanted
    // nobody, so the transcript never became signed and never reached the
    // evidence library.
    expect(SIGN).toContain('r.party_id || r.user_id || r.signer_user_id')
  })

  it('writes the account onto the track when a device joins', () => {
    expect(OPEN).toContain('user_id: access.userId,')
  })
})

describe('finding a recording afterwards', () => {
  const PANEL = fs.readFileSync('src/components/gtcv/RecordingsPanel.tsx', 'utf8')
  const DASH = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')
  const CALLPAGE = fs.readFileSync('app/call/[sessionId]/page.tsx', 'utf8')

  it('lists every recording on the engagement, with who was on it', () => {
    // A recording that can only be found by remembering which session it
    // belonged to is a record that exists and cannot be found.
    expect(OPEN).toContain("url.searchParams.get('list') === '1'")
    expect(PANEL).toContain('Who was on it')
    expect(DASH).toContain('<RecordingsPanel')
  })

  it('says which devices captured nothing, rather than only who attended', () => {
    expect(PANEL).toContain('their device failed')
  })

  it('gives the session room a way back to the engagement', () => {
    expect(CALLPAGE).toContain('Back to')
    expect(CALLPAGE).toContain('zone=sessions')
  })

  it('does not put a raw browser error under a running recording', () => {
    const REC = fs.readFileSync('src/components/gtcv/SessionRecorder.tsx', 'utf8')
    expect(REC).toContain('A POLL THAT FAILS SAYS NOTHING')
  })
})
