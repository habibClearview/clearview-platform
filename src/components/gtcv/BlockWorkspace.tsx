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
          <Comp clientId={clientId} canManage={canManage} dpId={dpId} currency={currency} />
        </section>
      ))}
    </div>
  )
}
