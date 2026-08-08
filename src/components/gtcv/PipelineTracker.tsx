// @ts-nocheck
'use client'
// ============================================================
// DP05 PIPELINE TRACKER
//
// One row per prospect, moving through the five method stages in order:
// Identified, Contacted, Met, Proposal Sent, Closed. The stage strip above
// the table counts how many prospects sit at each stage and what they are
// worth, so a pipeline that is all Identified and no Met is visible at a
// glance rather than buried in the rows.
//
// The stage vocabulary is fixed by the method and by the check constraint on
// gtcv_pipeline.stage, so the counts are always reliable. Nothing here is
// specific to any client or currency: every value is data against a
// client_id, and the currency is per row.
//
// Table: gtcv_pipeline (2026_08_09_gtcv_dp_tables_c.sql).
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const TABLE = 'gtcv_pipeline'

// The five stages, in method order. Order matters: the strip reads left to
// right as the funnel, and progress is measured against the last stage.
const STAGES = [
  { value: 'identified', label: 'Identified', colour: 'var(--cv-slate)', hint: 'Named as a target. No contact made yet.' },
  { value: 'contacted', label: 'Contacted', colour: 'var(--cv-cyan)', hint: 'Outreach sent. Waiting on a reply.' },
  { value: 'met', label: 'Met', colour: 'var(--cv-teal)', hint: 'A real conversation has happened.' },
  { value: 'proposal_sent', label: 'Proposal Sent', colour: 'var(--cv-purple)', hint: 'A priced offer is with them.' },
  { value: 'closed', label: 'Closed', colour: 'var(--cv-green)', hint: 'Decided, one way or the other. Note which in the row.' },
]
const stageLabel = (v) => (STAGES.find((s) => s.value === v) || {}).label || '-'

// ─── design tokens (mirror the coach dashboard) ──────────────
const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', white: 'var(--cv-card)',
  slate: 'var(--cv-slate)', border: 'var(--cv-border)', teal: 'var(--cv-teal)',
  red: 'var(--cv-red)', green: 'var(--cv-green)', amber: 'var(--cv-amber)',
  purple: 'var(--cv-purple)', alt: 'var(--cv-alt)',
}
const card = { background: C.white, border: '1px solid var(--cv-border-soft)', borderRadius: 14, padding: '1.25rem 1.4rem', marginBottom: '1.1rem', boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)' }
const secH = { fontFamily: 'Georgia,serif', fontSize: '1.25rem', fontWeight: 700, color: C.navy, margin: 0 }
const hint = { fontSize: '0.9rem', color: C.slate, lineHeight: 1.45 }
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' }
const th = { ...mono, padding: '0.45rem 0.55rem', textAlign: 'left', fontSize: '0.76rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
const td = { padding: '0.35rem 0.55rem', verticalAlign: 'top', fontSize: '0.9rem', color: C.navy }
const inp = { width: '100%', padding: '0.34rem 0.5rem', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '0.9rem', fontFamily: 'inherit', background: 'var(--cv-bg-2)', color: C.navy, boxSizing: 'border-box' }
const btn = (col) => ({ ...mono, fontSize: '0.86rem', fontWeight: 600, padding: '0.4rem 0.85rem', border: `1px solid ${col}`, borderRadius: 7, background: 'transparent', color: col, cursor: 'pointer' })

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const today = () => new Date().toISOString().split('T')[0]
const fmtMoney = (n, cur) => `${cur || 'USD'} ${num(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

// Value by currency, so a mixed currency pipeline is reported honestly
// rather than added up into a number that means nothing.
function valueByCurrency(list) {
  const out = {}
  list.forEach((r) => {
    const v = num(r.value_estimate)
    if (!v) return
    const cur = r.value_currency || 'USD'
    out[cur] = (out[cur] || 0) + v
  })
  return out
}
const moneyLine = (byCur) => {
  const keys = Object.keys(byCur)
  if (!keys.length) return 'No value estimated'
  return keys.map((k) => fmtMoney(byCur[k], k)).join('  |  ')
}

function StageChip({ stage, count, byCur, share }) {
  return (
    <div style={{ background: C.white, borderRadius: 12, padding: '0.75rem 0.9rem', borderTop: `3px solid ${stage.colour}`, boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 26px var(--cv-shadow-2)', minWidth: 0 }}>
      <div style={{ ...mono, fontSize: '0.72rem', letterSpacing: '0.1em', color: C.slate, textTransform: 'uppercase' }}>{stage.label}</div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.7rem', fontWeight: 700, color: C.navy, lineHeight: 1.1 }}>{count}</div>
      <div style={{ ...hint, fontSize: '0.8rem' }}>{share}% of the pipeline</div>
      <div style={{ ...mono, fontSize: '0.76rem', color: C.slate, marginTop: '0.25rem', wordBreak: 'break-word' }}>{moneyLine(byCur)}</div>
    </div>
  )
}

export default function PipelineTracker({ clientId, canManage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [save, setSave] = useState(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    if (!clientId) { setRows([]); setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from(TABLE).select('*').eq('client_id', clientId)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      if (error) {
        // A failed read leaves what was on screen alone. Blanking the table
        // would say the pipeline is empty, which is a different and much worse
        // statement than saying the read failed.
        console.error('PipelineTracker: load failed', error)
        setSave({ ok: false, text: 'Could not load the pipeline. What you can see may be out of date.' })
        return
      }
      setSave(null)
      setRows(data || [])
    } catch (e) {
      console.error('PipelineTracker: load threw', e)
      setSave({ ok: false, text: 'Could not load the pipeline. What you can see may be out of date.' })
    } finally {
      // Runs on every path, so a rejected query cannot leave the panel stuck
      // on Loading forever.
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { load() }, [load])

  const stamp = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  function edit(id, field, value) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  async function commit(id, patch) {
    if (!canManage) return
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setSave({ ok: true, text: 'Saving' })
    const { error } = await supabase.from(TABLE)
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { setSave({ ok: false, text: `Could not save. ${error.message}. Nothing was lost, please try again.` }); return }
    setSave({ ok: true, text: `Saved at ${stamp()}` })
  }

  async function addRow() {
    if (!canManage || !clientId) return
    setBusy(true); setSave({ ok: true, text: 'Saving' })
    const nextOrder = rows.length ? Math.max(...rows.map((r) => Number(r.sort_order) || 0)) + 1 : 0
    const { data, error } = await supabase.from(TABLE).insert({
      client_id: clientId, sort_order: nextOrder, stage: 'identified', value_currency: 'USD',
    }).select().single()
    setBusy(false)
    if (error) { setSave({ ok: false, text: `Could not add a prospect. ${error.message}` }); return }
    setRows((rs) => [...rs, data])
    setSave({ ok: true, text: `Saved at ${stamp()}` })
  }

  async function removeRow(row) {
    if (!canManage) return
    const who = row.organisation || row.contact_name || 'this prospect'
    if (!window.confirm(`Delete ${who} from the pipeline? This cannot be undone.`)) return
    setBusy(true)
    const { error } = await supabase.from(TABLE).delete().eq('id', row.id)
    setBusy(false)
    if (error) { setSave({ ok: false, text: `Could not delete. ${error.message}` }); return }
    setRows((rs) => rs.filter((r) => r.id !== row.id))
    setSave({ ok: true, text: `Deleted at ${stamp()}` })
  }

  // Move a prospect one stage along. Faster than opening the select, and it
  // enforces the order rather than letting anyone skip a stage by accident.
  function advance(row) {
    const i = STAGES.findIndex((s) => s.value === row.stage)
    if (i < 0 || i >= STAGES.length - 1) return
    commit(row.id, { stage: STAGES[i + 1].value })
  }

  const summary = useMemo(() => STAGES.map((s) => {
    const list = rows.filter((r) => r.stage === s.value)
    return {
      stage: s,
      count: list.length,
      byCur: valueByCurrency(list),
      share: rows.length ? Math.round((list.length / rows.length) * 100) : 0,
    }
  }), [rows])

  const overdue = useMemo(
    () => rows.filter((r) => r.next_action_date && r.next_action_date < today() && r.stage !== 'closed').length,
    [rows],
  )

  const shown = filter === 'all' ? rows : rows.filter((r) => r.stage === filter)

  const textCell = (row, field, placeholder) => (
    canManage
      ? <input style={inp} value={row[field] || ''} placeholder={placeholder}
          onChange={(e) => edit(row.id, field, e.target.value)}
          onBlur={(e) => commit(row.id, { [field]: e.target.value || null })} />
      : <span>{row[field] || '-'}</span>
  )

  return (
    <div>
      <div style={{ ...card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h3 style={secH}>DP05 pipeline tracker</h3>
            <div style={{ ...hint, marginTop: '0.3rem', maxWidth: '64ch' }}>
              One line per prospect. Every prospect sits at one of five stages, in order:
              Identified, Contacted, Met, Proposal Sent, Closed. A prospect with no next action
              and no date is not in the pipeline, it is on a wish list.
            </div>
          </div>
          <div style={{ ...mono, fontSize: '0.82rem', color: save && save.ok === false ? C.red : C.slate, textAlign: 'right', minWidth: 140 }}>
            {save ? save.text : canManage ? 'All changes save as you type' : 'Read only'}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: '0.7rem', marginTop: '1rem' }}>
          {summary.map((s) => <StageChip key={s.stage.value} {...s} />)}
        </div>

        <div style={{ ...hint, marginTop: '0.75rem', display: 'flex', gap: '1.2rem', flexWrap: 'wrap' }}>
          <span><b style={{ color: C.navy }}>{rows.length}</b> prospects in total</span>
          <span>Whole pipeline worth <b style={{ color: C.navy }}>{moneyLine(valueByCurrency(rows))}</b></span>
          {overdue > 0 && <span style={{ color: C.amber, fontWeight: 700 }}>{overdue} next action{overdue === 1 ? '' : 's'} past due</span>}
        </div>
      </div>

      <div style={{ ...card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
          <h3 style={{ ...secH, fontSize: '1.1rem' }}>Prospects ({shown.length}{filter === 'all' ? '' : ` of ${rows.length}`})</h3>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={{ ...inp, width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All stages</option>
              {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {canManage && <button type="button" style={btn(C.cyan)} disabled={busy} onClick={addRow}>+ Add prospect</button>}
          </div>
        </div>

        {loading ? (
          <div style={hint}>Loading the pipeline.</div>
        ) : shown.length === 0 ? (
          <div style={hint}>
            {rows.length === 0
              ? `No prospects yet. ${canManage ? 'Add the first organisation you intend to approach.' : ''}`
              : 'No prospects at this stage.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1240 }}>
              <thead>
                <tr>
                  <th style={{ ...th, minWidth: 150 }}>Organisation</th>
                  <th style={{ ...th, minWidth: 130 }}>Contact</th>
                  <th style={{ ...th, minWidth: 130 }}>Role</th>
                  <th style={{ ...th, width: 150 }}>Stage</th>
                  <th style={{ ...th, width: 140 }}>Value estimate</th>
                  <th style={{ ...th, minWidth: 160 }}>Last action</th>
                  <th style={{ ...th, minWidth: 160 }}>Next action</th>
                  <th style={{ ...th, width: 140 }}>Next action date</th>
                  <th style={{ ...th, minWidth: 110 }}>Owner</th>
                  <th style={{ ...th, minWidth: 160 }}>Notes</th>
                  {canManage && <th style={{ ...th, width: 86 }} />}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const late = r.next_action_date && r.next_action_date < today() && r.stage !== 'closed'
                  const stage = STAGES.find((s) => s.value === r.stage) || STAGES[0]
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--cv-border-soft)' }}>
                      <td style={td}>{textCell(r, 'organisation', 'Organisation')}</td>
                      <td style={td}>{textCell(r, 'contact_name', 'Name')}</td>
                      <td style={td}>{textCell(r, 'contact_role', 'Their role')}</td>
                      <td style={td}>
                        {canManage
                          ? <select style={{ ...inp, borderLeft: `4px solid ${stage.colour}` }} value={r.stage || 'identified'}
                              onChange={(e) => commit(r.id, { stage: e.target.value })}>
                              {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          : <span style={{ ...mono, fontSize: '0.82rem', padding: '0.15rem 0.45rem', borderRadius: 4, background: stage.colour, color: 'var(--cv-on-accent)' }}>{stageLabel(r.stage)}</span>}
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          {canManage
                            ? <>
                                <input style={{ ...inp, width: 62 }} value={r.value_currency || ''} placeholder="USD"
                                  onChange={(e) => edit(r.id, 'value_currency', e.target.value)}
                                  onBlur={(e) => commit(r.id, { value_currency: e.target.value || null })} />
                                <input style={inp} type="number" value={r.value_estimate ?? ''} placeholder="0"
                                  onChange={(e) => edit(r.id, 'value_estimate', e.target.value)}
                                  onBlur={(e) => commit(r.id, { value_estimate: e.target.value === '' ? null : Number(e.target.value) })} />
                              </>
                            : <span style={mono}>{r.value_estimate === null || r.value_estimate === undefined ? '-' : fmtMoney(r.value_estimate, r.value_currency)}</span>}
                        </div>
                      </td>
                      <td style={td}>{textCell(r, 'last_action', 'What you did last')}</td>
                      <td style={td}>{textCell(r, 'next_action', 'What happens next')}</td>
                      <td style={td}>
                        {canManage
                          ? <input type="date" style={{ ...inp, ...(late ? { borderColor: C.amber } : {}) }} value={r.next_action_date || ''}
                              onChange={(e) => commit(r.id, { next_action_date: e.target.value || null })} />
                          : <span style={{ color: late ? C.amber : C.navy }}>{r.next_action_date || '-'}</span>}
                        {late && <div style={{ ...mono, fontSize: '0.72rem', color: C.amber, marginTop: '0.15rem' }}>Past due</div>}
                      </td>
                      <td style={td}>{textCell(r, 'owner', 'Who owns it')}</td>
                      <td style={td}>{textCell(r, 'notes', 'Notes')}</td>
                      {canManage && (
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {r.stage !== 'closed' && (
                            <button type="button" title="Move to the next stage" disabled={busy} onClick={() => advance(r)}
                              style={{ ...mono, border: 'none', background: 'transparent', color: C.cyan, cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.3rem' }}>&gt;</button>
                          )}
                          <button type="button" title="Delete this prospect" disabled={busy} onClick={() => removeRow(r)}
                            style={{ ...mono, border: 'none', background: 'transparent', color: C.red, cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.3rem' }}>x</button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ ...hint, marginTop: '0.8rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {STAGES.map((s) => (
            <span key={s.value}>
              <b style={{ color: C.navy }}>{s.label}.</b> {s.hint}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
