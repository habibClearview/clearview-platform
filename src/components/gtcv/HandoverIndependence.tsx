// @ts-nocheck
'use client'
// ============================================================
// THE FIVE INDEPENDENCE TESTS
//
// How an engagement ends. Not with a report, and not with the coach saying it
// went well, but with the organisation doing five specific things in front of
// people without help.
//
// THE RULE THAT MAKES THIS WORTH ANYTHING. At the handover session the
// leadership team presents unassisted. The lead consultant and the funder
// representative are evaluators, not helpers. A test the coach had to prompt
// through is a test the organisation failed, and recording it as passed
// removes the only thing this exercise measures. So each test carries what was
// actually observed, in the observer's words, and a test cannot be marked
// passed without it.
//
// A failed test is a real and useful outcome. It names precisely what the
// organisation cannot yet do alone, which is what the next piece of support
// has to address. The panel treats it as information rather than as a problem
// to be smoothed over.
//
// The tests themselves are the method and are the same for every engagement,
// so they come from INDEPENDENCE_TESTS rather than from the database. What is
// stored per engagement is the result.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { INDEPENDENCE_TESTS } from '@/lib/engagement-types'

const TABLE = 'handover_record'

const C = {
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  slate: 'var(--cv-slate)', navy: 'var(--cv-navy)', teal: 'var(--cv-teal)',
  green: 'var(--cv-green)', amber: 'var(--cv-amber)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' }
const hint = { fontSize: '0.88rem', color: C.slate, lineHeight: 1.5 }
const cell = {
  width: '100%', padding: '0.5rem 0.6rem', borderRadius: 8,
  border: `1px solid ${C.border}`, background: 'transparent', color: 'inherit',
  fontFamily: "'Segoe UI',system-ui,sans-serif", fontSize: '0.93rem', lineHeight: 1.5,
}
const btn = (col, solid) => ({
  ...mono, fontSize: '0.83rem', fontWeight: 600, padding: '0.34rem 0.8rem',
  border: `1px solid ${col}`, borderRadius: 7,
  background: solid ? col : 'transparent',
  color: solid ? 'var(--cv-on-accent)' : col, cursor: 'pointer',
})

// What each result means, kept in the panel rather than in a legend nobody
// reads, because the difference between "did it" and "did it with help" is the
// whole point of the exercise.
const RESULTS = [
  { v: 'not_tested', l: 'Not tested yet', c: C.slate, note: 'The session has not happened, or this test was not run.' },
  { v: 'passed', l: 'Done unaided', c: C.green, note: 'They did it in front of the room with nobody stepping in.' },
  { v: 'prompted', l: 'Needed prompting', c: C.amber, note: 'They got there, but only after being pointed at it. Not a pass.' },
  { v: 'failed', l: 'Could not do it', c: C.red, note: 'Names exactly what the next piece of support has to address.' },
]
const resultDef = (v) => RESULTS.find((r) => r.v === v) || RESULTS[0]

export default function HandoverIndependence({ clientId, canManage }) {
  const [rows, setRows] = useState({})     // test_number -> row
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)
  const [dirty, setDirty] = useState({})   // test_number -> evidence text
  const alive = useRef(true)

  useEffect(() => () => { alive.current = false }, [])

  const load = useCallback(async () => {
    if (!clientId) { setRows({}); setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from(TABLE).select('*').eq('client_id', clientId).order('test_number')
      if (!alive.current) return
      if (error) {
        console.error('HandoverIndependence: load failed', error)
        setErr('Could not load the handover record. Try again.')
        return
      }
      setErr(null)
      const byNumber = {}
      for (const r of data || []) byNumber[r.test_number] = r
      setRows(byNumber)
    } catch (e) {
      if (!alive.current) return
      console.error('HandoverIndependence: load threw', e)
      setErr('Could not load the handover record. Try again.')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [clientId])

  useEffect(() => { load() }, [load])

  // One row per test per client, keyed on the test number, so recording a
  // result twice corrects it rather than stacking a second opinion.
  async function write(number, patch) {
    const existing = rows[number]
    const test = INDEPENDENCE_TESTS[number - 1]
    const payload = {
      id: existing?.id || `${clientId}-handover-${number}`,
      client_id: clientId,
      test_number: number,
      test_description: test ? `${test.label}: ${test.description}` : `Test ${number}`,
      ...patch,
      updated_at: new Date().toISOString(),
    }
    // Conflicts on the pair that identifies a handover record, not on the id
    // that encodes it. There is one result per test per engagement, and the
    // database now holds that rather than trusting every writer to build the
    // same id string.
    const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'client_id,test_number' })
    if (error) throw error
  }

  async function setResult(number, value) {
    const evidence = dirty[number] ?? rows[number]?.evidence ?? ''
    // A pass with nothing observed is not a pass, it is somebody's memory.
    if (value === 'passed' && !evidence.trim()) {
      setErr('Write what you actually saw them do before marking this as done unaided. A pass with nothing observed is a memory, not a record.')
      return
    }
    setBusy(`r:${number}`); setErr(null)
    try {
      await write(number, { status: value, evidence: evidence || null })
      await load()
    } catch (e) {
      console.error('HandoverIndependence: save failed', e)
      setErr('Could not record that result. Try again.')
    }
    setBusy(null)
  }

  async function saveEvidence(number) {
    const text = dirty[number]
    if (text === undefined) return
    setBusy(`e:${number}`); setErr(null)
    try {
      await write(number, { evidence: text || null })
      setDirty((prev) => { const next = { ...prev }; delete next[number]; return next })
      await load()
    } catch (e) {
      console.error('HandoverIndependence: save failed', e)
      setErr('Could not save what you observed. Your text is still here, try again.')
    }
    setBusy(null)
  }

  async function confirm(number, value) {
    setBusy(`c:${number}`); setErr(null)
    try {
      await write(number, {
        ceo_confirmed: value,
        ceo_confirmed_at: value ? new Date().toISOString() : null,
      })
      await load()
    } catch (e) {
      console.error('HandoverIndependence: confirm failed', e)
      setErr('Could not record that confirmation. Try again.')
    }
    setBusy(null)
  }

  if (loading) return <p style={hint}>Loading the handover record...</p>

  const results = INDEPENDENCE_TESTS.map((t, i) => rows[i + 1]?.status || 'not_tested')
  const passed = results.filter((r) => r === 'passed').length
  const tested = results.filter((r) => r !== 'not_tested').length
  const independent = passed === INDEPENDENCE_TESTS.length

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem', background: C.card,
    }}>
      <div style={{ ...mono, fontSize: '0.75rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
        The five independence tests
      </div>
      <p style={{ ...hint, margin: '0.4rem 0 0', maxWidth: '92ch' }}>
        The leadership team presents unassisted. You and the funder representative are evaluators,
        not helpers. A test you had to prompt them through is not a pass, and recording it as one
        removes the only thing this measures.
      </p>

      <div style={{
        display: 'flex', gap: '1.4rem', marginTop: '0.9rem', paddingTop: '0.8rem',
        borderTop: `1px solid ${C.border}`, flexWrap: 'wrap', alignItems: 'baseline',
      }}>
        <div>
          <div style={{ ...mono, fontSize: '0.68rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
            Done unaided
          </div>
          <div style={{
            fontFamily: 'Georgia,serif', fontSize: '1.5rem', fontWeight: 600,
            color: independent ? C.green : passed > 0 ? C.amber : C.slate,
            fontVariantNumeric: 'tabular-nums',
          }}>{passed} of {INDEPENDENCE_TESTS.length}</div>
        </div>
        <div style={{ flex: '1 1 280px', minWidth: 220 }}>
          <p style={{ ...hint, margin: 0 }}>
            {independent
              ? 'All five done without help. The organisation can run this on its own, and the completion record can be signed.'
              : tested === 0
                ? 'Nothing tested yet. This is done in the handover session, at the end.'
                : `${INDEPENDENCE_TESTS.length - passed} still to pass. What is not passed here is what the next piece of support has to address.`}
          </p>
        </div>
      </div>

      {err ? <div style={{ color: C.red, fontSize: '0.95rem', marginTop: '0.7rem' }}>{err}</div> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginTop: '1rem' }}>
        {INDEPENDENCE_TESTS.map((t, i) => {
          const number = i + 1
          const row = rows[number]
          const status = row?.status || 'not_tested'
          const def = resultDef(status)
          const evidence = dirty[number] ?? row?.evidence ?? ''
          const unsaved = dirty[number] !== undefined && dirty[number] !== (row?.evidence ?? '')

          return (
            <div key={t.key} style={{
              border: `1px solid ${C.border}`, borderLeft: `4px solid ${def.c}`,
              borderRadius: 10, padding: '0.8rem 0.95rem', background: C.alt,
            }}>
              <div style={{ display: 'flex', gap: '0.7rem', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div style={{ flex: '1 1 300px', minWidth: 240 }}>
                  <div style={{ ...mono, fontSize: '0.68rem', letterSpacing: '.12em', textTransform: 'uppercase', color: C.slate }}>
                    Test {number} · {t.category}
                  </div>
                  <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.05rem', fontWeight: 600, color: C.navy, marginTop: 2 }}>
                    {t.label}
                  </div>
                  <p style={{ ...hint, margin: '0.2rem 0 0' }}>{t.description}</p>
                </div>
                <span style={{
                  ...mono, fontSize: '0.78rem', color: def.c,
                  border: `1px solid ${def.c}`, borderRadius: 999, padding: '0.15rem 0.6rem', whiteSpace: 'nowrap',
                }}>{def.l}</span>
              </div>

              <div style={{ marginTop: '0.7rem' }}>
                <label
                  htmlFor={`handover-evidence-${number}`}
                  style={{ ...mono, fontSize: '0.68rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate, display: 'block', marginBottom: 4 }}
                >
                  What you actually saw them do
                </label>
                <textarea
                  id={`handover-evidence-${number}`}
                  aria-label={`What you saw during ${t.label}`}
                  value={evidence}
                  readOnly={!canManage}
                  rows={2}
                  placeholder="Who did it, what they were asked, and whether anyone stepped in."
                  onChange={(e) => setDirty((prev) => ({ ...prev, [number]: e.target.value }))}
                  onBlur={() => unsaved && saveEvidence(number)}
                  style={{ ...cell, resize: 'vertical' }}
                />
              </div>

              {canManage ? (
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {RESULTS.map((r) => (
                    <button
                      key={r.v}
                      type="button"
                      title={r.note}
                      aria-pressed={status === r.v}
                      disabled={busy === `r:${number}` || status === r.v}
                      onClick={() => setResult(number, r.v)}
                      style={{
                        ...btn(r.c, status === r.v),
                        cursor: status === r.v ? 'default' : 'pointer',
                        opacity: busy === `r:${number}` ? 0.6 : 1,
                      }}
                    >{r.l}</button>
                  ))}
                  {unsaved ? (
                    <span style={{ ...mono, fontSize: '0.76rem', color: C.amber }}>Unsaved</span>
                  ) : null}
                </div>
              ) : null}

              <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ ...hint, display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: canManage ? 'pointer' : 'default' }}>
                  <input
                    type="checkbox"
                    aria-label={`The Executive Director confirms the result of ${t.label}`}
                    checked={!!row?.ceo_confirmed}
                    disabled={!canManage || busy === `c:${number}`}
                    onChange={(e) => confirm(number, e.target.checked)}
                  />
                  The Executive Director confirms this result
                </label>
                {row?.ceo_confirmed_at ? (
                  <span style={{ ...mono, fontSize: '0.76rem', color: C.green }}>
                    Confirmed {new Date(row.ceo_confirmed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
