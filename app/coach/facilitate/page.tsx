'use client'
// ============================================================
// THE FACILITATOR VIEW  (/coach/facilitate)
//
// The screen at the front of the room. R25: the whole screen, and on it the
// current question in large type, the counter, the answers as cards, the
// timer, and the three buttons "Reveal", "Next question" and "Back to the
// table". The amendment to R25 adds two things and no more: the staging
// banner, which app/layout.tsx draws on every page, and the connection
// indicator R31 requires.
//
// NO BUILD BANNER. Checked rather than assumed: app/layout.tsx is the only
// layout in the whole of app/, there are no nested layouts and no templates,
// and BuildStamp is drawn by three page components individually and by no
// layout. So this route inherits the staging banner and nothing else, and no
// existing file had to be changed to achieve it.
//
// THE SIGN-IN CHECK BELOW IS A DELIBERATE COPY of the one in app/coach/page.tsx,
// approved on 11 August 2026 on condition it is marked as one. It is copied
// rather than shared because turning it into a shared helper would mean
// editing app/coach/page.tsx, which Section 4 protects. It is copied exactly,
// not tidied, so that a reader comparing the two sees one thing in two places
// rather than two things that have drifted.
//
// HOW IT KEEPS UP (R27, R29). It asks the server what has arrived, every
// second and a half, and redraws when the answer changes. No button, no page
// reload, and nothing for the facilitator to do. Two windows on the same
// account both stay current because neither depends on the other. See
// PROGRESS.md for why this rather than the database's push service, which was
// the approved approach and which rests on a question about the public key
// that has never been answered.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/authed-fetch'
import {
  answerCounter,
  formatNames,
  formatTimer,
  scoreExtremes,
  timerRemaining,
  type QuestionType,
  type Submission,
  type TargetField,
} from '@/lib/stage1-questions'
import { NO_QUESTIONS_YET } from '@/lib/stage1-question-sets'

const POLL_MS = 1500
/** R31's test allows five seconds. Four leaves room for one poll to be slow
 *  without the indicator flickering on a healthy connection. */
const STALE_MS = 4000

const C = {
  bg: '#0B1F33',
  card: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.18)',
  ink: '#FFFFFF',
  quiet: 'rgba(255,255,255,0.62)',
  teal: '#1A9DAA',
  amber: '#D98C1F',
  red: '#C0392B',
}

interface Question {
  id: string
  gate_id: string
  sort_order: number
  question_text: string
  question_type: QuestionType
  is_named: boolean
  target_fields: TargetField[]
  options: string[]
  suggested_minutes: number | null
  scale_min: number
  scale_max: number
  agreed_value: string | null
}

interface RoomState {
  open_question_id: string | null
  revealed: boolean
  timer_started_at: string | null
  timer_seconds: number | null
  timer_paused_with_seconds_left: number | null
  room_size: number | null
}

interface Feed {
  questions: Question[]
  state: RoomState | null
  answered: number
  connectedDevices: number
  cards: { id: string; values: Record<string, string>; name: string | null }[]
  distribution: { value: number; count: number }[]
  split: { option: string; count: number }[]
  scored: { score_value: number | null; participant_name: string | null }[]
}

export default function FacilitatePage() {
  // ---- the deliberate copy of the sign-in check ----------------------
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/'; return }
      const { data } = await supabase.from('user_profiles')
        .select('role, full_name, co_implementer_id, funder_programme_id')
        .eq('id', session.user.id).single()
      if (!data || !['super_coach', 'coach', 'funder'].includes(data.role)) {
        setStatus('denied')
        return
      }
      setStatus('ready')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { window.location.href = '/' }
    })
    return () => subscription.unsubscribe()
  }, [])

  if (status === 'checking') {
    return <Shell><p style={{ color: C.quiet }}>Loading...</p></Shell>
  }
  if (status === 'denied') {
    return <Shell><p style={{ color: C.red }}>You don&#39;t have access to the Coach Dashboard.</p></Shell>
  }
  return <Room />
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{
      minHeight: '100vh', background: C.bg, color: C.ink,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Segoe UI',system-ui,sans-serif", padding: '2rem',
    }}>{children}</main>
  )
}

function Room() {
  const [clientId, setClientId] = useState<string | null>(null)
  const [gateId, setGateId] = useState<string | null>(null)
  const [feed, setFeed] = useState<Feed | null>(null)
  const [live, setLive] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [minutes, setMinutes] = useState('')
  const [size, setSize] = useState('')
  const [agreed, setAgreed] = useState('')
  const lastGood = useRef<number>(Date.now())

  // Which engagement and which block, taken from the address the block's
  // button sent us to.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setClientId(p.get('clientId'))
    setGateId(p.get('gateId'))
  }, [])

  const load = useCallback(async () => {
    if (!clientId) return
    try {
      const res = await authedFetch(
        `/api/facilitate?clientId=${encodeURIComponent(clientId)}&gateId=${encodeURIComponent(gateId || '')}`,
        { cache: 'no-store' },
      )
      if (!res.ok) return
      const json = (await res.json()) as Feed
      setFeed(json)
      lastGood.current = Date.now()
      setLive(true)
    } catch {
      // Nothing arrived. The screen keeps what it has, and the indicator below
      // turns over on its own once the gap is long enough to matter.
    }
  }, [clientId, gateId])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  // R31. The indicator is driven by whether answers are actually arriving, not
  // by whether a connection object says it is open, because the failure the
  // facilitator cares about is "the projector has stopped being current" and
  // that is what this measures.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now())
      setLive(Date.now() - lastGood.current < STALE_MS)
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const send = useCallback(async (payload: Record<string, unknown>) => {
    if (!clientId) return
    try {
      await authedFetch('/api/facilitate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, gateId, ...payload }),
      })
      load()
    } catch {
      /* The next poll will show whether it landed. */
    }
  }, [clientId, gateId, load])

  const questions = feed?.questions || []
  const state = feed?.state || null
  const open = questions.find((q) => q.id === state?.open_question_id) || null
  const secondsLeft = timerRemaining(state, now)

  // The timer pre-fills from the question's suggested length where it has one,
  // and the facilitator can always override it (Q9).
  useEffect(() => {
    if (!open) return
    setMinutes(open.suggested_minutes ? String(open.suggested_minutes) : '')
    setAgreed(open.agreed_value || '')
  }, [open?.id, open?.suggested_minutes, open?.agreed_value, open])

  useEffect(() => {
    setSize(state?.room_size ? String(state.room_size) : '')
  }, [state?.room_size])

  const backToTheTable = () => {
    window.location.href = clientId ? `/coach?client=${encodeURIComponent(clientId)}` : '/coach'
  }

  const page: React.CSSProperties = {
    minHeight: '100vh', background: C.bg, color: C.ink,
    fontFamily: "'Segoe UI',system-ui,sans-serif",
    padding: '1.5rem', boxSizing: 'border-box',
  }

  if (!clientId) {
    return <Shell><p style={{ color: C.quiet }}>Open this from a block, so it knows which engagement to run.</p></Shell>
  }

  return (
    <main style={page}>
      <ConnectionIndicator live={live} devices={feed?.connectedDevices ?? 0} />

      {!open ? (
        // Nothing is open yet. R3: one question is opened, never a block, so
        // what is offered here is a list of single questions and there is no
        // control anywhere that opens more than one.
        <div style={{ maxWidth: 900, margin: '3rem auto 0' }}>
          <RoomSize size={size} setSize={setSize} onSet={(n) => send({ action: 'roomSize', roomSize: n })} />
          {questions.length === 0 ? (
            <p style={{ fontSize: '1.4rem', color: C.quiet, marginTop: '2rem' }}>{NO_QUESTIONS_YET}</p>
          ) : (
            <div style={{ marginTop: '2rem' }}>
              {questions.map((q) => (
                <div key={q.id} style={{
                  border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem',
                  marginBottom: '0.8rem', background: C.card,
                }}>
                  <div style={{ fontSize: '1.15rem', lineHeight: 1.4 }}>{q.question_text}</div>
                  <div style={{ color: C.quiet, fontSize: '0.85rem', margin: '0.4rem 0 0.8rem' }}>
                    {q.question_type} · {q.is_named ? 'named' : 'anonymous'}
                    {q.agreed_value ? ` · agreed: ${q.agreed_value}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => send({ action: 'open', questionId: q.id })}
                      style={btn(C.teal)}
                    >Open this question</button>
                    {/* R19. Changeable before the question is opened; the route
                        refuses once anybody has answered. */}
                    <button
                      type="button"
                      onClick={() => send({ action: 'setNamed', questionId: q.id, isNamed: !q.is_named })}
                      style={btn('transparent')}
                    >{q.is_named ? 'Make anonymous' : 'Make named'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={backToTheTable} style={{ ...btn('transparent'), marginTop: '1.5rem' }}>
            Back to the table
          </button>
        </div>
      ) : (
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          {/* R26. Never below forty pixels, whatever the screen. */}
          <h1 style={{
            fontFamily: 'Georgia,serif', fontWeight: 600, lineHeight: 1.15,
            fontSize: 'clamp(40px, 4.4vw, 80px)', margin: '2.5rem 0 1.5rem',
          }}>{open.question_text}</h1>

          <div style={{
            display: 'flex', alignItems: 'baseline', gap: '2rem',
            flexWrap: 'wrap', marginBottom: '1.5rem',
          }}>
            <div style={{ fontFamily: 'monospace', fontSize: 'clamp(28px, 3vw, 52px)' }}>
              {answerCounter(feed?.answered ?? 0, state?.room_size ?? null)}
            </div>
            {secondsLeft !== null ? (
              <div style={{
                fontFamily: 'monospace', fontSize: 'clamp(28px, 3vw, 52px)',
                color: secondsLeft <= 10 ? C.amber : C.quiet,
              }}>{formatTimer(secondsLeft)}</div>
            ) : null}
          </div>

          <Answers feed={feed} open={open} revealed={Boolean(state?.revealed)} />

          {state?.revealed && open.question_type !== 'collect' ? (
            // Q6, with both conditions held to: nothing is pre-filled with an
            // average or a median, and the distribution stays on screen above
            // while this is typed, so the decision is made in sight of the
            // spread.
            <form
              onSubmit={(e) => { e.preventDefault(); send({ action: 'agree', questionId: open.id, agreedValue: agreed }) }}
              style={{ marginTop: '1.5rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}
            >
              <input
                value={agreed}
                onChange={(e) => setAgreed(e.target.value)}
                placeholder="What the room agreed"
                aria-label="What the room agreed"
                style={{
                  flex: '1 1 18rem', fontSize: '1.1rem', padding: '0.6rem',
                  borderRadius: 8, border: `1px solid ${C.border}`,
                  background: 'rgba(0,0,0,0.25)', color: C.ink,
                }}
              />
              <button type="submit" style={btn(C.teal)}>Record the agreed value</button>
            </form>
          ) : null}

          {/* C52 AMENDS R25. R25 made this the working screen with three
              buttons on it. It is now a DISPLAY: the block is where a question
              is run from, and this carries no controls at all. C52's test is
              that no buttons appear here. */}
        </div>
      )}
    </main>
  )
}

/**
 * R31, and the instruction that participant connection is shown separately.
 *
 * Two facts, never one. "Connected" is about THIS screen still receiving
 * answers. The device count is about the phones in the room. Folding the
 * second into the answer counter would let a network problem read as a room
 * that had finished answering.
 */
function ConnectionIndicator({ live, devices }: { live: boolean; devices: number }) {
  return (
    <div style={{
      position: 'fixed', top: 10, right: 12, zIndex: 50,
      display: 'flex', alignItems: 'center', gap: '0.9rem',
      fontFamily: 'monospace', fontSize: '0.8rem',
      background: 'rgba(0,0,0,0.45)', border: `1px solid ${C.border}`,
      borderRadius: 999, padding: '0.35rem 0.8rem',
    }}>
      <span style={{ color: live ? C.teal : C.amber }}>
        {live ? 'connected' : 'reconnecting'}
      </span>
      <span style={{ color: C.quiet }}>
        {devices === 1 ? '1 device in the room' : `${devices} devices in the room`}
      </span>
    </div>
  )
}

function Answers({ feed, open, revealed }: { feed: Feed | null; open: Question; revealed: boolean }) {
  if (open.question_type === 'collect') {
    const cards = feed?.cards || []
    if (cards.length === 0) return <p style={{ color: C.quiet, fontSize: '1.2rem' }}>Nothing yet.</p>
    return (
      <div style={{ display: 'grid', gap: '0.7rem', gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))' }}>
        {cards.map((c) => (
          <div key={c.id} style={{
            border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.9rem',
            background: C.card, fontSize: '1.05rem', lineHeight: 1.45,
          }}>
            {(open.target_fields || []).map((f) => (
              c.values?.[f.column] ? (
                <div key={f.column} style={{ marginBottom: '0.35rem' }}>
                  <span style={{ color: C.quiet, fontSize: '0.72rem', letterSpacing: '.08em', textTransform: 'uppercase', display: 'block' }}>
                    {f.heading}
                  </span>
                  {/* Drawn as text. React escapes a string, so a submitted
                      script tag appears as the characters somebody typed. */}
                  {c.values[f.column]}
                </div>
              ) : null
            ))}
            {c.name ? <div style={{ color: C.quiet, fontSize: '0.8rem' }}>{c.name}</div> : null}
          </div>
        ))}
      </div>
    )
  }

  // R14. Before the reveal there is a count and no values, and the values were
  // never sent to this screen in the first place.
  if (!revealed) {
    return <p style={{ color: C.quiet, fontSize: '1.2rem' }}>Answers are hidden until you reveal them.</p>
  }

  if (open.question_type === 'score') {
    const rows = feed?.distribution || []
    const most = Math.max(1, ...rows.map((r) => r.count))
    // R18. The names are worked out from what the server sent, and the server
    // sends none at all on an anonymous question.
    const asSubmissions = (feed?.scored || []).map((s, i) => ({
      id: String(i), question_id: open.id, participant_id: String(i),
      participant_name: s.participant_name, values: {},
      score_value: s.score_value, option_value: null,
      submitted_at: '', disposition: 'pending' as const,
    })) as Submission[]
    const ends = scoreExtremes(asSubmissions, open.is_named)

    return (
      <div>
        {/* R16. Every value and how many chose it. Never a mean alone. */}
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-end', minHeight: '9rem' }}>
          {rows.map((r) => (
            <div key={r.value} style={{ textAlign: 'center', flex: '1 1 0' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '1.6rem' }}>{r.count}</div>
              <div style={{
                background: r.count ? C.teal : C.border,
                height: `${Math.round((r.count / most) * 100)}px`,
                minHeight: 4, borderRadius: 6, margin: '0.35rem 0',
              }} />
              <div style={{ fontFamily: 'monospace', fontSize: '1.6rem' }}>{r.value}</div>
            </div>
          ))}
        </div>
        {ends.highest && ends.highest.names.length > 0 ? (
          <p style={{ color: C.quiet, fontSize: '1.05rem', margin: '1rem 0 0' }}>
            Highest, {ends.highest.value}: {formatNames(ends.highest.names)}
          </p>
        ) : null}
        {ends.lowest && ends.lowest.names.length > 0 ? (
          <p style={{ color: C.quiet, fontSize: '1.05rem', margin: '0.3rem 0 0' }}>
            Lowest, {ends.lowest.value}: {formatNames(ends.lowest.names)}
          </p>
        ) : null}
      </div>
    )
  }

  // R17. The split by option, with counts, including an option nobody chose.
  const rows = feed?.split || []
  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      {rows.map((r) => (
        <div key={r.option} style={{
          border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.6rem',
          background: C.card, textAlign: 'center', minWidth: '9rem',
        }}>
          <div style={{ fontFamily: 'monospace', fontSize: '2.6rem' }}>{r.count}</div>
          <div style={{ fontSize: '1.1rem' }}>{r.option}</div>
        </div>
      ))}
    </div>
  )
}

/** R30. Started, paused and reset, with the length the facilitator sets (Q9). */
function Timer({
  minutes, setMinutes, running, onStart, onPause, onReset,
}: {
  minutes: string
  setMinutes: (v: string) => void
  running: boolean
  onStart: () => void
  onPause: () => void
  onReset: () => void
}) {
  return (
    <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
      <input
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        inputMode="numeric"
        aria-label="Minutes"
        placeholder="min"
        style={{
          width: '4rem', fontSize: '1rem', padding: '0.5rem', borderRadius: 8,
          border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.25)', color: C.ink,
          textAlign: 'center',
        }}
      />
      <button type="button" onClick={onStart} style={btn('transparent')}>Start</button>
      <button type="button" onClick={onPause} disabled={!running} style={btn('transparent')}>Pause</button>
      <button type="button" onClick={onReset} style={btn('transparent')}>Reset</button>
    </span>
  )
}

/**
 * Amendment to R25. The facilitator sets the room size, before or during a
 * question, and can change it at any time. Empty is a correct state: the
 * counter then shows the answers with no denominator.
 */
function RoomSize({
  size, setSize, onSet,
}: { size: string; setSize: (v: string) => void; onSet: (n: number | null) => void }) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSet(size.trim() === '' ? null : Number(size)) }}
      style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}
    >
      <input
        value={size}
        onChange={(e) => setSize(e.target.value)}
        inputMode="numeric"
        aria-label="People in the room"
        placeholder="people"
        style={{
          width: '5.5rem', fontSize: '1rem', padding: '0.5rem', borderRadius: 8,
          border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.25)', color: C.ink,
          textAlign: 'center',
        }}
      />
      <button type="submit" style={btn('transparent')}>Set room size</button>
    </form>
  )
}

function btn(background: string): React.CSSProperties {
  return {
    padding: '0.6rem 1.1rem', fontSize: '1rem', fontWeight: 600,
    borderRadius: 10, cursor: 'pointer', color: C.ink,
    border: `1px solid ${background === 'transparent' ? C.border : background}`,
    background,
  }
}
