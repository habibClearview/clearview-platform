// ============================================================
// NOBODY DRIVES THE PROJECTOR WITHOUT SCANNING THE CODE.
//
// The channel the phone and the screen talk on is named after a four digit
// code, and four digits is ten thousand guesses. Anybody who can open the
// public walkthrough can open a channel, so if the code were the whole lock, a
// stranger could take over a live presentation in front of a funder.
//
// It is not the lock. The square code on the screen also carries a long random
// key that is never printed, and the screen ignores anything that does not
// carry it. These tests are that rule, written down so it cannot be softened
// by accident later.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  randomKey, isCode, isKey, accepts, pairingFromLink, channelName, KEY_LENGTH,
} from '@/lib/walkthrough/pairing'

const MINE = { code: '4821', key: 'a'.repeat(KEY_LENGTH) }
const seal = (key: string, message: unknown) => ({ key, message })

describe('the screen obeys only the phone that scanned its code', () => {
  it('does what a message carrying the right key says', () => {
    expect(accepts(MINE, seal(MINE.key, { type: 'next' }))).toBe(true)
  })

  it('ignores a message with the wrong key', () => {
    expect(accepts(MINE, seal('b'.repeat(KEY_LENGTH), { type: 'next' }))).toBe(false)
  })

  it('ignores a message with no key at all', () => {
    expect(accepts(MINE, { type: 'next' })).toBe(false)
    expect(accepts(MINE, seal('', { type: 'next' }))).toBe(false)
    expect(accepts(MINE, null)).toBe(false)
    expect(accepts(MINE, 'next')).toBe(false)
  })

  it('knowing the four digit code is not enough', () => {
    // This is the whole point. Somebody who reads 4821 off the screen, or
    // simply counts to ten thousand, still cannot send an instruction.
    const guessed = seal(MINE.code, { type: 'next' })
    expect(accepts(MINE, guessed)).toBe(false)
  })

  it('a screen with no key of its own obeys nothing', () => {
    // If the browser has no cryptography there is no key, and the safe failure
    // is a screen driven from its own keyboard, not one anybody can drive.
    expect(accepts({ code: '4821', key: '' }, seal('', { type: 'next' }))).toBe(false)
    expect(accepts({ code: '4821', key: '' }, seal('anything', { type: 'next' }))).toBe(false)
  })
})

describe('the key itself', () => {
  it('is long, random and different every time', () => {
    const a = randomKey()
    const b = randomKey()
    expect(a).toHaveLength(KEY_LENGTH)
    expect(isKey(a)).toBe(true)
    expect(a).not.toBe(b)
  })

  it('is long enough that guessing is not a thing that happens', () => {
    // 48 hexadecimal characters is 192 bits.
    expect(KEY_LENGTH).toBeGreaterThanOrEqual(32)
  })
})

describe('what comes in on the end of the remote address', () => {
  it('accepts a proper pair', () => {
    expect(pairingFromLink('4821', 'f'.repeat(KEY_LENGTH))).toEqual({ code: '4821', key: 'f'.repeat(KEY_LENGTH) })
  })

  it('refuses a short key, a wrong shaped code, or either one missing', () => {
    expect(pairingFromLink('4821', 'f'.repeat(8))).toBeNull()
    expect(pairingFromLink('482', 'f'.repeat(KEY_LENGTH))).toBeNull()
    expect(pairingFromLink('4821', null)).toBeNull()
    expect(pairingFromLink(null, 'f'.repeat(KEY_LENGTH))).toBeNull()
    expect(pairingFromLink('4821', 'F'.repeat(KEY_LENGTH))).toBeNull()
  })

  it('a code is four digits and nothing else', () => {
    expect(isCode('4821')).toBe(true)
    expect(isCode('48211')).toBe(false)
    expect(isCode('48a1')).toBe(false)
    expect(isCode('')).toBe(false)
  })
})

describe('the channel name', () => {
  it('is the walkthrough and the code, so two rooms never collide', () => {
    expect(channelName('tanager', '4821')).toBe('walkthrough:tanager:4821')
    expect(channelName('generic', '0001')).not.toBe(channelName('tanager', '0001'))
  })
})
