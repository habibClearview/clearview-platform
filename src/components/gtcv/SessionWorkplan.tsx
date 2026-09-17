// @ts-nocheck
'use client'
// ============================================================
// SESSIONS AND ROOMS: THE WORKPLAN, READ ONLY
//
// Habib, 16 September 2026: "In the session and room tab, the decision points
// are listed and sessions for each are planned in this tab. I am suggesting
// that all the planning and everything associated with each decision point is
// moved to that decision tab. The session and room should then draw the
// details of the sessions, planned or otherwise, into it so it works almost
// like a summary of the sessions for all decision points and looks like a
// workplan that can be shared or downloaded. The idea is that things become a
// lot more intuitive for each session some maybe planned in advance or some
// may happen on the day it is recorded or done."
//
// And, asked which of the two this page should be: "read only would be better
// as all editing can happen in the decision tab... printable and spreadsheet
// for flexibility."
//
// So this page plans nothing. It reads every session on the engagement, lays
// them out in delivery order, and gives you two ways to take them out of the
// platform: print, and a spreadsheet. Every session name is a way back to the
// decision point where it can be changed.
//
// WHY THIS IS NOT WHERE SESSIONS ARE MADE. Planning Decision Point 2 used to
// happen here rather than on Decision Point 2, which meant leaving the work to
// arrange the work. One list of everything is still worth having, for the same
// reason a diary is: it is what you send a funder, and it is where you notice
// that nothing is planned for Decision Point 5.
//
// The method itself, the rooms and what each one requires, lives in
// src/lib/method-sessions.ts, which the decision point reads too.
//
// CLIENT AGNOSTIC: no organisation, funder or person is named here.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { onSolid } from '@/lib/ink'
import { supabase } from '@/lib/supabase'
import {
  KINDS, KIND_LABEL, kindDef, durationLabel,
  workplanGroups, workplanCsv, dpHref, STATUS_OPTIONS, statusColor,
} from '@/lib/method-sessions'

const SESSIONS_TABLE = 'gtcv_sessions'
const ATTENDANCE_TABLE = 'gtcv_session_attendance'
const PARTIES_TABLE = 'engagement_parties'

const C = {
  navy: 'var(--cv-navy)', slate: 'var(--cv-slate)', teal: 'var(--cv-teal)',
  border: 'var(--cv-border)', card: 'var(--cv-card)', red: 'var(--cv-red)',
  green: 'var(--cv-green)', amber: 'var(--cv-amber)',
}
const card = {
  background: C.card, border: '1px solid var(--cv-border-soft)', borderRadius: 14,
  padding: '1.35rem 1.5rem', marginBottom: '1.25rem',
  boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)',
}
const secH = { fontFamily: 'var(--cv-font)', fontSize: '1.32rem', fontWeight: 700, color: C.navy, margin: 0 }
const mono = { fontFamily: 'var(--cv-font-mono)' }
const hint = { fontSize: '1.01rem', color: C.slate, lineHeight: 1.45 }
const btn = (col, solid) => ({
  ...mono, fontSize: '1.01rem', fontWeight: 700, padding: '0.42rem 0.9rem',
  border: `1px solid ${col}`, borderRadius: 7,
  background: solid ? col : 'transparent',
  color: solid ? onSolid(col) : col, cursor: 'pointer',
})
const th = { ...mono, fontSize: '0.74rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: C.slate, textAlign: 'left', padding: '0.35rem 0.5rem', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
const td = { fontSize: '1.01rem', color: C.navy, padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--cv-border-soft)', verticalAlign: 'top' }

/**
 * Is this the database telling us the party_name column is not there yet,
 * rather than telling us something is wrong? PostgREST answers 42703 for an
 * undefined column, and names the column in the schema-cache error a fresh
 * database gives before it has reloaded.
 */
function missingPartyName(error) {
  if (!error) return false
  return error.code === '42703' || /party_name/i.test(String(error.message || ''))
}

/** A date as somebody reads it, not as the database keeps it. */
function readable(s) {
  if (s.planned_at) {
    const d = new Date(s.planned_at)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
  }
  const day = s.planned_date
  if (day) {
    const [y, m, d] = String(day).split('-').map(Number)
    if (y && m && d) return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  return 'No date yet'
}

function heldReadable(s) {
  if (!s.held_date) return ''
  const [y, m, d] = String(s.held_date).split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusLabel(v) {
  const o = STATUS_OPTIONS.find(x => x.v === v)
  return o ? o.l : 'Planned'
}

export default function SessionWorkplan({ clientId, clientName = '' }) {
  const [sessions, setSessions] = useState([])
  const [parties, setParties] = useState([])
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return }
    setLoading(true)
    // ONE DROPPED REQUEST USED TO EMPTY THE WHOLE PLAN. 10 September 2026. A
    // single moment of bad connection threw "Failed to fetch" and the screen
    // then read zero sessions against every decision point, which is
    // indistinguishable from an engagement that has none. It asks three times
    // now, and says the sessions are safe rather than showing an empty plan.
    let last = null
    for (let go = 0; go < 3; go++) {
      try {
        const [sRes, pRes] = await Promise.all([
          supabase.from(SESSIONS_TABLE).select('*').eq('client_id', clientId)
            .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
          supabase.from(PARTIES_TABLE).select('id,name,party_role').eq('client_id', clientId)
            .order('sort_order', { ascending: true }),
        ])
        if (!sRes.error && !pRes.error) {
          setSessions(sRes.data || [])
          setParties(pRes.data || [])
          // party_name arrives with 2026_09_16_session_attendance_name.sql, so
          // a database without it yet falls back to the pointer alone rather
          // than leaving the whole workplan blank.
          //
          // ONLY FOR THE MISSING COLUMN. CodeRabbit on #278: this fell back on
          // any error at all and then discarded the fallback's own error, so a
          // dropped connection produced a workplan that said every session was
          // empty, and a spreadsheet downloaded from it said so in writing.
          let { data: att, error: attErr } = await supabase.from(ATTENDANCE_TABLE)
            .select('id,session_id,party_id,party_role,party_name,required,attended')
            .eq('client_id', clientId)
          if (attErr && missingPartyName(attErr)) {
            ;({ data: att, error: attErr } = await supabase.from(ATTENDANCE_TABLE)
              .select('id,session_id,party_id,party_role,required,attended')
              .eq('client_id', clientId))
          }
          if (attErr) { last = attErr; continue }
          setAttendance(att || [])
          setErr(null)
          setLoading(false)
          return
        }
        last = sRes.error || pRes.error
      } catch (e) {
        last = e
      }
      await new Promise(r => setTimeout(r, 1000 * (go + 1)))
    }
    setErr('The workplan could not be loaded. Your sessions are safe on the record, this is a '
      + 'connection problem rather than lost work.' + (last?.message ? ` (${last.message})` : ''))
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load, reloadKey])

  // Who is in a session, by name, for the screen and for the spreadsheet.
  const whoFor = useCallback((s) => {
    return attendance
      .filter(a => a.session_id === s.id && a.attended)
      .map(a => {
        const who = parties.find(p => p.id === a.party_id)
        return who?.name || a.party_name || 'Somebody no longer on the engagement'
      })
  }, [attendance, parties])

  const groups = useMemo(() => workplanGroups(sessions), [sessions])
  const total = sessions.length
  const held = sessions.filter(s => s.status === 'held').length
  const undated = sessions.filter(s => !s.planned_at && !s.planned_date && s.status === 'planned').length

  /**
   * The spreadsheet. Built in the browser from what is already on screen, so
   * there is no second route to keep in step and nothing leaves the platform
   * that the viewer could not already see.
   */
  function downloadCsv() {
    const csv = workplanCsv(sessions, whoFor)
    // A byte order mark, so Excel opens it as UTF-8 and a name with an accent
    // in it is spelled correctly rather than mangled.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const stamp = new Date().toISOString().slice(0, 10)
    a.download = `${(clientName || 'engagement').replace(/[^\w-]+/g, '-').toLowerCase()}-workplan-${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Freed on the next turn of the loop, so the download has started first.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div style={card} className="cv-workplan">
      {/* The page as it prints: the tab menu, the buttons and the surrounding
          furniture come off, and the table keeps its rows together across a
          page break. Printing is how this goes to a funder. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .cv-workplan, .cv-workplan * { visibility: visible; }
          .cv-workplan { position: absolute; left: 0; top: 0; width: 100%; border: none; box-shadow: none; padding: 0; }
          .cv-no-print { display: none !important; }
          .cv-workplan tr, .cv-workplan .cv-group { break-inside: avoid; }
          .cv-workplan .cv-group { break-before: auto; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={secH}>The workplan</div>
          <div style={{ ...hint, marginTop: '0.25rem' }}>
            Every session on this engagement, in the order the method runs them.
            Sessions are planned, invited and opened on the decision point they belong to,
            and every name below is a way back to it.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }} className="cv-no-print">
          <button type="button" style={btn(C.teal, true)} onClick={() => window.print()}>Print</button>
          <button type="button" style={btn(C.teal)} onClick={downloadCsv} disabled={!total}>
            Download the spreadsheet
          </button>
        </div>
      </div>

      {err && (
        <div style={{ ...hint, color: C.red, margin: '0.6rem 0' }} className="cv-no-print">
          {err}{' '}
          <button type="button" style={{ ...btn(C.red), marginLeft: '0.4rem' }} onClick={() => setReloadKey(k => k + 1)}>
            Try again
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '1rem 0 1.1rem' }}>
        {[
          { l: 'Sessions', n: total, c: C.navy },
          { l: 'Held', n: held, c: C.green },
          { l: 'No date yet', n: undated, c: undated ? C.amber : C.slate },
        ].map(t => (
          <div key={t.l} style={{ borderTop: `3px solid ${t.c}`, background: 'var(--cv-alt)', borderRadius: 8, padding: '0.45rem 0.8rem', minWidth: 120 }}>
            <div style={{ ...mono, fontSize: '0.74rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: C.slate }}>{t.l}</div>
            <div style={{ fontFamily: 'var(--cv-font)', fontSize: '1.4rem', fontWeight: 700, color: t.c, lineHeight: 1.1 }}>{t.n}</div>
          </div>
        ))}
      </div>

      {/* THE KEY IS A KEY, NOT A WALL. 17 September 2026. Habib: "why does the
          key to the different types of rooms stacked like that, makes the whole
          thing cluttered. It is either you point to guidance note or you hide
          it to be expanded, it looks terrible."
          Six cards, each with a heading, a count and a sentence, sat above the
          workplan every time it was opened. It is reference material: needed
          once, by somebody who does not already know the six rooms, and in the
          way for everybody else. */}
      <details style={{ marginBottom: '1.2rem' }} className="cv-no-print">
        <summary style={{
          ...mono, fontSize: '0.8rem', letterSpacing: '0.06em', textTransform: 'uppercase',
          color: C.teal, cursor: 'pointer',
        }}>
          The six rooms, and who the method puts in each
        </summary>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
          {KINDS.map(k => {
            const n = sessions.filter(x => x.session_kind === k.v).length
            return (
              <div key={k.v} style={{ borderLeft: `3px solid ${k.color}`, background: 'var(--cv-alt)', borderRadius: 8, padding: '0.4rem 0.7rem', flex: '1 1 220px' }}>
                <div style={{ ...mono, fontSize: '0.8rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: k.color }}>
                  {k.l} &middot; {n}
                </div>
                <div style={hint}>{k.blurb}</div>
              </div>
            )
          })}
        </div>
      </details>

      {loading ? (
        <div style={hint}>Loading the workplan...</div>
      ) : total === 0 && err ? (
        // NOT LOADED IS NOT THE SAME AS NOT PLANNED. CodeRabbit on #278: a
        // failed load showed the connection message and "Nothing is planned"
        // together, which is the exact confusion the retry above exists to
        // prevent. The message above says what happened; this says nothing.
        null
      ) : total === 0 ? (
        <div style={{ ...hint, border: `1px dashed ${C.border}`, borderRadius: 8, padding: '0.9rem 1rem' }}>
          Nothing is planned on this engagement yet. Sessions are added on the decision point they
          belong to, and they appear here as soon as they are.
        </div>
      ) : (
        groups.map(g => {
          const href = dpHref(clientId, g.id)
          return (
            <div key={g.id} className="cv-group" style={{ marginBottom: '1.3rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                <div style={{ fontFamily: 'var(--cv-font)', fontSize: '1.08rem', fontWeight: 700, color: C.navy }}>
                  {g.label}
                </div>
                <span style={{ ...mono, fontSize: '0.78rem', color: C.slate }}>
                  {g.sessions.length} session{g.sessions.length === 1 ? '' : 's'}
                </span>
                {href && (
                  <a href={href} className="cv-no-print" style={{ ...mono, fontSize: '0.78rem', color: C.teal }}>
                    Plan sessions here
                  </a>
                )}
              </div>

              {g.sessions.length === 0 ? (
                <div style={{ ...hint, border: `1px dashed ${C.border}`, borderRadius: 8, padding: '0.55rem 0.8rem' }}>
                  Nothing planned here yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                    {/* The heading above is a sibling, so somebody reading this
                        in table mode had nine unnamed tables. */}
                    <caption style={{ ...mono, fontSize: '0.74rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: C.slate, textAlign: 'left', paddingBottom: '0.3rem' }}>
                      {g.label}
                    </caption>
                    <thead>
                      <tr>
                        <th style={th}>Session</th>
                        <th style={th}>Room</th>
                        <th style={th}>Planned</th>
                        <th style={th}>Held</th>
                        <th style={th}>Length</th>
                        <th style={th}>Status</th>
                        <th style={th}>Who is in it</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.sessions.map(s => {
                        const room = kindDef(s.session_kind)
                        const who = whoFor(s)
                        return (
                          <tr key={s.id}>
                            <td style={{ ...td, minWidth: 200 }}>
                              {href ? (
                                <a href={href} style={{ color: C.navy, fontWeight: 600, textDecoration: 'none', borderBottom: `1px solid ${C.teal}` }}>
                                  {s.title || 'Untitled session'}
                                </a>
                              ) : (
                                <span style={{ fontWeight: 600 }}>{s.title || 'Untitled session'}</span>
                              )}
                              {s.purpose && <div style={{ ...hint, fontSize: '1.01rem', marginTop: '0.15rem' }}>{s.purpose}</div>}
                            </td>
                            <td style={{ ...td, color: room ? room.color : C.slate, whiteSpace: 'nowrap' }}>
                              {s.session_kind ? (KIND_LABEL[s.session_kind] || s.session_kind) : 'Not set'}
                            </td>
                            {/* WHERE DID THAT COME FROM. 17 September 2026.
                                Habib, on three sessions he did not recognise:
                                "I did not set up anything, why is that showing
                                that." Nothing on the platform creates a session
                                by itself, so every row here was added by
                                somebody pressing Add on a decision point. Saying
                                when makes that answerable, and the name beside
                                it is the way to where it can be deleted. */}
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              {readable(s)}
                              {s.created_at && (
                                <div style={{ ...hint, fontSize: '0.82rem' }}>
                                  added {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </div>
                              )}
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>{heldReadable(s)}</td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>{durationLabel(s.duration_minutes)}</td>
                            <td style={{ ...td, color: statusColor(s.status), whiteSpace: 'nowrap' }}>{statusLabel(s.status)}</td>
                            <td style={td}>
                              {who.length
                                ? who.join(', ')
                                : <span style={hint}>Nobody named yet</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })
      )}

      <div style={{ ...hint, marginTop: '0.8rem' }} className="cv-no-print">
        Read only. A session is changed, invited, opened or deleted on its own decision point.
      </div>
    </div>
  )
}
