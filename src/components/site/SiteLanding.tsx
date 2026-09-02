// @ts-nocheck
'use client'
// ============================================================
// THE PUBLIC SITE at habibonifade.com
//
// Not the platform. A stranger who arrives here has never heard of the method
// and is not going to read a consultant's biography, so the page is built
// around the one thing they can do rather than around who Habib is: answer ten
// questions and find out where their own organisation actually stands.
//
// The ten questions are the ones asked inside a real engagement, and the
// scoring bands are the coach's bands, so somebody who scores four here and
// then hears a different number in the first session does not have grounds to
// distrust both. The score is worked out on the server; this page sends
// answers and renders what comes back.
//
// The canvas is the same nine decision points the client sees, read from
// gtcv-blocks, drawn lighter because a cold visitor needs the shape of the
// method rather than every bullet in it.
//
// The two social links are configuration, not content. A button that goes
// nowhere is worse than no button, so each one renders only when its address
// is set.
// ============================================================
import { useState } from 'react'
import { BLOCK, dpNumber, CANVAS_BLOCK_IDS } from '@/lib/gtcv-blocks'
import CanvasDrawing, { CANVAS_CSS } from '@/components/gtcv/CanvasDrawing'

// The newsletter and the channel. These are public addresses rather than
// secrets, so they live here where they can be read and corrected, with an
// environment variable able to override either without a deploy.
//
// The channel's handle reads DevTVorg and the channel itself displays as
// HabibOnifade, so a visitor who clicks through lands on a page with the right
// name on it. The button says where it goes either way: a link whose
// destination is a surprise is a link people stop trusting.
const LINKEDIN = (process.env.NEXT_PUBLIC_LINKEDIN_NEWSLETTER_URL
  || 'https://www.linkedin.com/newsletters/viable-by-design-7280979699525120000/').trim()
const YOUTUBE = (process.env.NEXT_PUBLIC_YOUTUBE_URL
  || 'https://www.youtube.com/@DevTVorg').trim()

const IN_ORDER = [...CANVAS_BLOCK_IDS].sort((a, b) => (dpNumber(a) || 0) - (dpNumber(b) || 0))

const CSS = `
.hs{
  --paper:#EDE6D6; --card:#FBF7EE; --box:#FFFDF8;
  --ink:#1B2A41; --ink-soft:#4C5A6B; --ink-faint:#8B8272;
  --line:rgba(27,42,65,.16);
  --gold:#B7791F; --navy:#22344F; --teal:#00767A; --purple:#6B4A8B;
  --good:#2E7D32; --red:#C0392B;
  --box:#FFFDF8; --line-soft:rgba(27,42,65,.09);
  --spine:#1B2A41; --spine-ink:#EFEADD;
  --shadow:0 1px 2px rgba(27,42,65,.05), 0 10px 30px rgba(27,42,65,.09);
  /* Handed to CanvasDrawing, which reads these names and nothing else about
     this page. The dark palette below redefines the sources, so the drawing
     follows without knowing dark mode exists. */
  --cvx-card:var(--card); --cvx-box:var(--box); --cvx-ink:var(--ink);
  --cvx-ink-soft:var(--ink-soft); --cvx-ink-faint:var(--ink-faint);
  --cvx-line:var(--line); --cvx-line-soft:var(--line-soft);
  --cvx-gold:var(--gold); --cvx-navy:var(--navy); --cvx-teal:var(--teal);
  --cvx-purple:var(--purple); --cvx-spine:var(--spine); --cvx-spine-ink:var(--spine-ink);
  --cvx-shadow:var(--shadow); --cvx-fd:var(--cv-font); --cvx-fm:var(--cv-font);
  --fd:var(--cv-font); --fb:var(--cv-font); --fm:var(--cv-font);
  background:var(--paper); color:var(--ink); font-family:var(--fb);
  line-height:1.6; min-height:100vh; -webkit-font-smoothing:antialiased;
}
@media (prefers-color-scheme:dark){
  .hs{
    --paper:#0B1420; --card:#111E31; --box:#16243A;
    --ink:#EDF2F8; --ink-soft:#AAB9C9; --ink-faint:#7c899b;
    --line:rgba(255,255,255,.16);
    --gold:#E0B15A; --navy:#3E5C8A; --teal:#2AEBEB; --purple:#B79AD6;
    --good:#6FBF73; --red:#E77C6E;
    --box:#16243A; --line-soft:rgba(255,255,255,.08);
    --spine:#0A1422; --spine-ink:#EDF2F8;
    --shadow:0 1px 2px rgba(0,0,0,.3), 0 12px 34px rgba(0,0,0,.4);
  }
}
.hs *{box-sizing:border-box}
.hs .wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.hs .top{background:#1B2A41;color:#EFEADD}
.hs .top-in{max-width:1080px;margin:0 auto;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.hs .brand{display:flex;flex-direction:column;line-height:1.15}
.hs .brand .k{font-family:var(--fm);font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#D9A441}
.hs .brand .w{font-family:var(--fd);font-size:20px;font-weight:600}
.hs .top a{color:#EFEADD;text-decoration:none;font-size:14px;border:1px solid rgba(239,234,221,.35);border-radius:999px;padding:6px 14px}

.hs .hero{padding:52px 0 8px}
.hs .eyebrow{font-family:var(--fm);font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--teal);margin:0 0 10px}
.hs .hero h1{font-family:var(--fd);font-weight:600;font-size:clamp(30px,5.6vw,54px);line-height:1.08;margin:0;letter-spacing:-.015em;max-width:24ch}
.hs .hero .sub{margin:18px 0 0;font-size:clamp(16px,2.1vw,19px);color:var(--ink-soft);max-width:60ch}
.hs .hero .sub b{color:var(--ink)}
.hs .cta-row{display:flex;gap:12px;flex-wrap:wrap;margin:26px 0 0}
.hs .btn{
  display:inline-block;font-family:var(--fb);font-size:16px;font-weight:600;
  border-radius:10px;padding:13px 22px;cursor:pointer;border:1px solid transparent;text-decoration:none;
}
.hs .btn.primary{background:var(--teal);color:#fff}
.hs .btn.ghost{background:transparent;color:var(--ink);border-color:var(--line)}
.hs .btn:disabled{opacity:.55;cursor:default}

.hs section{padding:44px 0}
.hs h2{font-family:var(--fd);font-size:clamp(22px,3.2vw,30px);font-weight:600;margin:0 0 10px;line-height:1.2}
.hs .lede{color:var(--ink-soft);margin:0 0 24px;max-width:66ch;font-size:16.5px}

.hs .truth{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:12px;padding:22px 24px;margin:0 0 8px}
.hs .truth p{margin:0 0 12px;font-size:16.5px}
.hs .truth p:last-child{margin:0}


.hs .quiz{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px}
.hs .qrow{display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--line)}
.hs .qrow:last-of-type{border-bottom:none}
.hs .qrow .qt{flex:1;font-size:15.5px;line-height:1.45}
.hs .yn{display:flex;gap:6px;flex-shrink:0}
.hs .yn button{
  font-family:var(--fb);font-size:14px;font-weight:600;border-radius:8px;padding:7px 16px;
  cursor:pointer;border:1px solid var(--line);background:var(--box);color:var(--ink-soft);min-width:58px;
}
.hs .yn button[aria-pressed="true"].y{background:var(--good);border-color:var(--good);color:#fff}
.hs .yn button[aria-pressed="true"].n{background:var(--ink-faint);border-color:var(--ink-faint);color:#fff}
.hs .counter{font-family:var(--fm);font-size:13px;color:var(--ink-faint);margin:0 0 4px}

.hs .capture{margin-top:22px;padding-top:22px;border-top:1px solid var(--line)}
.hs label{display:block;font-size:13.5px;font-weight:600;margin:0 0 5px;color:var(--ink)}
.hs input{
  width:100%;font-family:var(--fb);font-size:16px;padding:11px 13px;border-radius:9px;
  border:1px solid var(--line);background:var(--box);color:var(--ink);
}
.hs .fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:16px}
.hs .privacy{font-size:13.5px;color:var(--ink-faint);margin:12px 0 0}
.hs .err{color:var(--red);font-size:14.5px;margin:12px 0 0;font-weight:600}

.hs .result{background:var(--card);border:1px solid var(--line);border-top:4px solid var(--teal);border-radius:14px;padding:26px}
.hs .score{font-family:var(--fd);font-size:clamp(34px,7vw,52px);font-weight:600;line-height:1;margin:0}
.hs .bandlab{font-family:var(--fm);font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--teal);margin:8px 0 0}
.hs .result h3{font-family:var(--fd);font-size:20px;font-weight:600;margin:18px 0 0;line-height:1.25}
.hs .result p{color:var(--ink-soft);margin:10px 0 0;font-size:16px}
.hs .gap{background:var(--box);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-top:12px}
.hs .gap .gq{font-weight:600;font-size:15.5px}
.hs .gap .gw{color:var(--ink-soft);font-size:14.5px;margin-top:6px}
.hs .gap .gs{font-family:var(--fm);font-size:12.5px;color:var(--teal);margin-top:8px}

.hs .social{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.hs .soc{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 22px}
.hs .soc h3{font-family:var(--fd);font-size:18px;font-weight:600;margin:0 0 8px}
.hs .soc p{margin:0 0 16px;color:var(--ink-soft);font-size:15px}

.hs .foot{border-top:1px solid var(--line);margin-top:20px;padding:26px 0 46px;text-align:center;color:var(--ink-faint);font-size:13.5px}
.hs .foot p{margin:0 0 6px}

@media (max-width:560px){
  .hs .qrow{flex-direction:column;gap:10px}
  .hs .yn{width:100%}
  .hs .yn button{flex:1}
  .hs .btn{width:100%;text-align:center}
  .hs section{padding:34px 0}
  .hs .quiz,.hs .result{padding:18px}
}
`

function Result({ data, onRetake }) {
  return (
    <div className="result">
      <p className="score">{data.score} <span style={{ fontSize: '0.42em', color: 'var(--ink-faint)' }}>/ {data.total}</span></p>
      <p className="bandlab">{data.bandLabel}</p>
      <h3>{data.headline}</h3>
      <p>{data.meaning}</p>

      {data.gaps.length > 0 ? (
        <>
          <h3>Where the gaps are</h3>
          {data.gaps.map((g, i) => (
            <div className="gap" key={i}>
              <div className="gq">{g.question}</div>
              <div className="gw">{g.ifNot}</div>
              <div className="gs">Settled at: {g.settledAt}</div>
            </div>
          ))}
        </>
      ) : null}

      <h3>What to do next</h3>
      <p>{data.nextStep}</p>

      <p className="privacy">
        {data.emailed
          ? 'A copy is on its way to your inbox. If it is not there in a few minutes, look in the spam folder.'
          : 'Your score is above. The emailed copy could not be sent just now, so take a screenshot of this before you close it.'}
      </p>
      <div className="cta-row">
        <button type="button" className="btn ghost" onClick={onRetake}>Answer again</button>
      </div>
    </div>
  )
}

// The ten questions arrive from the server rather than being imported here,
// so the browser is not shipped the whole coaching library to draw a form, and
// so there is exactly one list: the engagement's own.
export default function SiteLanding({ questions }) {
  const [answers, setAnswers] = useState({})
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const QUESTIONS = questions || []
  const answered = QUESTIONS.filter((q) => answers[q.id] !== undefined).length

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (!email.trim()) { setError('An email address is needed to send the score.'); return }
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
      setResult(out)
      if (typeof window !== 'undefined') {
        document.getElementById('assessment')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    } catch {
      setError('That did not go through. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hs">
      <style dangerouslySetInnerHTML={{ __html: CSS + CANVAS_CSS }} />

      <header className="top">
        <div className="top-in">
          <div className="brand">
            <span className="k">The Canvas Coach</span>
            <span className="w">Habib Onifade</span>
          </div>
          <a href="#assessment">Score your organisation</a>
        </div>
      </header>

      <div className="wrap">

        <section className="hero">
          <p className="eyebrow">Grant-to-Commercial Viability Canvas</p>
          <h1>The grant will end. The question is what you are selling when it does.</h1>
          <p className="sub">
            Most organisations facing that deadline write a better proposal. The ones that get out
            do something harder: they find out which of their services somebody would actually pay
            for, what those services cost to deliver, and who holds the budget.
            <b> Nine decisions, in order, each one closed on evidence.</b>
          </p>
          <div className="cta-row">
            <a className="btn primary" href="#assessment">Score your organisation in two minutes</a>
            <a className="btn ghost" href="#canvas">See the nine decisions</a>
          </div>
        </section>

        <section>
          <div className="truth">
            <p>
              A grant pays you to deliver. A client pays you to solve something. Those are different
              businesses, and most organisations discover the difference in the last six months of
              funding, which is the worst possible time to find out.
            </p>
            <p>
              The work is not marketing and it is not a new proposal. It is finding out which of
              your services survives contact with somebody holding a budget — and being willing to
              stop the ones that do not.
            </p>
          </div>
        </section>

        <section id="canvas">
          <h2>Nine decisions, in the order they have to be taken</h2>
          <p className="lede">
            Each one asks a single question, produces a specific output, and does not close until
            there is evidence behind it and a signature on it. No decision opens until the one
            before it has closed — and the engagement can be stopped at any of them.
          </p>
          <CanvasDrawing strap="Nine decisions, in order, each closed on evidence and signed before the next one opens" />
        </section>

        <section id="assessment">
          <h2>Where does your organisation actually stand?</h2>
          <p className="lede">
            Ten questions — the same ten asked in the first session of a real engagement. Answer
            honestly; a low score is more useful than a flattering one, because it tells you which
            decision your work starts at. You get the score and the gaps by email.
          </p>

          {result ? (
            <Result data={result} onRetake={() => { setResult(null); setAnswers({}) }} />
          ) : (
            <form className="quiz" onSubmit={submit}>
              <p className="counter">{answered} of {QUESTIONS.length} answered</p>
              {QUESTIONS.map((q) => (
                <div className="qrow" key={q.id}>
                  <span className="qt">{q.question}</span>
                  <span className="yn">
                    <button
                      type="button" className="y" aria-pressed={answers[q.id] === true}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: true }))}
                    >Yes</button>
                    <button
                      type="button" className="n" aria-pressed={answers[q.id] === false}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: false }))}
                    >No</button>
                  </span>
                </div>
              ))}

              <div className="capture">
                <div className="fields">
                  <div>
                    <label htmlFor="hs-email">Email address</label>
                    <input
                      id="hs-email" type="email" required autoComplete="email"
                      value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@organisation.org"
                    />
                  </div>
                  <div>
                    <label htmlFor="hs-name">First name</label>
                    <input
                      id="hs-name" type="text" autoComplete="given-name"
                      value={firstName} onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label htmlFor="hs-org">Organisation</label>
                    <input
                      id="hs-org" type="text" autoComplete="organization"
                      value={organisation} onChange={(e) => setOrganisation(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? 'Scoring...' : 'Send me my score'}
                </button>
                {error ? <p className="err">{error}</p> : null}
                <p className="privacy">
                  Unanswered questions count as a no. Your address goes on the newsletter list and
                  nowhere else, every email has an unsubscribe link, and the list is never shared
                  or sold.
                </p>
              </div>
            </form>
          )}
        </section>

        {(LINKEDIN || YOUTUBE) ? (
          <section>
            <h2>Where the thinking gets published</h2>
            <p className="lede">
              The method did not come from a book. It came from working with organisations trying to
              make this exact transition, and what is learned goes out as it happens.
            </p>
            <div className="social">
              {LINKEDIN ? (
                <div className="soc">
                  <h3>Viable by Design</h3>
                  <p>
                    The newsletter, on LinkedIn. What is actually working, what is not, and the
                    decisions organisations get wrong on the way from grant funding to earned
                    revenue.
                  </p>
                  <a className="btn primary" href={LINKEDIN} target="_blank" rel="noopener noreferrer">
                    Subscribe to Viable by Design
                  </a>
                </div>
              ) : null}
              {YOUTUBE ? (
                <div className="soc">
                  <h3>On video</h3>
                  <p>
                    The same thinking, talked through rather than written down, on Habib&rsquo;s
                    YouTube channel.
                  </p>
                  <a className="btn ghost" href={YOUTUBE} target="_blank" rel="noopener noreferrer">
                    Watch on YouTube
                  </a>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="foot">
          <p>Grant-to-Commercial Viability Canvas&trade; · Habib Onifade · The Canvas Coach</p>
          <p>habibonifade.com</p>
        </div>

      </div>
    </div>
  )
}
