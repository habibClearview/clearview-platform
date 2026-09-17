// ============================================================
// THE CODE ON THE SCREEN, AND THE LOCK BEHIND IT.
//
// Two values are made when the holding screen loads. The four digit code is
// printed, because it has to be read across a meeting room, and it names the
// channel the phone and the screen talk on. The key is not printed anywhere. It
// travels only inside the square code the presenter scans, and every
// instruction the phone sends carries it.
//
// WHY BOTH. Four digits is ten thousand guesses, and the channel it names can
// be reached by anyone who can open the public page, so on its own it would
// mean a stranger could drive a live presentation from the next room. The key
// is 48 characters from the browser's own cryptography. Guessing it is not a
// thing that happens.
//
// This is deliberately in a file of its own, with no database and no browser
// beyond sessionStorage, so the rule can be tested directly.
// ============================================================

export interface Pairing {
  /** Four digits, printed under the square code. */
  code: string
  /** Long, random, and never printed. */
  key: string
}

/** What a phone actually sends: an instruction, and the key that permits it. */
export interface Sealed<T> {
  key: string
  message: T
}

/** How long a key is, in characters. 24 bytes written as hexadecimal. */
export const KEY_LENGTH = 48

/** A key nobody can read off a screen or guess. */
export function randomKey(): string {
  const bytes = new Uint8Array(24)
  try {
    crypto.getRandomValues(bytes)
  } catch {
    // No cryptography available is not a reason to fall back to something
    // guessable. With no key the screen refuses every instruction and the
    // presenter drives it from the keyboard, which always works.
    return ''
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Where the pair is kept, so refreshing does not invalidate a scanned code. */
function store(slug: string): string {
  return `gtcv-presenter-${slug}`
}

/** This screen's pair, the same one for the whole session. */
export function presenterPairing(slug: string): Pairing {
  try {
    const kept = sessionStorage.getItem(store(slug))
    if (kept) {
      const [code, key] = kept.split('.')
      if (isCode(code) && isKey(key)) return { code, key }
    }
  } catch { /* storage refused; a fresh pair every load still works */ }
  const made: Pairing = { code: String(Math.floor(1000 + Math.random() * 9000)), key: randomKey() }
  try { sessionStorage.setItem(store(slug), `${made.code}.${made.key}`) } catch {}
  return made
}

export function isCode(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}$/.test(value)
}

export function isKey(value: unknown): boolean {
  return typeof value === 'string' && new RegExp(`^[0-9a-f]{${KEY_LENGTH}}$`).test(value)
}

/** A pair read off the end of a web address, or nothing if either is malformed. */
export function pairingFromLink(code: unknown, key: unknown): Pairing | null {
  return isCode(code) && isKey(key) ? { code: code as string, key: key as string } : null
}

/**
 * Whether the screen should do what this message says.
 *
 * A screen with no key of its own obeys nothing, which is the safe way for the
 * no-cryptography case to fail. Everything else must carry the exact key.
 */
export function accepts(mine: Pairing, payload: unknown): boolean {
  if (!mine || !isKey(mine.key)) return false
  const sealed = payload as Sealed<unknown> | null
  if (!sealed || typeof sealed !== 'object') return false
  return typeof sealed.key === 'string' && sealed.key === mine.key
}

/** The channel the two ends meet on. */
export function channelName(slug: string, code: string): string {
  return `walkthrough:${slug}:${code}`
}
