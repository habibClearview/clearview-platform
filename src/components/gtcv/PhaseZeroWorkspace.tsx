// @ts-nocheck
'use client'
// ============================================================
// PHASE 0 WORKSPACE -- the five tools of "clear the ground", in the order
// the method uses them:
//
//   1. Assumption Dump Canvas       -> gtcv_assumptions
//   2. Problem Owner Budget Matrix  -> gtcv_problem_owner_budget
//   3. Hypothesis Shortlist Board   -> gtcv_hypotheses_shortlist
//   4. Signal vs Story Board        -> gtcv_signal_story
//   5. Continue / Pause / Kill      -> gtcv_continue_pause_kill
//
// Tables created in
// supabase/migrations/2026_08_09_gtcv_dp_tables_d.sql.
//
// The method rules are visible in the surface, not hidden in a document:
//   * Tool 2 shows the pause warning on any row with no budget holder named.
//     You cannot sell a problem nobody has money for.
//   * Tool 3 totals the four scores and marks who is in the top 3 to 5, the
//     only hypotheses allowed to advance out of Phase 0.
//   * Tool 5 carries a summary strip, because every activity must land
//     somewhere with a rationale and a destination gate.
//
// Editing model: typing changes local state only, and the row is written to
// Supabase when the field loses focus (or immediately for a dropdown or a
// checkbox). The save indicator at the top reports the state of the last
// write. When canManage is false everything renders read only.
//
// Client agnostic: the only client input is the clientId prop.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
// C4. The service anchor, sticky above all five tools.
import ServiceAnchorBar from '@/components/gtcv/ServiceAnchorBar'
// C12 to C16. Park, Move to another service, Delete — three named actions
// where there used to be one button that only destroyed.
import RowActions from '@/components/gtcv/RowActions'
// C20, C21, C22, C25, C27. The problem column, which is not a column of text
// but a view onto Tool 2's own rows.
import ProblemsCell from '@/components/gtcv/ProblemsCell'
// C26 as replaced. The hierarchy the tools draw, and C28 as amended, which
// decides what is shown and what is parked rather than what is hidden.
import {
  activityLabel,
  hierarchyForService,
  hypothesisBuild,
  problemLabel,
  problemsOutsideHierarchy,
  splitRowsByService,
  NO_PROBLEM_STATED,
} from '@/lib/phase-zero-hierarchy'
// Part J, C64 to C66. Folding at three levels, remembered between tools.
import { useCollapse } from '@/components/gtcv/useCollapse'
// T1.21, T1.22. The four fields that hold more than one value.
import { needsCarryAcross, valuesFor, VALUE_FIELDS } from '@/lib/activity-values'
import { authedFetch } from '@/lib/authed-fetch'

// ─── Shared style vocabulary (matches the coach dashboard) ───
const C = {
  navy: 'var(--cv-navy)', slate: 'var(--cv-slate)', faint: 'var(--cv-faint)',
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  borderSoft: 'var(--cv-border-soft)', header: 'var(--cv-header)',
  cyan: 'var(--cv-cyan)', teal: 'var(--cv-teal)', green: 'var(--cv-green)',
  amber: 'var(--cv-amber)', red: 'var(--cv-red)', purple: 'var(--cv-purple)',
  tintAmber: 'var(--cv-tint-amber)', tintGreen: 'var(--cv-tint-green)',
  tintRed: 'var(--cv-tint-red)', tintCyan: 'var(--cv-tint-cyan)',
  disabled: 'var(--cv-disabled)', bg2: 'var(--cv-bg-2)',
}

const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' }
const wrap = { fontFamily: "'Segoe UI',system-ui,-apple-system,sans-serif", color: C.navy }
const card = { background: C.card, border: `1px solid ${C.borderSoft}`, borderRadius: 14, marginBottom: '1.25rem', boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)', overflow: 'hidden' }
const cardHead = { background: C.header, color: 'var(--cv-on-accent)', padding: '0.85rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }
const cardBody = { padding: '1.1rem 1.2rem 1.3rem' }
const toolNo = { fontFamily: 'monospace', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cv-wa-75)' }
const toolTitle = { fontFamily: 'Georgia,serif', fontSize: '1.12rem', fontWeight: 700 }
const purpose = { fontSize: '0.95rem', color: C.slate, lineHeight: 1.45, marginBottom: '0.9rem' }
const tableWrap = { overflowX: 'auto' }
const table = { width: '100%', borderCollapse: 'collapse', fontSize: '0.93rem', minWidth: 860 }
// T1.23. The seven headings must be readable without scrolling sideways at a
// normal screen width, so Tool 1's table sets no floor and lets its cells wrap.
// Everything inside it is a box that wraps rather than a fixed-width control.
const toolOneTable = { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', tableLayout: 'fixed' }
const th = { padding: '0.45rem 0.55rem', textAlign: 'left', fontFamily: 'monospace', fontSize: '0.76rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
/** T1.23. A heading that may wrap rather than force the table wider. */
const thWrap = { ...th, whiteSpace: 'normal' }
const td = { padding: '0.4rem 0.4rem', verticalAlign: 'top', borderBottom: `1px solid ${C.borderSoft}` }
const cellInput = { width: '100%', minWidth: 0, padding: '0.4rem 0.5rem', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '0.93rem', fontFamily: 'inherit', background: C.bg2, color: C.navy, boxSizing: 'border-box', resize: 'vertical' }
const roInput = { ...cellInput, background: C.disabled, cursor: 'default' }
const selectStyle = { ...cellInput, minWidth: 108 }
const addButton = { fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700, border: 'none', borderRadius: 6, background: 'var(--cv-cyan)', color: 'var(--cv-on-accent)', padding: '0.4rem 0.9rem', cursor: 'pointer' }
const delButton = { fontFamily: 'monospace', fontSize: '0.85rem', border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', color: C.red, padding: '0.28rem 0.55rem', cursor: 'pointer' }
const emptyNote = { fontSize: '0.93rem', color: C.faint, padding: '0.7rem 0' }
const strip = { display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.85rem' }

function pill(bg, fg) {
  return { fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.04em', padding: '0.22rem 0.6rem', borderRadius: 999, background: bg, color: fg, display: 'inline-block', whiteSpace: 'nowrap' }
}
function noteBox(border, bg) {
  return { border: `1px solid ${border}`, background: bg, borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.9rem', color: C.navy, lineHeight: 1.45 }
}

// ─── Method content (fixed IP, identical for every engagement) ───
const DESTINATION_OPTIONS = [
  { id: '', label: 'No destination yet' },
  { id: 'dp01', label: 'DP01 Service Reality Audit' },
  { id: 'dp02', label: 'DP02 Customer and Problem Clarity' },
  { id: 'dp03', label: 'DP03 Value Proposition' },
  { id: 'dp04', label: 'DP04 Commercial Viability' },
  { id: 'dp05', label: 'DP05 Market Entry' },
  { id: 'dp06', label: 'DP06 Identity and Partners' },
  { id: 'dp07', label: 'DP07 Pilot and Learn' },
  { id: 'dp08', label: 'DP08 Scale Pathway' },
  { id: 'dp09', label: 'DP09 Commercial Readiness' },
]

const DECISIONS = [
  { id: 'undecided', label: 'Not landed', color: C.faint },
  { id: 'continue', label: 'Continue', color: C.green },
  { id: 'pause', label: 'Pause', color: C.amber },
  { id: 'kill', label: 'Kill', color: C.red },
]
const decisionMeta = (id) => DECISIONS.find((d) => d.id === id) || DECISIONS[0]

const CLASSIFICATIONS = [
  { id: 'unclassified', label: 'Not classified', color: C.faint },
  { id: 'signal', label: 'Signal', color: C.green },
  { id: 'story', label: 'Story', color: C.purple },
]
const classificationMeta = (id) => CLASSIFICATIONS.find((c) => c.id === id) || CLASSIFICATIONS[0]

const SCORE_FIELDS = [
  { key: 'urgency', label: 'Urgency' },
  { key: 'ownership_clarity', label: 'Ownership clarity' },
  { key: 'willingness_to_pay', label: 'Willingness to pay' },
  { key: 'access', label: 'Access' },
]

// The board advances the top 3 to 5 only. Rank 1 to 3 advance; rank 4 and 5
// advance only if there is capacity to carry them; everything below is held.
const ADVANCE_FLOOR = 3
const ADVANCE_CEILING = 5

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const blank = (v) => !String(v ?? '').trim()

// ─── Small building blocks ───────────────────────────────────
function TextCell({ value, onCommit, canManage, placeholder, rows = 2, ariaLabel }) {
  const [local, setLocal] = useState(value ?? '')
  useEffect(() => { setLocal(value ?? '') }, [value])
  if (!canManage) {
    return <div style={{ ...roInput, minHeight: 34, whiteSpace: 'pre-wrap' }}>{local || <span style={{ color: C.faint }}>Not filled in</span>}</div>
  }
  return (
    <textarea
      aria-label={ariaLabel || placeholder}
      style={cellInput}
      rows={rows}
      placeholder={placeholder}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if ((value ?? '') !== local) onCommit(local) }}
    />
  )
}

/**
 * A FIELD THAT HOLDS MORE THAN ONE VALUE  (T1.21, T1.22)
 *
 * A room has two funders for one activity, or three assumptions underneath it.
 * Each value is its own row with its own identity, so removing the second
 * leaves the first exactly as it was — which is what T1.22 tests, and why this
 * is not one box with commas in it.
 *
 * Before the migration has run there are no value rows and the original column
 * still holds what was typed, so that stands in and the first edit carries it
 * across. Nothing on screen goes blank waiting for a migration.
 */
function MultiValueCell({ activity, field, values, canManage, onAction, placeholder }) {
  const shown = valuesFor(activity, field, values)
  const carry = needsCarryAcross(activity, field, values)

  if (!canManage) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {shown.length === 0
          ? <span style={{ color: C.faint, fontSize: '0.88rem' }}>Not filled in</span>
          : shown.map((v, i) => <span key={v.id || i} style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{v.value}</span>)}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {shown.map((v, i) => (
        <ValueLine
          key={v.id || `legacy-${i}`}
          value={v.value}
          placeholder={placeholder}
          onCommit={(text) => {
            // A legacy value has no row yet. Editing it creates one, which also
            // mirrors the text back into the original column.
            if (v.id) onAction({ action: 'editActivityValue', id: v.id, value: text })
            else onAction({ action: 'addActivityValue', activityId: activity.id, field, value: text })
          }}
          onRemove={() => {
            if (v.id) onAction({ action: 'removeActivityValue', id: v.id })
            else onAction({ action: 'edit', activityId: activity.id, field, value: '' })
          }}
        />
      ))}
      <button
        type="button"
        onClick={async () => {
          // Carry the column across first, or the answer already there would sit
          // under a new empty box and be overwritten by the mirror-back.
          if (carry) await onAction({ action: 'addActivityValue', activityId: activity.id, field, value: activity[field] })
          await onAction({ action: 'addActivityValue', activityId: activity.id, field, value: '' })
        }}
        style={{ ...mono, fontSize: '0.7rem', color: C.slate, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', alignSelf: 'flex-start' }}
      >
        {shown.length === 0 ? '+ add' : '+ another'}
      </button>
    </div>
  )
}

/** One value of one field. Committed on leaving the box, like every other cell. */
function ValueLine({ value, placeholder, onCommit, onRemove }) {
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])
  return (
    <span style={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
      <textarea
        aria-label={placeholder}
        style={{ ...cellInput, minWidth: 90, minHeight: 30 }}
        rows={1}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text !== value) onCommit(text) }}
      />
      <button
        type="button"
        onClick={onRemove}
        title="Remove this value. The others are not touched."
        style={{ ...mono, fontSize: '0.7rem', color: C.slate, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 3px' }}
      >×</button>
    </span>
  )
}

function SaveIndicator({ state, message }) {
  const map = {
    idle: { text: 'All changes saved', color: C.faint },
    loading: { text: 'Loading', color: C.faint },
    saving: { text: 'Saving', color: C.amber },
    saved: { text: 'Saved', color: C.green },
    error: { text: message || 'Could not save', color: C.red },
  }
  const m = map[state] || map.idle
  return (
    <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: m.color, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
      {m.text}
    </span>
  )
}

function Section({ number, title, question, purposeText, children, right }) {
  return (
    <section style={card}>
      <div style={cardHead}>
        <div>
          <div style={toolNo}>Tool {number}</div>
          <div style={toolTitle}>{title}</div>
        </div>
        {right || null}
      </div>
      <div style={cardBody}>
        <div style={purpose}>
          <em style={{ color: C.navy }}>{question}</em>
          <br />
          {purposeText}
        </div>
        {children}
      </div>
    </section>
  )
}

// ─── THE HIERARCHY ON SCREEN  (C26 as replaced, C64 and C65) ─
//
// Three levels drawn as three levels: a service band, activity groups beneath
// it, and problems beneath each activity. The service appears ONCE, at the top,
// ALONE, as the frame. It is never a cell, and no component below it accepts a
// service name to put in one.

/** The fold marker. One shape, so the three levels read as the same gesture. */
function Chevron({ open }) {
  return (
    <span aria-hidden="true" style={{ ...mono, fontSize: '0.8rem', color: C.slate, display: 'inline-block', width: '0.9rem' }}>
      {open ? '▾' : '▸'}
    </span>
  )
}

/**
 * C26. The service, at the top, alone.
 *
 * C64. Folding it hides its activities, which is what a room does when it has
 * finished with a service and wants the next one on screen.
 */
function ServiceFrame({ service, summary, collapsed, onToggle, right, children }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: '0.9rem' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
        background: C.alt, padding: '0.55rem 0.75rem', borderBottom: collapsed ? 'none' : `1px solid ${C.border}`,
      }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <Chevron open={!collapsed} />
          <span style={{ ...mono, fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.slate }}>Service</span>
          <span style={{ fontFamily: 'Georgia,serif', fontSize: '1.05rem', fontWeight: 700, color: C.navy }}>
            {service?.service_name}
          </span>
        </button>
        <span style={{ ...mono, fontSize: '0.78rem', color: C.slate }}>{summary}</span>
        <span style={{ marginLeft: 'auto' }}>{right}</span>
      </div>
      {collapsed ? null : <div style={{ padding: '0.5rem 0.55rem 0.7rem' }}>{children}</div>}
    </div>
  )
}

/**
 * C26. One activity of that service, as its own group.
 *
 * C65. Folding it hides its problems. C22's words appear where nothing has been
 * stated, rather than an empty space that reads as a loading fault.
 */
function ActivityGroup({ activity, problemCount, noProblemStated, collapsed, onToggle, actions, children }) {
  return (
    <div style={{ borderLeft: `3px solid ${noProblemStated ? C.amber : C.borderSoft}`, paddingLeft: '0.6rem', marginBottom: '0.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '0.25rem 0' }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textAlign: 'left' }}
        >
          <Chevron open={!collapsed} />
          <span style={{ ...mono, fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.slate }}>Activity</span>
          <span style={{ fontWeight: 600, fontSize: '0.97rem', color: C.navy }}>{activityLabel(activity)}</span>
        </button>
        {noProblemStated ? (
          <span style={pill(C.tintAmber, C.navy)}>{NO_PROBLEM_STATED}</span>
        ) : (
          <span style={{ ...mono, fontSize: '0.76rem', color: C.slate }}>
            {problemCount} problem{problemCount === 1 ? '' : 's'}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>{actions}</span>
      </div>
      {collapsed ? null : <div style={{ marginTop: '0.2rem' }}>{children}</div>}
    </div>
  )
}

/** The Parked area a tool draws under itself. C28: visible, never hidden. */
function ParkedArea({ count, children, label }) {
  if (!count) return null
  return (
    <div style={{ marginTop: '0.9rem', border: `1px dashed ${C.amber}`, borderRadius: 10, padding: '0.6rem 0.75rem', background: C.tintAmber }}>
      <div style={{ ...mono, fontSize: '0.76rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.navy, marginBottom: '0.45rem' }}>
        {label ? `${label} — ${count}` : `Parked — ${count} not in any service`}
      </div>
      {/* C28 as amended: these are here so that NOTHING disappears for lack of
          a service. They are not errors and they are not hidden. */}
      {children}
    </div>
  )
}

/**
 * ONE HYPOTHESIS, AND WHAT IT IS BUILT FROM  (C26 as replaced)
 *
 * "A hypothesis is: this service, made up of these specific activities, solves
 * this problem or set of problems, for this type of client."
 *
 * So the scores are not the whole of it. Underneath sits the hierarchy the
 * hypothesis was drawn from — the activities named, and under each of them the
 * problems named — which is the part that used to live only in the memory of
 * whoever typed the sentence.
 *
 * The fold uses the 'activity' level keyed by the hypothesis's own identifier.
 * Identifiers are uuids and do not collide across tables, and this is the same
 * gesture at the same depth: a group folding away its detail.
 */
function HypothesisBlock({
  row, editable, clientId, tree, build, collapsed, onToggle, onScore, onAction, onDone,
  parked, anchoredService,
}) {
  const standing = !row.inTopFive
    ? { label: 'Held back', color: C.faint }
    : row.inTopThree
      ? { label: `Advances (rank ${row.rank})`, color: C.green }
      : { label: `Advances if capacity (rank ${row.rank})`, color: C.teal }

  // Only what is under the anchored service can be named, because a hypothesis
  // is built from THIS service's activities. Anything already named is offered
  // as a way to take the name off again.
  const namedActivityIds = new Set(build.activities.map((a) => a.id))
  const namedProblemIds = new Set(build.problems.map((p) => p.id))

  return (
    <div style={{
      border: `1px solid ${C.borderSoft}`, borderRadius: 9, marginBottom: '0.7rem',
      background: row.inTopFive ? C.tintGreen : C.card,
    }}>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', flexWrap: 'wrap', padding: '0.55rem 0.7rem' }}>
        <div style={{ flex: '1 1 22rem', minWidth: '16rem' }}>
          <TextCell value={row.hypothesis} canManage={editable} placeholder="The hypothesis to test" onCommit={(v) => onScore({ hypothesis: v })} />
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {SCORE_FIELDS.map((f) => (
            <label key={f.key} style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ ...mono, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: C.slate }}>{f.label}</span>
              {editable ? (
                <select
                  aria-label={f.label}
                  style={{ ...selectStyle, minWidth: 56, padding: '0.25rem 0.35rem' }}
                  value={num(row[f.key])}
                  onChange={(e) => onScore({ [f.key]: num(e.target.value) })}
                >
                  <option value={0}>-</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              ) : (
                <div style={{ ...roInput, minWidth: 46, textAlign: 'center' }}>{num(row[f.key]) || '-'}</div>
              )}
            </label>
          ))}
          <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.1rem', fontWeight: 700, color: C.navy, textAlign: 'center' }}>
            {row.total}
            <div style={{ ...mono, fontSize: '0.62rem', color: C.faint, fontWeight: 400 }}>of 20</div>
          </div>
          <span style={pill(standing.color, 'var(--cv-on-accent)')}>{standing.label}</span>
          {editable ? (
            <RowActions clientId={clientId} problemId={row.id} table="gtcv_hypotheses_shortlist" label="this hypothesis" onDone={onDone} />
          ) : null}
        </div>
      </div>

      {/* C28 as amended. The way out of the Parked area, offered here rather
          than the row being hidden until somebody finds it. */}
      {parked && editable && anchoredService ? (
        <div style={{ padding: '0 0.7rem 0.5rem' }}>
          <button
            type="button"
            onClick={() => onAction({ action: 'setRowService', table: 'gtcv_hypotheses_shortlist', id: row.id, serviceId: anchoredService.id })}
            style={{ ...mono, fontSize: '0.75rem', color: C.teal, background: 'transparent', border: `1px solid ${C.teal}`, borderRadius: 6, padding: '0.22rem 0.55rem', cursor: 'pointer' }}
          >
            Put into {anchoredService.service_name || 'this service'}
          </button>
        </div>
      ) : null}

      <div style={{ borderTop: `1px solid ${C.borderSoft}`, padding: '0.45rem 0.7rem 0.6rem' }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <Chevron open={!collapsed} />
          <span style={{ ...mono, fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: C.slate }}>
            Built from
          </span>
          <span style={{ ...mono, fontSize: '0.76rem', color: build.activities.length ? C.navy : C.amber }}>
            {build.activities.length === 0
              ? 'nothing named yet'
              : `${build.activities.length} activit${build.activities.length === 1 ? 'y' : 'ies'}, ${build.problems.length} problem${build.problems.length === 1 ? '' : 's'}`}
          </span>
        </button>

        {collapsed ? null : (
          <div style={{ marginTop: '0.4rem' }}>
            {build.activities.length === 0 ? (
              <div style={{ fontSize: '0.88rem', color: C.slate, lineHeight: 1.45 }}>
                Name the activities and the problems this hypothesis is built from, so the board shows what it rests on
                rather than the room having to remember.
              </div>
            ) : (
              // The same hierarchy again: activity, then its problems beneath.
              build.activities.map((a) => (
                <div key={a.id} style={{ borderLeft: `3px solid ${C.borderSoft}`, paddingLeft: '0.55rem', marginBottom: '0.35rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ ...mono, fontSize: '0.64rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: C.slate }}>Activity</span>
                    <span style={{ fontWeight: 600, fontSize: '0.92rem', color: C.navy }}>{activityLabel(a)}</span>
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => onAction({ action: 'unlinkHypothesisSource', id: row.id, activityId: a.id })}
                        style={{ ...mono, fontSize: '0.68rem', color: C.red, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        remove
                      </button>
                    ) : null}
                  </div>
                  {build.problems.filter((p) => p.activity_id === a.id).map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingLeft: '1rem', flexWrap: 'wrap' }}>
                      <span style={{ ...mono, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: C.slate }}>Problem</span>
                      <span style={{ fontSize: '0.88rem', color: C.navy }}>{problemLabel(p)}</span>
                      {editable ? (
                        <button
                          type="button"
                          onClick={() => onAction({ action: 'unlinkHypothesisSource', id: row.id, problemId: p.id })}
                          style={{ ...mono, fontSize: '0.68rem', color: C.red, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          remove
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ))
            )}

            {editable && tree.branches.length > 0 ? (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.45rem' }}>
                <select
                  value=""
                  aria-label="Name an activity this hypothesis is built from"
                  onChange={(e) => { if (e.target.value) onAction({ action: 'linkHypothesisSource', id: row.id, activityId: e.target.value }) }}
                  style={{ ...selectStyle, minWidth: 200, fontSize: '0.82rem' }}
                >
                  <option value="">Add an activity...</option>
                  {tree.branches.filter((b) => !namedActivityIds.has(b.activity.id)).map((b) => (
                    <option key={b.activity.id} value={b.activity.id}>{activityLabel(b.activity)}</option>
                  ))}
                </select>
                <select
                  value=""
                  aria-label="Name a problem this hypothesis is built from"
                  onChange={(e) => { if (e.target.value) onAction({ action: 'linkHypothesisSource', id: row.id, problemId: e.target.value }) }}
                  style={{ ...selectStyle, minWidth: 220, fontSize: '0.82rem' }}
                >
                  <option value="">Add a problem...</option>
                  {tree.branches.flatMap((b) => b.problems)
                    .filter((p) => !namedProblemIds.has(p.id))
                    .map((p) => <option key={p.id} value={p.id}>{problemLabel(p)}</option>)}
                </select>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div style={{ padding: '0 0.7rem 0.6rem' }}>
        <TextCell value={row.notes} canManage={editable} placeholder="Why this score" onCommit={(v) => onScore({ notes: v })} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.35rem', fontSize: '0.82rem', color: C.slate }}>
          <input type="checkbox" checked={!!row.advances} disabled={!editable} onChange={(e) => onScore({ advances: e.target.checked })} />
          Confirmed to advance
        </label>
      </div>
    </div>
  )
}

// ─── The workspace ───────────────────────────────────────────
export default function PhaseZeroWorkspace({ clientId, canManage }) {
  const editable = !!canManage
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [saveState, setSaveState] = useState('loading')
  const [saveMessage, setSaveMessage] = useState(null)

  const [assumptions, setAssumptions] = useState([])
  // Service names already in use, offered as suggestions so the same service
  // is spelled one way across the table.
  const [inventoryNames, setInventoryNames] = useState([])
  const [owners, setOwners] = useState([])
  const [hypotheses, setHypotheses] = useState([])
  const [signals, setSignals] = useState([])
  const [decisions, setDecisions] = useState([])
  // C12 to C16. Parking, moving or deleting a row happens through
  // /api/services, so this re-reads afterwards. Bumping a number rather than
  // lifting the loader out, so the loader itself is not touched.
  const [refreshKey, setRefreshKey] = useState(0)
  const reload = useCallback(() => setRefreshKey((n) => n + 1), [])
  // C25 to C27. ONE set of problem rows, read here and given to both tools, so
  // Tool 1 and Tool 2 cannot disagree about what a problem says.
  const [anchor, setAnchor] = useState({ services: [], activities: [], problems: [], hypothesisSources: [], activityValues: [], currentServiceId: null })
  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    const read = () => authedFetch(`/api/services?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j) setAnchor({ services: j.services || [], activities: j.activities || [], problems: j.problems || [], hypothesisSources: j.hypothesisSources || [], activityValues: j.activityValues || [], currentServiceId: j.currentServiceId || null }) })
      .catch(() => {})
    read()
    const t = setInterval(read, 4000)
    return () => { cancelled = true; clearInterval(t) }
  }, [clientId, refreshKey])

  // C18. Which activities the next new service will be made of, and what it
  // will be called. Held on the screen rather than the server: nothing is
  // written until the service is named and created, so an abandoned selection
  // leaves no trace.
  const [selectedForService, setSelectedForService] = useState(() => new Set())
  const [newServiceName, setNewServiceName] = useState('')
  const [creatingService, setCreatingService] = useState(false)
  const toggleSelected = useCallback((id) => {
    setSelectedForService((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // C26. THE SERVICE IS THE FRAME, and it is resolved here, above everything
  // that needs it: the adders below put a new row into it, and every tool
  // draws inside it.
  const anchoredService = useMemo(
    () => anchor.services.find((s) => s.id === anchor.currentServiceId) || anchor.services[0] || null,
    [anchor.services, anchor.currentServiceId],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!clientId) { setLoading(false); return }
      setLoading(true)
      setSaveState('loading')
      const order = (q) => q.eq('client_id', clientId).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      const [a, o, h, s, d, inv] = await Promise.all([
        order(supabase.from('gtcv_assumptions').select('*')),
        order(supabase.from('gtcv_problem_owner_budget').select('*')),
        order(supabase.from('gtcv_hypotheses_shortlist').select('*')),
        order(supabase.from('gtcv_signal_story').select('*')),
        order(supabase.from('gtcv_continue_pause_kill').select('*')),
        supabase.from('gtcv_service_inventory').select('service_name').eq('client_id', clientId),
      ])
      if (cancelled) return
      const firstError = a.error || o.error || h.error || s.error || d.error
      if (firstError) setLoadError(firstError.message)
      setAssumptions(a.data || [])
      setOwners(o.data || [])
      setHypotheses(h.data || [])
      setSignals(s.data || [])
      setDecisions(d.data || [])
      // Suggestions only. A failed read leaves the field free text, which is
      // what it is anyway, so it is not worth stopping the screen for.
      setInventoryNames((inv.data || []).map((r) => r.service_name).filter(Boolean))
      setLoading(false)
      setSaveState('idle')
    }
    load().catch((e) => { if (!cancelled) { setLoadError(e?.message || 'Could not load Phase 0'); setLoading(false); setSaveState('idle') } })
    return () => { cancelled = true }
  }, [clientId, refreshKey])

  // One write path for every table, so the save indicator is always honest.
  const persist = useCallback(async (tableName, id, patch) => {
    setSaveState('saving')
    setSaveMessage(null)
    const { error } = await supabase
      .from(tableName)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { setSaveState('error'); setSaveMessage(error.message); return false }
    setSaveState('saved')
    return true
  }, [])

  const makeUpdater = (tableName, setRows) => (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    persist(tableName, id, patch)
  }

  const makeAdder = (tableName, rows, setRows, defaults) => async () => {
    setSaveState('saving')
    setSaveMessage(null)
    const row = { client_id: clientId, sort_order: rows.length, ...defaults }
    const { data, error } = await supabase.from(tableName).insert([row]).select().single()
    if (error) { setSaveState('error'); setSaveMessage(error.message); return }
    setRows((prev) => [...prev, data])
    setSaveState('saved')
  }

  const makeRemover = (tableName, setRows) => async (id) => {
    setSaveState('saving')
    setSaveMessage(null)
    const { error } = await supabase.from(tableName).delete().eq('id', id)
    if (error) { setSaveState('error'); setSaveMessage(error.message); return }
    setRows((prev) => prev.filter((r) => r.id !== id))
    setSaveState('saved')
  }

  const updAssumption = makeUpdater('gtcv_assumptions', setAssumptions)
  const updOwner = makeUpdater('gtcv_problem_owner_budget', setOwners)
  const updHypothesis = makeUpdater('gtcv_hypotheses_shortlist', setHypotheses)
  const updSignal = makeUpdater('gtcv_signal_story', setSignals)
  const updDecision = makeUpdater('gtcv_continue_pause_kill', setDecisions)

  /**
   * C2. AN ACTIVITY IS CREATED INSIDE THE ANCHORED SERVICE, OR NOT AT ALL.
   *
   * This used to insert with no service_id at all, so every activity added
   * here dropped straight into Parked, the anchored service stayed at zero,
   * and Tool 2 looked empty. That is the fault this replaces.
   *
   * With nothing anchored it creates NOTHING and says so, rather than making a
   * row that has nowhere to live.
   */
  const addActivity = useCallback(async () => {
    if (!anchoredService) {
      setSaveState('error')
      setSaveMessage('Choose a service in the bar above first. An activity belongs to a service, so nothing was created.')
      return
    }
    setSaveState('saving')
    setSaveMessage(null)
    const { data, error } = await supabase.from('gtcv_assumptions').insert([{
      client_id: clientId,
      sort_order: assumptions.length,
      service_id: anchoredService.id,
      // Both are held, as the route does it: the reference is the parent, the
      // text is what other screens already read.
      service_name: anchoredService.service_name || null,
    }]).select().single()
    if (error) { setSaveState('error'); setSaveMessage(error.message); return }
    setAssumptions((prev) => [...prev, data])
    setSaveState('saved')
    // So it appears under the service in Tool 2 at once, not on the next poll.
    reload()
  }, [anchoredService, clientId, assumptions.length, reload])

  const addOwner = makeAdder('gtcv_problem_owner_budget', owners, setOwners, {})
  // C28 as amended. A row added while a service is anchored belongs to it from
  // the start, so the room does not create work in Tool 3 and then find it in
  // the Parked area. Where nothing is anchored the row simply has no service,
  // which is a legitimate state and is why the Parked area exists.
  const inAnchoredService = () => (anchoredService ? { service_id: anchoredService.id } : {})
  const addHypothesis = makeAdder('gtcv_hypotheses_shortlist', hypotheses, setHypotheses, { urgency: 0, ownership_clarity: 0, willingness_to_pay: 0, access: 0, advances: false, ...inAnchoredService() })
  const addSignal = makeAdder('gtcv_signal_story', signals, setSignals, { classification: 'unclassified', ...inAnchoredService() })
  const addDecision = makeAdder('gtcv_continue_pause_kill', decisions, setDecisions, { decision: 'undecided', ...inAnchoredService() })

  const delAssumption = makeRemover('gtcv_assumptions', setAssumptions)
  const delOwner = makeRemover('gtcv_problem_owner_budget', setOwners)
  const delHypothesis = makeRemover('gtcv_hypotheses_shortlist', setHypotheses)
  const delSignal = makeRemover('gtcv_signal_story', setSignals)
  const delDecision = makeRemover('gtcv_continue_pause_kill', setDecisions)

  // ─── C26 as replaced. THE HIERARCHY EVERY TOOL DRAWS ───────
  //
  // The service is the FRAME. It is held here once, at the top, and passed to
  // the tools as the thing they sit inside — never as a value for a cell. The
  // column headed "Service and activity" that used to sit on every Tool 2 row
  // is gone, and there is nothing here that could rebuild it.
  const tree = useMemo(
    () => hierarchyForService(anchoredService, anchor.activities, anchor.problems),
    [anchoredService, anchor.activities, anchor.problems],
  )
  /**
   * EVERY PROBLEM THE HIERARCHY CANNOT SHOW. Nothing is allowed to be invisible.
   *
   * A parked problem used to appear in NO list anywhere: problemsOfActivity
   * drops it, the old unparented filter dropped it, and the anchor bar's bucket
   * holds only activities. So a problem parked with the × could not be reached,
   * edited or restored by anybody. Three kinds land here now:
   *
   *   parked          parked_at is set
   *   orphaned        its activity no longer exists
   *   stranded        its activity itself has no service, so the activity is
   *                   not drawn under any service and its problems went with it
   *
   * A problem under an activity of ANOTHER service is deliberately not here:
   * switching the anchor above shows it, so it is reachable already.
   */
  const strandedProblems = useMemo(
    () => problemsOutsideHierarchy(anchor.problems, anchor.activities),
    [anchor.problems, anchor.activities],
  )

  /**
   * T1.2. Tool 1 shows the ANCHORED service's activities and nothing else.
   * It used to list every activity on the engagement, which is T1.2's own
   * failure condition and is why switching service changed nothing on screen.
   */
  const activitiesOfAnchored = useMemo(
    () => (anchoredService
      ? assumptions.filter((a) => a.service_id === anchoredService.id && !a.parked_at)
      : []),
    [assumptions, anchoredService],
  )

  /** Writing to a problem in the Parked area, and re-reading so it moves at once. */
  const updParkedProblem = useCallback(async (id, patch) => {
    setOwners((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    const ok = await persist('gtcv_problem_owner_budget', id, patch)
    if (ok) reload()
  }, [persist, reload])

  // Part J. Folded state, shared by every tool and remembered between them.
  const fold = useCollapse(clientId)
  const activityIds = useMemo(() => tree.branches.map((b) => b.activity.id), [tree])

  /**
   * One path to /api/services, so every tool changes the hierarchy the same way.
   *
   * A refusal is REPORTED, through the same save indicator every other write
   * uses. A control that appears to do nothing is how somebody presses a button
   * four times and then decides the screen is broken.
   */
  const hierarchyAction = useCallback(async (payload) => {
    setSaveState('saving')
    setSaveMessage(null)
    try {
      const res = await authedFetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...payload }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setSaveState('error')
        setSaveMessage(json?.error || 'That did not go through.')
        return
      }
      setSaveState('saved')
      reload()
    } catch {
      setSaveState('error')
      setSaveMessage('Could not reach the server. Nothing was changed.')
    }
  }, [clientId, reload])

  // Tool 2: the rule. A problem with no named budget holder is paused.
  const unfundedProblems = useMemo(
    () => owners.filter((r) => blank(r.budget_holder)).length,
    [owners],
  )

  // Tool 3: auto total, and the rank that decides who advances.
  const scoredHypotheses = useMemo(() => {
    const withTotals = hypotheses.map((r) => ({
      ...r,
      total: num(r.urgency) + num(r.ownership_clarity) + num(r.willingness_to_pay) + num(r.access),
    }))
    const ranked = [...withTotals].sort((a, b) => b.total - a.total)
    const rankById = new Map()
    ranked.forEach((r, i) => rankById.set(r.id, i + 1))
    return withTotals.map((r) => {
      const rank = rankById.get(r.id)
      const scored = r.total > 0
      return {
        ...r,
        rank,
        // Only a scored hypothesis can hold a shortlist place.
        inTopThree: scored && rank <= ADVANCE_FLOOR,
        inTopFive: scored && rank <= ADVANCE_CEILING,
      }
    })
  }, [hypotheses])
  const shortlistCount = scoredHypotheses.filter((r) => r.inTopFive).length

  // ─── C28 AS AMENDED. WHAT TOOLS 3, 4 AND 5 DRAW ────────────
  //
  // The anchored service's rows, and everything with no service in the Parked
  // area. NOTHING is hidden for lack of a service: on a live engagement no row
  // has one yet, so a filter would have shown a room an empty screen mid
  // session and the fault would have looked like lost work.
  const anchoredId = anchoredService?.id || null
  const splitHypotheses = useMemo(() => splitRowsByService(scoredHypotheses, anchoredId), [scoredHypotheses, anchoredId])
  const splitSignals = useMemo(() => splitRowsByService(signals, anchoredId), [signals, anchoredId])
  const splitDecisions = useMemo(() => splitRowsByService(decisions, anchoredId), [decisions, anchoredId])

  // Tool 4: how much of what the room believes is actually observed.
  const signalCount = signals.filter((r) => r.classification === 'signal').length
  const storyCount = signals.filter((r) => r.classification === 'story').length
  const unclassifiedCount = signals.filter((r) => r.classification !== 'signal' && r.classification !== 'story').length

  // Tool 5: the summary strip. Every activity must land somewhere, with a
  // rationale and a destination.
  const decisionSummary = useMemo(() => {
    const counts = { continue: 0, pause: 0, kill: 0, undecided: 0 }
    let missingRationale = 0
    let missingDestination = 0
    decisions.forEach((r) => {
      const key = ['continue', 'pause', 'kill'].includes(r.decision) ? r.decision : 'undecided'
      counts[key] += 1
      if (blank(r.rationale)) missingRationale += 1
      if (key !== 'kill' && blank(r.destination_dp)) missingDestination += 1
    })
    return { counts, missingRationale, missingDestination, total: decisions.length }
  }, [decisions])

  if (!clientId) {
    return <div style={{ ...wrap, ...emptyNote }}>Select an engagement to open its Phase 0 workspace.</div>
  }
  if (loading) {
    return <div style={{ ...wrap, ...emptyNote }}>Loading the Phase 0 workspace...</div>
  }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: C.teal }}>Phase 0</div>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.45rem', fontWeight: 700 }}>Clear the ground</div>
          <div style={{ fontSize: '0.95rem', color: C.slate, maxWidth: '92ch', marginTop: '0.25rem' }}>
            Five tools, used in order. Strip the activity back to what is actually true, find out who has the
            money, shortlist the few problems worth testing, separate what was observed from what is believed,
            and decide what continues, pauses or stops before any gate work begins.
          </div>
        </div>
        <SaveIndicator state={saveState} message={saveMessage} />
      </div>

      {loadError && (
        <div style={{ ...noteBox(C.red, C.tintRed), marginBottom: '1rem' }}>
          Some Phase 0 data could not be loaded: {loadError}
        </div>
      )}
      {!editable && (
        <div style={{ ...noteBox(C.border, C.alt), marginBottom: '1rem' }}>
          Read only. You can see the Phase 0 work but not change it.
        </div>
      )}

      {/* C4, C5, C30, C31, C7. The service the room is working on, the five
          figures, and the parked bucket. It STAYS AT THE TOP through all five
          tools, which is what C4 asks for and what a heading inside each tool
          could not do once anybody scrolled. Everything below works inside the
          service chosen here. */}
      <ServiceAnchorBar clientId={clientId} canManage={editable} />

      {/* ─── TOOL 1: Assumption Dump Canvas ─────────────────── */}
      <Section
        number={1}
        title="Assumption Dump Canvas"
        question="What are we already doing, and what has to be true for it to work?"
        purposeText="List every activity the organisation runs, and the service it sits under. An organisation sells several services and each is a portfolio of activities, so naming the service is what lets this be read back as what we actually do for gender advisory. For each activity, name what it delivers, who pays for it today, the assumption sitting underneath it, and what evidence would prove that assumption wrong."
        right={null}
      >
        {/* ─── C18. A NEW SERVICE, MADE OF ACTIVITIES THAT ALREADY EXIST ───
            Tick the activities, name the result, and they move. They keep
            their identity and their problems: this is a change of parent,
            never a copy, because a copy would leave the room looking at the
            same activity twice with no way to say which one was real. */}
        {editable && activitiesOfAnchored.length > 0 ? (
          <div style={{
            border: `1px solid ${selectedForService.size > 0 ? C.teal : C.borderSoft}`,
            background: selectedForService.size > 0 ? C.tintCyan : C.alt,
            borderRadius: 9, padding: '0.5rem 0.7rem', marginBottom: '0.8rem',
            display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap',
          }}>
            <span style={{ ...mono, fontSize: '0.76rem', color: C.slate }}>
              {selectedForService.size === 0
                ? 'Tick activities to make a new service out of them'
                : `${selectedForService.size} activit${selectedForService.size === 1 ? 'y' : 'ies'} chosen`}
            </span>
            {selectedForService.size > 0 ? (
              <form
                style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}
                onSubmit={async (e) => {
                  e.preventDefault()
                  const name = newServiceName.trim()
                  if (!name || creatingService) return
                  setCreatingService(true)
                  await hierarchyAction({
                    action: 'createServiceFromActivities',
                    name,
                    activityIds: Array.from(selectedForService),
                  })
                  setSelectedForService(new Set())
                  setNewServiceName('')
                  setCreatingService(false)
                }}
              >
                <input
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  placeholder="Name of the new service"
                  aria-label="Name of the new service"
                  style={{ ...cellInput, minWidth: 220, width: 'auto' }}
                />
                <button type="submit" disabled={!newServiceName.trim() || creatingService} style={addButton}>
                  {creatingService ? 'Creating...' : 'Create service from selected'}
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedForService(new Set()); setNewServiceName('') }}
                  style={{ ...delButton, color: C.slate }}
                >
                  Clear
                </button>
              </form>
            ) : null}
          </div>
        ) : null}

        {!anchoredService ? (
          <div style={emptyNote}>
            No service chosen. Add one in the bar above, or choose one, and its activities appear here.
          </div>
        ) : (
          <>
          {/* ONE SERVICE, NAMED ONCE, with its activities beneath it. This is
              the line the Service column used to repeat on every row. Adding an
              activity happens HERE, inside the service it will belong to, so
              the press and the parent are the same gesture. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
            background: C.alt, border: `1px solid ${C.border}`, borderRadius: 9,
            padding: '0.45rem 0.7rem', marginBottom: '0.6rem',
          }}>
            <span style={{ ...mono, fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.slate }}>Service</span>
            <span style={{ fontFamily: 'Georgia,serif', fontSize: '1.05rem', fontWeight: 700, color: C.navy }}>
              {anchoredService.service_name}
            </span>
            <span style={{ ...mono, fontSize: '0.76rem', color: C.slate }}>
              {activitiesOfAnchored.length} activit{activitiesOfAnchored.length === 1 ? 'y' : 'ies'}
            </span>
            {editable ? (
              <button type="button" style={{ ...addButton, marginLeft: 'auto' }} onClick={addActivity}>+ Add activity</button>
            ) : null}
          </div>
          {activitiesOfAnchored.length === 0 ? (
          <div style={emptyNote}>No activities under this service yet. Press &quot;+ Add activity&quot;.</div>
        ) : (
          <div style={tableWrap}>
            <table style={toolOneTable}>
              <thead>
                <tr>
                  {editable && <th style={{ ...thWrap, width: 34 }} aria-label="Choose for a new service" />}
                  {/* THE SERVICE IS NOT A COLUMN. It was repeating on every
                      row — the same name written once per activity — which is
                      the "service appearing twice" Habib reported and is
                      exactly what C26 forbids: the service is the frame, never
                      a cell. It is named ONCE, in the bar above, which every
                      row here belongs to. */}
                  <th style={{ ...thWrap, width: '18%' }}>Activity</th>
                  <th style={{ ...thWrap, width: '15%' }}>What it delivers</th>
                  {/* C20. ADDED beside it, never instead of it. Two different
                      questions: what the buyer receives, and what it is for. */}
                  <th style={{ ...thWrap, width: '16%' }}>Problem it solves</th>
                  <th style={{ ...thWrap, width: '13%' }}>Who pays</th>
                  <th style={{ ...thWrap, width: '17%' }}>Assumption underneath</th>
                  <th style={{ ...thWrap, width: '17%' }}>What would prove it wrong</th>
                  {editable && <th style={{ ...thWrap, width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {activitiesOfAnchored.map((r) => (
                  <tr key={r.id} style={selectedForService.has(r.id) ? { background: C.tintCyan } : undefined}>
                    {editable && (
                      <td style={td}>
                        <input
                          type="checkbox"
                          checked={selectedForService.has(r.id)}
                          onChange={() => toggleSelected(r.id)}
                          aria-label={`Include ${r.activity || 'this activity'} in a new service`}
                        />
                      </td>
                    )}
                    <td style={td}><TextCell value={r.activity} canManage={editable} placeholder="The activity" onCommit={(v) => updAssumption(r.id, { activity: v })} /></td>
                    <td style={td}><MultiValueCell activity={r} field="delivers" values={anchor.activityValues} canManage={editable} onAction={hierarchyAction} placeholder="What it actually delivers" /></td>
                    <td style={td}>
                      <ProblemsCell
                        clientId={clientId}
                        activityId={r.id}
                        problems={anchor.problems}
                        canManage={editable}
                        onChanged={reload}
                      />
                    </td>
                    <td style={td}><MultiValueCell activity={r} field="who_pays" values={anchor.activityValues} canManage={editable} onAction={hierarchyAction} placeholder="Who pays for it now" /></td>
                    <td style={td}><MultiValueCell activity={r} field="assumption" values={anchor.activityValues} canManage={editable} onAction={hierarchyAction} placeholder="What has to be true" /></td>
                    <td style={td}><MultiValueCell activity={r} field="disproof" values={anchor.activityValues} canManage={editable} onAction={hierarchyAction} placeholder="Evidence that would kill it" /></td>
                    {editable && (
                      <td style={td}>
                        {/* C12 to C16. Was one button marked Delete, which
                            deleted. Park is now the press that needs no
                            thought, and delete is behind one more press and a
                            confirmation that uses the word. */}
                        <RowActions
                          clientId={clientId}
                          activityId={r.id}
                          label={r.activity || 'this activity'}
                          onDone={reload}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          </>
        )}
      </Section>

      {/* ─── TOOL 2: Problem Owner Budget Matrix ────────────── */}
      <Section
        number={2}
        title="Problem Owner Budget Matrix"
        question="Who has this problem, and who controls the money to fix it?"
        purposeText="For each problem implied by the activity above, name who experiences it, who is accountable for it, who controls the budget, what it costs them not to solve it, and the mechanism through which money would actually be released."
        right={editable ? <button type="button" style={addButton} onClick={addOwner}>+ Add problem</button> : null}
      >
        <div style={strip}>
          <span style={pill(C.tintCyan, C.navy)}>{owners.length} problem{owners.length === 1 ? '' : 's'}</span>
          {unfundedProblems > 0 && (
            <span style={pill(C.amber, 'var(--cv-on-accent)')}>{unfundedProblems} with no budget holder</span>
          )}
        </div>
        {unfundedProblems > 0 && (
          <div style={{ ...noteBox(C.amber, C.tintAmber), marginBottom: '0.9rem' }}>
            <strong>Rule:</strong> if you cannot name a budget holder, pause the problem. {unfundedProblems} row
            {unfundedProblems === 1 ? ' has' : 's have'} no budget holder named, so {unfundedProblems === 1 ? 'it is' : 'they are'} not
            ready to carry into a hypothesis.
          </div>
        )}
        {/* ─── C26 AS REPLACED. THE HIERARCHY. ───────────────────
            The service at the top ALONE, every activity of it beneath, each
            activity's problems under it. There is no "Service and activity"
            column, here or anywhere: the service is the frame around the whole
            table and the activity is the heading of the group, so neither can
            be a cell. An activity with no problems is PRESENT, showing C22's
            words, because C26's own test requires the third activity to appear. */}
        {!anchoredService ? (
          <div style={emptyNote}>
            No service yet. Add one in the bar above, and its activities and their problems appear here.
          </div>
        ) : (
          <ServiceFrame
            service={anchoredService}
            collapsed={fold.is('service', anchoredService.id)}
            onToggle={() => fold.toggle('service', anchoredService.id)}
            summary={`${tree.branches.length} activit${tree.branches.length === 1 ? 'y' : 'ies'}, ${tree.problemCount} problem${tree.problemCount === 1 ? '' : 's'}`}
            right={tree.branches.length > 1 ? (
              // C65 in one press. Ten activities open, one argument: fold the
              // lot and open the two that matter.
              <button
                type="button"
                onClick={() => fold.setAll('activity', activityIds, !fold.allOf('activity', activityIds))}
                style={{ ...mono, fontSize: '0.75rem', color: C.slate, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '0.2rem 0.5rem', cursor: 'pointer' }}
              >
                {fold.allOf('activity', activityIds) ? 'Open all activities' : 'Fold all activities'}
              </button>
            ) : null}
          >
            {tree.branches.length === 0 ? (
              <div style={emptyNote}>This service has no activities yet. Add them in Tool 1.</div>
            ) : tree.branches.map((branch) => (
              <ActivityGroup
                key={branch.activity.id}
                activity={branch.activity}
                problemCount={branch.problems.length}
                noProblemStated={branch.noProblemStated}
                collapsed={fold.is('activity', branch.activity.id)}
                onToggle={() => fold.toggle('activity', branch.activity.id)}
                actions={editable ? (
                  <RowActions
                    clientId={clientId}
                    activityId={branch.activity.id}
                    label={activityLabel(branch.activity)}
                    onDone={reload}
                  />
                ) : null}
              >
                {branch.problems.length === 0 ? (
                  <div style={{ ...emptyNote, paddingLeft: '1.3rem' }}>
                    {/* C22 and C24. Named, not blank, and resolved at Tool 5
                        rather than killed at the moment the gap appears. */}
                    No problem stated under this activity. It is carried to Tool 5 to be landed with everything else.
                  </div>
                ) : (
                  <div style={tableWrap}>
                    <table style={{ ...table, minWidth: 760 }}>
                      <thead>
                        <tr>
                          <th style={{ ...th, width: '22%' }}>Problem implied</th>
                          <th style={{ ...th, width: '15%' }}>Who experiences it</th>
                          <th style={{ ...th, width: '15%' }}>Who is accountable</th>
                          <th style={{ ...th, width: '19%' }}>Who controls the budget</th>
                          <th style={{ ...th, width: '17%' }}>Cost of not solving it</th>
                          <th style={{ ...th, width: '17%' }}>Budget mechanism</th>
                          {editable && <th style={{ ...th, width: 40 }} />}
                        </tr>
                      </thead>
                      <tbody>
                        {branch.problems.map((p) => {
                          // The row Tool 2 edits is the SAME row Tool 1 states,
                          // so the local copy is found by id rather than kept
                          // twice. D13: one row read by two tools.
                          const r = owners.find((o) => o.id === p.id) || p
                          const noHolder = blank(r.budget_holder)
                          return (
                            <tr key={r.id} style={noHolder ? { background: C.tintAmber } : undefined}>
                              <td style={td}><TextCell value={r.problem} canManage={editable} placeholder="The problem" onCommit={(v) => updOwner(r.id, { problem: v })} /></td>
                              <td style={td}><TextCell value={r.experienced_by} canManage={editable} placeholder="Who feels it" onCommit={(v) => updOwner(r.id, { experienced_by: v })} /></td>
                              <td style={td}><TextCell value={r.accountable} canManage={editable} placeholder="Who answers for it" onCommit={(v) => updOwner(r.id, { accountable: v })} /></td>
                              <td style={td}>
                                <TextCell value={r.budget_holder} canManage={editable} placeholder="Name the budget holder" onCommit={(v) => updOwner(r.id, { budget_holder: v })} />
                                {noHolder && (
                                  <div style={{ marginTop: '0.35rem', fontSize: '0.82rem', color: C.amber, fontWeight: 600, lineHeight: 1.35 }}>
                                    No budget holder named. Pause this problem until you can say who releases the money.
                                  </div>
                                )}
                              </td>
                              <td style={td}><TextCell value={r.cost_of_not_solving} canManage={editable} placeholder="What it costs them to leave it" onCommit={(v) => updOwner(r.id, { cost_of_not_solving: v })} /></td>
                              <td style={td}><TextCell value={r.budget_mechanism} canManage={editable} placeholder="How the money is released" onCommit={(v) => updOwner(r.id, { budget_mechanism: v })} /></td>
                              {editable && (
                                <td style={td}>
                                  {/* A problem parks or is deleted. It never
                                      moves between services, because it has
                                      none of its own. */}
                                  <RowActions
                                    clientId={clientId}
                                    problemId={r.id}
                                    label={r.problem || 'this problem'}
                                    onDone={reload}
                                  />
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </ActivityGroup>
            ))}
          </ServiceFrame>
        )}

        {/* PARKED PROBLEMS, AND EVERY OTHER ONE THE HIERARCHY CANNOT SHOW.
            Reachable, editable in place, and restorable. Nothing here is
            deleted by being parked, and nothing here is invisible. */}
        <ParkedArea count={strandedProblems.length} label="Parked problems">
          {strandedProblems.map((p) => {
            const r = owners.find((o) => o.id === p.id) || p
            const parent = anchor.activities.find((a) => a.id === r.activity_id) || null
            const why = r.parked_at
              ? 'parked'
              : !parent
                ? 'not attached to an activity'
                : 'its activity is not in a service'
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap',
                  padding: '0.4rem 0', borderTop: `1px solid ${C.borderSoft}`,
                }}
              >
                {/* Editable in place, exactly as everywhere else. */}
                <div style={{ flex: '1 1 20rem', minWidth: '14rem' }}>
                  <TextCell
                    value={r.problem}
                    canManage={editable}
                    placeholder="The problem"
                    ariaLabel="The problem"
                    onCommit={(v) => updParkedProblem(r.id, { problem: v })}
                  />
                  <div style={{ ...mono, fontSize: '0.72rem', color: C.slate, marginTop: '0.15rem' }}>
                    {why}{parent ? ` · ${activityLabel(parent)}` : ''}
                  </div>
                </div>

                {editable ? (
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Straight back where it came from, where that still exists
                        and is in a service. One press, no choosing. */}
                    {r.parked_at && parent && parent.service_id && !parent.parked_at ? (
                      <button
                        type="button"
                        onClick={() => updParkedProblem(r.id, { parked_at: null })}
                        style={{ ...mono, fontSize: '0.74rem', color: C.teal, background: 'transparent', border: `1px solid ${C.teal}`, borderRadius: 6, padding: '0.2rem 0.55rem', cursor: 'pointer' }}
                      >
                        Put back on {activityLabel(parent)}
                      </button>
                    ) : null}

                    {/* Onto any activity of the anchored service. This also
                        un-parks it, because choosing where it goes IS putting
                        it back. */}
                    {tree.branches.length > 0 ? (
                      <select
                        value=""
                        aria-label={`Put ${problemLabel(r)} on an activity`}
                        onChange={(e) => { if (e.target.value) updParkedProblem(r.id, { activity_id: e.target.value, parked_at: null }) }}
                        style={{ ...selectStyle, minWidth: 190, fontSize: '0.82rem' }}
                      >
                        <option value="">Put on an activity...</option>
                        {tree.branches.map((b) => (
                          <option key={b.activity.id} value={b.activity.id}>{activityLabel(b.activity)}</option>
                        ))}
                      </select>
                    ) : null}

                    {/* C13. Delete, behind its confirmation, for the ones that
                        are genuinely finished with. */}
                    <RowActions
                      clientId={clientId}
                      problemId={r.id}
                      label={r.problem || 'this problem'}
                      onDone={reload}
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
        </ParkedArea>
      </Section>

      {/* ─── TOOL 3: Hypothesis Shortlist Board ─────────────── */}
      <Section
        number={3}
        title="Hypothesis Shortlist Board"
        question="Which of these are worth testing, and which are we carrying out of habit?"
        purposeText="Score each emerging hypothesis 1 to 5 on Urgency, Ownership clarity, Willingness to pay and Access. The total is out of 20. Only the top 3 to 5 advance out of Phase 0."
        right={editable ? <button type="button" style={addButton} onClick={addHypothesis}>+ Add hypothesis</button> : null}
      >
        <div style={strip}>
          <span style={pill(C.tintCyan, C.navy)}>{hypotheses.length} on the board</span>
          <span style={pill(shortlistCount > 0 ? C.green : C.faint, 'var(--cv-on-accent)')}>{shortlistCount} in the shortlist</span>
          {hypotheses.length - shortlistCount > 0 && (
            <span style={pill(C.tintAmber, C.navy)}>{hypotheses.length - shortlistCount} held back</span>
          )}
        </div>
        {/* ─── C26 AS REPLACED, AND C28 AS AMENDED. ──────────────
            Tool 3 follows the same hierarchy: the service at the top alone,
            and beneath it the hypotheses built inside it. A hypothesis is
            "this service, made up of these specific activities, solves this
            problem or set of problems", so each one SHOWS the activities and
            the problems it is built from, drawn as the hierarchy rather than
            listed as text. */}
        {hypotheses.length === 0 ? (
          <div style={emptyNote}>No hypotheses on the board yet.</div>
        ) : (
          <>
            <ServiceFrame
              service={anchoredService}
              collapsed={anchoredService ? fold.is('service', anchoredService.id) : false}
              onToggle={() => anchoredService && fold.toggle('service', anchoredService.id)}
              summary={`${splitHypotheses.anchored.length} hypothes${splitHypotheses.anchored.length === 1 ? 'is' : 'es'} in this service`}
            >
              {splitHypotheses.anchored.length === 0 ? (
                <div style={emptyNote}>No hypothesis has been placed in this service yet.</div>
              ) : (
                splitHypotheses.anchored.map((r) => (
                  <HypothesisBlock
                    key={r.id}
                    row={r}
                    editable={editable}
                    clientId={clientId}
                    tree={tree}
                    build={hypothesisBuild(r.id, anchor.hypothesisSources, anchor.activities, anchor.problems)}
                    collapsed={fold.is('activity', r.id)}
                    onToggle={() => fold.toggle('activity', r.id)}
                    onScore={(patch) => updHypothesis(r.id, patch)}
                    onAction={hierarchyAction}
                    onDone={reload}
                  />
                ))
              )}
            </ServiceFrame>

            {/* C28 as amended. A hypothesis with no service is HERE, not gone. */}
            <ParkedArea count={splitHypotheses.parked.length}>
              {splitHypotheses.parked.map((r) => (
                <HypothesisBlock
                  key={r.id}
                  row={r}
                  editable={editable}
                  clientId={clientId}
                  tree={tree}
                  build={hypothesisBuild(r.id, anchor.hypothesisSources, anchor.activities, anchor.problems)}
                  collapsed={fold.is('activity', r.id)}
                  onToggle={() => fold.toggle('activity', r.id)}
                  onScore={(patch) => updHypothesis(r.id, patch)}
                  onAction={hierarchyAction}
                  onDone={reload}
                  parked
                  anchoredService={anchoredService}
                />
              ))}
            </ParkedArea>
          </>
        )}
      </Section>

      {/* ─── TOOL 4: Signal vs Story Board ──────────────────── */}
      <Section
        number={4}
        title="Signal vs Story Board"
        question="What did we actually see, and what are we telling ourselves?"
        purposeText="Split each statement in two. A signal is something observed: a behaviour, a payment, a refusal, a document. A story is believed but not observed. Only signals may carry weight in a hypothesis."
        right={editable ? <button type="button" style={addButton} onClick={addSignal}>+ Add item</button> : null}
      >
        <div style={strip}>
          <span style={pill(C.green, 'var(--cv-on-accent)')}>{signalCount} signal{signalCount === 1 ? '' : 's'}</span>
          <span style={pill(C.purple, 'var(--cv-on-accent)')}>{storyCount} stor{storyCount === 1 ? 'y' : 'ies'}</span>
          {unclassifiedCount > 0 && <span style={pill(C.tintAmber, C.navy)}>{unclassifiedCount} not classified</span>}
        </div>
        {signals.length === 0 ? (
          <div style={emptyNote}>Nothing on the board yet.</div>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, width: '24%' }}>Statement</th>
                  <th style={{ ...th, width: '24%' }}>What was actually observed</th>
                  <th style={{ ...th, width: '24%' }}>What is believed but not observed</th>
                  <th style={{ ...th, width: 140 }}>Classification</th>
                  <th style={{ ...th, width: '14%' }}>Source</th>
                  {editable && <th style={{ ...th, width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {/* C28 as amended. This service's rows. Anything with no
                    service is below, in the Parked area, never hidden. */}
                {splitSignals.anchored.map((r) => {
                  const meta = classificationMeta(r.classification)
                  return (
                    <tr key={r.id}>
                      <td style={td}><TextCell value={r.item} canManage={editable} placeholder="The claim or statement" onCommit={(v) => updSignal(r.id, { item: v })} /></td>
                      <td style={td}><TextCell value={r.observed} canManage={editable} placeholder="Observed behaviour or evidence" onCommit={(v) => updSignal(r.id, { observed: v })} /></td>
                      <td style={td}><TextCell value={r.believed} canManage={editable} placeholder="Belief with no observation behind it" onCommit={(v) => updSignal(r.id, { believed: v })} /></td>
                      <td style={td}>
                        {editable ? (
                          <select aria-label="Signal or story" style={selectStyle} value={r.classification || 'unclassified'} onChange={(e) => updSignal(r.id, { classification: e.target.value })}>
                            {CLASSIFICATIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                          </select>
                        ) : (
                          <span style={pill(meta.color, 'var(--cv-on-accent)')}>{meta.label}</span>
                        )}
                      </td>
                      <td style={td}><TextCell value={r.source} canManage={editable} placeholder="Who said it, where" onCommit={(v) => updSignal(r.id, { source: v })} /></td>
                      {editable && (
                        <td style={td}>
                          {/* C11, C12 to C16. The same three actions as Tools 1
                              and 2, so Park means one thing across the block. */}
                          <RowActions clientId={clientId} problemId={r.id} table="gtcv_signal_story" label="this row" onDone={reload} />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* C28 as amended. Nothing disappears for lack of a service. */}
        <ParkedArea count={splitSignals.parked.length}>
          {splitSignals.parked.map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.2rem 0' }}>
              <span style={pill(classificationMeta(r.classification).color, 'var(--cv-on-accent)')}>{classificationMeta(r.classification).label}</span>
              <span style={{ fontSize: '0.92rem', color: C.navy }}>{(r.item || '').trim() || 'Nothing written yet'}</span>
              {editable && anchoredService ? (
                <button
                  type="button"
                  onClick={() => hierarchyAction({ action: 'setRowService', table: 'gtcv_signal_story', id: r.id, serviceId: anchoredService.id })}
                  style={{ ...mono, fontSize: '0.72rem', color: C.teal, background: 'transparent', border: `1px solid ${C.teal}`, borderRadius: 6, padding: '0.18rem 0.5rem', cursor: 'pointer' }}
                >
                  Put into {anchoredService.service_name || 'this service'}
                </button>
              ) : null}
            </div>
          ))}
        </ParkedArea>
      </Section>

      {/* ─── TOOL 5: Continue / Pause / Kill Table ──────────── */}
      <Section
        number={5}
        title="Continue / Pause / Kill Table"
        question="What continues, what pauses, and what stops here?"
        purposeText="Every activity must land somewhere. Give each one a decision, a one sentence rationale, and the decision point it travels to next. An activity with no landing is unfinished Phase 0 work."
        right={editable ? <button type="button" style={addButton} onClick={addDecision}>+ Add activity</button> : null}
      >
        <div style={strip}>
          <span style={pill(C.green, 'var(--cv-on-accent)')}>{decisionSummary.counts.continue} continue</span>
          <span style={pill(C.amber, 'var(--cv-on-accent)')}>{decisionSummary.counts.pause} pause</span>
          <span style={pill(C.red, 'var(--cv-on-accent)')}>{decisionSummary.counts.kill} kill</span>
          <span style={pill(decisionSummary.counts.undecided > 0 ? C.tintAmber : C.alt, C.navy)}>{decisionSummary.counts.undecided} not landed</span>
        </div>
        {(decisionSummary.counts.undecided > 0 || decisionSummary.missingRationale > 0 || decisionSummary.missingDestination > 0) && (
          <div style={{ ...noteBox(C.amber, C.tintAmber), marginBottom: '0.9rem' }}>
            <strong>Phase 0 is not closed yet.</strong>
            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
              {decisionSummary.counts.undecided > 0 && <li>{decisionSummary.counts.undecided} activit{decisionSummary.counts.undecided === 1 ? 'y has' : 'ies have'} no decision.</li>}
              {decisionSummary.missingRationale > 0 && <li>{decisionSummary.missingRationale} row{decisionSummary.missingRationale === 1 ? '' : 's'} without a one sentence rationale.</li>}
              {decisionSummary.missingDestination > 0 && <li>{decisionSummary.missingDestination} row{decisionSummary.missingDestination === 1 ? '' : 's'} continuing or paused with no destination decision point.</li>}
            </ul>
          </div>
        )}
        {decisionSummary.total > 0 && decisionSummary.counts.undecided === 0 && decisionSummary.missingRationale === 0 && decisionSummary.missingDestination === 0 && (
          <div style={{ ...noteBox(C.green, C.tintGreen), marginBottom: '0.9rem' }}>
            Every activity has landed with a rationale and a destination. Phase 0 is ready to close.
          </div>
        )}
        {decisions.length === 0 ? (
          <div style={emptyNote}>No activities landed yet.</div>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, width: '26%' }}>Activity</th>
                  <th style={{ ...th, width: 140 }}>Decision</th>
                  <th style={{ ...th, width: '34%' }}>Rationale, one sentence</th>
                  <th style={{ ...th, width: 220 }}>Destination decision point</th>
                  {editable && <th style={{ ...th, width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {/* C28 as amended. This service's rows; the rest are parked
                    below rather than hidden. */}
                {splitDecisions.anchored.map((r) => {
                  const meta = decisionMeta(r.decision)
                  const isKill = r.decision === 'kill'
                  return (
                    <tr key={r.id}>
                      <td style={td}><TextCell value={r.activity} canManage={editable} placeholder="The activity" onCommit={(v) => updDecision(r.id, { activity: v })} /></td>
                      <td style={td}>
                        {editable ? (
                          <select aria-label="Continue, pause or kill" style={selectStyle} value={r.decision || 'undecided'} onChange={(e) => updDecision(r.id, { decision: e.target.value })}>
                            {DECISIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                          </select>
                        ) : (
                          <span style={pill(meta.color, 'var(--cv-on-accent)')}>{meta.label}</span>
                        )}
                      </td>
                      <td style={td}>
                        <TextCell value={r.rationale} canManage={editable} placeholder="Why it lands there" onCommit={(v) => updDecision(r.id, { rationale: v })} />
                        {blank(r.rationale) && (
                          <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: C.amber, fontWeight: 600 }}>A rationale is required before this row counts as landed.</div>
                        )}
                      </td>
                      <td style={td}>
                        {editable ? (
                          <select aria-label="Which block this goes to" style={{ ...selectStyle, minWidth: 200 }} value={r.destination_dp || ''} onChange={(e) => updDecision(r.id, { destination_dp: e.target.value || null })}>
                            {DESTINATION_OPTIONS.map((o) => <option key={o.id || 'none'} value={o.id}>{o.label}</option>)}
                          </select>
                        ) : (
                          <div style={{ ...roInput, minWidth: 160 }}>
                            {(DESTINATION_OPTIONS.find((o) => o.id === (r.destination_dp || '')) || DESTINATION_OPTIONS[0]).label}
                          </div>
                        )}
                        {!isKill && blank(r.destination_dp) && (
                          <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: C.amber, fontWeight: 600 }}>Name the gate this travels to.</div>
                        )}
                      </td>
                      {editable && (
                        <td style={td}>
                          {/* C11, C12 to C16. The same three actions as Tools 1
                              and 2, so Park means one thing across the block. */}
                          <RowActions clientId={clientId} problemId={r.id} table="gtcv_continue_pause_kill" label="this row" onDone={reload} />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* C28 as amended. Nothing disappears for lack of a service. */}
        <ParkedArea count={splitDecisions.parked.length}>
          {splitDecisions.parked.map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.2rem 0' }}>
              <span style={pill(decisionMeta(r.decision).color, 'var(--cv-on-accent)')}>{decisionMeta(r.decision).label}</span>
              <span style={{ fontSize: '0.92rem', color: C.navy }}>{(r.activity || '').trim() || 'Nothing written yet'}</span>
              {editable && anchoredService ? (
                <button
                  type="button"
                  onClick={() => hierarchyAction({ action: 'setRowService', table: 'gtcv_continue_pause_kill', id: r.id, serviceId: anchoredService.id })}
                  style={{ ...mono, fontSize: '0.72rem', color: C.teal, background: 'transparent', border: `1px solid ${C.teal}`, borderRadius: 6, padding: '0.18rem 0.5rem', cursor: 'pointer' }}
                >
                  Put into {anchoredService.service_name || 'this service'}
                </button>
              ) : null}
            </div>
          ))}
        </ParkedArea>
      </Section>
    </div>
  )
}
