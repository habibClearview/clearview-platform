// ============================================================
// THE NINETEEN SCREENS.
//
// The narrative is the approved reference's, word for word, with two kinds of
// substitution and nothing else:
//
//   1. The engagement's own words. The funder, the organisation, the service,
//      the paying customer, the contract dates. Where none is recorded the
//      sentence still reads, because the context supplies "the funder", "the
//      organisation" and "the service" instead of a gap.
//
//   2. ClearView's terms. Where the reference and ClearView name the same thing
//      differently, ClearView wins and the rest of the sentence is untouched.
//      That is why screen 6 says "Connecting layer" rather than "Bridge", why
//      the decision points are numbered "Decision Point 1" rather than
//      "Decision Point 01", and why the six fit tests on screen 13 are read
//      from ClearView instead of typed out again here.
//
// Nothing on these screens is entered by hand per client. One component, one
// context object, two modes.
// ============================================================
import { COLUMN_BARS, FIT_TESTS, fullLabel } from './canvas-words'
import { threeQuestions, SERVICE_FALLBACK } from '@/lib/engagement-words'
import { cap, type WalkthroughContext } from './context'

export type StepKind = 'scene' | 'canvas'

export interface Step {
  kind: StepKind
  /** The screen's name, on the remote and in the screen list. */
  name: string
  /** Which canvas state this screen shows. Scenes have none. */
  cs?: number
  kicker?: string
  title?: [string, string]
  /** The narration panel, for a canvas screen. */
  html?: () => string
  /** The whole screen, for a full-screen scene. */
  scene?: () => string
}

/** Anything going into the page as text is escaped first. */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string
  ))
}

/** The service with its article, the way the three questions need it. */
export function servicePhraseOf(ctx: WalkthroughContext): string {
  return ctx.serviceGiven ? `the ${ctx.serviceGiven}` : SERVICE_FALLBACK
}

/** The faint canvas outline on the holding screen. */
const GHOST = `<svg class="ghost" viewBox="0 0 1200 700" aria-hidden="true"><rect x="10" y="10" width="130" height="600" rx="6"/><rect x="160" y="40" width="280" height="160" rx="6"/><rect x="450" y="40" width="280" height="160" rx="6"/><rect x="740" y="40" width="280" height="160" rx="6"/><rect x="160" y="210" width="280" height="160" rx="6"/><rect x="450" y="210" width="280" height="160" rx="6"/><rect x="740" y="210" width="280" height="160" rx="6"/><rect x="160" y="380" width="425" height="120" rx="6"/><rect x="595" y="380" width="425" height="120" rx="6"/><rect x="160" y="510" width="860" height="100" rx="6"/><rect x="1040" y="10" width="130" height="600" rx="6"/></svg>`

const beatsHTML = (items: [string, string][]) =>
  '<ol class="beats" id="beatList">'
  + items.map((t, i) => `<li data-b="${i}"><i></i><span><b>${t[0]}</b>${t[1]}</span></li>`).join('')
  + '</ol>'

/**
 * Screen 5 and the Set Up detail. The three questions are ClearView's own, read
 * from the same place the coach's screen reads them, so a change to the wording
 * there changes it here.
 */
export function setupHTML(ctx: WalkthroughContext): string {
  const C = words(ctx)
  const qs = threeQuestions(servicePhraseOf(ctx), ctx.named ? ctx.funder : '')
  return `<p>Three questions for the chief executive, recorded in their own words, read back, corrected and signed.</p>
  <ol>${qs.map((q: string) => `<li class="q">${esc(q)}</li>`).join('')}</ol>
  <div class="block"><h3>Engagement Charter</h3><p>Records what each party commits, including leadership time, how the work runs, and how decisions are made and recorded. ${C.Funder} reviews it first. It is signed at inception.</p></div>`
}

/** The engagement's words, escaped once, in the shapes the sentences need. */
function words(ctx: WalkthroughContext) {
  const funder = esc(ctx.funder)
  const org = esc(ctx.org)
  return {
    funder,
    org,
    Funder: cap(funder),
    Org: cap(org),
    service: esc(ctx.service),
    market: esc(ctx.market),
    close: esc(ctx.close),
    portfolio: esc(ctx.portfolio),
    programme: esc(ctx.programme),
  }
}

export function buildSteps(ctx: WalkthroughContext): Step[] {
  const C = words(ctx)
  const introLine = ctx.named ? `Prepared for ${C.Funder} and ${C.Org}.` : 'How the work runs.'
  const serviceLine = ctx.serviceGiven
    ? `Commercialising ${esc(servicePhraseOf(ctx))}.`
    : 'Commercialising a grant-funded service.'
  const tl = ctx.timeline

  return [
    {
      kind: 'scene', name: 'Holding screen',
      scene: () => `<div class="hold reveal">
    <p class="eyebrow">${C.programme || 'Grant-to-Commercial Viability Canvas™'}</p>
    <h1 class="s-h1">${introLine}<em>${serviceLine}</em></h1>
    <div class="status" id="holdStatus"><i></i><span id="holdStatusText">Waiting for presenter</span></div></div>
    <div class="pairing" id="pairing" hidden></div>${GHOST}`,
    },
    {
      kind: 'scene', name: 'Why',
      scene: () => `<div class="reveal"><p class="eyebrow">Why this work</p>
    <h1 class="s-h1">Being funded proved the need was real.<em>What changes is who pays.</em></h1>
    <p class="s-body">Grant funding carried ${esc(servicePhraseOf(ctx))} this far. The next stage asks a different question: who holds the budget, what will they pay, and what does it cost to deliver.</p></div>`,
    },
    {
      kind: 'scene', name: 'The principle',
      scene: () => `<div class="reveal"><p class="eyebrow">The principle</p>
    <h1 class="s-h1 mid">Every decision answers one question.<em>Will someone with a budget pay for this?</em></h1>
    <p class="s-quote">No service is designed, priced or scaled without evidence of paying demand from a customer with budget authority. The canvas holds every decision in this engagement to that standard.</p></div>`,
    },
    {
      kind: 'canvas', cs: 0, name: 'The canvas', kicker: 'The canvas',
      title: ['Eleven decisions.', 'Each one closes on evidence.'],
      html: () => `<p>Nine decision points on the canvas, one before it opens and one at close.</p><p>Every decision rests on evidence, is signed by the chief executive, and goes on a record ${C.funder} can read.</p>`,
    },
    {
      kind: 'canvas', cs: 1, name: 'Set up', kicker: 'Set up',
      title: ['It starts with the', 'people who will sign.'],
      html: () => setupHTML(ctx),
    },
    {
      kind: 'canvas', cs: 2, name: 'Reading the canvas', kicker: 'Reading the canvas',
      title: ['The layout', 'carries the logic.'],
      html: () => `<ul class="sync" id="syncList"><li><strong>${esc(COLUMN_BARS[0][0])}.</strong> What the organisation delivers and what it costs.</li>
  <li><strong>${esc(COLUMN_BARS[1][0])}.</strong> Who pays, and what kind of commercial organisation this is.</li>
  <li><strong>${esc(COLUMN_BARS[2][0])}.</strong> How value is put to the customer and how the market is entered.</li>
  <li><strong>Transition.</strong> The model tested with real customers, then extended.</li>
  <li><strong>Diagnostic spine.</strong> Readiness read at kick-off, the mid-point and the close.</li></ul>`,
    },
    {
      kind: 'canvas', cs: 3, name: fullLabel('cg'), kicker: 'Before the canvas opens',
      title: ['First,', 'clear the ground.'],
      html: () => `<span class="tag">Coach leads</span><p>Every assumption about what the service does, who benefits and who pays is written down and sorted into what has been tested and what has only been believed.</p><p>The most frequent finding: the people who value a service are rarely the people with the budget to pay for it.</p><p><strong>The kick-off readiness reading is taken here.</strong></p>`,
    },
    {
      kind: 'canvas', cs: 4, name: fullLabel('d1'), kicker: fullLabel('d1'),
      title: ['Service Reality Audit.', 'One decision, end to end.'],
      html: () => `<p class="q">What do we actually deliver, versus what we think we deliver?</p>` + beatsHTML([
        ['Evidence', `A costed inventory of what ${esc(servicePhraseOf(ctx))} delivers and what each part costs.`],
        ['Decision', 'Which parts carry real market demand, and which exist because a grant funds them.'],
        ['CEO sign-off', `The chief executive signs. ${fullLabel('d2')} stays closed until they do.`],
        ['On record', `The signed decision and its evidence go on the record, and a report goes to ${C.funder}.`],
      ]),
    },
    {
      kind: 'canvas', cs: 5, name: fullLabel('d2'), kicker: fullLabel('d2'),
      title: ['Nothing is designed', 'until a paying customer is named.'],
      html: () => `<span class="tag">Coach leads</span><p>Validation conversations with real buyers produce named customer segments, documented problem urgency and confirmed willingness to engage commercially.</p>${C.market ? `<p>For this service, the paying customers are ${C.market}.</p>` : ''}<p><strong>${fullLabel('d3')} opens only when ${fullLabel('d2').replace('Decision Point ', '')} holds a named customer.</strong></p>`,
    },
    {
      kind: 'canvas', cs: 6, name: 'Decision Points 3 to 6', kicker: 'Decision Points 3 to 6',
      title: ['Inside, outside,', 'inside, outside.'],
      html: () => `<span class="tag">Coach designs, organisation builds</span><p>The work moves between what the organisation can deliver and what customers will pay for.</p>
  <ul><li><strong>3</strong> A value proposition tested with the customer.</li><li><strong>4</strong> A financial model with two pricing tiers and break-even, built by the finance lead.</li><li><strong>5</strong> An outreach plan with tested messages.</li><li><strong>6</strong> A commercial identity and a partner map.</li></ul>
  <p>Each closes on the same four beats. <strong>The mid-point readiness reading follows.</strong></p>`,
    },
    {
      kind: 'canvas', cs: 7, name: fullLabel('d7'), kicker: fullLabel('d7'),
      title: ['Two rounds with', 'real paying customers.'],
      html: () => `<span class="tag">Coach steps back</span><p><strong>Iteration 1</strong> is coach-led, with real clients.</p><p><strong>Iteration 2</strong> is led by ${C.org}, with the coach backstopping and reviewing the evidence.</p><p>Every client engagement is debriefed with the client and documented before the service is revised.</p>`,
    },
    {
      kind: 'canvas', cs: 8, name: 'A reopened decision', kicker: 'When the evidence changes',
      title: ['A decision', 'can be reopened.'],
      html: () => `<span class="tag gold">Illustration</span><p>Iteration 1 shows clients respond to a different price structure. ${fullLabel('d4')} reopens.</p><p>The revised pricing is evidenced and signed again. The original decision stays on the record, with the reason it changed.</p><p><strong>Decisions hold until evidence says otherwise, and every change is signed and visible.</strong></p>`,
    },
    {
      kind: 'canvas', cs: 9, name: 'Decision Points 8 and 9', kicker: 'Decision Points 8 and 9',
      title: ['Beyond the first cohort,', 'and the closing reading.'],
      html: () => `<p>${fullLabel('d8')} sets out where the service goes after the engagement, and what enables it.</p><p>The closing reading places ${C.org} on the four-stage scale, across six fit tests:</p>
  <ul>${FIT_TESTS.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`,
    },
    {
      kind: 'canvas', cs: 10, name: fullLabel('ho'), kicker: 'At close',
      title: ['Handover.', `${C.Org} presents alone.`],
      html: () => `<span class="tag">Organisation presents, coach confirms</span><p>Independence is shown on five elements:</p>
  <ul><li><strong>Financial model.</strong> The finance lead changes an input and explains the new break-even.</li><li><strong>Value proposition.</strong> Presented to a prospect without notes.</li><li><strong>Outreach.</strong> The pipeline run for four weeks without prompting.</li><li><strong>Client management.</strong> An engagement planned, delivered and debriefed by staff.</li><li><strong>Commercial identity.</strong> Described the same way by every leader.</li></ul><p>A one-page handover record closes the engagement.</p>`,
    },
    {
      kind: 'scene', name: 'What you receive',
      scene: () => `<div class="reveal"><p class="eyebrow">What you receive</p>
    <h1 class="s-h1 mid">What ${C.Funder} receives<em>at every decision point.</em></h1>
    <div class="cards">
      <div class="card hl"><b>01</b><p>A report of each signed decision point, sent to your inbox automatically.</p></div>
      <div class="card"><b>02</b><p>The same record online: what was decided, the evidence, who agreed, who dissented and who signed.</p></div>
      <div class="card"><b>03</b><p>Readiness read three times, on the same six fit tests.</p></div>
      <div class="card"><b>04</b><p>Comments on the record, and invitations to working sessions on request.</p></div>
      <div class="card"><b>05</b><p>Room for your whole team.</p></div>
      <div class="card"><b>06</b><p>At close, the handover record and close-out report.</p></div>
    </div></div>`,
    },
    {
      kind: 'scene', name: 'Sample report',
      scene: () => `<div class="rep"><div class="reveal"><p class="eyebrow">In your inbox</p>
    <h1 class="s-h1 mid">This is what<em>arrives in your inbox.</em></h1>
    <p class="s-body">Generated from the signed record the moment a decision point closes.</p></div>
    <div class="paper" aria-label="Sample decision point report"><span class="sample">SAMPLE</span>
      <div class="ph"><span>ClearView · Decision Point Report</span><span>01 / 11</span></div>
      <h4>${fullLabel('d1')} · Service Reality Audit</h4>
      <div class="meta">${C.Org} · ${ctx.serviceGiven ? esc(cap(ctx.serviceGiven)) : 'Service'} · Demo engagement</div>
      <div class="sec">Decision</div><div class="bar" style="width:96%"></div><div class="bar" style="width:88%"></div><div class="bar" style="width:62%"></div>
      <div class="sec">Evidence</div><div class="bar" style="width:92%"></div><div class="bar" style="width:79%"></div><div class="bar" style="width:84%"></div>
      <div class="sec">What opens next</div><div class="bar" style="width:90%"></div><div class="bar" style="width:55%"></div>
      <div class="sign"><span>Signed · Chief Executive</span><span class="sent">Sent to ${C.funder}</span></div>
    </div></div>`,
    },
    ...(tl ? [{
      kind: 'scene' as const, name: 'Timeline',
      scene: () => `<div class="reveal"><p class="eyebrow">The engagement</p>
    <h1 class="s-h1 mid">${esc(tl.span)}<em>${tl.milestones.length === 1 ? 'One milestone.' : `${esc(numberWord(tl.milestones.length))} milestones.`}</em></h1>
    <div class="tl"><div class="axis"><span>${esc(tl.start)}</span><span style="left:50%">${esc(tl.middle)}</span><span style="left:100%">${esc(tl.end)}</span></div>
      <div class="cols" style="grid-template-columns:repeat(${tl.milestones.length},minmax(0,1fr))">
        ${tl.milestones.map((m) => `<div class="col"><h3>${esc(m.title)}</h3><p>${esc(m.detail)}</p></div>`).join('')}
      </div><p class="note">Milestone dates follow the approved workplan.</p></div></div>`,
    }] : []),
    {
      kind: 'scene', name: 'Live reveal',
      scene: () => (ctx.named && ctx.workspaceUrl
        ? `<div class="reveal"><p class="eyebrow">ClearView</p>
    <h1 class="s-h1">You already have the keys.<em>Here is what they open.</em></h1>
    <p class="s-body">${C.Funder}'s sign-in details are already in your inbox. This is the ${C.Org} workspace, where every signed decision point appears as it happens.</p>
    <div><a class="cta" id="revealBtn" href="${esc(ctx.workspaceUrl)}" target="_blank" rel="noopener noreferrer">Open the ${C.Org} workspace →</a></div></div>`
        : `<div class="reveal"><p class="eyebrow">ClearView</p>
    <h1 class="s-h1">Every decision, on the record.<em>Open to the funder from day one.</em></h1>
    <p class="s-body">The funder signs in to the same record: each decision, the evidence behind it, who agreed and who signed.</p></div>`),
    },
    {
      kind: 'scene', name: 'Questions',
      scene: () => `<div class="reveal"><p class="eyebrow">Over to you</p>
    <h1 class="s-h1 mid">Three questions<em>for ${C.funder}.</em></h1>
    <ol class="qlist"><li>${C.close}, what would you need to see to call this engagement a success?</li><li>What has stopped past commercialisation support from lasting?</li><li>What would you need to compare this work across ${C.portfolio}?</li></ol></div>`,
    },
  ]
}

/** Small counts are written out, the way the rest of the copy writes them. */
function numberWord(n: number): string {
  return ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'][n] || String(n)
}
