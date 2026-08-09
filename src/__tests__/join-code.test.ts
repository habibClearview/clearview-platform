// ============================================================
// A code read off a screen at the back of a room.
//
// Two things are being protected. That a mistyped code opens nothing rather
// than somebody else's session, and that a code is as hard to guess as it looks
// rather than quietly favouring the front of the alphabet.
// ============================================================

import { describe, expect, it } from 'vitest'
import {
  JOIN_ALPHABET,
  JOIN_CODE_COMBINATIONS,
  JOIN_CODE_LENGTH,
  JOIN_EXCLUDED,
  formatJoinCode,
  makeJoinCode,
  normaliseJoinCode,
} from '@/lib/join-code'

/** Bytes that walk 0,1,2,... so the output is predictable. */
function counting(start = 0) {
  let at = start
  return (n: number) => Uint8Array.from({ length: n }, () => at++ % 256)
}

describe('the code the room types', () => {
  it('breaks every confusable pair, so no character can be read as another', () => {
    // The list of what is excluded is the thing that gets edited carelessly
    // later, so it is checked against the alphabet rather than trusted.
    for (const ch of Object.keys(JOIN_EXCLUDED)) {
      expect(JOIN_ALPHABET, `${ch} is confused with ${JOIN_EXCLUDED[ch]}`).not.toContain(ch)
    }
    // And the pairs really are broken: for every character that survived, its
    // twin did not.
    const pairs = [['O', '0'], ['I', '1'], ['L', '1'], ['S', '5'], ['B', '8'], ['Z', '2'], ['G', '6']]
    for (const [a, b] of pairs) {
      const bothPresent = JOIN_ALPHABET.includes(a) && JOIN_ALPHABET.includes(b)
      expect(bothPresent, `${a} and ${b} are both in the alphabet`).toBe(false)
    }
  })

  it('is long enough that guessing is not worth attempting', () => {
    // Eight characters from twenty nine is well past a hundred billion.
    expect(JOIN_CODE_COMBINATIONS).toBeGreaterThan(1e11)
  })

  it('makes codes of the right length, from the alphabet only', () => {
    for (let seed = 0; seed < 40; seed++) {
      const code = makeJoinCode(counting(seed))
      expect(code, `seed ${seed}`).toHaveLength(JOIN_CODE_LENGTH)
      for (const ch of code) expect(JOIN_ALPHABET, code).toContain(ch)
    }
  })

  it('does not favour the front of the alphabet', () => {
    // A byte that cannot be used evenly is thrown away rather than folded. If
    // it were folded, the first few characters would come up more often, and
    // the code would be easier to guess than its length suggests.
    const counts = new Map()
    let at = 0
    const everyByte = (n: number) => Uint8Array.from({ length: n }, () => at++ % 256)
    for (let i = 0; i < 400; i++) {
      for (const ch of makeJoinCode(everyByte)) counts.set(ch, (counts.get(ch) || 0) + 1)
    }
    const seen = Array.from(counts.values())
    const most = Math.max(...seen)
    const fewest = Math.min(...seen)
    // Every character appears, and none appears twice as often as another.
    expect(counts.size).toBe(JOIN_ALPHABET.length)
    expect(most).toBeLessThan(fewest * 2)
  })

  it('reads through the noise of being said out loud and written down', () => {
    const code = makeJoinCode(counting(7))
    const shown = formatJoinCode(code)
    expect(shown).toContain('-')
    for (const typed of [shown, shown.toLowerCase(), code.toLowerCase(), ` ${shown} `, code.split('').join(' ')]) {
      expect(normaliseJoinCode(typed), typed).toBe(code)
    }
  })

  it('refuses a misread character rather than sending them somewhere else', () => {
    // A code typed with an O in it was misread. Turning it into a zero would
    // hand them a different session, which is far worse than saying no.
    const code = makeJoinCode(counting(3))
    const wrong = `O${code.slice(1)}`
    expect(normaliseJoinCode(wrong)).toBe(null)
    for (const ch of Object.keys(JOIN_EXCLUDED)) {
      expect(normaliseJoinCode(ch.repeat(JOIN_CODE_LENGTH)), ch).toBe(null)
      expect(normaliseJoinCode(`${ch}${code.slice(1)}`), ch).toBe(null)
    }
  })

  it('refuses anything that is not a code at all', () => {
    for (const junk of [null, undefined, '', 'ABC', 'A'.repeat(40), 42, {}, '../../etc', "'; drop table"]) {
      expect(normaliseJoinCode(junk as string), String(junk)).toBe(null)
    }
  })

  it('refuses a code of the wrong length even when every character is valid', () => {
    const code = makeJoinCode(counting(11))
    expect(normaliseJoinCode(code.slice(0, 7))).toBe(null)
    expect(normaliseJoinCode(code + code[0])).toBe(null)
  })

  it('shows a code that is not a code without pretending', () => {
    expect(formatJoinCode('')).toBe('')
    expect(formatJoinCode(null)).toBe('')
    expect(formatJoinCode('SHORT')).toBe('SHORT')
  })

  it('gives up rather than looping forever on a random source that returns nothing usable', () => {
    // Every byte above the usable range, so none is ever accepted.
    const useless = (n: number) => Uint8Array.from({ length: n }, () => 255)
    expect(() => makeJoinCode(useless)).toThrow(/random source/)
  })
})
