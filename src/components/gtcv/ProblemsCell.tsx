'use client'
// ============================================================
// "PROBLEM IT SOLVES"  (C20, C21, C22, C25, C27)
//
// THIS CELL IS THE CARRY FORWARD. It does not hold text of its own. Every
// problem shown here IS a row in gtcv_problem_owner_budget — the table Tool 2
// draws — from the moment it is typed.
//
// That is what makes C25 and C27 true rather than approximately true. C25 says
// a problem stated here appears in Tool 2 with nothing retyped, and C27 says
// editing it here changes it there. Both are automatic when there is ONE row
// read by two tools, and both are a synchronisation problem when there are two
// copies. Two copies kept in step is a thing that works until the day it does
// not, and that day is in front of a room.
//
// C20: this column is ADDED. "What it delivers" keeps its heading and its
// meaning and is not touched. They are different questions — what the buyer
// receives, and what it is for.
//
// C21: an activity may have more than one problem, so this is a list with a
// way to add another, not a box.
//
// C22: an activity with none says so, in words, rather than showing an empty
// cell that looks like something nobody has got to yet.
// ============================================================
import { useState } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import { NO_PROBLEM_STATED, type Problem } from '@/lib/service-anchor'

const C = {
  navy: '#1B2A41', slate: '#4C5A6B', border: 'rgba(27,42,65,.16)',
  amber: '#D98C1F', card: '#FFFFFF', red: '#C0392B',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }

export default function ProblemsCell({
  clientId, activityId, problems, canManage, onChanged,
}: {
  clientId: string
  activityId: string
  /** Every problem on the engagement; this cell picks out its own. */
  problems: Problem[]
  canManage: boolean
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const mine = problems.filter((p) => p.activity_id === activityId && !p.parked_at)

  const send = async (payload: Record<string, unknown>) => {
    setBusy(true)
    try {
      await authedFetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...payload }),
      })
      onChanged()
    } catch {
      /* The next read shows whether it landed. */
    }
    setBusy(false)
  }

  const add = () => {
    const text = draft.trim()
    if (!text) return
    setDraft(''); setAdding(false)
    // C25. Stating it here IS stating it in Tool 2. There is no second step
    // and no copy.
    send({ action: 'addProblem', activityId, name: text })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {mine.length === 0 && !adding ? (
        // C22. Its own visible state, in words, not an empty cell.
        <span style={{
          ...mono, fontSize: 11, color: C.amber, border: `1px dashed ${C.amber}`,
          borderRadius: 5, padding: '2px 6px', alignSelf: 'flex-start',
        }}>{NO_PROBLEM_STATED}</span>
      ) : null}

      {/* C21. More than one, each editable in place. C27: editing here changes
          the same row Tool 2 is showing, because it is the same row. */}
      {mine.map((p) => (
        <ProblemLine
          key={p.id}
          value={p.problem || ''}
          canManage={canManage}
          busy={busy}
          onCommit={(v) => send({ action: 'edit', id: p.id, field: 'problem', value: v })}
          onRemove={() => send({ action: 'remove', id: p.id })}
        />
      ))}

      {canManage ? (
        adding ? (
          <form onSubmit={(e) => { e.preventDefault(); add() }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={add}
              placeholder="The problem it solves"
              aria-label="The problem it solves"
              autoFocus
              style={box}
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            style={{
              ...mono, fontSize: 11, color: C.slate, background: 'transparent',
              border: 'none', padding: 0, cursor: 'pointer', alignSelf: 'flex-start',
            }}
          >{mine.length === 0 ? '+ state the problem' : '+ another problem'}</button>
        )
      ) : null}
    </div>
  )
}

/** One problem. Committed on leaving the box, like every other cell here. */
function ProblemLine({
  value, canManage, busy, onCommit, onRemove,
}: {
  value: string
  canManage: boolean
  busy: boolean
  onCommit: (v: string) => void
  onRemove: () => void
}) {
  const [text, setText] = useState(value)
  const [editing, setEditing] = useState(false)

  if (!canManage) return <span style={{ fontSize: 13, color: C.navy }}>{value}</span>

  return (
    <span style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
      {editing ? (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => { setEditing(false); if (text !== value) onCommit(text) }}
          autoFocus
          style={box}
        />
      ) : (
        <button
          type="button"
          onClick={() => { setText(value); setEditing(true) }}
          style={{
            flex: 1, textAlign: 'left', fontSize: 13, color: C.navy,
            background: 'transparent', border: 'none', padding: '1px 0', cursor: 'text',
          }}
        >{value || <span style={{ color: C.slate }}>Empty</span>}</button>
      )}
      {/* A problem is removed from the activity it belongs to. It does not move
          between services, because it has no service of its own — it travels
          with its activity, which is what stops a move stranding it. */}
      <button
        type="button"
        disabled={busy}
        onClick={onRemove}
        title="Park this problem. Nothing is lost."
        style={{
          ...mono, fontSize: 11, color: C.slate, background: 'transparent',
          border: 'none', cursor: 'pointer', padding: '1px 3px',
        }}
      >×</button>
    </span>
  )
}

const box: React.CSSProperties = {
  width: '100%', fontSize: 13, padding: '3px 5px', borderRadius: 5,
  border: `1px solid ${C.border}`, background: C.card, color: C.navy,
  fontFamily: "var(--cv-font)",
}
