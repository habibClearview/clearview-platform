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
  const funder = cap(ctx.funder)
  const org = cap(ctx.org)
  const service = servicePhraseOf(ctx)
  const market = ctx.market

  const notes: SpeakerNote[] = [
    {
      cue: 'Scan the code with your phone. Pleasantries. Press Next when everyone is settled.',
      points: [
        'Nothing on this screen needs explaining. Let people arrive and settle.',
        'The code in the corner is for your phone only. It disappears once you are connected.',
        `Say what the next twenty minutes cover: how the work runs, and what ${funder} receives at every step.`,
      ],
    },
    {
      cue: `${funder}'s funding proved the need is real. This engagement is about who pays next.`,
      points: [
        `Grant funding carried ${service} this far, and that is not in question.`,
        'What changes is the question being asked: who holds the budget, what will they pay, and what does it cost to deliver.',
        'Do not rush this screen. It is the premise everything after it rests on.',
      ],
    },
    {
      cue: 'Read the principle once, slowly. Everything that follows applies this one rule.',
      points: [
        'No service is designed, priced or scaled without evidence of paying demand from a customer with budget authority.',
        'Say that it is a standard rather than an opinion. Every decision point is held to it.',
        'If the room wants to argue with this, settle it here. Nothing later works without it.',
      ],
    },
    {
      cue: 'Nine decision points on the canvas, one before it opens, one at close. Point to the three columns.',
      points: [
        'Left is what the organisation can deliver. The centre is who pays. The right is the market.',
        `Every decision rests on evidence, is signed by the chief executive, and goes on a record ${funder} can read.`,
        'The row of small boxes along the bottom is the record. They fill in as decisions are signed.',
      ],
    },
    {
      cue: `Three questions for ${org}'s chief executive, in their own words, signed. ${funder} reviews the charter before it is signed.`,
      points: [
        'The three questions are asked out loud with everyone present, and recorded word for word.',
        'The Charter is signed by three parties: the organisation, the coach and the funder.',
        `${fullLabel('d1')} does not open until both are signed.`,
      ],
    },
    {
      cue: 'One line per column as it lights up.',
      points: [
        'Let each region light before you speak. There are five.',
        'The two wide boxes are the transition row, where the model meets real customers.',
        'The strip across the bottom is the readiness reading, taken three times.',
      ],
    },
    {
      cue: 'The people who value a service are rarely the people with the budget. The kick-off reading is taken here.',
      points: [
        'Every assumption about the service is written down before any of it is judged.',
        'This is where an engagement can be stopped, and that is a result rather than a failure.',
        'Ask the room for one thing they believed and had never tested.',
      ],
    },
    {
      cue: `Slow down. Evidence, decision, sign-off, record. A report reaches ${funder}'s inbox at sign-off.`,
      points: [
        'Four beats, and every decision point closes in the same four.',
        'Point at each beat in the panel as its dot fills.',
        'Stress the last one. The report is automatic, not a favour.',
      ],
    },
    {
      cue: market
        ? `Nothing is designed until a paying customer is named. For this service: ${market}.`
        : 'Nothing is designed until a paying customer is named.',
      points: [
        'Named customer segments, documented urgency, and confirmed willingness to engage commercially.',
        'A donor as funder is not the same as a client as customer. Say that plainly.',
        `${fullLabel('d3')} does not open until ${fullLabel('d2')} holds a named customer.`,
      ],
    },
    {
      cue: `Watch it move between inside and outside. ${org}'s finance lead builds the model.`,
      points: [
        'Inside, outside, inside, outside. That alternation is the method, not the running order.',
        'The financial model is built by their own finance lead, not handed over finished.',
        'The mid-point readiness reading follows these four.',
      ],
    },
    {
      cue: `Iteration 1 is coach-led. Iteration 2 is led by ${org}, with backstopping.`,
      points: [
        'Two rounds with real paying customers, not a rehearsal.',
        'Every client engagement is debriefed with the client and documented before the service is revised.',
        'This is where the coach starts stepping back.',
      ],
    },
    {
      cue: 'This is an illustration. The change is signed and the original stays on the record.',
      points: [
        'Use the word illustration. This has not happened on this engagement.',
        'Evidence from the pilot can reopen a decision that was already signed.',
        'Nothing is deleted. The original decision and the reason it changed both stay on the record.',
      ],
    },
    {
      cue: 'The closing reading, on six fit tests and four stages.',
      points: [
        `${fullLabel('d8')} is where the service goes after the engagement ends, and what pays for it.`,
        `The closing reading places ${org} on the same four stages as the first two readings.`,
        'The movement between the three readings is the finding, rather than any one score.',
      ],
    },
    {
      cue: `${org} presents alone. Five tests of independence.`,
      points: [
        'Done unaided, or the engagement does not close.',
        'Name one of the five: the finance lead changes an input and explains the new break-even.',
        'The wave of green at the end is every decision signed.',
      ],
    },
    {
      cue: `Six things ${funder} receives. Stress card 2: who agreed, who dissented, who signed.`,
      points: [
        'Card 1 is automatic. A report at every signed decision point, in your inbox.',
        'Card 2 is the one funders ask about. Dissent goes on the record rather than being smoothed over.',
        'Card 5: room for your whole team, not one sign in passed around.',
      ],
    },
    {
      cue: 'This arrives in your inbox the moment a decision point closes.',
      points: [
        'Generated from the signed record. Nobody writes it afterwards.',
        'This is the shape of it, taken from a demonstration engagement.',
        'Offer to send the real one the day the first decision point closes.',
      ],
    },
    ...(ctx.timeline
      ? [{
        cue: timelineCue(ctx.timeline.span, ctx.timeline.milestones.length),
        points: [
          'The dates are the contract dates, not an estimate.',
          'Each milestone carries its own deliverables.',
          'Ask whether these line up with their own reporting dates.',
        ],
      }]
      : []),
    {
      cue: 'Your sign-in details are already with you. Show the workspace.',
      points: [
        'Click the button on the laptop. A browser will not open a tab because this phone asked it to.',
        'Show one signed decision point and the evidence behind it.',
        'Say that this is live, not a copy taken for the meeting.',
      ],
    },
    {
      cue: 'Ask the first question, then stop talking.',
      points: [
        'Read question one and wait. The silence is the point.',
        'Write down what they say. It goes into the engagement.',
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
