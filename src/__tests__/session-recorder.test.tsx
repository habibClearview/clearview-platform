// @vitest-environment jsdom
// ============================================================
// THE SAFEGUARD THAT WAS MISSING
//
// 10 September 2026. Habib, more than once: the safeguards are there to reduce
// this level of error and time wasting, and you have ignored me.
//
// He is right, and this file is the admission. Every test written for the
// recording ran against the server or against arithmetic. Not one of them
// mounted the screen. So a counter that froze, a counter that started at the
// previous recording's length, a microphone opened twice, and a session that
// recorded silence while reporting success were all invisible to 1,735 passing
// tests and were found by a person losing an afternoon.
//
// What is different here: the actual component is rendered, with a fake
// microphone, a fake recorder and a fake clock, and driven the way a person
// drives it. If the screen lies, this fails.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'

// ─── The world the component runs in ─────────────────────────
let started: MediaStreamConstraints[] = []
let recorders: FakeRecorder[] = []
let level = 0
let audioStartsAsleep = false
let audioWillWake = true
let trackLabel = 'MacBook Pro Microphone'
let trackMuted = false

class FakeRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onerror: (() => void) | null = null
  state = 'inactive'
  constructor(public stream: unknown, public options?: unknown) { recorders.push(this) }
  start() { this.state = 'recording' }
  stop() { this.state = 'inactive' }
}

function installBrowser() {
  started = []; recorders = []; level = 0; audioStartsAsleep = false; audioWillWake = true
  trackLabel = 'MacBook Pro Microphone'; trackMuted = false

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async (c: MediaStreamConstraints) => {
        started.push(c)
        const track = {
          stop: () => {},
          label: trackLabel,
          muted: trackMuted,
          readyState: 'live',
          getSettings: () => ({ sampleRate: 48000, channelCount: 1 }),
          onmute: null, onunmute: null,
        }
        return {
          getTracks: () => [track],
          getAudioTracks: () => [track],
        } as unknown as MediaStream
      }),
      enumerateDevices: vi.fn(async () => [
        { kind: 'audioinput', deviceId: 'built-in', label: 'MacBook Pro Microphone' },
        { kind: 'audioinput', deviceId: 'other', label: 'Some other device' },
      ]),
    },
  })
  Object.defineProperty(globalThis.navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn(async () => ({ state: 'granted' })) },
  })
  ;(globalThis as Record<string, unknown>).MediaRecorder = FakeRecorder
  ;(FakeRecorder as unknown as { isTypeSupported: (m: string) => boolean }).isTypeSupported = () => true

  // An analyser that reports whatever `level` is set to, so a test can make the
  // room silent or make somebody speak.
  ;(globalThis as Record<string, unknown>).AudioContext = class {
    state = audioStartsAsleep ? 'suspended' : 'running'
    createMediaStreamSource() { return { connect: () => {} } }
    createAnalyser() {
      return {
        fftSize: 1024,
        getFloatTimeDomainData: (buf: Float32Array) => { buf.fill(level) },
        connect: () => {},
      }
    }
    resume() { if (audioWillWake) this.state = 'running'; return Promise.resolve() }
    close() { return Promise.resolve() }
  }
  ;(globalThis as Record<string, unknown>).URL = Object.assign(globalThis.URL, {
    createObjectURL: () => 'blob:x', revokeObjectURL: () => {},
  })
}

// The engagement answers: a recording is open, with nothing captured yet.
const OPEN_RECORDING = {
  recording: { id: 'rec-1', client_id: 'c1', started_at: new Date().toISOString(), status: 'opening' },
  tracks: [], live: [], seconds: 0, canManage: true,
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }),
  },
}))

import SessionRecorder from '@/components/gtcv/SessionRecorder'

/** Let every pending promise settle, then advance the fake clock. */
async function tick(ms: number) {
  await act(async () => {
    await Promise.resolve()
    vi.advanceTimersByTime(ms)
    await Promise.resolve()
  })
}

beforeEach(() => {
  installBrowser()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  // Every poll answers with the same recording, as the real one does.
  globalThis.fetch = vi.fn(async () => ({
    ok: true, json: async () => OPEN_RECORDING,
  })) as unknown as typeof fetch
})

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('one microphone, however often the screen redraws', () => {
  it('opens the microphone exactly once across many polls', async () => {
    // THE POLL RUNS EVERY FIVE SECONDS FOR THE LENGTH OF THE SESSION. If a
    // redraw can start a second recorder, two of them write to the same track
    // with the same piece numbers and overwrite each other, which is a
    // recording of nothing that reports success at every step.
    render(<SessionRecorder clientId="c1" sessionId="s1" canManage clientName="Test" />)
    await tick(100)
    await tick(5000)
    await tick(5000)
    await tick(5000)
    expect(started.length).toBe(1)
    expect(recorders.length).toBe(1)
  })
})

describe('the timer says what this device has captured', () => {
  it('starts at zero, not at whatever was there before', async () => {
    // It showed 00:30 and then jumped back to 00:00, because it preferred the
    // server's figure from the previous recording until this device had one.
    render(<SessionRecorder clientId="c1" sessionId="s1" canManage clientName="Test" />)
    await tick(100)
    expect(screen.getByText(/●\s*00:00/)).toBeTruthy()
  })

  it('keeps counting past the poll that used to freeze it', async () => {
    // The poll replaced the recording object every five seconds, which
    // restarted the effect whose cleanup switched off the counter.
    render(<SessionRecorder clientId="c1" sessionId="s1" canManage clientName="Test" />)
    await tick(100)
    await tick(8000)
    const shown = screen.getByText(/●\s*00:\d\d/).textContent || ''
    const seconds = Number(shown.trim().split(':')[1])
    expect(seconds).toBeGreaterThanOrEqual(5)
  })
})

describe('a microphone that is producing nothing says so', () => {
  it('shows no sound while the room is silent', async () => {
    level = 0
    render(<SessionRecorder clientId="c1" sessionId="s1" canManage clientName="Test" />)
    await tick(100)
    await tick(1000)
    expect(screen.getByText('no sound')).toBeTruthy()
  })

  it('says it is hearing you the moment there is signal', async () => {
    level = 0.2
    render(<SessionRecorder clientId="c1" sessionId="s1" canManage clientName="Test" />)
    await tick(100)
    await tick(1000)
    expect(screen.getByText('hearing you')).toBeTruthy()
  })

  it('interrupts after ten seconds of silence rather than at the end', async () => {
    level = 0
    render(<SessionRecorder clientId="c1" sessionId="s1" canManage clientName="Test" />)
    await tick(100)
    await tick(12000)
    expect(screen.getByText(/Nothing is reaching this microphone/)).toBeTruthy()
  })
})

describe('the recording is taken raw, not through the call processing', () => {
  it('asks for no echo cancellation, no noise suppression, no automatic gain', async () => {
    // The call already holds this microphone with echo cancellation on. A
    // second stream on the same device through the same chain can come back as
    // silence, which is the failure that recorded a whole session of nothing.
    render(<SessionRecorder clientId="c1" sessionId="s1" canManage clientName="Test" />)
    await tick(100)
    const audio = started[0].audio as MediaTrackConstraints
    expect(audio.echoCancellation).toBe(false)
    expect(audio.noiseSuppression).toBe(false)
    expect(audio.autoGainControl).toBe(false)
  })
})

describe('a meter that cannot measure says so', () => {
  it('says it cannot tell, rather than saying there is no sound', async () => {
    // A browser will not measure audio before the person has touched the page,
    // and this recorder starts itself. Reporting that as silence sends somebody
    // to fix a device that is not broken.
    audioStartsAsleep = true
    audioWillWake = false
    render(<SessionRecorder clientId="c1" sessionId="s1" canManage clientName="Test" />)
    await tick(100)
    await tick(1000)
    expect(screen.getByText('cannot tell')).toBeTruthy()
    expect(screen.queryByText('no sound')).toBeNull()
  })

  it('never raises the silence alarm on a measurement it does not have', async () => {
    audioStartsAsleep = true
    audioWillWake = false
    render(<SessionRecorder clientId="c1" sessionId="s1" canManage clientName="Test" />)
    await tick(100)
    await tick(15000)
    expect(screen.queryByText(/Nothing is reaching this microphone/)).toBeNull()
  })

  it('wakes it where the browser allows, and then measures properly', async () => {
    audioStartsAsleep = true
    audioWillWake = true
    level = 0
    render(<SessionRecorder clientId="c1" sessionId="s1" canManage clientName="Test" />)
    await tick(100)
    await tick(1000)
    expect(screen.getByText('no sound')).toBeTruthy()
  })
})

describe('naming the microphone that was actually opened', () => {
  it('says which device the browser gave it', async () => {
    // A request for "whichever this device calls default" is answered by the
    // operating system, and the answer is often not the one on the lid. Four
    // sessions recorded silence and nobody could say which device that was.
    trackLabel = 'Krisp Microphone'
    render(<SessionRecorder clientId="c1" sessionId="s1" canManage clientName="Test" />)
    await tick(200)
    expect(screen.getByText('Krisp Microphone')).toBeTruthy()
  })

  it('says plainly when the device is sending nothing at all', async () => {
    // muted on a track is not a person pressing mute. It is the source saying
    // it is delivering no samples, which settles whether the fault is the
    // platform or the machine.
    trackMuted = true
    render(<SessionRecorder clientId="c1" sessionId="s1" canManage clientName="Test" />)
    await tick(200)
    expect(screen.getByText(/not sending any audio at all/)).toBeTruthy()
  })

  it('sends the report to the platform, so it is on the record', async () => {
    trackLabel = 'Some Virtual Device'
    render(<SessionRecorder clientId="c1" sessionId="s1" canManage clientName="Test" />)
    await tick(200)
    const joins = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => c[1] as RequestInit)
      .filter((o) => o && typeof o.body === 'string' && (o.body as string).includes('"join"'))
    expect(joins.length).toBeGreaterThan(0)
    expect(joins[0].body as string).toContain('Some Virtual Device')
  })

  it('offers the chooser even when only one device has a name', async () => {
    // It was hidden below two devices, which hid it on exactly the machines
    // that needed it.
    render(<SessionRecorder clientId="c1" sessionId="s1" canManage clientName="Test" />)
    await tick(200)
    expect(screen.getByText('Microphone')).toBeTruthy()
  })
})
