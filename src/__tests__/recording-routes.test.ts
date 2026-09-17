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
import { METHOD_SESSIONS } from '@/lib/method-sessions'

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
    expect(CHUNK).toContain('trackStoragePath(recording.client_id, recording.id, deviceId, chunkIndex, mime)')
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

  it('and that way back opens the engagement, not the list of every client', () => {
    // 'client' is that client's own page. 'clients' is the list of all of
    // them. Reading the address and then showing the list meant every link
    // into an engagement landed on the dashboard.
    expect(DASH).toContain("if(client){setSelClientId(client);setView('client')}")
  })

  it('does not put a raw browser error under a running recording', () => {
    const REC = fs.readFileSync('src/components/gtcv/SessionRecorder.tsx', 'utf8')
    expect(REC).toContain('A POLL THAT FAILS SAYS NOTHING')
  })
})

describe('deleting a recording', () => {
  const PANEL = fs.readFileSync('src/components/gtcv/RecordingsPanel.tsx', 'utf8')
  const PARTIES = fs.readFileSync('src/components/gtcv/EngagementPartiesPanel.tsx', 'utf8')
  const DASH2 = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')

  it('can be done at all, which it could not before', () => {
    // A platform holding people's voices that cannot delete one has it the
    // wrong way round: a recording made in error, or one somebody withdraws
    // consent for, would have to stay for ever.
    expect(OPEN).toContain('export async function DELETE')
    expect(PANEL).toContain("method: 'DELETE'")
  })

  it('takes manage rights', () => {
    expect(OPEN).toContain('Only the coaching team can delete a recording')
  })

  it('removes the audio before the record of it', () => {
    // The other order leaves audio nobody can see or reach.
    const del = OPEN.slice(OPEN.indexOf('export async function DELETE'))
    expect(del.indexOf("storage.from('recordings').remove")).toBeLessThan(
      del.indexOf("from('session_recordings').delete()"))
  })

  it('deletes nothing if the audio cannot be removed', () => {
    expect(OPEN).toContain('so nothing has been deleted')
  })

  it('asks first, because it cannot be undone', () => {
    expect(PANEL).toContain('This cannot be undone')
  })

  it('can be deleted where the recording actually is, on its session', () => {
    // 12 September 2026. The button existed, but on the list at the bottom,
    // and that list was narrowed the day before to recordings with no session.
    // So every recording made in a session lost the only way to delete it, on
    // the same day it was moved onto the session card. 16 September 2026: the
    // session card itself moved onto the decision point, and the button went
    // with it rather than being left behind on a page that now only reads.
    const PLAN = fs.readFileSync('src/components/gtcv/SessionsStrip.tsx', 'utf8')
    expect(PLAN).toContain('async function removeRecording(rec)')
    expect(PLAN).toContain("method: 'DELETE'")
    expect(PLAN).toContain('The audio, the transcript and any signatures on it go with it')
  })

  it('offers it only to somebody who may manage the engagement', () => {
    const PLAN = fs.readFileSync('src/components/gtcv/SessionsStrip.tsx', 'utf8')
    expect(PLAN).toContain('{canManage && (\n                      <button type="button" style={{ ...btn(C.red), marginLeft: \'auto\' }}\n                        disabled={busy === rec.id} onClick={() => removeRecording(rec)}')
  })
})

describe('audio that no recording points at', () => {
  const PANEL = fs.readFileSync('src/components/gtcv/RecordingsPanel.tsx', 'utf8')

  // 12 September 2026. Deleting through the route takes the audio first and
  // the row second, so a half-finished delete leaves a row pointing at nothing
  // rather than audio nobody can reach. Rows removed straight from the
  // database instead left the audio behind, held but not admitted to.

  it('is counted, so the platform never holds a voice it does not own up to', () => {
    expect(OPEN).toContain('async function leftoverAudio(')
    expect(OPEN).toContain("url.searchParams.get('leftover') === '1'")
    expect(PANEL).toContain('leftover=1&clientId=')
  })

  it('is only ever audio for a recording that is gone', () => {
    // The folder is named after the recording. A folder whose recording is
    // still on file is left alone, or deleting the leftovers would delete
    // everything.
    const fn = OPEN.slice(OPEN.indexOf('async function leftoverAudio('))
    expect(fn).toContain('if (live.has(rec.name)) continue')
    expect(fn).toContain("from('session_recordings').select('id').eq('client_id', clientId)")
  })

  it('never reaches outside the engagement it was asked about', () => {
    const fn = OPEN.slice(OPEN.indexOf('async function leftoverAudio('))
    expect(fn).toContain('const folder = clientFolder(clientId)')
    expect(fn.slice(0, fn.indexOf('export async function POST'))).not.toContain("store.list('', ")
  })

  it('takes manage rights to count and to remove', () => {
    expect(OPEN).toContain('Only the coaching team can remove leftover audio')
    const get = OPEN.slice(OPEN.indexOf("url.searchParams.get('leftover') === '1'"))
    expect(get.slice(0, 300)).toContain("'manage'")
  })

  it('asks first, because it cannot be undone', () => {
    expect(PANEL).toContain('leftover audio')
    expect(PANEL).toContain('This cannot be undone')
  })
})

describe('one list of the people, not two', () => {
  const PARTIES = fs.readFileSync('src/components/gtcv/EngagementPartiesPanel.tsx', 'utf8')
  const DASH2 = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')

  it('carries the login on the person own line', () => {
    // The invite panel repeated every name purely to hold this one fact and
    // this one button, so the same person was typed and corrected twice.
    expect(PARTIES).toContain('Has a login')
    expect(PARTIES).toContain('Give them a login')
  })

  it('no longer draws the second list beside it', () => {
    const setup = DASH2.slice(DASH2.indexOf("shownTab==='eng_setup'"))
    expect(setup.slice(0, 1200)).not.toContain('<ClientTeamInvite')
  })

  it('gives an invited login the role their engagement role earns', () => {
    // Not the role of whichever button was pressed.
    expect(PARTIES).toContain('accountRoleForParty(r.party_role)')
  })
})

describe('the pre-engagement conversation', () => {
  const DASH2 = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')

  // IT IS A MEETING LIKE ANY OTHER. 16 September 2026. Habib: keep it
  // flexible, "it could be that it is recorded on my laptop or my phone with
  // all attendees in the same room, or it could be a call". It used to be a
  // bare recorder bolted to this tab, with no people invited, no time and no
  // link, on the reasoning that the three questions come before any session
  // plan. In practice it is a conversation with the funder and the Executive
  // Director in three places.
  it('is planned, invited and opened like every other session', () => {
    const tab = DASH2.slice(DASH2.indexOf('function TabDiagnostic'))
    expect(tab.slice(0, 4000)).toContain('<SessionsStrip')
    expect(tab.slice(0, 4000)).toContain('dpId="setup"')
    // And the bare recorder is gone from this screen entirely.
    expect(DASH2).not.toContain('<SessionRecorder')
  })

  it('still has somewhere for a recording made without a session', () => {
    // A field interview, or a conversation nobody planned, still has no
    // session to sit on and must not be lost.
    expect(OPEN).toContain("url.searchParams.get('dpId')")
    expect(OPEN).toContain(".is('session_id', null)")
  })
})

// ============================================================
// THE SESSIONS LIVE ON THE DECISION POINT THEY BELONG TO
//
// Habib, 16 September 2026: "how bad clutter would it be to include session
// planning, calls and all that in each of the decision points rather than have
// a separate tab called rooms and sessions... the design must just be user
// friendly and tidy with less clicks."
//
// Running a session for Decision Point 2 meant leaving the decision point,
// finding it among every session on the engagement, inviting from there and
// opening the call from there.
// ============================================================
describe('sessions on the decision point', () => {
  const DASH3 = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')
  const STRIP = fs.readFileSync('src/components/gtcv/SessionsStrip.tsx', 'utf8')

  it('every decision point carries its own sessions, at the top of it', () => {
    expect(DASH3).toContain('<SessionsStrip clientId={selClient.id} dpId="phase_0"')
    expect(DASH3).toContain('<SessionsStrip clientId={selClient.id} dpId={dpKey}')
    expect(DASH3).toContain('<SessionsStrip clientId={selClient.id} dpId="handover"')
  })

  it('the strip is one line until it is opened, so it cannot clutter the point', () => {
    expect(STRIP).toContain('aria-expanded={open}')
    expect(STRIP).toContain('nothing planned yet')
  })

  it('planning, inviting and opening are all on it', () => {
    expect(STRIP).toContain('+ New session')
    expect(STRIP).toContain("fetch('/api/session-invite'")
    expect(STRIP).toContain('Open the session')
    expect(STRIP).toContain('`/call/${s.id}`')
  })

  // ONE ROOM MEANS ONE DEVICE. 16 September 2026. I first wrote that three
  // laptops round a table gives a better record than one microphone in the
  // middle. Habib: "multiple laptops recording in the same room would cause
  // audio feedback and make the recording useless." Two devices in one room
  // with the call open on both put each one's speaker into the other's
  // microphone, which howls and ruins the only copy of the conversation.
  it('tells you to record a shared room on one device, and why', () => {
    expect(STRIP).toContain('Everyone in one room.')
    expect(STRIP).toContain('Do not open it on a second device in the same room')
    expect(STRIP).toContain('feed back and spoil the recording')
  })

  it('still offers the call for people who are apart', () => {
    expect(STRIP).toContain('People in different places.')
    expect(STRIP).toContain('each device records the person in front of it')
  })

  // WHO WAS THERE IS A LIST, NOT AN INFERENCE. Habib: "I should be able to
  // select a participant from a dropdown list of people on the assignment."
  it('participants are chosen from the people on the engagement', () => {
    expect(STRIP).toContain("const PARTIES_TABLE = 'engagement_parties'")
    expect(STRIP).toContain('Add somebody…')
    expect(STRIP).toContain('async function addParticipant(session, partyId)')
    expect(STRIP).toContain('async function removeParticipant(row)')
  })

  it('a named participant is recorded against the session itself', () => {
    expect(STRIP).toContain("supabase.from(ATTENDANCE_TABLE).insert")
    expect(STRIP).toContain('Who is in this session')
  })

  it('says what to do when there is nobody to choose from', () => {
    expect(STRIP).toContain('Nobody is on this engagement yet. Add them on "Who is on it, and settings".')
  })

  it('names somebody taken off the engagement rather than showing a blank chip', () => {
    expect(STRIP).toContain('Somebody no longer on the engagement')
  })

  it('a recording is shown against the session it was made on', () => {
    // A recording could only be found by remembering which session it belonged
    // to, which is a record that exists and cannot be found.
    expect(STRIP).toContain('recordings.filter(r => r.session_id === id)')
    expect(STRIP).toContain('Recorded {recWhen(rec.started_at)}')
  })

  it('a session that failed to read never hides the sessions themselves', () => {
    expect(STRIP).toContain('the sessions still stand on their own')
  })

  it('Sessions and rooms stays as the workplan, reads everything and edits nothing', () => {
    expect(DASH3).toContain('Sessions are planned, invited, opened and deleted on the decision point they belong to')
    expect(DASH3).toContain('<SessionWorkplan clientId={selClient.id}')
    // The old planner is gone, so there is no second place to plan a session.
    expect(DASH3).not.toContain('<SessionPlanner')
    expect(fs.existsSync('src/components/gtcv/SessionPlanner.tsx')).toBe(false)
  })

  it('a time typed in a browser is stored as an instant, not as a local string', () => {
    // A calendar in another country has to show the same moment.
    expect(STRIP).toContain('new Date(form.when).toISOString()')
  })

  // The two parts that can be reasoned about without a browser were pulled out
  // so they could be run rather than read. See sessions-strip.test.ts, which
  // exercises them for real. CodeRabbit on #276.
  it('when a session is, and which is next, are testable on their own', () => {
    expect(STRIP).toContain("from '@/lib/session-time'")
  })

  // THE NAME IS WRITTEN DOWN, NOT ONLY POINTED AT. CodeRabbit on #276: the
  // pointer is set to null when somebody is taken off the engagement, so an
  // attendance row survived with no identity on it at all and a session could
  // no longer say who was in the room.
  it('a participant’s name is stored with the attendance, not only their id', () => {
    expect(STRIP).toContain('party_name: party?.name || null')
    expect(STRIP).toContain("a.party_name || 'Somebody no longer on the engagement'")
    const SQL = fs.readFileSync('supabase/migrations/2026_09_16_session_attendance_name.sql', 'utf8')
    expect(SQL).toContain('add column if not exists party_name text')
  })

  it('still records the person where that column is not there yet', () => {
    expect(STRIP).toContain('// The column is not there yet. The person is still recorded.')
  })

  it('the engagement’s own list wins, so a corrected spelling reaches old sessions', () => {
    expect(STRIP).toContain('const name = who?.name || a.party_name')
  })
})

// ============================================================
// ASSIGNMENTS ARE NOT ON A CLIENT'S WORKSPACE
//
// Habib, 16 September 2026: "why do we have a section called Assignment on the
// cover page of a client's workspace that lists other clients? No client
// should be able to see other client's information."
// ============================================================
describe('the practice’s commercial record stays on the practice’s side', () => {
  const DASH4 = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')

  it('is gone from the client Cover, on both branches that drew it', () => {
    expect(DASH4).not.toContain('<ServicesSection payerType="client" payerId={selClient.id} clients={clients}/>')
  })

  it('a payer’s assignments are on the payer’s own page', () => {
    expect(DASH4).toContain('<ServicesSection payerType="programme" payerId={prog.id} clients={clients}/>')
  })

  it('an organisation paying for itself keeps a home, on the coaching team’s tab only', () => {
    // A self-paying organisation IS the payer, so its assignments have to live
    // somewhere. They live on the tab the method already keeps to the team,
    // and that screen is handed only this one organisation, so no other
    // client's name can appear on it even when a coach is looking.
    expect(DASH4).toContain("{shownTab==='eng_setup'&&!selClient.programme_id&&canViewCoachGuidance(previewRoleId)&&<><ServicesSection payerType=\"client\" payerId={selClient.id} clients={[selClient]}/>")
  })
})

// ============================================================
// PLANNING MOVED ONTO THE DECISION POINT, AND THE WORKPLAN ONLY READS
//
// Habib, 16 September 2026: "the decision points are listed and sessions for
// each are planned in this tab. I am suggesting that all the planning and
// everything associated with each decision point is moved to that decision
// tab. The session and room should then draw the details of the sessions,
// planned or otherwise, into it so it works almost like a summary... and looks
// like a workplan that can be shared or downloaded." And, on which of the two
// this page should be: "read only would be better as all editing can happen in
// the decision tab... printable and spreadsheet for flexibility."
// ============================================================
describe('the method comes to the decision point', () => {
  const STRIP = fs.readFileSync('src/components/gtcv/SessionsStrip.tsx', 'utf8')

  it('offers the sessions the guide prescribes here, so nothing is typed from memory', () => {
    expect(STRIP).toContain('Sessions the method specifies here')
    expect(STRIP).toContain('methodSessionsFor(dpId)')
    expect(STRIP).toContain('+ Blank session')
  })

  it('will not add the same prescribed session twice', () => {
    expect(STRIP).toContain('usedTitles.has(t.title)')
    expect(STRIP).toContain('Already here')
  })

  it('carries the room, the length and the purpose in with it', () => {
    expect(STRIP).toContain('template ? template.mins')
    expect(STRIP).toContain('template ? template.purpose')
  })

  it('says who the method wants in the room, and who it keeps out', () => {
    expect(STRIP).toContain('attendanceWarnings({')
    expect(STRIP).toContain('The method requires ')
    expect(STRIP).toContain('the method keeps that role out of this room')
  })

  it('never blocks a session that actually happened for being the wrong shape', () => {
    // A coach who knows why the finance lead is absent should not be stopped
    // from recording the session that took place.
    expect(STRIP).not.toContain('disabled={w.missing')
    expect(STRIP).not.toContain('cannot start until')
  })

  // Habib: "I should be able to delete sessions that planned but never
  // happened and so on."
  it('a session that never happened can be deleted, and it asks first', () => {
    expect(STRIP).toContain('async function removeSession(s)')
    expect(STRIP).toContain('This cannot be undone')
    expect(STRIP).toContain('Who was in it goes with it')
  })

  it('refuses to delete a session that carries a recording, and says why', () => {
    // A session with a recording on it is evidence, not a diary entry.
    expect(STRIP).toContain('Delete the recording first, then the session.')
  })

  it('puts a session back if the delete failed, rather than hiding it', () => {
    expect(STRIP).toContain('setSessions(prev => [...prev, s])')
  })

  // A SESSION PLANNED IN MARCH AND ONE STARTING NOW ARE THE SAME THING. There
  // is no second route for a session that happens today.
  it('one that is happening now is the same session as one planned ahead', () => {
    expect(STRIP).toContain('Happening right now.')
    expect(STRIP).toContain('leave the time empty')
  })

  it('everything about a session can be changed where the session is', () => {
    expect(STRIP).toContain('async function saveEdit(s)')
    expect(STRIP).toContain('function startEdit(s)')
    expect(STRIP).toContain('STATUS_OPTIONS.map')
  })

  it('changing the room names the people that room requires', () => {
    expect(STRIP).toContain('async function markRequired(session, kind, extra)')
    expect(STRIP).toContain("update({ required: false }).in('id', noLonger)")
  })

  it('taking a required person out of the room leaves the requirement standing', () => {
    // Otherwise unticking somebody quietly removes the method's rule with them.
    expect(STRIP).toContain('if (row.required) {')
    expect(STRIP).toContain('update({ attended: null })')
  })
})

describe('Sessions and rooms is the workplan', () => {
  const PLAN = fs.readFileSync('src/components/gtcv/SessionWorkplan.tsx', 'utf8')

  it('reads every session on the engagement, in the order the method runs them', () => {
    expect(PLAN).toContain('workplanGroups(sessions)')
    expect(PLAN).toContain("from '@/lib/method-sessions'")
  })

  it('edits nothing at all, and says so', () => {
    expect(PLAN).toContain('Read only. A session is changed, invited, opened or deleted on its own decision point.')
    // No writes of any kind from this screen.
    expect(PLAN).not.toMatch(/\.insert\(/)
    expect(PLAN).not.toMatch(/\.update\(/)
    expect(PLAN).not.toMatch(/\.delete\(/)
    expect(PLAN).not.toContain('+ New session')
    expect(PLAN).not.toContain('+ Add session')
  })

  it('can be printed and downloaded as a spreadsheet, which is what it is for', () => {
    expect(PLAN).toContain('window.print()')
    expect(PLAN).toContain('Download the spreadsheet')
    expect(PLAN).toContain('workplanCsv(sessions, whoFor)')
    expect(PLAN).toContain('@media print')
  })

  it('every session name is the way back to where it can be changed', () => {
    expect(PLAN).toContain('dpHref(clientId, g.id)')
    expect(PLAN).toContain('Plan sessions here')
  })

  it('a dropped connection never reads as an engagement with no sessions', () => {
    // 10 September 2026. One "Failed to fetch" showed zero sessions against
    // every decision point, which Habib read as his work having been deleted.
    expect(PLAN).toContain('for (let go = 0; go < 3; go++)')
    expect(PLAN).toContain('Your sessions are safe on the record')
  })
})

// ============================================================
// WHAT CODERABBIT FOUND ON #278
//
// Six of these are the same shape: a failure that reads as a fact. An
// attendance read that fell over said the session was empty; a load that
// fell over said nothing was planned; a day with no time on it was written
// away as no day at all. On an engagement this platform is the record of,
// a record that quietly says less than the truth is the worst failure it has.
// ============================================================
describe('a failure never reads as a fact', () => {
  const STRIP = fs.readFileSync('src/components/gtcv/SessionsStrip.tsx', 'utf8')
  const PLAN = fs.readFileSync('src/components/gtcv/SessionWorkplan.tsx', 'utf8')

  it('falls back to the pointer only when the name column is genuinely absent', () => {
    // It used to fall back on any error at all and throw the fallback's own
    // error away, so a dropped connection read as a session nobody is in.
    for (const SRC of [STRIP, PLAN]) {
      expect(SRC).toContain('function missingPartyName(error)')
      expect(SRC).toContain("error.code === '42703'")
      expect(SRC).toContain('if (attErr && missingPartyName(attErr))')
    }
  })

  it('says so when it could not read who is in a session, instead of showing nobody', () => {
    expect(STRIP).toContain('Who is in each session could not be read')
    // The workplan retries instead, because it has a retry loop to fall into.
    expect(PLAN).toContain('if (attErr) { last = attErr; continue }')
  })

  it('never prints "nothing is planned" underneath a connection error', () => {
    // 10 September 2026, twice over: Habib read an empty plan as his work
    // having been deleted, and it had not been.
    expect(PLAN).toContain('total === 0 && err ?')
  })

  it('keeps every other required attendee when one of them clashes', () => {
    // One batch is one statement, so a unique violation on any single row
    // aborted all of them and the session then asked for nobody.
    expect(STRIP).toContain('for (const row of rows) {')
    expect(STRIP).toContain('insert([row]).select().single()')
  })

  it('keeps the day when a session that has only a day is edited', () => {
    // Changing the name of a session somebody had put in the diary as a date
    // wrote the date away as null.
    expect(STRIP).toContain("(s.planned_date ? `${s.planned_date}T00:00` : '')")
    expect(STRIP).toContain('planned_at: draft.when && !draft.dayOnly')
    // And typing an actual time turns it into a moment.
    expect(STRIP).toContain('when: e.target.value, dayOnly: false')
  })

  it('says why a session cannot be deleted before asking whether to delete it', () => {
    // Asking "this cannot be undone, are you sure" and then refusing anyway
    // made the one case where the answer is already no look like a decision.
    const fn = STRIP.slice(STRIP.indexOf('async function removeSession(s)'))
    expect(fn.indexOf('Delete the recording first')).toBeLessThan(fn.indexOf('window.confirm'))
  })

  it('gives every workplan table a name a screen reader can read out', () => {
    expect(PLAN).toContain('<caption')
  })
})

// ============================================================
// THE SECOND PASS ON #278
// ============================================================
describe('the invitation route authenticates before it reads anything', () => {
  const ROUTE = fs.readFileSync('app/api/session-invite/route.ts', 'utf8')
  const AUTHZ = fs.readFileSync('src/lib/auth/api-authz.ts', 'utf8')

  it('will not tell a stranger whether a session id is real', () => {
    // It looked the session up with the service role and only then checked who
    // was asking, so 404 against 401 mapped out the identifier space.
    expect(AUTHZ).toContain('export async function requireSignedIn(')
    const before = ROUTE.indexOf('const signedIn = await requireSignedIn(req, admin)')
    const lookup = ROUTE.indexOf("admin.from('gtcv_sessions')")
    expect(before).toBeGreaterThan(-1)
    expect(before).toBeLessThan(lookup)
  })

  it('still checks the engagement itself, once it knows which one it is', () => {
    const signedIn = ROUTE.indexOf('requireSignedIn(req, admin)')
    const access = ROUTE.indexOf("requireAccess(req, admin, session.client_id, 'manage'")
    expect(signedIn).toBeLessThan(access)
  })

  it('logs what went wrong and tells the caller nothing about the database', () => {
    expect(ROUTE).toContain("console.error('Session invitation failed', e)")
    expect(ROUTE).toContain('The invitation could not be sent. Try again.')
    expect(ROUTE).not.toContain("e instanceof Error ? e.message")
  })
})

describe('an unread list is not an empty one', () => {
  const STRIP = fs.readFileSync('src/components/gtcv/SessionsStrip.tsx', 'utf8')

  it('will not call the engagement empty because the people could not be read', () => {
    // Every role the method wants would have looked like a role nobody holds.
    expect(STRIP).toContain('The people on this engagement could not be read')
  })

  it('shows nothing until all of it has been read, so half a load is never on screen', () => {
    // The sessions went up first and the people second, so a failed read of
    // the people left the sessions rendering against a list of nobody, with
    // the controls live and "nobody is on this engagement yet" underneath.
    const fn = STRIP.slice(STRIP.indexOf('const load = useCallback'), STRIP.indexOf('}, [clientId, dpId])'))
    expect(fn.indexOf('const { data: people, error: peopleErr }')).toBeLessThan(fn.indexOf('setSessions(rows || [])'))
    expect(fn.indexOf('setErr(null)')).toBeGreaterThan(fn.indexOf('setParties(people || [])'))
  })

  it('will not set up a room from an attendance list it failed to read', () => {
    // Acting on that inserts duplicates and clears requirements that are live.
    expect(STRIP).toContain('const { data: fresh, error: freshErr }')
    expect(STRIP).toContain('who it requires could not be set just now')
  })

  it('clears what the old room required when the room is taken off', () => {
    // markRequired used to return before the cleanup whenever the new room
    // asked for nobody, so the session went on warning about a room it was no
    // longer in.
    expect(STRIP).toContain('if (roomChanged) await markRequired(')
    const fn = STRIP.slice(STRIP.indexOf('async function markRequired'))
    // The cleanup runs before the "nothing to insert" exit.
    expect(fn.indexOf('const noLonger =')).toBeLessThan(fn.indexOf('if (!rows.length) return'))
  })
})

// ============================================================
// EVERY DECISION POINT CAN BE PLANNED FOR
//
// Habib, 16 September 2026: "not all of them can be planned for, each of these
// should have the planning section in them."
//
// The strip was on all twelve, and on eleven of them it was shut: one grey
// line reading SESSIONS 0, which you had to know was a button. A planning
// section you have to discover is not on the page.
// ============================================================
describe('the planning section is on every decision point', () => {
  const DASH = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')
  const STRIP = fs.readFileSync('src/components/gtcv/SessionsStrip.tsx', 'utf8')
  const TYPES = fs.readFileSync('src/lib/coach-types.ts', 'utf8')

  it('the method knows a session for every decision point a tab points at', () => {
    // A tab carrying a dpId that the catalogue has never heard of is a
    // decision point where "the guide does not specify sessions here".
    const tabDps = [...TYPES.matchAll(/dpId:\s*'([^']+)'/g)].map(m => m[1])
    expect(tabDps.length).toBeGreaterThan(9)
    const unknown = tabDps.filter(d => !METHOD_SESSIONS[d] || !METHOD_SESSIONS[d].length)
    expect(unknown).toEqual([])
  })

  it('every tab that is a decision point renders the strip', () => {
    const tabDps = [...TYPES.matchAll(/dpId:\s*'([^']+)'/g)].map(m => m[1])
    const missing = tabDps.filter(d => {
      if (d === 'phase_0') return !DASH.includes('<SessionsStrip clientId={selClient.id} dpId="phase_0"')
      if (d === 'handover') return !DASH.includes('<SessionsStrip clientId={selClient.id} dpId="handover"')
      // The nine are rendered from one list, by key.
      return !DASH.includes('<SessionsStrip clientId={selClient.id} dpId={dpKey}')
    })
    expect(missing).toEqual([])
    // And the pre-engagement conversation, which is dp 'setup'.
    expect(DASH).toContain('dpId="setup"')
  })

  it('it is open when you arrive, rather than hidden behind a grey line', () => {
    expect(STRIP).toContain('openByDefault = true')
    // And the header says what pressing it does.
    expect(STRIP).toContain("{open ? 'Hide' : 'Plan a session'}")
  })

  it('a decision point renders only when its tab is the one being shown', () => {
    // These nine tested activeTab while every other tab tested shownTab, so a
    // decision point left over in the address rendered under the cover for
    // somebody who may not see decision points at all.
    expect(DASH).toContain('shownTab===dpKey&&<div key={dpKey}>')
    expect(DASH).not.toContain('activeTab===dpKey')
  })
})

// ============================================================
// A SHUT GATE IS A LOCK, NOT A DISABLED BUTTON
//
// From the review on #279. A block stays shut until the one before it is
// signed off, and that was enforced by greying the button in the sidebar.
// ?zone=dp05 typed, pasted, or simply remembered by a browser rendered
// Decision Point 5 in full for somebody the gate was meant to hold back.
// ============================================================
describe('a decision point that is not open yet', () => {
  const DASH = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')

  it('is not rendered because the address asked for it', () => {
    expect(DASH).toContain('const tabIsOpen=(id)=>{')
    expect(DASH).toContain("const shownTab=tabIsOpen(activeTab)?activeTab:'cover'")
  })

  it('checks the gate itself, not just whether the tab exists', () => {
    const fn = DASH.slice(DASH.indexOf('const tabIsOpen=(id)=>{'), DASH.indexOf('const shownTab=tabIsOpen'))
    expect(fn).toContain('gateIsOpen(tab.dpId')
    // A tab that is not a decision point has no gate to check.
    expect(fn).toContain('if(!tab.dpId)return true')
  })

  it('still lets the coaching team prepare a block before the session that fills it', () => {
    const fn = DASH.slice(DASH.indexOf('const tabIsOpen=(id)=>{'), DASH.indexOf('const shownTab=tabIsOpen'))
    expect(fn).toContain('isCoachingTeam:canViewCoachGuidance(previewRoleId)')
  })
})

// ============================================================
// THE SMALL THINGS THAT MADE THE PAGE FEEL BROKEN
//
// Habib, 17 September 2026: "The tab now starts in the middle not at the
// bottom, how frustrating is this... The tab title is sessions and rooms, the
// content shows workplan, please make this consistent... why does the key to
// the different types of rooms stacked like that, makes the whole thing
// cluttered... The workplan page is showing 3 sessions, where did that come
// from, I did not set up anything."
// ============================================================
describe('the workplan page', () => {
  const PLAN = fs.readFileSync('src/components/gtcv/SessionWorkplan.tsx', 'utf8')
  const TYPES = fs.readFileSync('src/lib/coach-types.ts', 'utf8')
  const DASH = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')

  it('is called the same thing in the menu as on the page', () => {
    expect(TYPES).toContain("label: 'Workplan'")
    expect(TYPES).not.toContain("label: 'Sessions and rooms'")
  })

  it('folds the room key away, instead of stacking six cards above the work', () => {
    expect(PLAN).toContain('<details')
    expect(PLAN).toContain('The six rooms, and who the method puts in each')
  })

  it('says when a session was added, so an unfamiliar one can be accounted for', () => {
    // Nothing on the platform creates a session by itself, so every row was
    // added by somebody pressing Add. Saying when makes that answerable.
    expect(PLAN).toContain('added {new Date(s.created_at)')
  })
})

describe('a tab opens at its top, and stays there', () => {
  const DASH = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')

  it('scrolls when the tab changes', () => {
    expect(DASH).toContain('window.scrollTo({top:0,left:0,behavior:\'auto\'})')
    expect(DASH).toContain('[activeTab,selClientId,view]')
  })

  it('scrolls again once the panels have finished loading', () => {
    // A tab's panels fetch their own data, so the page is short at the moment
    // of the change and grows as each one answers. Scrolling only then puts
    // you at the top of a page that is not there yet.
    expect(DASH).toContain('requestAnimationFrame(top)')
    expect(DASH).toContain('setTimeout(top,250)')
    // And it tidies up after itself, so a fast click does not leave a timer
    // that scrolls the next tab out from under you.
    expect(DASH).toContain('cancelAnimationFrame(frame);clearTimeout(settle)')
  })
})
