'use client'
// ============================================================
// THE PARTICIPANT PAGE  (/room)
//
// What a person in the workshop holds. R6: no account, no password, nothing to
// install. R9: the question, an input that suits its type, and a submit button,
// and beyond that only what other requirements put here — the timer R30 says
// participants must see, and the code box shown when this browser has not
// joined a room yet.
//
// IT TALKS TO THE SERVER AND TO NOTHING ELSE. The browser holds no database
// key and subscribes to no push channel. What that channel delivers to a
// browser holding only the public key has never been established (see
// PROGRESS.md), and a page built on top of an unanswered question inherits it.
// So everything arrives through /api/room, which holds the elevated key on the
// server, and the unanswered question stops mattering here.
//
// HOW IT KEEPS UP (R8). It asks the server what is open, every second and a
// half, and redraws when the answer changes. No button, no page reload, and
// nothing for the participant to do. See PROGRESS.md for why this rather than
// a live socket.
//
// WHAT HAPPENS WITH NO INTERNET (R32). An answer is written into the phone's
// own storage BEFORE it is sent, and the sending is a separate job that keeps
// trying. Close the page, walk out of signal, come back: the answer is still
// queued and still goes. The participant is never asked to send it again and
// never shown an error for being offline.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  formatTimer,
  timerRemaining,
  type QuestionType,
  type TargetField,
} from '@/lib/stage1-questions'
import {
  ANONYMOUS_NOTICE,
  LINK_CLOSED,
  PERSONAL_LINK_PARAM,
} from '@/lib/stage2-personal-links'

// The exact sentence R7 requires, kept as a constant so it cannot drift.
const NOTHING_OPEN = 'Nothing open yet. Your facilitator will open a question shortly.'

const QUEUE_KEY = 'gtcv_room_queue'
const POLL_MS = 1500

const C = {
  bg: 'var(--cv-bg, #F4F1EA)',
  card: 'var(--cv-card, #FFFFFF)',
  border: 'var(--cv-border, #D8D2C6)',
  navy: 'var(--cv-navy, #1B2A3A)',
  slate: 'var(--cv-slate, #4A5A6A)',
  teal: 'var(--cv-teal, #1A9DAA)',
  red: 'var(--cv-red, #C0392B)',
}

interface RoomQuestion {
  id: string
  question_text: string
  question_type: QuestionType
  is_named: boolean
  target_fields: TargetField[]
  options: string[]
  scale_min: number
  scale_max: number
}

interface RoomState {
  open_question_id: string | null
  revealed: boolean
  timer_started_at: string | null
  timer_seconds: number | null
  timer_paused_with_seconds_left: number | null
}

interface MineRow {
  id: string
  values: Record<string, string> | null
  score_value: number | null
  option_value: number | string | null
}

/** One answer waiting to be sent. Held in the phone's own storage. */
interface QueuedAnswer {
  /** Made on the device, so a retry cannot be counted twice as two answers. */
  localId: string
  questionId: string
  values?: Record<string, string>
  score?: number
  option?: string
}

function readQueue(): QueuedAnswer[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // A storage that cannot be read is treated as empty rather than as a
    // failure. Losing the queue is bad; refusing to run is worse.
    return []
  }
}

function writeQueue(items: QueuedAnswer[]) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
  } catch {
    /* Private browsing with storage switched off. The send still happens. */
  }
}

export default function RoomPage() {
  const [joined, setJoined] = useState<boolean | null>(null)
  const [question, setQuestion] = useState<RoomQuestion | null>(null)
  const [state, setState] = useState<RoomState | null>(null)
  const [mine, setMine] = useState<MineRow[]>([])
  const [everyones, setEveryones] = useState<{ values: Record<string, string> }[]>([])

  const [code, setCode] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const [draft, setDraft] = useState<Record<string, string>>({})
  const [chosen, setChosen] = useState<string | number | null>(null)
  const [queued, setQueued] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [myName, setMyName] = useState<string | null>(null)
  const [showNotice, setShowNotice] = useState(false)
  const [closed, setClosed] = useState(false)
  // Until the link in the address has been exchanged, nothing else should run:
  // a personal link that raced the first read would show the code box for a
  // moment to somebody who never needs to see one.
  const [exchanging, setExchanging] = useState<boolean | null>(null)

  // Which question the boxes on screen belong to, so moving to a new question
  // clears them rather than carrying somebody's last answer forward.
  const shownQuestionId = useRef<string | null>(null)

  // ---- reading what is open ------------------------------------------
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/room', { cache: 'no-store' })
      if (res.status === 401) {
        // R37. The link was withdrawn, or the engagement has finished. One
        // sentence, nothing else, and no removal language.
        setClosed(true)
        setJoined(false)
        return
      }
      if (!res.ok) return
      const json = await res.json()
      setClosed(false)
      setJoined(Boolean(json.joined))
      setQuestion(json.question || null)
      setState(json.state || null)
      setMine(json.mine || [])
      setEveryones(json.everyones || [])
      setMyName(json.me?.name || null)
      setShowNotice(Boolean(json.showAnonymousNotice))
    } catch {
      /* No connection. Keep what is on screen; the next try will catch up. */
    }
  }, [])

  // R34 and the amendment to R5. A personal link carries a value in the
  // address. It is exchanged once for the cookie, and then REMOVED from the
  // address, so that from then on the address reads exactly /room and the link
  // is not sitting there to be screenshotted.
  useEffect(() => {
    const url = new URL(window.location.href)
    const token = url.searchParams.get(PERSONAL_LINK_PARAM)
    if (!token) { setExchanging(false); return }

    setExchanging(true)
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'personal', token }),
        })
        if (cancelled) return
        if (res.status === 401) setClosed(true)
      } catch {
        // No connection on first opening. The link stays in the address so the
        // next attempt can still use it, and the page falls back to the code
        // box rather than pretending to know who this is.
        if (!cancelled) { setExchanging(false); return }
      }
      if (cancelled) return
      // Taken out of the address whether or not it worked, EXCEPT where there
      // was no connection at all, handled above. A link that failed is a link
      // that should not stay on screen.
      url.searchParams.delete(PERSONAL_LINK_PARAM)
      window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash)
      setExchanging(false)
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (exchanging !== false) return
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load, exchanging])

  // The clock ticks on its own so the timer moves between reads.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // A new question empties the boxes.
  useEffect(() => {
    const id = question?.id || null
    if (shownQuestionId.current === id) return
    shownQuestionId.current = id
    setDraft({})
    setNote(null)
    setChosen(null)
  }, [question?.id])

  // The answer already given, so a score or classify question shows what this
  // person chose and lets them change it (R11).
  useEffect(() => {
    if (!question || question.question_type === 'collect') return
    const last = mine[mine.length - 1]
    if (!last) return
    const existing = question.question_type === 'score' ? last.score_value : last.option_value
    if (existing !== null && existing !== undefined && chosen === null) setChosen(existing)
  }, [mine, question, chosen])

  // ---- sending, and keeping trying -----------------------------------
  const flush = useCallback(async () => {
    const items = readQueue()
    if (items.length === 0) { setQueued(0); return }

    const left: QueuedAnswer[] = []
    for (const item of items) {
      try {
        const res = await fetch('/api/room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        })
        if (res.ok) continue
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          // The server has decided, and trying again would get the same answer.
          // The commonest cause is a question that moved on while the device
          // was out of signal, which is a thing the participant should be told
          // once rather than left to wonder about.
          const json = await res.json().catch(() => ({}))
          setNote(json?.error || 'That answer could not be counted.')
          continue
        }
        // A limit, or the server having a bad moment. Keep it and try later.
        left.push(item)
      } catch {
        // No connection. Keep it. This is the ordinary case R32 is about, and
        // it is deliberately silent: the participant did nothing wrong.
        left.push(item)
      }
    }
    writeQueue(left)
    setQueued(left.length)
    if (left.length !== items.length) load()
  }, [load])

  useEffect(() => {
    setQueued(readQueue().length)
    flush()
    const t = setInterval(flush, POLL_MS * 2)
    const onOnline = () => flush()
    window.addEventListener('online', onOnline)
    return () => { clearInterval(t); window.removeEventListener('online', onOnline) }
  }, [flush])

  /** Storage first, sending second. That order is the whole of R32. */
  const send = useCallback((answer: Omit<QueuedAnswer, 'localId'>) => {
    const item: QueuedAnswer = {
      ...answer,
      localId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    }
    const items = readQueue()
    items.push(item)
    writeQueue(items)
    setQueued(items.length)
    flush()
  }, [flush])

  // ---- joining -------------------------------------------------------
  async function join(e: React.FormEvent) {
    e.preventDefault()
    if (joining) return
    setJoining(true); setJoinError(null)
    try {
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', code }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setJoinError(json?.error || 'That code does not open anything. Check it on the screen and try again.')
        setJoining(false)
        return
      }
      setJoining(false)
      load()
    } catch {
      setJoinError('Could not reach the session. Check the connection and try again.')
      setJoining(false)
    }
  }

  const page: React.CSSProperties = {
    minHeight: '100vh',
    background: C.bg,
    color: C.navy,
    padding: '1rem',
    fontFamily: "'Segoe UI',system-ui,sans-serif",
    // Nothing on this page is ever wider than the screen, on any device.
    boxSizing: 'border-box',
    overflowX: 'hidden',
  }
  const card: React.CSSProperties = {
    width: '100%', maxWidth: 560, margin: '0 auto', background: C.card,
    border: `1px solid ${C.border}`, borderRadius: 14, padding: '1.25rem',
    boxSizing: 'border-box',
  }

  if (exchanging !== false || joined === null) {
    return <main style={page}><div style={card}><p style={{ color: C.slate, margin: 0 }}>Opening...</p></div></main>
  }

  // ---- R37. The link is no longer open -------------------------------
  // One sentence and nothing else. Q18, word for word.
  if (closed) {
    return (
      <main style={page}>
        <div style={card}>
          <p style={{ margin: 0, fontSize: '1.1rem', lineHeight: 1.5 }}>{LINK_CLOSED}</p>
        </div>
      </main>
    )
  }

  // ---- not joined: the code box (see PROGRESS.md, Q4) ------------------
  if (!joined) {
    return (
      <main style={page}>
        <div style={card}>
          <h1 style={{ fontFamily: 'Georgia,serif', fontSize: '1.4rem', margin: '0 0 0.6rem' }}>Join the session</h1>
          <p style={{ color: C.slate, margin: '0 0 1rem', lineHeight: 1.5 }}>
            Type the code that is on the screen at the front of the room.
          </p>
          <form onSubmit={join}>
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value); setJoinError(null) }}
              placeholder="XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-label="The code"
              style={{
                width: '100%', boxSizing: 'border-box', fontFamily: 'monospace',
                fontSize: '1.4rem', letterSpacing: '.18em', textAlign: 'center',
                textTransform: 'uppercase', padding: '0.7rem', borderRadius: 10,
                border: `1px solid ${joinError ? C.red : C.border}`, color: C.navy,
                background: 'var(--cv-bg-2, #FAFAF7)',
              }}
            />
            {joinError ? <p role="alert" style={{ color: C.red, margin: '0.6rem 0 0' }}>{joinError}</p> : null}
            <button
              type="submit"
              disabled={joining}
              style={{
                width: '100%', marginTop: '1rem', padding: '0.75rem',
                fontSize: '1rem', fontWeight: 700, border: 'none', borderRadius: 10,
                background: C.teal, color: 'var(--cv-on-accent, #FFFFFF)',
                cursor: joining ? 'default' : 'pointer',
              }}
            >{joining ? 'Opening...' : 'Join'}</button>
          </form>
        </div>
      </main>
    )
  }

  const secondsLeft = timerRemaining(state, now)

  // ---- joined, nothing open (R7) ---------------------------------------
  if (!question) {
    return (
      <main style={page}>
        <div style={card}>
          {/* A personal link knows who is holding it, so it says so. R34's own
              test is that the name is recognised without any code. */}
          {myName ? (
            <p style={{ color: C.slate, margin: '0 0 0.6rem', fontSize: '0.9rem' }}>{myName}</p>
          ) : null}
          <p style={{ margin: 0, fontSize: '1.1rem', lineHeight: 1.5 }}>{NOTHING_OPEN}</p>
          {queued > 0 ? (
            <p style={{ color: C.slate, margin: '0.8rem 0 0', fontSize: '0.9rem' }}>
              {queued === 1 ? '1 answer waiting to send.' : `${queued} answers waiting to send.`}
            </p>
          ) : null}
        </div>
      </main>
    )
  }

  const locked = Boolean(state?.revealed) && question.question_type !== 'collect'

  return (
    <main style={page}>
      <div style={card}>
        {secondsLeft !== null ? (
          <div style={{
            fontFamily: 'monospace', fontSize: '1.6rem', textAlign: 'right',
            color: secondsLeft <= 10 ? C.red : C.slate, marginBottom: '0.4rem',
          }}>{formatTimer(secondsLeft)}</div>
        ) : null}

        <h1 style={{
          fontFamily: 'Georgia,serif', fontSize: '1.35rem', fontWeight: 600,
          lineHeight: 1.3, margin: '0 0 1.1rem',
        }}>{question.question_text}</h1>

        {/* R39 and Q12. THE CONSENT, on the answerer's own screen and not only
            in something a facilitator says aloud and may forget. It sits ABOVE
            the boxes, because a notice underneath the Send button is a notice
            read after the decision it was meant to inform. */}
        {showNotice ? (
          <p style={{
            margin: '0 0 1.1rem', padding: '0.7rem 0.8rem', borderRadius: 8,
            background: 'var(--cv-bg-2, #FAFAF7)', border: `1px solid ${C.border}`,
            color: C.slate, fontSize: '0.92rem', lineHeight: 1.5,
          }}>{ANONYMOUS_NOTICE}</p>
        ) : null}

        {question.question_type === 'collect' ? (
          <CollectInput
            fields={question.target_fields || []}
            draft={draft}
            setDraft={setDraft}
            onSend={() => {
              send({ questionId: question.id, values: draft })
              setDraft({})
            }}
          />
        ) : null}

        {question.question_type === 'score' ? (
          <ScoreInput
            min={question.scale_min}
            max={question.scale_max}
            chosen={typeof chosen === 'number' ? chosen : null}
            locked={locked}
            onChoose={(n) => { setChosen(n); send({ questionId: question.id, score: n }) }}
          />
        ) : null}

        {question.question_type === 'classify' ? (
          <ClassifyInput
            options={question.options || []}
            chosen={typeof chosen === 'string' ? chosen : null}
            locked={locked}
            onChoose={(o) => { setChosen(o); send({ questionId: question.id, option: o }) }}
          />
        ) : null}

        {locked ? (
          <p style={{ color: C.slate, margin: '0.9rem 0 0' }}>
            The answers have been revealed. This can no longer be changed.
          </p>
        ) : null}

        {note ? <p role="alert" style={{ color: C.red, margin: '0.9rem 0 0' }}>{note}</p> : null}

        {queued > 0 ? (
          <p style={{ color: C.slate, margin: '0.9rem 0 0', fontSize: '0.9rem' }}>
            {queued === 1 ? '1 answer waiting to send.' : `${queued} answers waiting to send.`}
          </p>
        ) : null}

        {/* R12. On a collect question everybody sees the answers as they
            arrive. On a score or classify question the server never sends
            them, so there is nothing here to hide. */}
        {question.question_type === 'collect' && everyones.length > 0 ? (
          <div style={{ marginTop: '1.2rem', borderTop: `1px solid ${C.border}`, paddingTop: '0.8rem' }}>
            {everyones.map((row, i) => (
              <div key={i} style={{
                fontSize: '0.95rem', color: C.navy, padding: '0.35rem 0',
                borderBottom: i === everyones.length - 1 ? 'none' : `1px solid ${C.border}`,
              }}>
                {(question.target_fields || [])
                  .map((f) => row.values?.[f.column])
                  .filter(Boolean)
                  .join(' — ')}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  )
}

/**
 * R13. One box per column of the block's table, each under the column's own
 * heading. Never one paragraph box: a paragraph has to be pulled apart by hand
 * afterwards, which is the retyping this whole stage exists to remove.
 */
function CollectInput({
  fields, draft, setDraft, onSend,
}: {
  fields: TargetField[]
  draft: Record<string, string>
  setDraft: (v: Record<string, string>) => void
  onSend: () => void
}) {
  const ready = fields.some((f) => (draft[f.column] || '').trim().length > 0)
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ready) onSend() }}>
      {fields.map((f) => (
        <label key={f.column} style={{ display: 'block', marginBottom: '0.8rem' }}>
          <span style={{
            display: 'block', fontSize: '0.75rem', letterSpacing: '.08em',
            textTransform: 'uppercase', color: C.slate, marginBottom: '0.25rem',
          }}>{f.heading}</span>
          <input
            value={draft[f.column] || ''}
            onChange={(e) => setDraft({ ...draft, [f.column]: e.target.value })}
            style={{
              width: '100%', boxSizing: 'border-box', fontSize: '1rem',
              padding: '0.6rem', borderRadius: 8, border: `1px solid ${C.border}`,
              background: 'var(--cv-bg-2, #FAFAF7)', color: C.navy,
            }}
          />
        </label>
      ))}
      <button
        type="submit"
        disabled={!ready}
        style={{
          width: '100%', marginTop: '0.4rem', padding: '0.75rem', fontSize: '1rem',
          fontWeight: 700, border: 'none', borderRadius: 10,
          background: ready ? C.teal : C.border,
          color: ready ? 'var(--cv-on-accent, #FFFFFF)' : C.slate,
          cursor: ready ? 'pointer' : 'default',
        }}
      >Send</button>
    </form>
  )
}

/**
 * R14 and R11. A row of numbers, one tap. Tapping again changes the answer,
 * until the facilitator reveals.
 */
function ScoreInput({
  min, max, chosen, locked, onChoose,
}: {
  min: number; max: number; chosen: number | null; locked: boolean
  onChoose: (n: number) => void
}) {
  const values: number[] = []
  for (let v = min; v <= max; v += 1) values.push(v)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          disabled={locked}
          onClick={() => onChoose(v)}
          style={{
            flex: '1 1 3.2rem', minWidth: '3.2rem', padding: '0.9rem 0',
            fontSize: '1.3rem', fontWeight: 700, borderRadius: 10,
            border: `1px solid ${chosen === v ? C.teal : C.border}`,
            background: chosen === v ? C.teal : C.card,
            color: chosen === v ? 'var(--cv-on-accent, #FFFFFF)' : C.navy,
            cursor: locked ? 'default' : 'pointer',
          }}
        >{v}</button>
      ))}
    </div>
  )
}

/** R15. The same behaviour as a score, with the question's own options. */
function ClassifyInput({
  options, chosen, locked, onChoose,
}: {
  options: string[]; chosen: string | null; locked: boolean
  onChoose: (o: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          disabled={locked}
          onClick={() => onChoose(o)}
          style={{
            padding: '0.9rem', fontSize: '1.1rem', fontWeight: 600, borderRadius: 10,
            border: `1px solid ${chosen === o ? C.teal : C.border}`,
            background: chosen === o ? C.teal : C.card,
            color: chosen === o ? 'var(--cv-on-accent, #FFFFFF)' : C.navy,
            cursor: locked ? 'default' : 'pointer',
          }}
        >{o}</button>
      ))}
    </div>
  )
}
