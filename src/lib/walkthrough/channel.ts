// ============================================================
// THE PHONE THAT DRIVES THE PROJECTOR.
//
// A Supabase Realtime broadcast channel, which is a message relay and nothing
// else: no row is written, no table is involved, and nothing said on it is
// stored anywhere. The screen listens, the phone sends, and after every change
// the screen says back what it is now showing so the phone is never guessing.
//
// TWO THINGS GUARD IT, AND ONE OF THEM IS NOT THE FOUR DIGIT CODE.
//
// The code on the holding screen is four digits because it is there to be read
// across a meeting room. Four digits is ten thousand guesses, which is nothing,
// and the channel it names is reachable by anyone who can open the public page.
// On its own it would mean a stranger could drive a live presentation.
//
// So the square code on the screen carries a second value that is never
// printed: a long random key, generated with the browser's own cryptography.
// Every instruction the phone sends carries it, and the screen ignores anything
// that does not. Scanning the code in the room is the only way to have it.
//
// On top of that the remote page itself opens only for a signed-in coach.
// The code is the convenience, the key is the lock, and the sign in is the
// answer to who is holding the phone.
//
// WHAT HAPPENS WHEN IT FAILS. Nothing that matters. The walkthrough is driven
// by the keyboard, a clicker and the buttons on the screen whether the channel
// ever connects or not. If it has not connected after eight seconds, the
// holding screen stops saying it is waiting and tells the presenter to use the
// arrow keys.
// ============================================================
import { supabase } from '@/lib/supabase'
import { accepts, channelName, type Pairing, type Sealed } from './pairing'

export { channelName, presenterPairing, pairingFromLink, type Pairing } from './pairing'

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
  /** Slow the sequences down, or put them back to the approved pace. */
  | { type: 'speed'; factor: number }
  /** Hold the sequence at the beat it has reached, or let it carry on. */
  | { type: 'hold'; held: boolean }
  /** Move the reading panel on the screen, from the other end of the room. */
  | { type: 'scroll'; direction: 1 | -1 }

/** What the screen says back, after every change. */
export interface ScreenState {
  type: 'state'
  index: number
  total: number
  name: string
  mode: string
  sound: boolean
  room: string
  /** How slowly the sequences are running. 1 is the approved pace. */
  speed?: number
  /** True while the sequence is held where it is. */
  held?: boolean
  /** How many things this screen takes one at a time, and which one is up. */
  beats?: number
  beat?: number
  /** Where the engagement's own workspace is, for the presenter's own phone. */
  workspace?: string
  /** Whether the panel on the screen has more text above or below the fold. */
  more?: { down: boolean; up: boolean }
  /** The presenter's cue and talking points, so the phone never guesses. */
  notes?: { cue: string; points: string[] }[]
  /** Every screen's name, for the jump-to list. */
  names?: string[]
}

/** How long the holding screen waits before it stops saying "waiting". */
export const CONNECT_TIMEOUT_MS = 8000

type Unsub = () => void

/**
 * The screen's end. It listens for the phone and publishes its own state.
 * `onReady` fires once, when the channel is live, so the holding screen can
 * change from "Waiting for presenter" to "Ready".
 */
export function joinAsScreen(
  slug: string,
  pairing: Pairing,
  handlers: {
    onMessage: (m: RemoteMessage) => void
    onReady: () => void
    onLost: () => void
  },
): { publish: (s: ScreenState) => void; leave: Unsub } {
  const ch = supabase.channel(channelName(slug, pairing.code), { config: { broadcast: { self: false } } })
  ch.on('broadcast', { event: 'remote' }, ({ payload }) => {
    // Anything without the key from the square code is somebody else on a
    // channel whose name they guessed. It is dropped without a word: telling
    // them the key was wrong tells them there is a key to get right.
    if (!accepts(pairing, payload)) return
    handlers.onMessage((payload as Sealed<RemoteMessage>).message)
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
  pairing: Pairing,
  handlers: {
    onState: (s: ScreenState) => void
    onStatus: (status: 'connecting' | 'connected' | 'lost') => void
  },
): { send: (m: RemoteMessage) => void; leave: Unsub } {
  const ch = supabase.channel(channelName(slug, pairing.code), { config: { broadcast: { self: false } } })
  ch.on('broadcast', { event: 'screen' }, ({ payload }) => {
    handlers.onState(payload as ScreenState)
  })
  handlers.onStatus('connecting')
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      handlers.onStatus('connected')
      ch.send({ type: 'broadcast', event: 'remote', payload: { key: pairing.key, message: { type: 'hello' } } }).catch(() => {})
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') handlers.onStatus('lost')
  })
  return {
    send: (m) => {
      ch.send({ type: 'broadcast', event: 'remote', payload: { key: pairing.key, message: m } }).catch(() => {})
    },
    leave: () => { supabase.removeChannel(ch) },
  }
}
