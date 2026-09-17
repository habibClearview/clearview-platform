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

/**
 * The readable writing colour for a solid button or badge of this colour.
 *
 * Pass the same value used for the background. Anything unrecognised keeps
 * white, which is what a dark fill wants and is what this did before.
 */
export function onSolid(fill: string | null | undefined): string {
  const f = String(fill ?? '').trim().toLowerCase()
  if (PALE_FILLS.includes(f)) return 'var(--cv-navy)'
  if (LIGHT_FILLS.includes(f)) return 'var(--cv-on-cyan)'
  return 'var(--cv-on-accent)'
}
