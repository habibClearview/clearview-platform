'use client'
// ============================================================
// WHAT THE ROOM SENT, WAITING TO BECOME ROWS  (R20 to R23)
//
// R20 says answers to a collect question arrive as pending rows in the block's
// own table, beneath the existing rows and visibly marked as pending, and that
// it FAILS if they land in a separate list requiring manual copying. So this
// sits directly beneath the block's tables, and every row here becomes a real
// row in one press with nothing retyped.
//
// WHY THEY ARE HELD SEPARATELY UNTIL ACCEPTED. The block tables are the
// engagement's working record, and Section 4 protects them. Twenty phones
// writing straight into them would mean the record could not be told apart
// from the noise of a workshop, and a wrong answer would already be in the
// evidence. Held here, the facilitator's press is what puts it in — which is
// the same one press R21 asks for, and no retyping either way.
//
// R22. Answers that match once capitals, punctuation and extra spaces are set
// aside are shown as ONE row with a count and the contributors. Anything
// looser is offered as a suggestion the facilitator confirms, never applied on
// its own, because a wrong merge destroys a distinct activity and nobody
// notices, while a missed merge costs one click.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import { GUEST_LABEL } from '@/lib/stage2-personal-links'
import {
  groupCollectSubmissions,
  suggestMerges,
  type GroupedSubmission,
  type Question,
  type Submission,
} from '@/lib/stage1-questions'

const C = {
  navy: '#1B2A41',
  slate: '#4C5A6B',
  border: 'rgba(27,42,65,.16)',
  amber: '#D98C1F',
  teal: '#2A9D8F',
  red: '#C0392B',
  tint: '#FBF7EE',
}

const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' }
const sans = "'Segoe UI',system-ui,sans-serif"

export default function PendingRows({
  clientId, dpId, canManage,
}: { clientId: string; dpId: string; canManage: boolean }) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [pending, setPending] = useState<Submission[]>([])
  const [rows, setRows] = useState<{ id: string; label: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [openDistribution, setOpenDistribution] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!clientId || !dpId || !canManage) return
    try {
      const res = await authedFetch(
        `/api/facilitate?clientId=${encodeURIComponent(clientId)}&gateId=${encodeURIComponent(dpId)}`,
        { cache: 'no-store' },
      )
      if (!res.ok) return
      const json = await res.json()
      setQuestions(json.questions || [])
      setPending(json.pending || [])
      setRows(json.blockRows || [])
    } catch {
      // Nothing arrives, nothing changes on screen. R29: this window and the
      // Facilitator View each keep themselves current, so neither stops
      // updating because the other is being used.
    }
  }, [clientId, dpId, canManage])

  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [load])

  const act = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true); setErr(null)
    try {
      const res = await authedFetch('/api/facilitate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, gateId: dpId, ...payload }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setErr(json?.error || 'That did not go through.')
      }
      await load()
    } catch {
      setErr('Could not reach the server. Nothing was changed.')
    }
    setBusy(false)
  }, [clientId, dpId, load])

  if (!canManage) return null

  const collect = questions.filter((q) => q.question_type === 'collect')
  const decided = questions.filter((q) => q.question_type !== 'collect' && q.agreed_value)
  const anyPending = pending.length > 0

  if (!anyPending && decided.length === 0) return null

  return (
    <section style={{ fontFamily: sans }}>
      {anyPending ? (
        <>
          <div style={{
            ...mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
            color: C.amber, marginBottom: 8,
          }}>Pending — sent by the room, not yet in the table</div>

          {collect.map((q) => {
            const mine = pending.filter((s) => s.question_id === q.id)
            if (mine.length === 0) return null
            const groups = groupCollectSubmissions(mine, q.target_fields || [])
            const suggestions = suggestMerges(groups, q.target_fields || [])
            return (
              <div key={q.id} style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 13.5, color: C.slate, margin: '0 0 8px' }}>{q.question_text}</p>
                {groups.map((g, i) => (
                  <PendingRow
                    key={i}
                    group={g}
                    question={q}
                    rows={rows}
                    busy={busy}
                    suggestion={suggestions.find((s) => s.mergeIndex === i)
                      ? groups[suggestions.find((s) => s.mergeIndex === i)!.keepIndex]
                      : null}
                    onAccept={() => act({ action: 'accept', submissionIds: g.submissions.map((s) => s.id) })}
                    onMerge={(into) => act({ action: 'merge', submissionIds: g.submissions.map((s) => s.id), intoRowId: into })}
                    onDiscard={() => act({ action: 'discard', submissionIds: g.submissions.map((s) => s.id) })}
                  />
                ))}
              </div>
            )
          })}
        </>
      ) : null}

      {/* R23. The agreed value, and the distribution behind it, kept and
          reachable by pressing the value rather than thrown away at reveal. */}
      {decided.map((q) => (
        <div key={q.id} style={{
          border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px',
          marginBottom: 8, background: '#FFFFFF',
        }}>
          <p style={{ fontSize: 13.5, color: C.slate, margin: '0 0 6px' }}>{q.question_text}</p>
          <button
            type="button"
            onClick={() => setOpenDistribution(openDistribution === q.id ? null : q.id)}
            style={{
              ...mono, fontSize: 15, fontWeight: 700, color: C.navy, background: 'transparent',
              border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
            }}
          >{q.agreed_value}</button>
          <span style={{ fontSize: 12, color: C.slate, marginLeft: 8 }}>
            agreed by the room — press to see how they answered
          </span>
          {openDistribution === q.id ? <Distribution snapshot={q.agreed_distribution} /> : null}
        </div>
      ))}

      {err ? <p role="alert" style={{ color: C.red, fontSize: 13.5, margin: '8px 0 0' }}>{err}</p> : null}
    </section>
  )
}

function PendingRow({
  group, question, rows, busy, suggestion, onAccept, onMerge, onDiscard,
}: {
  group: GroupedSubmission
  question: Question
  rows: { id: string; label: string }[]
  busy: boolean
  suggestion: GroupedSubmission | null
  onAccept: () => void
  onMerge: (into: string) => void
  onDiscard: () => void
}) {
  const [mergeInto, setMergeInto] = useState('')
  const first = (question.target_fields || [])[0]
  const headline = first ? (group.display?.[first.column] || '') : ''

  return (
    <div style={{
      border: `1px dashed ${C.amber}`, borderRadius: 10, padding: '10px 12px',
      marginBottom: 8, background: C.tint,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: '14rem', flex: 1 }}>
          {(question.target_fields || []).map((f) => (
            group.display?.[f.column] ? (
              <div key={f.column} style={{ fontSize: 14, color: C.navy, lineHeight: 1.45 }}>
                <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: C.slate, marginRight: 6 }}>
                  {f.heading}
                </span>
                {/* Drawn as text. React escapes a string, so a submitted script
                    tag appears as the characters somebody typed and never runs. */}
                {group.display[f.column]}
              </div>
            ) : null
          ))}
          {/* R22, in the words the specification gives: "Farmer training,
              submitted by 4". The names appear only where the question is
              named; on an anonymous one there are none to show. */}
          <div style={{ fontSize: 12.5, color: C.slate, marginTop: 4 }}>
            {headline ? `${headline}, submitted by ${group.count}` : `Submitted by ${group.count}`}
            {group.contributors.length > 0 ? ` — ${group.contributors.join(', ')}` : ''}
            {/* R38. "Guest" appears HERE AND NOWHERE ELSE. Never on the
                projector: a word beside somebody's answer in front of the room
                is a public statement that they are not one of us. It says a
                visitor sent this and never which visitor, so it cannot become
                a name on an anonymous question. */}
            {group.submissions.some((s) => s.is_guest) ? (
              <span style={{
                marginLeft: 6, padding: '1px 6px', borderRadius: 4,
                border: `1px solid ${C.border}`, fontSize: 11, color: C.slate,
              }}>{GUEST_LABEL}</span>
            ) : null}
          </div>
          {suggestion ? (
            <div style={{ fontSize: 12.5, color: C.amber, marginTop: 4 }}>
              Looks close to &ldquo;{first ? suggestion.display?.[first.column] : ''}&rdquo;. Merge only if they are the same thing.
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <button type="button" disabled={busy} onClick={onAccept} style={btn(C.teal)}>Accept</button>
          <select
            value={mergeInto}
            onChange={(e) => { setMergeInto(e.target.value); if (e.target.value) onMerge(e.target.value) }}
            disabled={busy || rows.length === 0}
            aria-label="Merge into an existing row"
            style={{ ...btn(C.slate), cursor: 'pointer' }}
          >
            <option value="">Merge into...</option>
            {rows.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={onDiscard} style={btn(C.red)}>Discard</button>
        </div>
      </div>
    </div>
  )
}

/** The counts as the room saw them at the reveal, kept rather than recomputed. */
function Distribution({ snapshot }: { snapshot: unknown }) {
  const s = snapshot as { kind?: string; rows?: { value?: number; option?: string; count: number }[] } | null
  const rows = s?.rows || []
  if (rows.length === 0) {
    return <p style={{ fontSize: 13, color: C.slate, margin: '8px 0 0' }}>No distribution was stored for this one.</p>
  }
  return (
    <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ textAlign: 'center', minWidth: '3rem' }}>
          <div style={{ ...mono, fontSize: 18, color: C.navy }}>{r.count}</div>
          <div style={{ fontSize: 12.5, color: C.slate }}>{s?.kind === 'score' ? r.value : r.option}</div>
        </div>
      ))}
    </div>
  )
}

function btn(colour: string): React.CSSProperties {
  return {
    ...mono, fontSize: 12.5, padding: '5px 10px', borderRadius: 6,
    border: `1px solid ${colour}`, background: 'transparent', color: colour,
    cursor: 'pointer',
  }
}
