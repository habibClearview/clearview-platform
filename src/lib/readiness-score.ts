// ============================================================
// THE PUBLIC READINESS SCORE.
//
// The ten questions are the same ten the coach asks inside a real engagement
// (READINESS_QUESTIONS in coach-types), and the bands are the same bands the
// coach's screen uses: under six is below threshold, eight or more is strong.
// That is deliberate. A visitor who scores four on the website and then hears
// a different number in the first session would be right to distrust both.
//
// The ten questions themselves live in readiness-questions.ts, which imports
// nothing, so the browser can ask them without being sent this file's
// dependencies.
//
// WHY THE SCORING LIVES HERE AND NOT IN THE PAGE. The browser sends answers,
// not a score. A number posted from a page is a number a stranger chose, and
// this one decides what the email says and which tag the subscriber gets.
//
// WHAT EACH ANSWER IS WORTH. A 'no' is not a failure, it is the thing the
// engagement is for, so every question names the decision point that settles
// it. That mapping is the whole value of the report: it turns ten yes/no
// answers into "here is where your work actually starts".
// ============================================================
import { READINESS, ReadinessQuestion } from '@/lib/readiness-questions'

export type { ReadinessQuestion }
export { READINESS }

export type Band = 'below' | 'moderate' | 'strong'

export interface ReadinessResult {
  score: number
  total: number
  band: Band
  /** The band in words, the same words the coach's screen uses. */
  bandLabel: string
  /** One sentence a visitor reads first. */
  headline: string
  /** What the score means, without flattery and without a sales pitch. */
  meaning: string
  /** The single next step, which is different for each band. */
  nextStep: string
  /** The questions answered no, with where each one is settled. */
  gaps: ReadinessQuestion[]
}

/** The tag written on the Kit subscriber, so a list can be segmented by band. */
export function bandTag(band: Band): string {
  return `readiness-${band}`
}

/**
 * Score a set of answers. Anything that is not an explicit true counts as a
 * no: a question skipped is a question the organisation could not answer yes
 * to, which is the same information.
 */
export function scoreReadiness(answers: Record<string, unknown>): ReadinessResult {
  const said = (id: string) => answers?.[id] === true
  const score = READINESS.filter((q) => said(q.id)).length
  const total = READINESS.length
  const gaps = READINESS.filter((q) => !said(q.id))

  const band: Band = score < 6 ? 'below' : score >= 8 ? 'strong' : 'moderate'

  if (band === 'below') {
    return {
      score, total, band, bandLabel: 'Below threshold', gaps,
      headline: `${score} out of ${total}. There is groundwork to do before a commercial move will hold.`,
      meaning:
        'A score under six does not mean the organisation is not viable. It means the foundations a commercial service stands on are not in place yet, and starting to sell before they are is how organisations spend a year proving something they could have found out in a month. Every gap below has a decision point that settles it, in the order they have to be taken.',
      nextStep:
        'Take the two lowest-numbered gaps in the list below. They come first for a reason: nothing later in the method holds without them.',
    }
  }
  if (band === 'strong') {
    return {
      score, total, band, bandLabel: 'Strong readiness', gaps,
      headline: `${score} out of ${total}. The foundations are there.`,
      meaning:
        'A score of eight or more says the hard conversations have already happened internally. What usually separates an organisation at this point from one earning commercial revenue is not readiness, it is sequence: doing the nine decisions in order, with evidence behind each one, rather than jumping to pricing and market entry because those feel like progress.',
      nextStep: gaps.length
        ? 'Close the remaining gaps below first. At this score they are usually quick, and each one is a decision that later work depends on.'
        : 'Ten out of ten is rare and worth testing. The first decision point exists to check whether what an organisation believes about its own services survives contact with the evidence.',
    }
  }
  return {
    score, total, band, bandLabel: 'Moderate readiness', gaps,
    headline: `${score} out of ${total}. Real momentum, with specific holes in it.`,
    meaning:
      'A score in the middle is the most common result and the most useful one, because the gaps are specific rather than general. The organisation is not starting from nothing, and it is not ready to sell either. What matters is which questions the no answers fall against, not how many there are.',
    nextStep:
      'Read the gaps below in order. If most of them sit in Decision Points 2 and 3, the issue is customer clarity. If they sit in Decision Point 4, the issue is money. Those need different first moves.',
  }
}
