// ============================================================
// WHAT THE PRESENTER READS, ON THEIR PHONE.
//
// One note per screen, in Habib's own words from the build instructions. They
// are never shown on the projector: they exist so the person presenting can
// glance down instead of turning round to read the screen behind them.
//
// The names in them are the engagement's. In the generic walkthrough they fall
// back to "the funder" and "the organisation", the same as every other
// sentence, so a note never shows a client's name to the wrong room.
// ============================================================
import { cap, type WalkthroughContext } from './context'
import { fullLabel } from './canvas-words'

/**
 * The notes for one engagement, in screen order. The list matches the screens
 * the walkthrough is actually showing, so an engagement with no contract dates,
 * which has no timeline screen, gets no timeline note either.
 */
export function speakerNotes(ctx: WalkthroughContext): string[] {
  const funder = cap(ctx.funder)
  const org = cap(ctx.org)
  const market = ctx.market
  return [
    'Scan the code with your phone. Pleasantries. Press Next when everyone is settled.',
    `${funder}'s funding proved the need is real. This engagement is about who pays next.`,
    'Read the principle once, slowly. Everything that follows applies this one rule.',
    'Nine decision points on the canvas, one before it opens, one at close. Point to the three columns.',
    `Three questions for ${org}'s chief executive, in their own words, signed. ${funder} reviews the charter before it is signed.`,
    'One line per column as it lights up.',
    'The people who value a service are rarely the people with the budget. The kick-off reading is taken here.',
    `Slow down. Evidence, decision, sign-off, record. A report reaches ${funder}'s inbox at sign-off.`,
    market
      ? `Nothing is designed until a paying customer is named. For this service: ${market}.`
      : 'Nothing is designed until a paying customer is named.',
    `Watch it move between inside and outside. ${org}'s finance lead builds the model.`,
    `Iteration 1 is coach-led. Iteration 2 is led by ${org}, with backstopping.`,
    'This is an illustration. The change is signed and the original stays on the record.',
    'The closing reading, on six fit tests and four stages.',
    `${org} presents alone. Five tests of independence.`,
    `Six things ${funder} receives. Stress card 2: who agreed, who dissented, who signed.`,
    'This arrives in your inbox the moment a decision point closes.',
    ...(ctx.timeline ? [timelineNote(ctx.timeline.span, ctx.timeline.milestones.length)] : []),
    'Your sign-in details are already with you. Show the workspace.',
    'Ask the first question, then stop talking.',
  ]
}

/** "Six months, four milestones, matched to the contract." */
function timelineNote(span: string, count: number): string {
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']
  const howLong = span.replace(/[.\s]+$/, '')
  return `${howLong}, ${words[count] || count} milestones, matched to the contract.`
}

/** "09 / 19 · Decision Point 2", the line across the top of the remote. */
export function remoteHeading(index: number, total: number, name: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(index + 1)} / ${pad(total)} · ${name}`
}

export { fullLabel }
