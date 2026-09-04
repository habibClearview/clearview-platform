'use client'
// ============================================================
// THE READINESS DIAGNOSTIC.
//
// One question per screen with a progress bar, then the score, then an
// optional email for the written report.
//
// THE SCORE IS NEVER GATED. It appears the moment the tenth question is
// answered, whether or not an address is given. Gating the number kills
// completions; gating the thing you would put in front of your leadership
// team does not, and the emailed report is that thing.
//
// The number shown here is worked out from the reader's own answers, which is
// safe because they are their own. When an address is given the server scores
// the same answers again and uses ITS result for the email and the tag, so a
// figure posted from a browser can never decide what Habib's list believes.
// ============================================================
import { useState } from 'react'
import Link from 'next/link'
import { C } from '@/components/site/tokens'
import { READINESS } from '@/lib/readiness-questions'

type Answers = Record<string, boolean | undefined>

export const SCORE_CSS = `
.hb .q-card{background:${C.creamWarm};color:${C.ink};padding:44px 40px;max-width:820px}
.hb .q-bar{height:6px;background:rgba(18,34,44,.14);margin-bottom:34px}
.hb .q-bar i{display:block;height:6px;background:${C.cyan};transition:width .35s ease}
.hb .q-n{font-size:14px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.teal}}
.hb .q-t{font-size:clamp(24px,3.2vw,38px);font-weight:600;line-height:1.22;letter-spacing:-0.02em;margin:18px 0 34px}
.hb .q-yn{display:flex;gap:2px}
.hb .q-yn button{flex:1;font-family:inherit;font-size:20px;font-weight:600;padding:22px;
  border:2px solid ${C.ink};background:transparent;color:${C.ink};cursor:pointer}
.hb .q-yn button:hover{background:${C.ink};color:${C.cream}}
.hb .q-back{margin-top:26px;background:none;border:none;font-family:inherit;font-size:16px;
  color:${C.slate};cursor:pointer;text-decoration:underline;padding:0}
.hb .sc-head{display:flex;align-items:baseline;gap:22px;flex-wrap:wrap}
.hb .sc-n{font-size:clamp(66px,11vw,150px);font-weight:700;letter-spacing:-0.05em;line-height:0.86}
.hb .sc-band{font-size:15px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${C.cyan}}
.hb .gap{border-left:5px solid ${C.gold};padding:18px 0 18px 24px;margin-top:2px;background:rgba(245,245,220,.05)}
.hb .gap h4{font-size:20px}
.hb .gap .cost{margin-top:10px;opacity:.82}
.hb .gap .at{margin-top:12px;font-size:14.5px;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;color:${C.cyan}}
@media (max-width:640px){
  .hb .q-card{padding:26px 22px}
  .hb .q-yn{flex-direction:column}
}
`

function bandOf(score: number) {
  if (score < 6) return { key: 'below', label: 'Below threshold' }
  if (score >= 8) return { key: 'strong', label: 'Strong readiness' }
  return { key: 'moderate', label: 'Moderate readiness' }
}

const MEANING: Record<string, { headline: (n: number) => string; meaning: string; next: string }> = {
  below: {
    headline: (n) => `${n} out of 10. There is groundwork to do before a commercial move will hold.`,
    meaning: 'A score under six does not mean the organisation is not viable. It means the foundations a paying service stands on are not in place yet, and selling before they are is how organisations spend a year proving something they could have found out in a month.',
    next: 'Take the two lowest numbered gaps below. They come first for a reason: nothing later holds without them.',
  },
  moderate: {
    headline: (n) => `${n} out of 10. Real momentum, with specific holes in it.`,
    meaning: 'A score in the middle is the most common result and the most useful one, because the gaps are specific rather than general. You are not starting from nothing, and you are not ready to sell either.',
    next: 'Read the gaps in order. If most sit in Decision Points 2 and 3, the issue is customer clarity. If they sit in Decision Point 4, the issue is money. Those need different first moves.',
  },
  strong: {
    headline: (n) => `${n} out of 10. The foundations are there.`,
    meaning: 'Eight or more says the hard conversations have already happened internally. What usually separates an organisation here from one earning commercial revenue is not readiness, it is sequence.',
    next: 'Close what is left below first. At this score they are usually quick, and each is a decision later work depends on.',
  },
}

export default function ScoreFlow() {
  const [i, setI] = useState(-1)
  const [answers, setAnswers] = useState<Answers>({})
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailed, setEmailed] = useState<null | { emailed: boolean }>(null)

  const total = READINESS.length
  const done = i >= total

  const answer = (v: boolean) => {
    setAnswers((a) => ({ ...a, [READINESS[i].id]: v }))
    setI((n) => n + 1)
  }

  const score = READINESS.filter((q) => answers[q.id] === true).length
  const gaps = READINESS.filter((q) => answers[q.id] !== true)
  const band = bandOf(score)
  const copy = MEANING[band.key]

  async function sendReport(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim()) { setError('An email address is needed to send the report.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, firstName, organisation, answers,
          referrer: typeof window !== 'undefined' ? window.location.href : '',
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out?.error || 'That did not go through. Try again in a moment.'); return }
      setEmailed(out)
    } catch {
      setError('That did not go through. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  // ── not started ──
  if (i < 0) {
    return (
      <div className="q-card" data-reveal>
        <p className="q-n">Ten questions. Two minutes.</p>
        <p className="q-t" style={{ marginBottom: 22 }}>The same ten I ask in a first session.</p>
        <p style={{ color: C.slate, marginBottom: 32 }}>
          Answer honestly. A low score is more useful than a flattering one, because it tells you
          where your work starts. Your score appears on screen whether or not you give an email.
        </p>
        <button className="btn" type="button" onClick={() => setI(0)}>Begin. Question 1 of 10.</button>
      </div>
    )
  }

  // ── in progress ──
  if (!done) {
    const q = READINESS[i]
    return (
      <div className="q-card">
        <div className="q-bar"><i style={{ width: `${(i / total) * 100}%` }} /></div>
        <p className="q-n">Question {i + 1} of {total}</p>
        <p className="q-t">{q.question}</p>
        <div className="q-yn">
          <button type="button" onClick={() => answer(true)}>Yes</button>
          <button type="button" onClick={() => answer(false)}>No</button>
        </div>
        {i > 0 ? (
          <button className="q-back" type="button" onClick={() => setI((n) => n - 1)}>Back a question</button>
        ) : null}
      </div>
    )
  }

  // ── the result ──
  return (
    <div>
      <div className="sc-head">
        <span className="sc-n">{score}<span style={{ fontSize: '0.34em', opacity: 0.5 }}> / {total}</span></span>
        <span className="sc-band">{band.label}</span>
      </div>
      <h2 style={{ margin: '26px 0 18px', maxWidth: '20ch' }}>{copy.headline(score)}</h2>
      <p className="lede" style={{ opacity: 0.86, maxWidth: '62ch' }}>{copy.meaning}</p>

      {gaps.length ? (
        <>
          <h3 style={{ margin: '52px 0 22px' }}>Where the gaps are</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {gaps.map((g) => (
              <div className="gap" key={g.id}>
                <h4>{g.question}</h4>
                <p className="cost">{g.ifNot}</p>
                <div className="at">Settled at {g.settledAt}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p style={{ marginTop: 40, fontWeight: 600 }}>You answered yes to all ten. That is rare, and worth testing.</p>
      )}

      <h3 style={{ margin: '52px 0 16px' }}>What to do next</h3>
      <p className="lede" style={{ opacity: 0.86, maxWidth: '62ch' }}>{copy.next}</p>

      <div style={{ background: C.creamWarm, color: C.ink, padding: '44px 40px', marginTop: 52 }}>
        {emailed ? (
          <div>
            <h3 style={{ marginBottom: 12 }}>
              {emailed.emailed ? 'On its way.' : 'Saved, but the email did not send.'}
            </h3>
            <p style={{ color: C.slate }}>
              {emailed.emailed
                ? 'Check your inbox for the written version, and the spam folder if it is not there in a few minutes.'
                : 'Your score is above. The emailed copy could not be sent just now, so take a screenshot before you close this.'}
            </p>
            <p style={{ marginTop: 26 }}>
              <Link className="btn" href="/contact" style={{ background: C.ink, color: C.cream }}>
                Talk it through with me
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={sendReport} className="fm">
            <h3 style={{ marginBottom: 10 }}>Where should the report go?</h3>
            <p style={{ color: C.slate, marginBottom: 8 }}>
              Your score is above either way. The emailed copy is the one you can put in front of
              your leadership team.
            </p>
            <div>
              <label htmlFor="sc-email">Email address</label>
              <input id="sc-email" type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@organisation.org" />
            </div>
            <div className="row">
              <div>
                <label htmlFor="sc-name">First name</label>
                <input id="sc-name" type="text" autoComplete="given-name"
                  value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label htmlFor="sc-org">Organisation</label>
                <input id="sc-org" type="text" autoComplete="organization"
                  value={organisation} onChange={(e) => setOrganisation(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div>
              <button className="btn" type="submit" disabled={busy}
                style={{ background: C.ink, color: C.cream, opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Sending...' : 'Send me the report'}
              </button>
            </div>
            {error ? <p className="err">{error}</p> : null}
            <p className="note">
              Your address goes on the Viable by Design list and nowhere else. Every email has an
              unsubscribe link.
            </p>
          </form>
        )}
      </div>

      <p style={{ marginTop: 34 }}>
        <button className="q-back" type="button" onClick={() => { setI(-1); setAnswers({}); setEmailed(null) }}>
          Answer again
        </button>
      </p>
    </div>
  )
}
