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
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
// C4. The service anchor, sticky above all five tools.
import ServiceAnchorBar from '@/components/gtcv/ServiceAnchorBar'
// C12 to C16. Park, Move to another service, Delete — three named actions
// where there used to be one button that only destroyed.
import RowActions from '@/components/gtcv/RowActions'
// C20, C21, C22, C25, C27. The problem column, which is not a column of text
// but a view onto Tool 2's own rows.
// R20. Drawn inside Tool 1, under the table the answers become rows of. See the
// comment at the bottom of Tool 1 for why it is not left to BlockWorkspace.
import PendingRows from '@/components/gtcv/PendingRows'
// The room controls belong to the TOOL whose question is being run, not to the
// block as a whole. Drawn against Tool 1's own heading so the question on the
// wall and the table it fills are plainly the same piece of work.
import RoomControlBar from '@/components/gtcv/RoomControlBar'
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
/** Two controls on one heading, without either wrapping under the other. */
function HeadingControls({ children }) {
  return <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>{children}</span>
}
const runWithRoomButton = {
  fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
  fontSize: '0.78rem', fontWeight: 700, padding: '0.4rem 0.8rem', borderRadius: 8,
  border: '1px solid var(--cv-teal)', background: 'var(--cv-teal)', color: '#FFFFFF',
  cursor: 'pointer', whiteSpace: 'nowrap',
}

/** Last row of its problem, so the activity add follows it. */
function endOfProblem(rows, i) {
  return i === rows.length - 1 || rows[i + 1].problem_id !== rows[i].problem_id
}

/** Last row of its service, so the problem add follows it. */
function endOfService(rows, i) {
  return i === rows.length - 1 || rows[i + 1].service_id !== rows[i].service_id
}

/** True when the row above already names this row's service, so it is not repeated. */
function sameServiceAsAbove(rows, i) {
  return i > 0 && rows[i - 1].service_id && rows[i - 1].service_id === rows[i].service_id
}

/** A cell that cannot be answered yet, saying what is missing rather than sitting dead. */
function Locked({ need }) {
  return <span style={{ fontSize: '0.8rem', color: C.faint, fontStyle: 'italic' }}>Name {need} first</span>
}

const PLACEHOLDERS = {
  delivers: 'What it actually delivers',
  who_pays: 'Who pays for it now',
  assumption: 'What has to be true',
  disproof: 'Evidence that would kill it',
}

const anchorSelect = {
  fontSize: '0.86rem', padding: '0.3rem 0.4rem', borderRadius: 6,
  border: '1px solid rgba(27,42,65,.22)', background: 'var(--cv-bg-2, #FAFAF7)',
  maxWidth: '100%',
}

/** The service name reads as the frame it is, not as another editable cell. */
const serviceCell = { fontWeight: 700, color: C.navy, fontSize: '0.9rem' }
/**
 * THE ONE WAY TO ADD ANOTHER OF ANYTHING. 14 August 2026.
 *
 * Every multi-value cell already offers "+ add" / "+ another" as a quiet line
 * under the values it belongs to. Adding an ACTIVITY was a filled teal button
 * up in the service band instead — a different shape, a different colour and a
 * different corner of the screen for the same idea. Habib asked for one place
 * and one shape: an activity is added under the Activity column exactly as a
 * second "who pays" is added under Who pays.
 */
const addLine = {
  fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
  fontSize: '0.7rem', color: C.slate, background: 'transparent',
  border: 'none', padding: 0, cursor: 'pointer',
}
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
/**
 * THE ACTIVITIES UNDER ONE PROBLEM. 14 August 2026.
 *
 * Drawn once and used for every problem band, and for the activities that have
 * no problem named yet. Defined at module level ON PURPOSE: a component
 * declared inside the workspace's own render would be a new type on every
 * keystroke, React would unmount and remount the whole table, and the cell
 * being typed into would lose focus mid-word. That is worth ten props.
 *
 * "Problem it solves" is NOT a column here. The problem is the band above these
 * rows, the way the service is the band above the problems — named once, never
 * repeated down a column.
 */
function ActivityTable({
  rows, editable, anchor, clientId, selected, onToggle, onEditActivity, onEditProblem,
  serviceNameFor, problemTextFor, onAction, onReload, onAdd, onAddProblem, onAddService, onLeaveRow, onSetService, onRenameService,
}) {
  return (
    <div style={tableWrap}>
      <table style={toolOneTable}>
        <thead>
          <tr>
            {editable && <th style={{ ...thWrap, width: 34 }} aria-label="Choose for a new service" />}
            <th style={{ ...thWrap, width: '13%' }}>Service</th>
            <th style={{ ...thWrap, width: '16%' }}>Problem it solves</th>
            <th style={{ ...thWrap, width: '15%' }}>Activity</th>
            <th style={{ ...thWrap, width: '14%' }}>What it delivers</th>
            <th style={{ ...thWrap, width: '12%' }}>Who pays</th>
            <th style={{ ...thWrap, width: '15%' }}>Assumption underneath</th>
            <th style={{ ...thWrap, width: '15%' }}>What would prove it wrong</th>
            {editable && <th style={{ ...thWrap, width: 40 }} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <React.Fragment key={r.id}>
            <tr
              style={selected.has(r.id) ? { background: C.tintCyan } : undefined}
              onBlur={(e) => {
                // Only when focus has actually left the row, never when moving
                // between two cells of it — otherwise tabbing from Activity to
                // What it delivers would delete the row underneath you.
                if (!e.currentTarget.contains(e.relatedTarget)) onLeaveRow(r)
              }}
            >
              {editable && (
                <td style={td}>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => onToggle(r.id)}
                    aria-label={`Include ${r.activity || 'this activity'} in a new service`}
                  />
                </td>
              )}
              {/* THE SERVICE AND THE PROBLEM ARE COLUMNS. 14 August 2026.
                  Drawn as bands above the rows they governed, they pushed the
                  work down the page and you could not scroll one table and read
                  every service. They are columns now, like everything else, so
                  the whole engagement reads in one list. The service cell is
                  the name, not an editor: a service is renamed in the bar
                  above, and having two places to rename it is how two names for
                  one service appear. */}
              {/* ─────────────────────────────────────────────────────
                  NOTHING IS ANSWERABLE UNTIL ITS ANCHOR EXISTS.
                  14 August 2026.

                  Habib's rule, and his data proved the need for it: three rows
                  carried "what it delivers" and "who pays" with NO SERVICE at
                  all, and not one row of six had a problem. An attribute with
                  no anchor is not a half-finished thought, it is a value about
                  nothing — it cannot be read back, rolled up, or carried into
                  Tool 2.

                  So the chain is enforced where it is typed. Each cell opens
                  only once the one to its left holds something:

                    service → problem → activity → delivers, who pays,
                                                   assumption, disproof

                  A closed cell says which anchor is missing rather than sitting
                  there dead, because a greyed box with no reason is the same
                  bug wearing a different coat.
                  ───────────────────────────────────────────────────── */}
              {/* THE SERVICE IS WRITTEN ONCE PER SERVICE, NOT ONCE PER ROW.
                  14 August 2026. A chooser on every row repeated "Gender
                  Workshop" five times down the column and read as five
                  services. It is a column so that scrolling reveals the next
                  service and everything hanging off it — which needs the name
                  stated at the top of its group and nowhere else inside it.

                  The chooser survives in one place only: a row with NO service.
                  That is the row that cannot be worked on until it is given
                  one, and the only row that needs moving. */}
              <td style={{ ...td, ...(r.service_id && sameServiceAsAbove(rows, i) ? { borderTop: 'none' } : {}) }}>
                {!r.service_id && editable ? (
                  <select
                    value=""
                    onChange={(e) => onSetService(r, e.target.value || null)}
                    aria-label="The service this belongs to"
                    style={anchorSelect}
                  >
                    <option value="">Choose a service...</option>
                    {(anchor.services || [])
                      .filter((sv) => !sv.parked_at)
                      .map((sv) => (
                        <option key={sv.id} value={sv.id}>{sv.service_name || 'Unnamed service'}</option>
                      ))}
                  </select>
                ) : sameServiceAsAbove(rows, i) ? null : editable ? (
                  /* The name is typed HERE, on the first row of its group. A
                     service added from this table starts unnamed, and a cell
                     that only displays a name gives no way to give it one. */
                  <TextCell
                    value={serviceNameFor(r)}
                    canManage={editable}
                    placeholder="Name the service"
                    onCommit={(v) => onRenameService(r.service_id, v)}
                  />
                ) : (
                  <span style={serviceCell}>{serviceNameFor(r) || '—'}</span>
                )}
              </td>
              <td style={td}>
                {r.service_id ? (
                  <TextCell
                    value={problemTextFor(r)}
                    canManage={editable}
                    placeholder="The problem this service solves"
                    onCommit={(v) => onEditProblem(r, v)}
                  />
                ) : <Locked need="a service" />}
              </td>
              <td style={td}>
                {r.problem_id ? (
                  <TextCell value={r.activity} canManage={editable} placeholder="The activity" onCommit={(v) => onEditActivity(r.id, { activity: v })} />
                ) : <Locked need="a problem" />}
              </td>
              {['delivers', 'who_pays', 'assumption', 'disproof'].map((field) => (
                <td key={field} style={td}>
                  {String(r.activity || '').trim() ? (
                    <MultiValueCell
                      activity={r}
                      field={field}
                      values={anchor.activityValues}
                      canManage={editable}
                      onAction={onAction}
                      placeholder={PLACEHOLDERS[field]}
                    />
                  ) : <Locked need="an activity" />}
                </td>
              ))}
              {editable && (
                <td style={td}>
                  {/* C12 to C16. Park is the press that needs no thought, and
                      delete is behind one more press and a confirmation. */}
                  <RowActions
                    clientId={clientId}
                    activityId={r.id}
                    label={r.activity || 'this activity'}
                    onDone={onReload}
                  />
                </td>
              )}
            </tr>
            {/* ─────────────────────────────────────────────────────
                THE ADD BELONGS TO THE GROUP IT ADDS TO. 14 August 2026.

                One "+ add" at the foot of the whole table could only ever add
                to whatever happened to be last. To add a problem to a service
                sitting at the TOP of a long list you had to scroll past every
                other service to reach a button that then added to the wrong
                one, and the page jumped to the bottom doing it.

                So each group closes with its own adds, in its own columns: the
                end of a PROBLEM's activities offers "+ add" under Activity and
                adds to THAT problem, and the end of a SERVICE's rows offers
                "+ add" under Problem and adds to THAT service. Neither moves
                the page.
                ───────────────────────────────────────────────────── */}
            {editable && r.problem_id && endOfProblem(rows, i) ? (
              <tr key={`${r.id}-a`}>
                <td style={td} colSpan={3} />
                <td style={td}>
                  <button type="button" style={addLine} onClick={() => onAdd(r.problem_id, r.service_id)}>+ add</button>
                </td>
                <td style={td} colSpan={4} />
              </tr>
            ) : null}
            {editable && r.service_id && endOfService(rows, i) ? (
              <tr key={`${r.id}-p`}>
                <td style={td} colSpan={2} />
                <td style={td}>
                  <button type="button" style={addLine} onClick={() => onAddProblem(r.service_id)}>+ add</button>
                </td>
                <td style={td} colSpan={5} />
              </tr>
            ) : null}
            </React.Fragment>
          ))}
          {editable ? (
            <tr>
              <td style={td} />
              <td style={td}>
                <button type="button" style={addLine} onClick={onAddService}>+ add</button>
              </td>
              <td style={td} colSpan={6} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

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

/**
 * A TOOL, WITH ITS OWN COUNT, THAT FOLDS AWAY. 14 August 2026.
 *
 * TWO THINGS CHANGED HERE, both to cut what a facilitator has to hold in their
 * head while a room is waiting.
 *
 * THE COUNT IS PER TOOL. There was one strip above all five tools, mixing
 * Tool 1's activities with Tool 5's decisions. That is not what the counter is
 * for: it exists so the facilitator can compare what is on this tool's screen
 * with what the room has just sent to this tool's question. Mixed together it
 * can answer neither. Each tool now carries its own count on its own heading.
 *
 * THE TOOLS FOLD. All five drew at once, so Tool 1's work sat above four
 * hundred lines of tools that are not in play. A tool you are not running folds
 * to its heading. The fold is remembered per engagement through useCollapse,
 * the same mechanism every other group on this page already uses, so it
 * survives the reload that a timed-out session forces.
 *
 * OPEN IS THE DEFAULT. Nothing hides itself the first time somebody looks.
 */
function Section({ number, title, question, purposeText, children, right, count, collapsed, onToggle }) {
  return (
    <section style={card}>
      <div style={cardHead}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          style={{
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
            textAlign: 'left', color: 'inherit', font: 'inherit', flex: 1, minWidth: 0,
          }}
        >
          <div style={toolNo}>
            Tool {number}
            <span style={{ marginLeft: '0.5rem' }}>{collapsed ? '▸' : '▾'}</span>
          </div>
          <div style={toolTitle}>{title}</div>
          {count ? (
            <div style={{ ...toolNo, marginTop: '0.25rem', opacity: 0.85 }}>{count}</div>
          ) : null}
        </button>
        {right || null}
      </div>
      {collapsed ? null : (
        <div style={cardBody}>
          <div style={purpose}>
            <em style={{ color: C.navy }}>{question}</em>
            <br />
            {purposeText}
          </div>
          {children}
        </div>
      )}
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
   * A ROW STILL COMPLETELY EMPTY WHEN YOU LEAVE IT REMOVES ITSELF.
   * 14 August 2026.
   *
   * Pressing "+ add" and then thinking better of it left a row behind. Repeated
   * over a week that produced 18 empty problems, 2 empty services and an empty
   * activity on staging, every one of them counted in the totals above the
   * tools — which is how a counter that is supposed to be compared against the
   * room stops meaning anything.
   *
   * THE RULE, as agreed:
   *   - A blank row is legitimate for a few seconds. You press add, then type.
   *     Deleting on creation would make adding impossible.
   *   - It is never legitimate once you have moved on, so leaving a row with
   *     every column still empty removes it. No warning and no confirmation: it
   *     was never anything, and asking about nothing is its own kind of noise.
   *   - A row with SOME columns filled is work in progress, not a blank. It
   *     stays. This is the exception that stops the rule eating real typing.
   *
   * Checked against the values table too, so an activity whose only content is
   * a second "who pays" is not mistaken for empty.
   */
  const ACTIVITY_TEXT_FIELDS = ['activity', 'delivers', 'who_pays', 'assumption', 'disproof']

  const dropIfBlank = useCallback(async (row) => {
    if (!row?.id) return
    const hasText = ACTIVITY_TEXT_FIELDS.some((f) => String(row[f] || '').trim() !== '')
    if (hasText) return
    const hasValue = (anchor.activityValues || [])
      .some((v) => v.activity_id === row.id && String(v.value || '').trim() !== '')
    if (hasValue) return
    // The only row of a service is what makes that service visible at all, so
    // it stays even when empty. Removing it would hide the service and the
    // "+ add" that belongs to it.
    const onlyRowOfItsService = row.service_id
      && assumptions.filter((a) => a.service_id === row.service_id).length <= 1
    if (onlyRowOfItsService) return
    // A row that is under a problem is still nothing if it says nothing; the
    // parent is not content, it is only where the empty row was created.
    const { error } = await supabase.from('gtcv_assumptions')
      .delete().eq('id', row.id).eq('client_id', clientId)
    if (error) return
    setAssumptions((prev) => prev.filter((a) => a.id !== row.id))
    reload()
  }, [anchor.activityValues, assumptions, clientId, reload])

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
  const addActivity = useCallback(async (problemId = null, serviceId = null) => {
    const target = serviceId
      || anchoredService?.id
      || null
    if (!target) {
      setSaveState('error')
      setSaveMessage('Add a service first. An activity belongs to a service, so nothing was created.')
      return
    }
    setSaveState('saving')
    setSaveMessage(null)
    const svc = (anchor.services || []).find((x) => x.id === target) || null
    const { data, error } = await supabase.from('gtcv_assumptions').insert([{
      client_id: clientId,
      sort_order: assumptions.length,
      service_id: target,
      // 14 August. The activity solves a problem, and is filed under the one
      // whose "+ add" was pressed.
      problem_id: problemId,
      service_name: svc?.service_name || null,
    }]).select().single()
    if (error) { setSaveState('error'); setSaveMessage(error.message); return }
    // NO reload() HERE. 14 August 2026. It re-read the whole engagement and
    // remounted all five tools, so pressing "+ add" threw the page around —
    // worse than the refresh it replaced, which is exactly how Habib described
    // it. The one new row is known, so it is added in place and nothing else
    // on the page moves.
    setAssumptions((prev) => [...prev, data])
    setSaveState('saved')
    return data
  }, [anchoredService, anchor.services, clientId, assumptions.length])

  /** Naming a service from its own row, applied in place so nothing redraws. */
  const renameService = useCallback(async (serviceId, name) => {
    if (!serviceId) return
    setSaveState('saving')
    const { error } = await supabase.from('gtcv_service_inventory')
      .update({ service_name: name, updated_at: new Date().toISOString() })
      .eq('id', serviceId).eq('client_id', clientId)
    if (error) { setSaveState('error'); setSaveMessage(error.message); return }
    setAnchor((prev) => ({
      ...prev,
      services: (prev.services || []).map((x) => (x.id === serviceId ? { ...x, service_name: name } : x)),
    }))
    setAssumptions((prev) => prev.map((a) => (a.service_id === serviceId ? { ...a, service_name: name } : a)))
    setSaveState('saved')
  }, [clientId])

  /**
   * A SERVICE IS ADDED FROM THE TABLE, LIKE EVERYTHING ELSE. 14 August 2026.
   *
   * There was a separate "Add a service" button above the table, and a service
   * created there did not appear in the table at all — the table was built from
   * ACTIVITIES, so a service with none had no row to be seen on. A control that
   * adds something invisible is worse than no control.
   *
   * So: "+ add" under the Service column, the same shape and the same gesture
   * as every other add, and the new service arrives carrying one empty row so
   * there is somewhere to state its first problem.
   */
  const addService = useCallback(async () => {
    setSaveState('saving')
    setSaveMessage(null)
    const { data: svc, error } = await supabase.from('gtcv_service_inventory')
      .insert([{ client_id: clientId, sort_order: (anchor.services || []).length }])
      .select().single()
    if (error) { setSaveState('error'); setSaveMessage(error.message); return }
    const { data: row, error: rErr } = await supabase.from('gtcv_assumptions')
      .insert([{ client_id: clientId, service_id: svc.id, sort_order: assumptions.length }])
      .select().single()
    if (rErr) { setSaveState('error'); setSaveMessage(rErr.message); return }
    setAnchor((prev) => ({ ...prev, services: [...(prev.services || []), svc] }))
    setAssumptions((prev) => [...prev, row])
    setSaveState('saved')
  }, [clientId, anchor.services, assumptions.length])

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

  /**
   * THE PROBLEMS THIS SERVICE SOLVES. 14 August 2026.
   *
   * The session works through what problem each service solves and only then
   * the activity that solves it, so the problem is a frame inside the service
   * and not a cell on an activity's row. A problem that names no service is not
   * shown here: it belongs to no service yet and is reachable in Parked, the
   * same rule every other row in this workspace follows.
   */
  const problemsOfAnchored = useMemo(
    () => (anchoredService
      ? (anchor.problems || []).filter((p) => p.service_id === anchoredService.id && !p.parked_at)
      : []),
    [anchor.problems, anchoredService],
  )

  /** The activities that solve one of those problems. */
  const activitiesForProblem = useCallback(
    (problemId) => activitiesOfAnchored.filter((a) => a.problem_id === problemId),
    [activitiesOfAnchored],
  )

  /**
   * Activities under the service but under no problem. Shown rather than
   * hidden: an activity stated before anybody named the problem is real work,
   * and dropping it out of the table is how the room stops trusting the screen.
   */
  const unattachedActivities = useMemo(
    () => activitiesOfAnchored.filter((a) => !a.problem_id),
    [activitiesOfAnchored],
  )

  /**
   * EVERY ACTIVITY ON THE ENGAGEMENT, ordered so the table reads as a list of
   * services. An organisation has many services and the session works through
   * all of them, so Tool 1 shows all of them and you scroll rather than switch.
   * Parked rows stay out: they have their own area and their own reason.
   */
  const allActivities = useMemo(() => {
    const order = new Map((anchor.services || []).map((s, i) => [s.id, i]))
    return assumptions
      .filter((a) => !a.parked_at)
      .slice()
      .sort((a, b) => {
        const sa = order.has(a.service_id) ? order.get(a.service_id) : 9999
        const sb = order.has(b.service_id) ? order.get(b.service_id) : 9999
        if (sa !== sb) return sa - sb
        // Activities solving the same problem sit together, so the problem
        // column reads as one block rather than repeating in and out.
        const pa = a.problem_id || ''
        const pb = b.problem_id || ''
        if (pa !== pb) return pa < pb ? -1 : 1
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      })
  }, [assumptions, anchor.services])

  /**
   * "RUN THIS WITH THE ROOM", ON EVERY TOOL HEADING. 14 August 2026.
   *
   * It opens the projected view for the question being run, and a question
   * always belongs to a tool. On Tool 1 alone it read as if only Tool 1 could
   * be run with a room, which is the opposite of true — every tool is run with
   * the room, in order. One element, built once, placed on all five.
   */
  const runWithRoom = useMemo(() => (
    <button
      type="button"
      onClick={() => window.open(
        `/coach/facilitate?clientId=${encodeURIComponent(clientId)}&gateId=phase_0`,
        '_blank',
        'noopener',
      )}
      style={runWithRoomButton}
    >Run this with the room</button>
  ), [clientId])

  /**
   * Putting a row into a service, from the row itself. Habib's report was that
   * the Service column could not be edited while rows sat there with no service
   * at all and no way to give them one — the column named the anchor and
   * offered no way to set it. Changing the service clears the problem, because
   * a problem belongs to a service and carrying it across would attach this row
   * to a problem of a service it is no longer in.
   */
  const setRowService = useCallback(async (row, serviceId) => {
    setSaveState('saving')
    setSaveMessage(null)
    const svc = (anchor.services || []).find((x) => x.id === serviceId) || null
    const patch = {
      service_id: serviceId,
      service_name: svc?.service_name || null,
      problem_id: serviceId === row.service_id ? row.problem_id : null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('gtcv_assumptions')
      .update(patch).eq('id', row.id).eq('client_id', clientId)
    if (error) { setSaveState('error'); setSaveMessage(error.message); return }
    setSaveState('saved')
    // Applied in place for the same reason as above: the row moves into its
    // service and the Problem cell beside it opens, with nothing else redrawn.
    setAssumptions((prev) => prev.map((a) => (a.id === row.id ? { ...a, ...patch } : a)))
  }, [anchor.services, clientId])

  /** The service a row belongs to, by name. Read only: renaming happens above. */
  const serviceNameFor = useCallback(
    (row) => (anchor.services || []).find((s) => s.id === row.service_id)?.service_name || '',
    [anchor.services],
  )

  /** The problem a row solves, as text. Empty where none has been stated. */
  const problemTextFor = useCallback(
    (row) => (anchor.problems || []).find((p) => p.id === row.problem_id)?.problem || '',
    [anchor.problems],
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

  /**
   * Typing in the Problem column. Where the row already solves a problem the
   * text of THAT problem changes — one row, read by Tool 1 and Tool 2, never
   * two copies. Where it does not, a problem is created under the row's service
   * and the row is attached to it in the same press, because asking somebody to
   * create a problem and then attach it is two steps for one thought.
   */
  const setProblemText = useCallback(async (row, text) => {
    setSaveState('saving')
    setSaveMessage(null)
    if (row.problem_id) {
      await hierarchyAction({ action: 'edit', id: row.problem_id, field: 'problem', value: text })
      return
    }
    if (!row.service_id) {
      setSaveState('error')
      setSaveMessage('This activity has no service yet, and a problem belongs to a service. Nothing was created.')
      return
    }
    try {
      const res = await authedFetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, action: 'addProblem', serviceId: row.service_id, name: text }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.id) {
        setSaveState('error')
        setSaveMessage(json?.error || 'That did not go through.')
        return
      }
      const { error } = await supabase.from('gtcv_assumptions')
        .update({ problem_id: json.id, updated_at: new Date().toISOString() })
        .eq('id', row.id).eq('client_id', clientId)
      if (error) { setSaveState('error'); setSaveMessage(error.message); return }
      setSaveState('saved')

      // NO FULL RELOAD HERE. 14 August 2026. reload() re-reads the whole
      // engagement and remounts every tool, which on screen is the page closing
      // and reopening — Habib's word for it was jarring, and he is right: you
      // type a problem and the screen you were reading is thrown away and
      // rebuilt. The two things that changed are known exactly, so they are
      // applied in place and the Activity cell beside the one you just typed in
      // unlocks without anything else moving.
      setAnchor((prev) => ({
        ...prev,
        problems: [...(prev.problems || []), { id: json.id, problem: text, service_id: row.service_id }],
      }))
      setAssumptions((prev) => prev.map((a) => (a.id === row.id ? { ...a, problem_id: json.id } : a)))
    } catch {
      setSaveState('error')
      setSaveMessage('Could not reach the server. Nothing was changed.')
    }
  }, [clientId, hierarchyAction, reload])

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
        count={`${allActivities.length} activit${allActivities.length === 1 ? 'y' : 'ies'} · ${(anchor.problems || []).length} problem${(anchor.problems || []).length === 1 ? '' : 's'}`}
        collapsed={fold.is('tool', 'tool1')}
        onToggle={() => fold.toggle('tool', 'tool1')}
        title="Assumption Dump Canvas"
        question="What are we already doing, and what has to be true for it to work?"
        purposeText="List every activity the organisation runs, and the service it sits under. An organisation sells several services and each is a portfolio of activities, so naming the service is what lets this be read back as what we actually do for gender advisory. For each activity, name what it delivers, who pays for it today, the assumption sitting underneath it, and what evidence would prove that assumption wrong."
        right={runWithRoom}
      >
        {/* THE ROOM CONTROLS, AGAINST THE TOOL THEY RUN. 14 August 2026.
            They used to float above the whole block, which said nothing about
            which tool the open question belonged to — and the question is
            always a question of one tool. Here, directly under Tool 1's
            heading, the question on the wall and the table it fills are
            visibly the same piece of work. */}
        <RoomControlBar clientId={clientId} dpId="phase_0" canManage={editable} />

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

        {/* ─────────────────────────────────────────────────────
            ONE TABLE, EVERY SERVICE, SCROLLABLE. 14 August 2026.

            The service and the problem were bands above the rows they
            governed. Habib's words for it: confusing, cluttered, and you
            could not scroll one table and read every service with everything
            related to it. So they are COLUMNS, like every other field, and
            this table now lists the whole engagement rather than the one
            anchored service — an organisation has many services and the
            session works through all of them.

            The anchored service is still marked, because the room's question
            is asked about one service at a time, but it no longer decides
            what you can see.
            ───────────────────────────────────────────────────── */}
        {allActivities.length === 0 && (anchor.services || []).length === 0 ? (
          <div style={emptyNote}>
            No services yet. Add one in the bar above, and its problems and activities appear here.
          </div>
        ) : (
          <ActivityTable
            rows={allActivities}
            editable={editable}
            anchor={anchor}
            clientId={clientId}
            selected={selectedForService}
            onToggle={toggleSelected}
            onEditActivity={updAssumption}
            onEditProblem={setProblemText}
            serviceNameFor={serviceNameFor}
            problemTextFor={problemTextFor}
            onAction={hierarchyAction}
            onReload={reload}
            onAdd={() => addActivity(null)}
            onLeaveRow={dropIfBlank}
            onSetService={setRowService}
            onAddProblem={(serviceId) => addActivity(null, serviceId)}
            onAddService={addService}
            onRenameService={renameService}
          />
        )}
        {/* ─────────────────────────────────────────────────────────
            WHAT THE ROOM SENT, DIRECTLY UNDER THE TABLE IT GOES INTO.
            14 August 2026.

            R20 requires pending answers beneath the block's own table and says
            in terms that it FAILS if they land in a separate list somewhere
            else. They were rendered by BlockWorkspace after this whole
            component — and this component is all five tools, roughly five
            hundred lines of interface. So the answers, and the Accept button
            with them, sat at the very bottom of the page, below Tool 5, four
            tools away from the table they belong to.

            Habib reported it as "there is no accept button anywhere". From
            where he was working there was not one.

            It belongs here: immediately under Tool 1's table, which is the
            table every collect answer in this block writes into — the activity
            and what it delivers, and the assumption and what would disprove
            it, are all columns of the rows above.
            ───────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 12 }}>
          <PendingRows clientId={clientId} dpId="phase_0" canManage={editable} />
        </div>
      </Section>

      {/* ─── TOOL 2: Problem Owner Budget Matrix ────────────── */}
      <Section
        number={2}
        count={`${owners.length} problem${owners.length === 1 ? '' : 's'}`}
        collapsed={fold.is('tool', 'tool2')}
        onToggle={() => fold.toggle('tool', 'tool2')}
        title="Problem Owner Budget Matrix"
        question="Who has this problem, and who controls the money to fix it?"
        purposeText="For each problem implied by the activity above, name who experiences it, who is accountable for it, who controls the budget, what it costs them not to solve it, and the mechanism through which money would actually be released."
        right={<HeadingControls>{editable ? <button type="button" style={addButton} onClick={addOwner}>+ Add problem</button> : null}{runWithRoom}</HeadingControls>}
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
        count={`${hypotheses.length} hypothes${hypotheses.length === 1 ? 'is' : 'es'}`}
        collapsed={fold.is('tool', 'tool3')}
        onToggle={() => fold.toggle('tool', 'tool3')}
        title="Hypothesis Shortlist Board"
        question="Which of these are worth testing, and which are we carrying out of habit?"
        purposeText="Score each emerging hypothesis 1 to 5 on Urgency, Ownership clarity, Willingness to pay and Access. The total is out of 20. Only the top 3 to 5 advance out of Phase 0."
        right={<HeadingControls>{editable ? <button type="button" style={addButton} onClick={addHypothesis}>+ Add hypothesis</button> : null}{runWithRoom}</HeadingControls>}
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
        count={`${signals.length} statement${signals.length === 1 ? '' : 's'}`}
        collapsed={fold.is('tool', 'tool4')}
        onToggle={() => fold.toggle('tool', 'tool4')}
        title="Signal vs Story Board"
        question="What did we actually see, and what are we telling ourselves?"
        purposeText="Split each statement in two. A signal is something observed: a behaviour, a payment, a refusal, a document. A story is believed but not observed. Only signals may carry weight in a hypothesis."
        right={<HeadingControls>{editable ? <button type="button" style={addButton} onClick={addSignal}>+ Add item</button> : null}{runWithRoom}</HeadingControls>}
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
        count={`${decisions.length} activit${decisions.length === 1 ? 'y' : 'ies'}`}
        collapsed={fold.is('tool', 'tool5')}
        onToggle={() => fold.toggle('tool', 'tool5')}
        title="Continue / Pause / Kill Table"
        question="What continues, what pauses, and what stops here?"
        purposeText="Every activity must land somewhere. Give each one a decision, a one sentence rationale, and the decision point it travels to next. An activity with no landing is unfinished Phase 0 work."
        right={<HeadingControls>{editable ? <button type="button" style={addButton} onClick={addDecision}>+ Add activity</button> : null}{runWithRoom}</HeadingControls>}
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
