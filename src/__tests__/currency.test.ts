// ============================================================
// The one rule worth protecting here is negative: nothing invents a currency.
//
// Two faults sat in this codebase for a long time. Screens offered a dropdown
// of six codes and nothing else, so a client outside that list could not be
// recorded. And where nothing was set, the code filled in USD in some places
// and UGX in others, which is worse than showing no currency at all, because a
// figure labelled with the wrong one looks correct and is not.
//
// So these tests check that an amount with no currency prints as a plain
// number, that anything a client might actually use is accepted, and that the
// suggestion list is only a suggestion.
// ============================================================

import { describe, expect, it } from 'vitest'
import {
  MAX_CURRENCY_LENGTH,
  SUGGESTED_CURRENCIES,
  formatMoney,
  formatMoneyShort,
  isUsableCurrency,
  normaliseCurrency,
} from '@/lib/currency'

describe('currency', () => {
  it('prints an amount with no currency as a plain number', () => {
    expect(formatMoney(25000, null)).toBe('25,000')
    expect(formatMoney(25000, '')).toBe('25,000')
    expect(formatMoney(25000, undefined)).toBe('25,000')
    expect(formatMoneyShort(25000, null)).toBe('25k')
  })

  it('puts the code in front rather than guessing a symbol', () => {
    expect(formatMoney(25000, 'NGN')).toBe('NGN 25,000')
    expect(formatMoney(25000, 'USD')).toBe('USD 25,000')
    expect(formatMoneyShort(4200000, 'NGN')).toBe('NGN 4200k')
  })

  it('accepts a currency from anywhere, not only the suggested ones', () => {
    for (const code of ['INR', 'VND', 'MMK', 'XAF', 'SBD', 'TOP']) {
      expect(isUsableCurrency(code), code).toBe(true)
      expect(formatMoney(100, code)).toBe(`${code} 100`)
    }
  })

  it('treats the suggestion list as a suggestion, not a limit', () => {
    expect(SUGGESTED_CURRENCIES.length).toBeGreaterThan(10)
    // A code that is deliberately not on the list still works.
    expect(SUGGESTED_CURRENCIES.some((c) => c.code === 'VND')).toBe(false)
    expect(isUsableCurrency('VND')).toBe(true)
  })

  it('tidies what somebody typed without changing what they meant', () => {
    expect(normaliseCurrency('  ngn ')).toBe('NGN')
    expect(normaliseCurrency('usd')).toBe('USD')
    expect(normaliseCurrency('')).toBe(null)
    expect(normaliseCurrency('   ')).toBe(null)
    expect(normaliseCurrency(null)).toBe(null)
    expect(normaliseCurrency(7)).toBe(null)
  })

  it('refuses something that is not a currency code', () => {
    expect(isUsableCurrency('N')).toBe(false)
    expect(isUsableCurrency('12')).toBe(false)
    expect(isUsableCurrency('a very long name')).toBe(false)
    expect(isUsableCurrency('')).toBe(false)
  })

  it('caps a pasted string rather than storing an essay', () => {
    expect(normaliseCurrency('A'.repeat(50))?.length).toBe(MAX_CURRENCY_LENGTH)
  })

  it('reads the same figure the same way on every machine', () => {
    // Pinned locale. Left to the environment this reads 1.250 in some places,
    // and a cost sheet that changes meaning with the reader is not one.
    expect(formatMoney(1250, 'NGN')).toBe('NGN 1,250')
    expect(formatMoney(1250.6, 'NGN', 2)).toBe('NGN 1,250.6')
  })

  it('survives an amount that is not a number', () => {
    expect(formatMoney(null, 'NGN')).toBe('NGN 0')
    expect(formatMoney('not a number', 'NGN')).toBe('NGN 0')
    expect(formatMoneyShort(undefined, null)).toBe('0')
  })

  it('keeps a negative amount negative', () => {
    expect(formatMoney(-500, 'KES')).toBe('KES -500')
    expect(formatMoneyShort(-2500, 'KES')).toBe('-KES 2.5k')
  })
})
