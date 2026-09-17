// ============================================================
// WHAT THE PRESENTER READS, ON THEIR PHONE.
//
// One cue per screen in Habib's own words from the build instructions, and
// under it the points worth making on that screen. They are never shown on the
// projector: they exist so the person presenting can glance down instead of
// turning round to read the screen behind them.
//
// WHY THERE IS MORE THAN ONE LINE. 17 September 2026. Habib: "it will also be
// good to have some presenter talking points on the phone, there is a
// significant gap between the top of the phone and where the navigation is."
// A single sentence left the middle of the phone empty, which is the part he
// is actually looking at while talking.
//
// AND WHY THEY READ THE WAY THEY DO. Habib, the same evening: "use the points
// that would impress, I am doing this to impress." So each point is a claim a
// funder has a reason to remember rather than a description of the screen they
// are already looking at. The test is whether it would survive being repeated
// back to somebody who was not in the room.
//
// The names in them are the engagement's. In the generic walkthrough they fall
// back to "the funder" and "the organisation", the same as every other
// sentence, so a note never shows a client's name to the wrong room.
// ============================================================
import { cap, type WalkthroughContext } from './context'
import { fullLabel } from './canvas-words'
import { servicePhraseOf } from './steps'

export interface SpeakerNote {
  /** The one line to glance at. Habib's own wording. */
  cue: string
  /** What is worth saying on this screen, in the order it is worth saying it. */
  points: string[]
}

/**
 * The notes for one engagement, in screen order. The list matches the screens
 * the walkthrough is actually showing, so an engagement with no contract dates,
 * which has no timeline screen, gets no timeline note either.
 */
export function speakerNotes(ctx: WalkthroughContext): SpeakerNote[] {
  // TWO FORMS OF EACH NAME. A funder with a name is Tanager wherever it
  // appears. A funder with no name is "the funder", which starts a sentence as
  // "The funder" and sits inside one as "the funder". One form used everywhere
  // produced "Six things The funder receives" on the generic walkthrough.
  const Funder = cap(ctx.funder)
  const Org = cap(ctx.org)
  const funder = ctx.funder
  const org = ctx.org
  const service = servicePhraseOf(ctx)
  const market = ctx.market

  const notes: SpeakerNote[] = [
    {
      cue: 'Scan the code with your phone. Pleasantries. Press Next when everyone is settled.',
      points: [
        'Let people arrive. Nothing on this screen needs explaining.',
        `In twenty minutes ${funder} will know exactly what they receive, when, and what it is evidence of.`,
        'The code in the corner is for your phone. It disappears the moment you are connected.',
      ],
    },
    {
      cue: `${Funder}'s funding proved the need is real. This engagement is about who pays next.`,
      points: [
        `Open by crediting them. Their funding is why ${service} exists to be commercialised at all.`,
        'Then name the shift: the question stops being whether the work is needed and becomes who holds the budget for it.',
        'Most commercialisation support never asks that question out loud. This engagement starts with it.',
      ],
    },
    {
      cue: 'Read the principle once, slowly. Everything that follows applies this one rule.',
      points: [
        'Nothing is designed, priced or scaled without evidence of paying demand from a customer with budget authority.',
        'This is a standard, not an opinion, and every one of the eleven decisions is held to it.',
        'It is also what makes the engagement stoppable. A decision that cannot meet it does not close.',
      ],
    },
    {
      cue: 'Nine decision points on the canvas, one before it opens, one at close. Point to the three columns.',
      points: [
        'Eleven decisions, in order, each one shut until the one before it is signed.',
        `Every one rests on evidence, is signed by the chief executive, and lands on a record ${funder} reads without asking for it.`,
        'The row along the bottom is that record filling up. By close it is the asset the organisation keeps.',
      ],
    },
    {
      cue: `Three questions for ${org}'s chief executive, in their own words, signed. ${Funder} reviews the charter before it is signed.`,
      points: [
        'Asked out loud, with everyone present, and recorded in the chief executive\u2019s own words rather than paraphrased.',
        'The Charter is signed by all three parties, so the funder is a signatory rather than a recipient.',
        `Nothing opens until both are signed. ${fullLabel('d1')} stays shut.`,
      ],
    },
    {
      cue: 'One line per column as it lights up.',
      points: [
        'Let each region light before you speak to it. There are five.',
        'The layout is the argument: capability on the left, who pays in the middle, the market on the right.',
        'The strip across the bottom is read three times, so movement is visible rather than asserted.',
      ],
    },
    {
      cue: 'The people who value a service are rarely the people with the budget. The kick-off reading is taken here.',
      points: [
        'Every assumption is written down before any of it is judged, using five named tools.',
        'The finding almost every time: the people who value the service are not the people with the budget.',
        'An engagement can end here, and a funder who learns that in month one has been well served.',
      ],
    },
    {
      cue: `Slow down. Evidence, decision, sign-off, record. A report reaches ${funder}'s inbox at sign-off.`,
      points: [
        'Evidence, decision, signature, record. All eleven close in the same four beats.',
        'The chief executive signs personally. Not a team, not a consultant, and not the coach.',
        `The report is generated from the signed record and reaches ${funder} the same day. Automatic, not a favour.`,
      ],
    },
    {
      cue: market
        ? `Nothing is designed until a paying customer is named. For this service: ${market}.`
        : 'Nothing is designed until a paying customer is named.',
      points: [
        'Named segments with documented urgency and confirmed willingness to pay. Not a market study.',
        'A donor as funder is not a client as customer. Conflating the two is why most of these efforts stall.',
        `${fullLabel('d3')} is shut until ${fullLabel('d2')} holds a named customer, so nothing is designed on hope.`,
      ],
    },
    {
      cue: `Watch it move between inside and outside. ${org}'s finance lead builds the model.`,
      points: [
        'Inside, outside, inside, outside. The alternation is the method, not the running order.',
        `The financial model is built by ${org}\u2019s own finance lead. A model nobody inside can change is a model that dies at handover.`,
        'Two pricing tiers, break-even calculated, and the cost recovery threshold documented.',
      ],
    },
    {
      cue: `Iteration 1 is coach-led. Iteration 2 is led by ${org}, with backstopping.`,
      points: [
        'Two rounds with real paying customers. Not a rehearsal and not a pitch deck.',
        `Round one is coach-led, round two is led by ${org} with the coach only backstopping.`,
        'The point of two rounds is that the second one proves the first was not the coach.',
      ],
    },
    {
      cue: 'This is an illustration. The change is signed and the original stays on the record.',
      points: [
        'Say illustration. This has not happened on this engagement.',
        'Evidence from the pilot can reopen a decision that was already signed, and that is a feature.',
        'Nothing is deleted. The original decision, the change, and the reason for it all stay on the record.',
      ],
    },
    {
      cue: 'The closing reading, on six fit tests and four stages.',
      points: [
        `${fullLabel('d8')} answers where this goes after the engagement ends, and what pays for it.`,
        'Six fit tests, four stages, scored with the leadership team and the funder representative in the room.',
        'Three readings on one scale. The movement is the finding. A single score proves nothing.',
      ],
    },
    {
      cue: `${Org} presents alone. Five tests of independence.`,
      points: [
        'Five tests of independence, done unaided, or the engagement does not close.',
        'The sharpest one: the finance lead changes an input and explains the new break-even, with nobody helping.',
        'Independence is demonstrated rather than declared. That is the whole difference.',
      ],
    },
    {
      cue: `Six things ${funder} receives. Stress card 2: who agreed, who dissented, who signed.`,
      points: [
        'One: a report at every signed decision point, in your inbox, without asking.',
        'Two: who agreed, who dissented and who signed. Dissent is on the record rather than smoothed out of it.',
        'Five: your whole team, not one sign in passed around. Six: the handover record and close-out report.',
      ],
    },
    {
      cue: 'This arrives in your inbox the moment a decision point closes.',
      points: [
        'Generated from the signed record. Nobody writes it afterwards and nobody edits it.',
        'This is the shape of it, from a demonstration engagement.',
        'Offer to forward the real one the day the first decision point closes.',
      ],
    },
    ...(ctx.timeline
      ? [{
        cue: timelineCue(ctx.timeline.span, ctx.timeline.milestones.length),
        points: [
          'These are the contract dates, not an estimate, and each milestone carries its own deliverables.',
          'Payment is tied to accepted deliverables, and a deliverable is accepted when its decision point is signed.',
          'Ask whether these line up with their own reporting dates.',
        ],
      }]
      : []),
    {
      cue: 'Your sign-in details are already with you. Show the workspace.',
      points: [
        'Click the button on the laptop. A browser will not open a tab because this phone asked it to.',
        'This is the live record, not a copy prepared for the meeting. Open one decision and show the evidence under it.',
        'Their sign in already works. They can open this tonight without asking anybody.',
      ],
    },
    {
      cue: 'Ask the first question, then stop talking.',
      points: [
        'Read question one and stop. The silence is the point.',
        'Write down what they say. Their answer to the first one becomes the measure the engagement is judged by.',
        'Do not answer your own question.',
      ],
    },
  ]
  return notes
}

/** "Six months, four milestones, matched to the contract." */
function timelineCue(span: string, count: number): string {
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
