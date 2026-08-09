// ============================================================
// A code somebody can read off a screen and type.
//
// WHY. A session link is sixty odd characters of random letters. Scanning the
// code puts it on a phone, and a copy button gets it from one place to another
// on the same machine, but neither helps the person who wants it in the browser
// on the laptop they are actually going to work in. Nobody types a sixty
// character address correctly, and the point of opening a block to the room is
// that everybody in the room can join in the next thirty seconds.
//
// WHAT IT IS. Eight characters, shown in two groups of four, read off a
// projector or said out loud across a table. The long link still exists and is
// still the thing that gets stored and checked; this is a second way in to the
// same session, not a weaker one.
//
// THE ALPHABET BREAKS EVERY PAIR PEOPLE CONFUSE. Each confusable pair keeps one
// member and loses the other, so no character in a code can be read as another
// character that is also in a code. The digits stay and their letter twins go:
// O goes and zero stays, I and L go and one stays, S goes and five stays, B
// goes and eight stays, Z goes and two stays, G goes and six stays. Then zero
// and one go as well, because a lone digit whose letter is gone is still the
// one people type wrong on a phone.
//
// The rule matters more than the list. A code should not be mistypeable by
// reading it wrong, only by typing it wrong, and typing it wrong is a thing a
// person notices.
//
// IS IT GUESSABLE. Twenty seven characters in eight places is about two hundred
// and eighty billion codes. Only a handful exist at any moment, they die in
// twelve hours, and the route that accepts them is rate limited hard. Somebody
// guessing would need longer than the session lasts to have a meaningful
// chance, and would be stopped long before they got near it.
//
// WHAT A CODE OPENS. Exactly what the link opens: one block, of one engagement,
// for as long as the coach left it open. It is a way of reaching the same
// grant, so it can never reach further than the grant does.
// ============================================================

/**
 * The characters a code may contain.
 *
 * Deliberately not the alphabet minus a few: this is the set that survives
 * being read off a screen at the back of a room, written on a flip chart, and
 * typed on a phone keyboard.
 */
export const JOIN_ALPHABET = '23456789ACDEFHJKMNPQRTUVWXY'

/**
 * The characters deliberately left out, and what each would be confused with.
 *
 * Written down so the rule can be checked rather than trusted, and so that
 * anybody widening the alphabet later has to look at this first.
 */
export const JOIN_EXCLUDED: Record<string, string> = {
  O: '0', '0': 'O',
  I: '1', L: '1', '1': 'I or L',
  S: '5', B: '8', Z: '2', G: '6',
}

export const JOIN_CODE_LENGTH = 8

/**
 * Turn what somebody typed into a code, or null if it is not one.
 *
 * Spaces, hyphens and case are all noise: a code said out loud gets written
 * down with a dash in the middle, and a phone keyboard capitalises the first
 * letter whatever you do. None of that changes which session is meant.
 */
export function normaliseJoinCode(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null
  const cleaned = input.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (cleaned.length !== JOIN_CODE_LENGTH) return null
  // Indexed rather than for...of, for the same reason as in makeJoinCode below.
  for (let i = 0; i < cleaned.length; i++) {
    if (!JOIN_ALPHABET.includes(cleaned[i])) return null
  }
  return cleaned
}

/** Two groups of four, which is how a person reads and repeats it. */
export function formatJoinCode(code: string | null | undefined): string {
  const c = typeof code === 'string' ? code : ''
  if (c.length !== JOIN_CODE_LENGTH) return c
  return `${c.slice(0, 4)}-${c.slice(4)}`
}

/**
 * A new code.
 *
 * `randomValues` takes the bytes, so the server passes the cryptographic source
 * and a test can pass a known sequence. Bytes are rejected rather than folded
 * when they fall outside a whole number of alphabet lengths, because folding
 * with a remainder makes the early characters of the alphabet more likely, and
 * a code that is more guessable than it looks is the worst kind.
 */
export function makeJoinCode(randomValues: (n: number) => Uint8Array): string {
  const limit = Math.floor(256 / JOIN_ALPHABET.length) * JOIN_ALPHABET.length
  let out = ''
  let guard = 0
  while (out.length < JOIN_CODE_LENGTH) {
    if (++guard > 1000) throw new Error('join code: the random source is not returning usable bytes')
    const bytes = randomValues(JOIN_CODE_LENGTH)
    // Indexed rather than for...of. This project compiles to a JavaScript
    // version older than the one where walking a byte array that way became
    // ordinary, and the build refuses it. Caught by the build rather than by
    // the tests, because the tests run the source directly and never see the
    // setting the application is compiled under.
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]
      if (b >= limit) continue
      out += JOIN_ALPHABET[b % JOIN_ALPHABET.length]
      if (out.length === JOIN_CODE_LENGTH) break
    }
  }
  return out
}

/** Kept next to the alphabet so the two cannot drift apart. */
export const JOIN_CODE_COMBINATIONS = JOIN_ALPHABET.length ** JOIN_CODE_LENGTH
