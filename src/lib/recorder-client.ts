// ============================================================
// THE RECORDER THAT RUNS IN SOMEBODY'S BROWSER
//
// One instance per device. It takes that device's own microphone, cuts the
// audio into half minute pieces, and posts each piece to the platform as it is
// produced. It reports how far it has got so the person running the session
// can see a green line against each name, and it reports a failure the moment
// one happens rather than leaving a silent gap.
//
// WHAT IT DELIBERATELY DOES NOT DO.
//
//   It does not wait for the end to upload. A phone that dies loses the last
//   thirty seconds and nothing else.
//
//   It does not give up when the network drops. A piece that fails to upload
//   goes back on a queue and is tried again, so a field interviewer walking
//   out of signal keeps recording and the audio arrives when they walk back
//   into it.
//
//   It does not decide whether recording is allowed. Consent is checked by the
//   server when the recording opens, once, in front of nobody.
//
// WHAT THE DEVICE IDENTIFIER IS. A random string, kept so that the same laptop
// rejoining after a dropped line continues its own track rather than starting
// a second one. It holds no engagement data of any kind and it is not an
// identity: writing to a track still requires being on the engagement.
// ============================================================
import { AUDIO_MIME, CHUNK_MS } from './recording'

const DEVICE_KEY = 'cv_device_id'

/** This device's own name for itself. Random, and it is nobody's identity. */
export function deviceId(): string {
  try {
    const held = localStorage.getItem(DEVICE_KEY)
    if (held) return held
    const made = (globalThis.crypto?.randomUUID?.() || `dev_${Math.random().toString(36).slice(2)}${Date.now()}`)
    localStorage.setItem(DEVICE_KEY, made)
    return made
  } catch {
    // A browser that refuses storage still records; it simply starts a new
    // track if the page is reloaded, which is better than not recording.
    return `dev_${Math.random().toString(36).slice(2)}${Date.now()}`
  }
}

/** Whether this browser can record at all, and if not, what to say about it. */
export function recordingSupport(): { ok: boolean; reason?: string } {
  if (typeof window === 'undefined') return { ok: false, reason: 'not in a browser' }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: 'this browser cannot reach a microphone. Use Chrome, Edge or Safari.' }
  }
  if (typeof MediaRecorder === 'undefined') {
    return { ok: false, reason: 'this browser cannot record audio. Use Chrome, Edge or Safari.' }
  }
  return { ok: true }
}

/** The format this browser will actually give us, preferring Opus. */
export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const wanted = [AUDIO_MIME, 'audio/webm', 'audio/mp4']
  for (const m of wanted) {
    try { if (MediaRecorder.isTypeSupported(m)) return m } catch { /* older browser */ }
  }
  return ''
}

export interface RecorderOptions {
  recordingId: string
  token: string | null
  speakerName?: string | null
  partyId?: string | null
  /** Which microphone. Absent means whichever one the browser calls default. */
  microphoneId?: string | null
  /** Called whenever something changes, so a screen can redraw. */
  onChange?: (s: RecorderState) => void
}

/** Below this, nothing audible is arriving. Room tone sits well above it. */
export const SILENCE_LEVEL = 0.006

/**
 * How long silence has to last before it is worth interrupting somebody.
 *
 * Ten seconds. Long enough that a pause for thought is not an alarm, short
 * enough that the sentence being missed can still be repeated.
 */
export const SILENCE_ALARM_SECONDS = 10

/** The microphones this browser can offer, for when the default is the wrong one. */
export async function listMicrophones(): Promise<{ id: string; label: string }[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    return all
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }))
  } catch {
    return []
  }
}

export interface RecorderState {
  status: 'idle' | 'starting' | 'recording' | 'stopping' | 'stopped' | 'failed'
  seconds: number
  /** Pieces recorded, and pieces still waiting to be uploaded. */
  uploaded: number
  waiting: number
  problem?: string
  /**
   * HOW LOUD THIS MICROPHONE ACTUALLY IS, 0 to 1.
   *
   * 10 September 2026. A whole session was recorded, uploaded and transcribed
   * and every second of it was silence. Everything reported success, because
   * everything had succeeded: the device was open, the encoder ran, the pieces
   * uploaded. Nothing anywhere was listening to whether there was any sound in
   * them, and the first sign of trouble was a transcript that said "For more UN
   * videos visit www.un.org", which is what the transcription service says when
   * handed nothing.
   *
   * A recorder that cannot say whether it is hearing anything is not a
   * recorder, it is a hope. This is measured off the live stream itself.
   */
  level: number
  /** How long this microphone has been silent while it was meant to be recording. */
  silentSeconds: number
}

export class DeviceRecorder {
  private opts: RecorderOptions
  private stream: MediaStream | null = null
  private rec: MediaRecorder | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private startedAt = 0
  private nextIndex = 0
  private queue: { index: number; blob: Blob }[] = []
  private sending = false
  private state: RecorderState = {
    status: 'idle', seconds: 0, uploaded: 0, waiting: 0, level: 0, silentSeconds: 0,
  }
  private audio: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private levelTimer: ReturnType<typeof setInterval> | null = null
  readonly device = deviceId()

  constructor(opts: RecorderOptions) { this.opts = opts }

  current(): RecorderState { return { ...this.state } }

  private set(patch: Partial<RecorderState>) {
    this.state = { ...this.state, ...patch, waiting: this.queue.length }
    this.opts.onChange?.(this.current())
  }

  private async post(action: string, body: Record<string, unknown>) {
    return fetch('/api/session-recording', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.opts.token ? { Authorization: `Bearer ${this.opts.token}` } : {}),
      },
      body: JSON.stringify({ action, recordingId: this.opts.recordingId, deviceId: this.device, ...body }),
    })
  }

  /** Ask for the microphone, join the recording, and begin. */
  async start(): Promise<void> {
    const support = recordingSupport()
    if (!support.ok) { await this.fail(support.reason!); throw new Error(support.reason) }

    this.set({ status: 'starting', problem: undefined })
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Speech in a room, on a laptop, with other people talking. These
          // three are what make one voice usable rather than a hum.
          echoCancellation: true, noiseSuppression: true, autoGainControl: true,
          ...(this.opts.microphoneId ? { deviceId: { exact: this.opts.microphoneId } } : {}),
        },
      })
    } catch {
      const why = 'their microphone was blocked or is in use by another program'
      await this.fail(why)
      throw new Error(why)
    }

    const mimeType = pickMimeType()
    try {
      // 32 kilobits a second. Chrome's own default is roughly four times that,
      // which is wasted on speech and has a real consequence: the transcription
      // service takes a file of a certain size, and at the default a session of
      // any length has to be cut into parts to be sent at all. At this rate two
      // hours of one voice is about thirty megabytes, speech is clear, and the
      // upload works on a field phone's connection.
      this.rec = new MediaRecorder(this.stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 32_000,
      })
    } catch {
      // A browser that will not take those settings still records. Losing the
      // bitrate costs disk; refusing to record costs the session.
      try {
        this.rec = new MediaRecorder(this.stream)
      } catch {
        await this.fail('their browser could not start a recorder')
        throw new Error('recorder could not start')
      }
    }

    this.startedAt = Date.now()
    // The offset is measured from this moment, so it is sent before anything
    // else happens rather than after the first piece is ready.
    await this.post('join', {
      startedAt: new Date(this.startedAt).toISOString(),
      speakerName: this.opts.speakerName || null,
      partyId: this.opts.partyId || null,
    }).catch(() => null)

    this.rec.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        this.queue.push({ index: this.nextIndex++, blob: e.data })
        void this.drain()
      }
    }
    this.rec.onerror = () => { void this.fail('their device stopped recording unexpectedly') }

    this.listen()
    this.rec.start(CHUNK_MS)
    this.set({ status: 'recording', seconds: 0, level: 0, silentSeconds: 0 })

    this.timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - this.startedAt) / 1000)
      this.set({ seconds })
      // Every half minute the platform is told how far this device has got,
      // which is what draws the live line against this person's name.
      if (seconds % 30 === 0) void this.post('progress', { durationSeconds: seconds }).catch(() => null)
    }, 1000)
  }

  /**
   * WATCH WHETHER ANY SOUND IS ACTUALLY ARRIVING.
   *
   * Five times a second, the loudest sample in the current window. That is
   * enough to move a meter smoothly and to notice a microphone that is open,
   * encoding, uploading and completely silent, which is the failure that cost a
   * whole session and reported success at every step.
   */
  private listen() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.audio = new Ctx()
      const source = this.audio.createMediaStreamSource(this.stream!)
      this.analyser = this.audio.createAnalyser()
      this.analyser.fftSize = 1024
      source.connect(this.analyser)
      const buf = new Float32Array(this.analyser.fftSize)

      this.levelTimer = setInterval(() => {
        if (!this.analyser) return
        this.analyser.getFloatTimeDomainData(buf)
        let peak = 0
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i])
          if (v > peak) peak = v
        }
        const quiet = peak < SILENCE_LEVEL
        this.set({
          level: peak,
          silentSeconds: quiet ? this.state.silentSeconds + 0.2 : 0,
        })
      }, 200)
    } catch {
      // A browser that will not measure still records. The meter simply sits at
      // zero, and the screen says it cannot tell rather than claiming silence.
      this.analyser = null
    }
  }

  /** True when the browser can actually measure this microphone. */
  canMeasure(): boolean { return this.analyser !== null }

  /** Send what is waiting, oldest first, and keep anything that will not go. */
  private async drain(): Promise<void> {
    if (this.sending) return
    this.sending = true
    try {
      while (this.queue.length) {
        const piece = this.queue[0]
        const form = new FormData()
        form.append('recordingId', this.opts.recordingId)
        form.append('deviceId', this.device)
        form.append('chunkIndex', String(piece.index))
        form.append('file', piece.blob, `${piece.index}.webm`)
        let ok = false
        try {
          const res = await fetch('/api/session-recording/chunk', {
            method: 'POST',
            headers: this.opts.token ? { Authorization: `Bearer ${this.opts.token}` } : undefined,
            body: form,
          })
          ok = res.ok
        } catch { ok = false }
        if (!ok) break // Leave it on the queue and try again with the next piece.
        this.queue.shift()
        this.set({ uploaded: this.state.uploaded + 1 })
      }
    } finally {
      this.sending = false
      this.set({})
    }
  }

  /** Say this device has broken, and why, while the session is still running. */
  async fail(reason: string): Promise<void> {
    this.set({ status: 'failed', problem: reason })
    await this.post('fail', { reason, durationSeconds: this.state.seconds }).catch(() => null)
  }

  /** Stop, flush the last piece, and keep trying until what is held has gone. */
  async stop(): Promise<void> {
    this.set({ status: 'stopping' })
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    if (this.levelTimer) { clearInterval(this.levelTimer); this.levelTimer = null }
    try { this.audio?.close() } catch { /* already closed */ }
    this.analyser = null
    try { this.rec?.stop() } catch { /* already stopped */ }
    try { this.stream?.getTracks().forEach((t) => t.stop()) } catch { /* already released */ }

    // The recorder hands over its last piece asynchronously, so give it a
    // moment, then keep retrying what is queued for up to a minute.
    await new Promise((r) => setTimeout(r, 400))
    for (let attempt = 0; attempt < 12 && this.queue.length; attempt++) {
      await this.drain()
      if (this.queue.length) await new Promise((r) => setTimeout(r, 5000))
    }

    await this.post('finish', { durationSeconds: this.state.seconds }).catch(() => null)
    this.set({ status: 'stopped' })
  }
}
