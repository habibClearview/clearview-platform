// @ts-nocheck
'use client'
// ============================================================
// DP05 A/B MESSAGE TESTING LOG
//
// One row per contact approached: who they are, which message variant they
// were sent, what came back, how good it was, the phrase they used, and
// whether a purchasing signal appeared.
//
// The method rule this encodes (GtCV handbook, DP05): a variant only wins
// when it pulls about 50 percent higher response than the other. So the
// component computes the response rate for each variant from the log and
// flags the winner automatically. Nothing is stored precomputed: the log is
// the single source of truth and the verdict is derived on every render.
//
// A response counts as any reply that came back, so 'yes' and 'partial'
// both count. 'no' does not. The quality score and the purchasing signal
// are reported alongside the rate so a high rate of weak replies cannot
// pass itself off as a win.
//
// Client agnostic: everything is data against a client_id. Reads and writes
// go through the browser Supabase client, so RLS scopes them to the viewer.
// Table: gtcv_ab_tests (2026_08_09_gtcv_dp_tables_c.sql).
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const TABLE = 'gtcv_ab_tests'

// The method threshold: the winner needs about 50 percent higher response.
const WIN_FACTOR = 1.5

const VARIANTS = ['A', 'B']
const RESPONSES = [
  { value: 'yes', label: 'Yes' },
  { value: 'partial', label: 'Partial' },
  { value: 'no', label: 'No' },
]
const SIGNALS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Unsure' },
]

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

const pct = (v) => (v === null ? 'n/a' : `${(v * 100).toFixed(0)}%`)
const today = () => new Date().toISOString().split('T')[0]

// A reply of any kind counts as a response. 'partial' is still contact.
const responded = (r) => r === 'yes' || r === 'partial'

function statsFor(rows, variant) {
  const sent = rows.filter((r) => r.variant === variant)
  const replies = sent.filter((r) => responded(r.response))
  const firm = sent.filter((r) => r.response === 'yes')
  const quality = replies.map((r) => Number(r.response_quality)).filter((n) => Number.isFinite(n) && n > 0)
  const buyers = sent.filter((r) => r.purchasing_signal === 'yes')
  return {
    variant,
    sent: sent.length,
    replies: replies.length,
    firm: firm.length,
    buyers: buyers.length,
    rate: sent.length ? replies.length / sent.length : null,
    avgQuality: quality.length ? quality.reduce((a, b) => a + b, 0) / quality.length : null,
  }
}

// The method verdict. A variant wins only when its response rate is at
// least WIN_FACTOR times the other one. Anything short of that is reported
// as a lead, not a win, and the shortfall is stated plainly.
function verdict(a, b) {
  if (!a.sent || !b.sent) {
    return { tone: C.slate, headline: 'Not comparable yet', detail: 'Both variants need to have been sent to at least one contact before a winner means anything.' }
  }
  if (a.rate === b.rate) {
    return { tone: C.slate, headline: 'No winner: the two variants are level', detail: `Both are responding at ${pct(a.rate)}. Keep sending, or rewrite one of them.` }
  }
  const lead = a.rate > b.rate ? a : b
  const trail = a.rate > b.rate ? b : a
  const clears = trail.rate === 0 ? lead.rate > 0 : lead.rate >= trail.rate * WIN_FACTOR
  const lift = trail.rate === 0 ? null : (lead.rate / trail.rate - 1) * 100
  if (clears) {
    return {
      tone: C.green,
      headline: `Variant ${lead.variant} wins`,
      detail: trail.rate === 0
        ? `Variant ${lead.variant} responds at ${pct(lead.rate)} against nothing at all from variant ${trail.variant}. Send variant ${lead.variant} from here.`
        : `Variant ${lead.variant} responds at ${pct(lead.rate)} against ${pct(trail.rate)}, which is ${lift.toFixed(0)} percent higher. The method asks for about 50 percent higher, so this clears it. Send variant ${lead.variant} from here.`,
    }
  }
  return {
    tone: C.amber,
    headline: `No winner yet: variant ${lead.variant} leads but not by enough`,
    detail: `Variant ${lead.variant} responds at ${pct(lead.rate)} against ${pct(trail.rate)}, which is ${lift === null ? '0' : lift.toFixed(0)} percent higher. The method asks for about 50 percent higher before you call it. Send more of both, or rewrite the weaker message.`,
  }
}

function StatCard({ s, winner }) {
  const accent = winner ? C.green : C.cyan
  return (
    <div style={{ background: C.white, borderRadius: 12, padding: '0.85rem 1rem', borderTop: `3px solid ${accent}`, boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 26px var(--cv-shadow-2)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <div style={{ ...mono, fontSize: '0.78rem', letterSpacing: '0.12em', color: C.slate, textTransform: 'uppercase' }}>Variant {s.variant}</div>
        {winner && <span style={{ ...mono, fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 4, background: C.green, color: 'var(--cv-on-accent)' }}>WINNER</span>}
      </div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.85rem', fontWeight: 700, color: C.navy, lineHeight: 1.1 }}>{pct(s.rate)}</div>
      <div style={{ ...hint, marginTop: '0.15rem' }}>{s.replies} replied of {s.sent} sent</div>
      <div style={{ ...hint, marginTop: '0.35rem' }}>
        {s.firm} firm yes, {s.buyers} with a purchasing signal
        <br />
        Average response quality {s.avgQuality === null ? 'n/a' : s.avgQuality.toFixed(1)} of 5
      </div>
    </div>
  )
}

export default function ABTestingLog({ clientId, canManage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [save, setSave] = useState(null)   // {ok, text}
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!clientId) { setRows([]); setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from(TABLE).select('*').eq('client_id', clientId)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      if (error) {
        // Keep what is on screen. Blanking the table would say the log is
        // empty, which is a different and worse claim than the read failing.
        console.error('ABTestingLog: load failed', error)
        setSave({ ok: false, text: 'Could not load the log. What you can see may be out of date.' })
        return
      }
      setSave(null)
      setRows(data || [])
    } catch (e) {
      console.error('ABTestingLog: load threw', e)
      setSave({ ok: false, text: 'Could not load the log. What you can see may be out of date.' })
    } finally {
      // Every path, so a thrown request cannot leave this on Loading forever.
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { load() }, [load])

  const stamp = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  // Local edit only. Nothing goes to the database until commit().
  function edit(id, field, value) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  // Write one or more fields of one row.
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
    // Alternate the variant so a log built by clicking add stays balanced.
    const nextVariant = rows.filter((r) => r.variant === 'A').length <= rows.filter((r) => r.variant === 'B').length ? 'A' : 'B'
    const { data, error } = await supabase.from(TABLE).insert({
      client_id: clientId, sort_order: nextOrder, variant: nextVariant,
      response: 'no', purchasing_signal: 'unsure', contact_date: today(),
    }).select().single()
    setBusy(false)
    if (error) { setSave({ ok: false, text: `Could not add a contact. ${error.message}` }); return }
    setRows((rs) => [...rs, data])
    setSave({ ok: true, text: `Saved at ${stamp()}` })
  }

  async function removeRow(row) {
    if (!canManage) return
    const who = row.contact_name || row.organisation || 'this contact'
    if (!window.confirm(`Delete the log line for ${who}? This cannot be undone.`)) return
    setBusy(true)
    const { error } = await supabase.from(TABLE).delete().eq('id', row.id)
    setBusy(false)
    if (error) { setSave({ ok: false, text: `Could not delete. ${error.message}` }); return }
    setRows((rs) => rs.filter((r) => r.id !== row.id))
    setSave({ ok: true, text: `Deleted at ${stamp()}` })
  }

  const a = useMemo(() => statsFor(rows, 'A'), [rows])
  const b = useMemo(() => statsFor(rows, 'B'), [rows])
  const v = useMemo(() => verdict(a, b), [a, b])
  const winner = v.headline.startsWith('Variant ') ? v.headline.split(' ')[1] : null

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
            <h3 style={secH}>DP05 A/B message testing log</h3>
            <div style={{ ...hint, marginTop: '0.3rem', maxWidth: '62ch' }}>
              One line per contact you approached. Record the variant you sent and what came back.
              A reply of any kind, full or partial, counts as a response. The winning message needs
              about 50 percent higher response than the other one before you commit to it.
            </div>
          </div>
          <div style={{ ...mono, fontSize: '0.82rem', color: save && save.ok === false ? C.red : C.slate, textAlign: 'right', minWidth: 140 }}>
            {save ? save.text : canManage ? 'All changes save as you type' : 'Read only'}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '0.8rem', marginTop: '1rem' }}>
          <StatCard s={a} winner={winner === 'A'} />
          <StatCard s={b} winner={winner === 'B'} />
        </div>

        <div style={{ marginTop: '0.9rem', borderLeft: `3px solid ${v.tone}`, background: C.alt, borderRadius: 8, padding: '0.75rem 0.95rem' }}>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.05rem', fontWeight: 700, color: v.tone }}>{v.headline}</div>
          <div style={{ ...hint, marginTop: '0.25rem' }}>{v.detail}</div>
        </div>
      </div>

      <div style={{ ...card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
          <h3 style={{ ...secH, fontSize: '1.1rem' }}>Contacts logged ({rows.length})</h3>
          {canManage && <button type="button" style={btn(C.cyan)} disabled={busy} onClick={addRow}>+ Add contact</button>}
        </div>

        {loading ? (
          <div style={hint}>Loading the log.</div>
        ) : rows.length === 0 ? (
          <div style={hint}>
            No contacts logged yet. {canManage ? 'Add the first contact you approached, and note which message they got.' : ''}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080 }}>
              <thead>
                <tr>
                  <th style={{ ...th, minWidth: 130 }}>Contact</th>
                  <th style={{ ...th, minWidth: 150 }}>Organisation</th>
                  <th style={{ ...th, width: 80 }}>Variant</th>
                  <th style={{ ...th, width: 100 }}>Response</th>
                  <th style={{ ...th, width: 90 }}>Quality</th>
                  <th style={{ ...th, minWidth: 180 }}>Key phrase they used</th>
                  <th style={{ ...th, width: 110 }}>Buying signal</th>
                  <th style={{ ...th, width: 130 }}>Date</th>
                  <th style={{ ...th, minWidth: 180 }}>Notes</th>
                  {canManage && <th style={{ ...th, width: 44 }} />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--cv-border-soft)' }}>
                    <td style={td}>{textCell(r, 'contact_name', 'Name')}</td>
                    <td style={td}>{textCell(r, 'organisation', 'Organisation')}</td>
                    <td style={td}>
                      {canManage
                        ? <select style={inp} value={r.variant || 'A'} onChange={(e) => commit(r.id, { variant: e.target.value })}>
                            {VARIANTS.map((x) => <option key={x} value={x}>{x}</option>)}
                          </select>
                        : <span>{r.variant}</span>}
                    </td>
                    <td style={td}>
                      {canManage
                        ? <select style={inp} value={r.response || 'no'} onChange={(e) => commit(r.id, { response: e.target.value })}>
                            {RESPONSES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                          </select>
                        : <span>{(RESPONSES.find((x) => x.value === r.response) || {}).label || '-'}</span>}
                    </td>
                    <td style={td}>
                      {canManage
                        ? <select style={inp} value={r.response_quality || ''} onChange={(e) => commit(r.id, { response_quality: e.target.value ? Number(e.target.value) : null })}>
                            <option value="">-</option>
                            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        : <span>{r.response_quality || '-'}</span>}
                    </td>
                    <td style={td}>{textCell(r, 'key_phrase', 'Their words, not yours')}</td>
                    <td style={td}>
                      {canManage
                        ? <select style={inp} value={r.purchasing_signal || 'unsure'} onChange={(e) => commit(r.id, { purchasing_signal: e.target.value })}>
                            {SIGNALS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                          </select>
                        : <span>{(SIGNALS.find((x) => x.value === r.purchasing_signal) || {}).label || '-'}</span>}
                    </td>
                    <td style={td}>
                      {canManage
                        ? <input type="date" style={inp} value={r.contact_date || ''} onChange={(e) => commit(r.id, { contact_date: e.target.value || null })} />
                        : <span>{r.contact_date || '-'}</span>}
                    </td>
                    <td style={td}>{textCell(r, 'notes', 'What happened')}</td>
                    {canManage && (
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button type="button" title="Delete this line" disabled={busy}
                          onClick={() => removeRow(r)}
                          style={{ ...mono, border: 'none', background: 'transparent', color: C.red, cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.3rem' }}>x</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
