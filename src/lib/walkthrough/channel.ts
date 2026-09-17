// ============================================================
// THE PHONE THAT DRIVES THE PROJECTOR.
//
// A Supabase Realtime broadcast channel, which is a message relay and nothing
// else: no row is written, no table is involved, and nothing said on it is
// stored anywhere. The screen listens, the phone sends, and after every change
// the screen says back what it is now showing so the phone is never guessing.
//
// WHY A CODE AND NOT JUST THE SLUG. The channel name carries a four digit code
// that the screen invents when it loads and shows on the holding screen. Anyone
// who knows the client link alone cannot reach the channel, because they do not
// have the code, and the code is only readable by someone in the room looking
// at the screen. The remote page requires a signed-in coach on top of that.
//
// WHAT HAPPENS WHEN IT FAILS. Nothing that matters. The walkthrough is driven
// by the keyboard, a clicker and the buttons on the screen whether the channel
// ever connects or not. If it has not connected after eight seconds, the
// holding screen stops saying it is waiting and tells the presenter to use the
// arrow keys.
// ============================================================
import { supabase } from '@/lib/supabase'

/** Everything the phone can ask the screen to do. */
export type RemoteMessage =
  | { type: 'goto'; index: number }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'mode'; mode: 'walk' | 'explore' | 'play' }
  | { type: 'sound'; on: boolean }
  | { type: 'room'; room: 'dark' | 'light' }
  | { type: 'reveal' }
  | { type: 'hello' }

/** What the screen says back, after every change. */
export interface ScreenState {
  type: 'state'
  index: number
  total: number
  name: string
  mode: string
  sound: boolean
  room: string
  /** The screen's note for the presenter, so the phone never guesses. */
  notes?: string[]
  /** Every screen's name, for the jump-to list. */
  names?: string[]
}

/** How long the holding screen waits before it stops saying "waiting". */
export const CONNECT_TIMEOUT_MS = 8000

/** The name both ends must agree on. */
export function channelName(slug: string, code: string): string {
  return `walkthrough:${slug}:${code}`
}

/** A fresh four digit code. Kept for the session so a refresh does not change it. */
export function presenterCode(slug: string): string {
  const key = `gtcv-presenter-${slug}`
  try {
    const kept = sessionStorage.getItem(key)
    if (kept && /^\d{4}$/.test(kept)) return kept
  } catch {}
  const made = String(Math.floor(1000 + Math.random() * 9000))
  try { sessionStorage.setItem(key, made) } catch {}
  return made
}

type Unsub = () => void

/**
 * The screen's end. It listens for the phone and publishes its own state.
 * `onReady` fires once, when the channel is live, so the holding screen can
 * change from "Waiting for presenter" to "Ready".
 */
export function joinAsScreen(
  slug: string,
  code: string,
  handlers: {
    onMessage: (m: RemoteMessage) => void
    onReady: () => void
    onLost: () => void
  },
): { publish: (s: ScreenState) => void; leave: Unsub } {
  const ch = supabase.channel(channelName(slug, code), { config: { broadcast: { self: false } } })
  ch.on('broadcast', { event: 'remote' }, ({ payload }) => {
    handlers.onMessage(payload as RemoteMessage)
  })
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') handlers.onReady()
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') handlers.onLost()
  })
  return {
    publish: (s) => { ch.send({ type: 'broadcast', event: 'screen', payload: s }).catch(() => {}) },
    leave: () => { supabase.removeChannel(ch) },
  }
}

/**
 * The phone's end. It sends instructions and follows whatever the screen says
 * it is showing, rather than counting presses, so the two cannot drift apart.
 */
export function joinAsRemote(
  slug: string,
  code: string,
  handlers: {
    onState: (s: ScreenState) => void
    onStatus: (status: 'connecting' | 'connected' | 'lost') => void
  },
): { send: (m: RemoteMessage) => void; leave: Unsub } {
  const ch = supabase.channel(channelName(slug, code), { config: { broadcast: { self: false } } })
  ch.on('broadcast', { event: 'screen' }, ({ payload }) => {
    handlers.onState(payload as ScreenState)
  })
  handlers.onStatus('connecting')
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      handlers.onStatus('connected')
      ch.send({ type: 'broadcast', event: 'remote', payload: { type: 'hello' } }).catch(() => {})
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') handlers.onStatus('lost')
  })
  return {
    send: (m) => { ch.send({ type: 'broadcast', event: 'remote', payload: m }).catch(() => {}) },
    leave: () => { supabase.removeChannel(ch) },
  }
}
