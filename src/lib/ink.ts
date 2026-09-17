// ============================================================
// WHAT COLOUR THE WRITING GOES ON A COLOURED BUTTON
//
// Habib has asked for this more times than he should have had to:
// "white text on a cyan background in the buttons makes it difficult to see
// the text - DO NOT USE WHITE ON CYAN... Please make it all uniform across
// the platform."
//
// The rule was already written down and fixed three times, in three separate
// files, each with its own copy of the same function. Every screen built
// afterwards started from a different file and got it wrong again. Three
// copies of a rule is the same as no rule.
//
// So it lives here, once, and every screen asks this instead of deciding for
// itself. Cyan, teal, green and amber are light enough that white letters
// wash out, so they take the dark ink. Navy, red, purple and slate are dark
// enough to carry white.
// ============================================================

/** The accent fills that are too light to carry white writing. */
const LIGHT_FILLS = [
  'var(--cv-cyan)', 'var(--cv-teal)', 'var(--cv-green)', 'var(--cv-amber)',
]

/** Pale surfaces, where the writing is the ordinary navy. */
const PALE_FILLS = [
  'var(--cv-card)', 'var(--cv-cream)', 'var(--cv-bg)', 'var(--cv-bg-2)',
  'var(--cv-alt)', '#fff', '#ffffff', 'white', 'transparent',
]

/** The dark ink, as a number, so contrast can be worked out rather than guessed. */
const DARK_INK = '#062230'

/** One channel of a hex colour, on the scale the contrast formula wants. */
function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** How bright a colour is, 0 for black and 1 for white. */
function luminance(hex: string): number | null {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return null
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** The contrast between two brightnesses, as the accessibility rules count it. */
function ratio(a: number, b: number): number {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The readable writing colour for a solid button or badge of this colour.
 *
 * Pass the same value used for the background.
 *
 * WHY IT MEASURES RATHER THAN RECOGNISES. From the review on #282. The first
 * version knew the names of four light fills and treated everything else as
 * dark. That is fine until a screen uses a raw hex of its own, and several do:
 * sweeping white off cyan put the dark ink on a dark green and a dark red,
 * where it is no more readable than the white was on the cyan. Anything with a
 * hex in it is now measured, and whichever of white or the dark ink stands out
 * more against it wins. The named CSS variables cannot be measured from here,
 * so those keep the list.
 */
export function onSolid(fill: string | null | undefined): string {
  const f = String(fill ?? '').trim().toLowerCase()
  if (PALE_FILLS.includes(f)) return 'var(--cv-navy)'
  if (LIGHT_FILLS.includes(f)) return 'var(--cv-on-cyan)'

  const hex = /#[0-9a-f]{3,8}\b/i.exec(f)
  if (hex) {
    const lum = luminance(hex[0].slice(0, 7))
    if (lum !== null) {
      const onWhite = ratio(lum, 1)
      const onDark = ratio(lum, luminance(DARK_INK) as number)
      return onDark > onWhite ? 'var(--cv-on-cyan)' : 'var(--cv-on-accent)'
    }
  }
  return 'var(--cv-on-accent)'
}
