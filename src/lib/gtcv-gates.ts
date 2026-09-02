// ============================================================
// The twelve gates, in order, with the names the method gives them.
//
// WHY THIS EXISTS SEPARATELY FROM BLOCK. src/lib/gtcv-blocks.ts describes the
// eight blocks that sit in the three columns of the canvas: their colour, their
// question, their bullets. It is a drawing. It does not include the four steps
// that are part of the journey but are not one of the eight boxes: setting up,
// clearing the ground, the diagnostic spine that runs across the whole thing,
// and handing over.
//
// Anything that has to reason about the engagement as a sequence needs all
// twelve. Setting an engagement up needs to create a row per gate. The canvas
// needs to know what comes before what. A gate identifier written anywhere has
// to match the database's is_gate_id() constraint. Those all wanted the same
// list, and before this they each carried their own copy.
//
// The order is the method's and does not vary by engagement, and neither is
// what they are called: every one of them is a Decision Point, from dpLabel()
// in gtcv-blocks. What varies is what goes in them, which is the work.
// ============================================================

export interface GateDefinition {
  /** The identifier, matching the database's is_gate_id() constraint. */
  id: string
  /** The method's name for it. Written to canvas_decision_points.label. */
  label: string
  /** True for the eight blocks drawn in the three columns of the canvas. */
  isBlock: boolean
}

export const GATES: GateDefinition[] = [
  { id: 'setup', label: 'Engagement set up', isBlock: false },
  { id: 'phase_0', label: 'Clearing the ground', isBlock: false },
  { id: 'dp01', label: 'Service Reality Audit', isBlock: true },
  { id: 'dp02', label: 'Customer and Problem Clarity', isBlock: true },
  { id: 'dp03', label: 'Value Proposition Architecture', isBlock: true },
  { id: 'dp04', label: 'Commercial Viability Model', isBlock: true },
  { id: 'dp05', label: 'Market Entry Design', isBlock: true },
  { id: 'dp06', label: 'Organisational Identity and Partner Architecture', isBlock: true },
  { id: 'dp07', label: 'Pilot and Learn Architecture', isBlock: true },
  { id: 'dp08', label: 'Scale and Expansion Pathway', isBlock: true },
  { id: 'dp09', label: 'Commercial Readiness Diagnostic', isBlock: false },
  { id: 'handover', label: 'Handover and independence', isBlock: false },
]

export const GATE_IDS: string[] = GATES.map((g) => g.id)

export function gateLabel(id: string): string | null {
  return GATES.find((g) => g.id === id)?.label ?? null
}

/** The gate immediately before this one in the method's order, or null. */
export function gateBefore(id: string): GateDefinition | null {
  const at = GATES.findIndex((g) => g.id === id)
  return at > 0 ? GATES[at - 1] : null
}

/**
 * Whether a gate is open to somebody who is not the coaching team.
 *
 * The method works the blocks in order and a block is not finished until it has
 * been signed off, so the organisation cannot start the next one until the one
 * before it is closed. That is the discipline the whole thing rests on: a block
 * opened early is a block worked without the decision behind it.
 *
 * The consultant is not subject to it. Setting an engagement up, correcting a
 * record, and preparing a block before the session that will fill it are all
 * ordinary parts of running one, and a lock that stopped the person running the
 * engagement would be a lock nobody could use.
 *
 * `statusOf` answers with the gate's recorded status. A gate counts as closed
 * when it is complete. Anything else, including evidence submitted and awaiting
 * a signature, leaves the next one shut, because the point of the gate is the
 * signature and not the paperwork before it.
 */
export function gateIsOpen(
  id: string,
  statusOf: (gateId: string) => string | null | undefined,
  opts: { isCoachingTeam: boolean },
): boolean {
  if (opts.isCoachingTeam) return true
  const at = GATES.findIndex((g) => g.id === id)
  if (at <= 0) return true
  const before = GATES[at - 1]
  return statusOf(before.id) === 'complete'
}

/** Why a gate is shut, in words a person can act on, or null when it is open. */
export function gateShutBecause(
  id: string,
  statusOf: (gateId: string) => string | null | undefined,
  opts: { isCoachingTeam: boolean },
): string | null {
  if (gateIsOpen(id, statusOf, opts)) return null
  const before = gateBefore(id)
  return before
    ? `${before.label} has to be signed off before this one opens.`
    : 'This one is not open yet.'
}
