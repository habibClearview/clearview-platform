// ============================================================
// Currency, chosen or typed, never assumed.
//
// TWO SEPARATE FAULTS THIS REPLACES.
//
// Fixed lists. Several screens offered a dropdown of six or so codes and
// nothing else, so an engagement in a country outside that list could not be
// recorded at all. The list differed from screen to screen, which meant the
// answer to "what currencies does this platform support" depended on which
// form you were standing in front of.
//
// Invented defaults. Where nothing was set, the code filled in USD in some
// places and UGX in others. That is worse than showing no currency, because a
// figure labelled with the wrong currency is not incomplete, it is false. A
// Nigerian client's costs printed as US dollars are a number nobody can act on
// and nobody can see is wrong.
//
// WHAT REPLACES THEM. A list of common codes offered as suggestions, and free
// entry for everything else. The suggestions save typing; they do not decide
// what is allowed. Any code the world uses works, because a client can be
// anywhere.
//
// And no default anywhere. When a currency has not been chosen, an amount
// prints as a plain number. That is honest: it says the figure is real and the
// currency has not been set, which is a state a coach can see and fix.
// ============================================================

/**
 * Codes offered as suggestions. Not a limit and not a ranking: they are the
 * ones most likely to be typed on this platform today, so they save keystrokes.
 * Adding one here changes nothing except how quickly it can be picked.
 */
export const SUGGESTED_CURRENCIES: { code: string; name: string }[] = [
  { code: 'NGN', name: 'Nigerian naira' },
  { code: 'UGX', name: 'Ugandan shilling' },
  { code: 'KES', name: 'Kenyan shilling' },
  { code: 'GHS', name: 'Ghanaian cedi' },
  { code: 'TZS', name: 'Tanzanian shilling' },
  { code: 'RWF', name: 'Rwandan franc' },
  { code: 'ZAR', name: 'South African rand' },
  { code: 'XOF', name: 'West African CFA franc' },
  { code: 'ETB', name: 'Ethiopian birr' },
  { code: 'ZMW', name: 'Zambian kwacha' },
  { code: 'MWK', name: 'Malawian kwacha' },
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'Pound sterling' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'BDT', name: 'Bangladeshi taka' },
  { code: 'PKR', name: 'Pakistani rupee' },
  { code: 'PHP', name: 'Philippine peso' },
  { code: 'IDR', name: 'Indonesian rupiah' },
  { code: 'BRL', name: 'Brazilian real' },
  { code: 'COP', name: 'Colombian peso' },
  { code: 'PEN', name: 'Peruvian sol' },
]

/** The longest a currency code may be. Three is the standard; a little room is
 *  left for the places that use a longer local abbreviation in practice. */
export const MAX_CURRENCY_LENGTH = 8

/**
 * Tidy what somebody typed into something storable, or null when they cleared
 * it. Upper cased because a currency code is conventionally upper case and two
 * spellings of the same currency would show as two currencies.
 */
export function normaliseCurrency(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const cleaned = input.trim().toUpperCase()
  if (!cleaned) return null
  return cleaned.slice(0, MAX_CURRENCY_LENGTH)
}

export function isUsableCurrency(input: unknown): boolean {
  const c = normaliseCurrency(input)
  return c !== null && /^[A-Z]{2,8}$/.test(c)
}

/**
 * Print an amount. The currency is placed in front of the number rather than
 * turned into a symbol, because a symbol has to be looked up and guessed at and
 * the code never is: NGN 25,000 is unambiguous everywhere, and $ is not.
 *
 * With no currency it prints the number alone. That is the whole point: an
 * amount whose currency nobody has set says so, instead of claiming one.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency?: string | null,
  maximumFractionDigits = 0,
): string {
  const n = typeof amount === 'number' ? amount : Number(amount)
  const safe = Number.isFinite(n) ? n : 0
  // The locale is pinned so the same figure reads the same on every machine.
  // Left to the environment, 1,250 becomes 1.250 elsewhere and a cost sheet
  // that changes meaning with the reader is not a cost sheet.
  const body = safe.toLocaleString('en-GB', { maximumFractionDigits })
  const code = normaliseCurrency(currency)
  return code ? `${code} ${body}` : body
}

/** Short form for dashboards: 25,000 becomes 25k. Same rule about the code. */
export function formatMoneyShort(
  amount: number | string | null | undefined,
  currency?: string | null,
): string {
  const n = typeof amount === 'number' ? amount : Number(amount)
  const safe = Number.isFinite(n) ? n : 0
  const code = normaliseCurrency(currency)
  const prefix = code ? `${code} ` : ''
  const size = Math.abs(safe)
  const sign = safe < 0 ? '-' : ''
  if (size >= 1000) {
    const thousands = (size / 1000).toFixed(size >= 10000 ? 0 : 1).replace(/\.0$/, '')
    return `${sign}${prefix}${thousands}k`
  }
  return `${sign}${prefix}${Math.round(size)}`
}
