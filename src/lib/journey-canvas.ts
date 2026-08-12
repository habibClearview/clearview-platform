// ============================================================
// THE JOURNEY CANVAS  (PART K, C67 to C70)
//
// What the canvas is FOR: a gate's conclusion is worth nothing to a funder six
// months later without the path that reached it. So each gate renders what was
// decided, the evidence it rests on, who agreed, who dissented, and who signed.
//
// C70 AND THE PROMISE MADE IN THE ROOM. Where authors were hidden, the dissent
// is shown WITHOUT the name — permanently, in the live view and in the fixed
// version and in anything printed from either. gtcv_question_records
// .authors_were_visible is what decides it.
//
// This is already enforced once, at the moment of writing: D16 records that
// where authors are hidden NO NAME IS WRITTEN into the record at all, so there
// is nothing in the row to leak. This file enforces it a SECOND time, on the
// way out. That is deliberate belt and braces: the write-time rule protects
// rows written after 12 August 2026, and this protects the render whatever the
// row happens to contain — an older row, a hand-repaired one, an import. A
// promise made to a junior person in a room is not something to protect once.
//
// No React and no database in here, so the rule can be tested directly.
// ============================================================
import { GATES } from '@/lib/gtcv-gates'

/** One row of gtcv_question_records. */
export interface QuestionRecord {
  id: string
  gate_id: string | null
  question_text: string | null
  question_type: string | null
  submissions: { name?: string | null; score?: number | null; option?: string | null; at?: string | null }[] | null
  agreed_value: string | null
  dissent: { note?: string | null; name?: string | null }[] | null
  authors_were_visible: boolean | null
  revealed_at: string | null
  locked_by_name: string | null
  locked_at: string | null
}

/** One row of gtcv_gate_signoffs. */
export interface GateSignoff {
  dp_id: string | null
  signer_role: string | null
  signer_name: string | null
  decision: string | null
  note: string | null
  signed_at: string | null
}

/** One row of evidence_library, as far as the canvas cares. */
export interface EvidenceEntry {
  reference: string | null
  dp_id: string | null
  description?: string | null
  source_type?: string | null
}

/** One dissenting voice, after the anonymity rule has been applied. */
export interface DissentLine {
  note: string
  /** Null where authors were hidden. There is no way to ask for the name. */
  name: string | null
  /** True where a name is withheld BY THE PROMISE, not merely absent. */
  nameWithheld: boolean
}

/** One decision taken at a gate. */
export interface DecisionLine {
  id: string
  question: string
  agreed: string | null
  at: string | null
  /** Who recorded the agreement. This is the facilitator, never a participant. */
  recordedBy: string | null
  /** How many people answered. Shown instead of names where names are withheld. */
  submissionCount: number
  /** The people behind it, where the room agreed names could be shown. */
  agreedBy: string[]
  /** True where the room was promised no names. */
  namesWithheld: boolean
  dissent: DissentLine[]
}

export interface GateLine {
  id: string
  label: string
  isBlock: boolean
  decisions: DecisionLine[]
  evidence: EvidenceEntry[]
  signoffs: GateSignoff[]
  /** True where there is nothing to show yet. */
  empty: boolean
}

/**
 * C70. The dissent of one record, with the promise applied.
 *
 * Where authors were hidden the name is dropped HERE, on the way out, whatever
 * the stored row contains. A note with no words is not a dissent and is left
 * out rather than drawn as an empty bullet.
 */
export function dissentOf(record: QuestionRecord): DissentLine[] {
  const withheld = record.authors_were_visible !== true
  return (record.dissent || [])
    .map((d) => ({ note: String(d?.note || '').trim(), stored: String(d?.name || '').trim() }))
    .filter((d) => d.note.length > 0)
    .map((d) => ({
      note: d.note,
      name: withheld ? null : (d.stored || null),
      nameWithheld: withheld,
    }))
}

/**
 * Who agreed, where the room allowed names.
 *
 * Where it did not, this is EMPTY and the count is what the canvas shows
 * instead. A count is not identifying; a list of four names in a room of five
 * identifies the fifth.
 */
export function agreedByOf(record: QuestionRecord): string[] {
  if (record.authors_were_visible !== true) return []
  const names = (record.submissions || [])
    .map((s) => String(s?.name || '').trim())
    .filter(Boolean)
  return Array.from(new Set(names))
}

/** One record, as the canvas draws it. */
export function decisionOf(record: QuestionRecord): DecisionLine {
  const withheld = record.authors_were_visible !== true
  return {
    id: record.id,
    question: (record.question_text || '').trim() || 'Question not recorded',
    agreed: (record.agreed_value || '').trim() || null,
    at: record.locked_at || record.revealed_at || null,
    recordedBy: (record.locked_by_name || '').trim() || null,
    submissionCount: (record.submissions || []).length,
    agreedBy: agreedByOf(record),
    namesWithheld: withheld,
    dissent: dissentOf(record),
  }
}

/**
 * C67 to C69. THE WHOLE CANVAS, gate by gate, in the method's order.
 *
 * EVERY gate appears, including one nothing has happened at yet, because a
 * canvas that showed only the finished gates would not be a journey — the gaps
 * are the part a coach and a funder both read first.
 */
export function journeyCanvas(
  records: QuestionRecord[],
  signoffs: GateSignoff[],
  evidence: EvidenceEntry[],
): GateLine[] {
  return GATES.map((gate) => {
    const mine = records.filter((r) => r.gate_id === gate.id)
    const decisions = mine.map(decisionOf)
    const gateEvidence = evidence.filter((e) => e.dp_id === gate.id)
    const gateSignoffs = signoffs.filter((s) => s.dp_id === gate.id)
    return {
      id: gate.id,
      label: gate.label,
      isBlock: gate.isBlock,
      decisions,
      evidence: gateEvidence,
      signoffs: gateSignoffs,
      empty: decisions.length === 0 && gateEvidence.length === 0 && gateSignoffs.length === 0,
    }
  })
}

/**
 * C69. The stamp on a fixed version.
 *
 * A fixed version that does not say WHEN it was fixed is indistinguishable from
 * a live one that happens to be stale, which is the failure this guards
 * against: two copies of a handover pack in a room, no way to say which is
 * later. The date is passed in rather than read from the clock here, so the
 * caller decides the moment and the function stays testable.
 */
export function fixedVersionStamp(at: Date): string {
  const date = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `Fixed version, ${date} at ${time}`
}

/** What a canvas with nothing on it says, rather than an empty page. */
export const NOTHING_DECIDED_YET =
  'Nothing has been agreed at this gate yet. What is decided in a session appears here as it happens.'

/** C70's sentence, wherever a withheld name would otherwise have gone. */
export const NAME_WITHHELD = 'Name not shown, by the promise made in the room'
