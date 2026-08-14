// @ts-nocheck
'use client'
// ============================================================
// Block workspace.
//
// One surface per decision block, assembled from the working tables the
// workbook defines for that block. This is the single place that decides
// what belongs to which block, so the canvas panel and the sidebar tab show
// exactly the same thing and neither can drift from the other.
//
// Three layers stack in every block:
//   1. the block's own working tables
//   2. the evidence library, filtered to this block
//   3. the gate sign off, which is how the block closes
//
// Layers 2 and 3 are universal because the method says every gate closes on
// evidence and a signature, so no block should be missing either one.
//
// Surfaces are loaded on demand. A coach who opens Block 1 should not pay
// for the pilot capture or the costing model they are not looking at.
// ============================================================
import dynamic from 'next/dynamic'
import { zoneBrief } from '@/lib/gtcv-zone-brief'
// R20. What the room sent, waiting to become rows, drawn under the block's own
// table rather than in a list somewhere else.
import PendingRows from '@/components/gtcv/PendingRows'
// C44, C49, C50. Running a question from inside the block, so nothing about a
// session needs the "Sessions and rooms" page.
import RoomControlBar from '@/components/gtcv/RoomControlBar'
// R24. The button at the top of every block, and the sentence that stands
// beside it on a block Stage 1 gives no questions to (Q8).
import { BLOCKS_WITH_QUESTIONS, NO_QUESTIONS_YET } from '@/lib/stage1-question-sets'

// ------------------------------------------------------------
// R24. "Run this with the room", at the top of every block.
//
// IT LIVES HERE AND NOT IN THE BLOCK'S HEADER, and that is worth writing down
// because the first attempt put it in the header and it did not appear.
//
// The dark header at the top of a block is drawn by TabDP in CoachDashboard,
// and TabDP draws nothing but "This Decision Point is not yet loaded" when the
// engagement has no rows in canvas_decision_points. GtCV Demo Client has none,
// so on that engagement the header never exists and a button inside it never
// exists either. Checked by query, not guessed, after it failed to appear.
//
// This component, by contrast, is what every block IS. It renders on the coach
// dashboard and in the engagement journey view, on every engagement, whether
// or not the canvas rows were ever created. So the button is at the top of
// every block in the only sense that survives the data being incomplete.
// ------------------------------------------------------------
function RunThisWithTheRoom({ dpId, clientId }) {
  const has = BLOCKS_WITH_QUESTIONS.includes(dpId)
  // A SECOND TAB, not this one. This used to replace the page, which took the
  // room controls off screen the moment the projection opened — and the
  // controls live HERE, on the block, not on the projection. The facilitator
  // needs both at once: this tab to drive the room, that tab on the wall.
  const open = () => {
    window.open(
      `/coach/facilitate?clientId=${encodeURIComponent(clientId)}&gateId=${encodeURIComponent(dpId)}`,
      '_blank',
      'noopener',
    )
  }
  const base = {
    fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    fontSize: 13, fontWeight: 700, padding: '8px 14px', borderRadius: 8,
    border: '1px solid #2A9D8F', background: '#2A9D8F', color: '#FFFFFF',
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        disabled={!has}
        onClick={has ? open : undefined}
        style={has ? { ...base, cursor: 'pointer' } : { ...base, opacity: 0.4, cursor: 'default' }}
      >Run this with the room</button>
      {/* Q8, word for word, on the blocks Stage 1 gives no questions to. */}
      {!has ? (
        <span style={{
          fontFamily: "'Segoe UI',system-ui,sans-serif", fontSize: 13.5, color: '#6B7A8C',
        }}>{NO_QUESTIONS_YET}</span>
      ) : null}
    </div>
  )
}

// What this zone is for, taken from the method reference. Three things, in the
// order a room needs them: the question, what has to exist before the gate can
// close, and how you know the answer is real.
function ZoneBriefPanel({ dpId }) {
  const brief = zoneBrief(dpId)
  if (!brief) return null
  const sans = "'Segoe UI',system-ui,sans-serif"
  const cap = {
    fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#6B7A8C',
  }
  return (
    <section style={{
      border: '1px solid rgba(27,42,65,.16)', borderLeft: '3px solid #2A9D8F',
      borderRadius: 12, padding: '14px 16px', background: '#FBF7EE',
    }}>
      <div style={cap}>What this zone settles</div>
      <p style={{
        fontFamily: 'Georgia,serif', fontSize: 17, lineHeight: 1.45, color: '#1B2A41',
        margin: '6px 0 0', maxWidth: '78ch',
      }}>{brief.question}</p>

      <div style={{ ...cap, marginTop: 14 }}>What has to exist before it closes</div>
      <ul style={{
        fontFamily: sans, fontSize: 14, lineHeight: 1.55, color: '#33414F',
        margin: '6px 0 0', paddingLeft: 18, maxWidth: '78ch',
      }}>
        {brief.outputs.map((o) => <li key={o} style={{ marginTop: 3 }}>{o}</li>)}
      </ul>

      <div style={{ ...cap, marginTop: 14 }}>How you know it is real</div>
      <p style={{
        fontFamily: sans, fontSize: 14, lineHeight: 1.55, color: '#33414F',
        margin: '6px 0 0', maxWidth: '78ch',
      }}>{brief.signal}</p>
    </section>
  )
}

const loading = () => (
  <p style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", fontSize: 13.5, color: '#8B8272', padding: '10px 0' }}>
    Loading...
  </p>
)
const lazy = (imp) => dynamic(imp, { ssr: false, loading })

const ServiceInventoryTable = lazy(() => import('./ServiceInventoryTable'))
const CustomerSegmentsTable = lazy(() => import('./CustomerSegmentsTable'))
const ProblemScoringTable   = lazy(() => import('./ProblemScoringTable'))
const PropositionBuilder    = lazy(() => import('./PropositionBuilder'))
const ABTestingLog          = lazy(() => import('./ABTestingLog'))
const PipelineTracker       = lazy(() => import('./PipelineTracker'))
const PartnerMapTable       = lazy(() => import('./PartnerMapTable'))
const PilotCapture          = lazy(() => import('./PilotCapture'))
const ChannelLogicTable     = lazy(() => import('./ChannelLogicTable'))
const ReadinessDiagnostic   = lazy(() => import('./ReadinessDiagnostic'))
const PhaseZeroWorkspace    = lazy(() => import('./PhaseZeroWorkspace'))
const CommercialViability   = lazy(() => import('./CommercialViability'))
const InterviewBriefing     = lazy(() => import('./InterviewBriefing'))
const InterviewCaptureForm  = lazy(() => import('./InterviewCaptureForm'))
const EvidenceLibraryPanel  = lazy(() => import('./EvidenceLibraryPanel'))
const GateSignOffPanel      = lazy(() => import('./GateSignOffPanel'))
const BlockSynthesis        = lazy(() => import('./BlockSynthesis'))
const HandoverIndependence  = lazy(() => import('./HandoverIndependence'))
const InterviewReporting    = lazy(() => import('./InterviewReporting'))

// What each block carries. Title is what the coach sees above the surface,
// so it says what the tool is for rather than repeating the block name.
const BLOCK_SURFACES = {
  phase_0: [
    { key: 'phase0', title: 'Clearing the ground', Comp: PhaseZeroWorkspace },
  ],
  dp01: [
    { key: 'inventory', title: 'Service inventory', Comp: ServiceInventoryTable },
  ],
  dp02: [
    { key: 'segments', title: 'Customer segments and the adoption test', Comp: CustomerSegmentsTable },
    { key: 'scoring', title: 'Problem prioritisation', Comp: ProblemScoringTable },
    { key: 'brief', title: 'Before you go out: the conversation rules', Comp: InterviewBriefing },
    { key: 'capture', title: 'Customer conversation capture', Comp: InterviewCaptureForm },
    { key: 'reporting', title: 'What the conversations add up to', Comp: InterviewReporting },
  ],
  dp03: [
    { key: 'proposition', title: 'Proposition builder', Comp: PropositionBuilder },
  ],
  dp04: [
    { key: 'viability', title: 'Cost, break even and pricing', Comp: CommercialViability },
  ],
  dp05: [
    { key: 'ab', title: 'Message testing', Comp: ABTestingLog },
    { key: 'pipeline', title: 'Pipeline', Comp: PipelineTracker },
  ],
  dp06: [
    { key: 'partners', title: 'Partner map', Comp: PartnerMapTable },
  ],
  dp07: [
    { key: 'pilots', title: 'Pilot capture', Comp: PilotCapture },
  ],
  dp08: [
    { key: 'channels', title: 'Channel logic', Comp: ChannelLogicTable },
  ],
  dp09: [
    { key: 'readiness', title: 'Commercial readiness', Comp: ReadinessDiagnostic },
  ],
  handover: [
    { key: 'independence', title: 'The five independence tests', Comp: HandoverIndependence },
  ],
}

// Every block closes the same way, so these two follow the block's own tables
// rather than being repeated in each entry above.
const CLOSING_SURFACES = [
  { key: 'evidence', title: 'Evidence for this gate', Comp: EvidenceLibraryPanel },
  { key: 'synthesis', title: 'What this gate established', Comp: BlockSynthesis },
  { key: 'signoff', title: 'Gate sign off', Comp: GateSignOffPanel },
]

/** Every block has work, so this is always true. Kept for call sites that ask. */
export function hasWorkspace(dpId) {
  return Boolean(dpId)
}

/**
 * BLOCKS THAT DRAW THE ROOM'S PENDING ANSWERS THEMSELVES. 14 August 2026.
 *
 * Below, pending answers are drawn after the block's first surface. That is
 * right for a surface which IS one table, and wrong for phase_0, whose single
 * surface is all five tools — some five hundred lines of interface — so "after
 * it" put the answers and the Accept button at the very bottom of the page,
 * four tools below the table they belong to. R20 fails on exactly that: it
 * requires them beneath the block's own table and not in a list somewhere else.
 *
 * PhaseZeroWorkspace now draws them itself, directly under Tool 1's table. This
 * list stops a second copy appearing at the foot of the page.
 */
const BLOCKS_PLACING_PENDING_THEMSELVES = ['phase_0']

/** True when the block has working tables of its own beyond evidence and sign off. */
export function hasOwnTables(dpId) {
  return Array.isArray(BLOCK_SURFACES[dpId]) && BLOCK_SURFACES[dpId].length > 0
}

export default function BlockWorkspace({ dpId, clientId, canManage, currency }) {
  const own = BLOCK_SURFACES[dpId] || []
  const surfaces = [...own, ...CLOSING_SURFACES]

  if (!clientId || !dpId) {
    return (
      <p style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", fontSize: 13.5, color: '#8B8272' }}>
        Select a client to open this block.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* R24. The first thing in the block, above everything else in it. */}
      <RunThisWithTheRoom dpId={dpId} clientId={clientId} />

      {/* What the zone is for, before the tools. A zone used to open straight
          into its tables, so the question it exists to settle, what has to
          exist before it closes, and how you know the answer is real were all
          somewhere else: in the delivery document, or in somebody's memory,
          in front of the room. */}
      <ZoneBriefPanel dpId={dpId} />

      {own.length === 0 ? (
        <div style={{
          fontFamily: "'Segoe UI',system-ui,sans-serif", fontSize: 13.5, color: '#4C5A6B',
          background: '#FBF7EE', border: '1px dashed rgba(27,42,65,.18)', borderRadius: 12,
          padding: '14px 16px',
        }}>
          This block is worked through its nine components above. The evidence and the signature
          below are what close it.
        </div>
      ) : null}

      {surfaces.map(({ key, title, Comp }) => (
        <section key={key}>
          <h3 style={{
            fontFamily: 'Georgia,serif', fontSize: 17, fontWeight: 600, margin: '0 0 10px',
            color: '#1B2A41',
          }}>{title}</h3>
          {/* C44, C49 as amended, 14 August 2026.
              THE QR AND THE CODE ARE NOT REPEATED IN EVERY BLOCK. A participant
              scans once and that one scan carries them through all five tools,
              so a QR panel at the top of every block is a large picture of
              something already done. It lives in "Sessions and rooms", which is
              where somebody goes to open a room, and nowhere else.

              THE ROOM CONTROLS MOVED TO THE TOOL. The question being run
              belongs to a tool, and a bar floating above the whole block said
              nothing about which. Blocks listed below draw it against their own
              tool heading; the rest keep it here, at the top of their single
              table, where it still reads correctly. */}
          {key === own[0]?.key && !BLOCKS_PLACING_PENDING_THEMSELVES.includes(dpId) ? (
            <RoomControlBar clientId={clientId} dpId={dpId} canManage={canManage} />
          ) : null}
          <Comp clientId={clientId} canManage={canManage} dpId={dpId} currency={currency} />
          {/* R20. What the room sent, beneath the rows the block already has,
              and visibly marked as pending. It is drawn under the block's FIRST
              surface, which is the block's own table, so it reads as the
              bottom of that table rather than as a separate list somewhere
              else on the page. It draws nothing at all where there is nothing
              pending and nothing agreed. */}
          {key === own[0]?.key && !BLOCKS_PLACING_PENDING_THEMSELVES.includes(dpId) ? (
            <div style={{ marginTop: 12 }}>
              {/* C50. Above the pending rows and below the table, so the table
                  is never hidden or frozen while a question runs. */}
              <PendingRows clientId={clientId} dpId={dpId} canManage={canManage} />
            </div>
          ) : null}
        </section>
      ))}
    </div>
  )
}
