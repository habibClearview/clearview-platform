'use client'
// ============================================================
// RUNNING A QUESTION FROM INSIDE THE BLOCK  (C44, C49, C50, C51, C46)
//
// WHAT WAS WRONG. The room controls lived in "Sessions and rooms" and the
// tables lived in the block, so the facilitator had to move between two
// unrelated pages to run one session — watching answers arrive on one screen
// while the table they land in was on another.
//
// SO THIS BAR SITS IN THE BLOCK, above the table, and everything needed to run
// a question is on it: the question, the count against room size, the
// connection state, how many devices are in the room, Reveal, Next question,
// and Open the projected view. C44's test is a whole question run from opening
// to reveal to agreement without leaving the block.
//
// C50: THE TABLE STAYS. It is not hidden or frozen while a question runs;
// pending rows arrive beneath it with this bar still on screen. That is the
// whole point — the answers land where the work is.
//
// C46: the projection is the only thing that opens in a second tab, and this
// tab keeps working while it is open, because neither depends on the other.
// Both simply ask the server.
//
// C51: the device count is its own number and is NEVER folded into the answer
// count. A phone going to sleep must not read as a person who has answered.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import { answerCounter, formatTimer, timerRemaining } from '@/lib/stage1-questions'
import { NO_QUESTIONS_YET } from '@/lib/stage1-question-sets'

const C = {
  navy: '#0B1F33', ink: '#FFFFFF', quiet: 'rgba(255,255,255,0.66)',
  border: 'rgba(255,255,255,0.2)', teal: '#2A9D8F', amber: '#D98C1F',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const POLL_MS = 1500
const STALE_MS = 4000

export default function RoomControlBar({
  clientId, dpId, canManage, tool = 1,
}: { clientId: string; dpId: string; canManage: boolean; tool?: number }) {
  const [feed, setFeed] = useState<any>(null)
  const [live, setLive] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [lastGood, setLastGood] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!clientId || !dpId || !canManage) return
    try {
      const res = await authedFetch(
        `/api/facilitate?clientId=${encodeURIComponent(clientId)}&gateId=${encodeURIComponent(dpId)}`,
        { cache: 'no-store' },
      )
      if (!res.ok) return
      setFeed(await res.json())
      setLastGood(Date.now())
      setLive(true)
    } catch {
      // Nothing arrived. What is on screen stays, and the indicator turns over
      // on its own once the gap is long enough to matter.
    }
  }, [clientId, dpId, canManage])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now())
      setLive(Date.now() - lastGood < STALE_MS)
    }, 1000)
    return () => clearInterval(t)
  }, [lastGood])

  const act = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true)
    try {
      await authedFetch('/api/facilitate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, gateId: dpId, ...payload }),
      })
      await load()
    } catch {
      /* The next read shows whether it landed. */
    }
    setBusy(false)
  }, [clientId, dpId, load])

  if (!canManage) return null

  // ─────────────────────────────────────────────────────────
  // THIS TOOL'S QUESTIONS, AND ONLY THIS TOOL'S. 15 August 2026.
  //
  // Phase 0 is five tools on one block. A bar drawn against Tool 2's heading
  // that offers Tool 1's questions is the fault that already cost a week in
  // another form: "signal, or story?" is Tool 4's question and was being asked
  // from Tool 1. Rows written before the tool column default to 1, so nothing
  // that already exists changes tool.
  // ─────────────────────────────────────────────────────────
  const questions = (feed?.questions || []).filter((q: any) => (q.tool ?? 1) === tool)
  const state = feed?.state || null
  const open = questions.find((q: any) => q.id === state?.open_question_id) || null
  const secondsLeft = timerRemaining(state, now)

  // C81. Present but disabled on a block with no questions, with the sentence
  // beside it word for word.
  if (questions.length === 0) {
    return (
      <div style={bar}>
        <button type="button" disabled style={{ ...btn(C.teal), opacity: 0.4, cursor: 'default' }}>
          Run this with the room
        </button>
        <span style={{ color: C.quiet, fontSize: 13 }}>{NO_QUESTIONS_YET}</span>
      </div>
    )
  }

  // Nothing open: one question is opened, never a block (R3).
  if (!open) {
    return (
      <div style={bar}>
        <span style={{ ...mono, fontSize: 12.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.quiet }}>
          Run this with the room
        </span>
        <select
          value=""
          disabled={busy}
          onChange={(e) => { if (e.target.value) act({ action: 'open', questionId: e.target.value }) }}
          aria-label="Open a question to the room"
          style={select}
        >
          <option value="">Open a question...</option>
          {questions.map((q: any, i: number) => (
            <option key={q.id} value={q.id}>{i + 1}. {q.question_text}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div style={{ ...bar, alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: 'var(--cv-font)', fontSize: 18, lineHeight: 1.3 }}>
        {open.question_text}
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* The answer count. C51: the device figure below is separate and is
            never mixed into this one. */}
        <span style={{ ...mono, fontSize: 20 }}>
          {answerCounter(feed?.answered ?? 0, state?.room_size ?? null)}
        </span>
        {secondsLeft !== null ? (
          <span style={{ ...mono, fontSize: 18, color: secondsLeft <= 10 ? C.amber : C.quiet }}>
            {formatTimer(secondsLeft)}
          </span>
        ) : null}
        <span style={{ ...mono, fontSize: 12.5, color: live ? C.teal : C.amber }}>
          {live ? 'connected' : 'reconnecting'}
        </span>
        <span style={{ ...mono, fontSize: 12.5, color: C.quiet }}>
          {(feed?.connectedDevices ?? 0) === 1 ? '1 device in the room' : `${feed?.connectedDevices ?? 0} devices in the room`}
        </span>
      </div>

      {/* C56, C60. Two switches, independent, changeable while the question is
          open. Every device sees the change on its next read. */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5 }}>
        {[
          { key: 'answersVisible', label: 'Answers visible', on: !!open.answers_visible },
          { key: 'authorsVisible', label: 'Authors visible', on: !!open.authors_visible },
        ].map((sw) => (
          <label key={sw.key} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', cursor: 'pointer', color: C.quiet }}>
            <input
              type="checkbox"
              checked={sw.on}
              disabled={busy}
              onChange={(e) => act({ action: 'setVisibility', questionId: open.id, [sw.key]: e.target.checked })}
            />
            {sw.label}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={busy || Boolean(state?.revealed)}
          onClick={() => act({ action: 'reveal' })}
          style={state?.revealed ? { ...btn(C.border), opacity: 0.5 } : btn(C.teal)}
        >Reveal</button>

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const next = questions.find((q: any) => q.sort_order > open.sort_order)
            if (next) act({ action: 'open', questionId: next.id })
            else act({ action: 'close' })
          }}
          style={btn(C.border)}
        >Next question</button>

        {/* C46. The ONLY thing that opens in a second tab, and this one carries
            on working while it is open. */}
        <button
          type="button"
          onClick={() => window.open(
            `/coach/facilitate?clientId=${encodeURIComponent(clientId)}&gateId=${encodeURIComponent(dpId)}`,
            '_blank',
            'noopener',
          )}
          style={btn(C.border)}
        >Open the projected view</button>
      </div>
    </div>
  )
}

const bar: React.CSSProperties = {
  background: C.navy, color: C.ink, borderRadius: 12, padding: '12px 16px',
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  fontFamily: "var(--cv-font)", marginBottom: 12,
}
const select: React.CSSProperties = {
  ...mono, fontSize: 13, padding: '6px 10px', borderRadius: 8,
  border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.3)', color: C.ink,
  maxWidth: '32rem',
}
function btn(colour: string): React.CSSProperties {
  return {
    ...mono, fontSize: 13, fontWeight: 700, padding: '7px 14px', borderRadius: 8,
    border: `1px solid ${colour}`, background: colour === C.teal ? colour : 'transparent',
    color: C.ink, cursor: 'pointer',
  }
}
