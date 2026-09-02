// @ts-nocheck
// ============================================================
// THE SHOWCASE PAGE
//
// What a prospect sees. Not a component that fetches anything: it is handed
// exactly what the server allowlist returned and can show nothing else, which
// is the entire security model. There is no client on this page, no session,
// no Supabase call and no data behind what is rendered.
//
// It shows the method, which is the thing worth showing, and one line about
// how far a real engagement has got, which is what makes it more than a
// brochure. It does not name the organisation unless that engagement has
// agreed to be named, and it never shows anything the engagement produced.
//
// WHAT WAS WRONG WITH IT. 2 September 2026. Three things, and all three made
// the page read as unfinished to the one audience that has to be convinced by
// it.
//
//   It was incomplete. The page looped nine identifiers, BLOCK held eight, and
//   the missing one was dropped without a word under a heading that said nine.
//   Fixed in gtcv-blocks.ts, where the ninth now exists.
//
//   It was a different drawing. The client's page lays the canvas out the way
//   the method does: three columns, a transition row, the diagnostic across
//   the bottom. This page laid the same nine boxes out as a plain grid that
//   reflowed to whatever the window was. A prospect who becomes a client saw
//   two different methods. Both pages now read the layout from one place.
//
//   It started at Decision Point 1. The engagement does not. A charter is
//   agreed and signed, three questions are asked of the Executive Director and
//   signed, the ground is cleared, and an evidence library runs underneath the
//   whole thing. That work is most of the reason the method is worth buying,
//   and it was the part the link did not show.
//
// A dead, revoked or expired link renders the same page as a link that never
// existed. Telling a stranger which one it was tells them something about a
// token they do not hold.
// ============================================================
import {
  BLOCK, SPINE, CANVAS_COLUMNS, CANVAS_ROWS, TRANSITION_ROW, TRANSITION_LABEL,
  SPINE_BLOCK_ID, CANVAS_BLOCK_IDS, BEFORE_THE_CANVAS, RUNS_UNDERNEATH, dpLabel, dpNumber,
} from '@/lib/gtcv-blocks'

// The whole arc, in order, for the path across the top. The steps before the
// first decision point are named here because the point of showing the path is
// that the engagement does not begin at Decision Point 1.
const PATH = [
  { id: 'charter', lab: 'Charter', glyph: '§' },
  { id: 'diagnostic', lab: 'Diagnostic', glyph: '?' },
  { id: 'phase_0', lab: 'Clear ground', glyph: '·' },
  // Numeric order, not canvas order: the canvas draws six before five because
  // of where they sit in the columns, but the path is the sequence they are
  // worked in and the number on the node has to be the block's own number.
  ...[...CANVAS_BLOCK_IDS]
    .sort((a, b) => (dpNumber(a) || 0) - (dpNumber(b) || 0))
    .map((id) => ({ id, lab: BLOCK[id].short, glyph: String(dpNumber(id)) })),
  { id: 'handover', lab: 'Hand over', glyph: '★' },
]

const CSS = `
.sc{
  --paper:#EDE6D6; --card:#FBF7EE; --box:#FFFDF8;
  --ink:#1B2A41; --ink-soft:#4C5A6B; --ink-faint:#8B8272;
  --line:rgba(27,42,65,.16); --line-soft:rgba(27,42,65,.09);
  --gold:#B7791F; --navy:#22344F; --teal:#00767A; --purple:#6B4A8B;
  --idle:#BDB4A0;
  --spine:#1B2A41; --spine-ink:#EFEADD;
  --shadow:0 1px 2px rgba(27,42,65,.05), 0 10px 30px rgba(27,42,65,.09);
  --fd:var(--cv-font);
  --fb:var(--cv-font);
  --fm:var(--cv-font);
  background:var(--paper); color:var(--ink); font-family:var(--fb);
  line-height:1.55; min-height:100vh; padding:0 20px 70px;
  -webkit-font-smoothing:antialiased;
}
@media (prefers-color-scheme: dark){
  .sc{
    --paper:#0B1420; --card:#111E31; --box:#16243A;
    --ink:#EDF2F8; --ink-soft:#AAB9C9; --ink-faint:#7c899b;
    --line:rgba(255,255,255,.16); --line-soft:rgba(255,255,255,.08);
    --gold:#E0B15A; --navy:#3E5C8A; --teal:#2AEBEB; --purple:#B79AD6;
    --idle:#41505f;
    --spine:#0A1422; --spine-ink:#EDF2F8;
    --shadow:0 1px 2px rgba(0,0,0,.3), 0 12px 34px rgba(0,0,0,.4);
  }
}
.sc *{box-sizing:border-box}
.sc .wrap{max-width:1220px;margin:0 auto;}
.sc .band{
  background:var(--spine); color:var(--spine-ink); border-radius:0 0 16px 16px;
  padding:34px 30px 30px; margin:0 -4px 26px;
}
.sc .eyebrow{
  font-family:var(--fm); font-size:12.5px; letter-spacing:.24em;
  text-transform:uppercase; color:var(--gold); margin:0;
}
.sc .band h1{
  font-family:var(--fd); font-size:clamp(26px,4.4vw,40px); font-weight:600;
  margin:10px 0 0; line-height:1.13; max-width:22ch;
}
.sc .band p{margin:12px 0 0; color:rgba(243,236,222,.86); max-width:72ch; font-size:15.5px;}
.sc .live{
  display:inline-flex; align-items:center; gap:9px; margin-top:20px;
  border:1px solid rgba(243,236,222,.3); border-radius:999px; padding:6px 14px;
  font-family:var(--fm); font-size:12.5px; letter-spacing:.06em; color:rgba(243,236,222,.9);
}
.sc .dot{width:7px;height:7px;border-radius:50%;background:var(--gold);}

.sc .st{display:flex;align-items:baseline;gap:12px;margin:34px 0 12px;flex-wrap:wrap}
.sc .st h2{font-family:var(--fd); font-size:22px; font-weight:600; margin:0;}
.sc .st p{margin:0; color:var(--ink-soft); font-size:13.5px;}
.sc .lede{color:var(--ink-soft); margin:0 0 20px; max-width:74ch;}

/* The arc across the top. No status on it: this is the method, not one
   engagement, and the live line in the band is the only progress this page is
   allowed to report. */
.sc .path-scroll{overflow-x:auto;padding:8px 2px 14px;margin-top:22px}
.sc .path{position:relative;display:flex;justify-content:space-between;gap:6px;min-width:760px}
.sc .path::before{content:"";position:absolute;left:15px;right:15px;top:18px;height:3px;background:linear-gradient(90deg,var(--gold),var(--teal));border-radius:2px;opacity:.5}
.sc .stop{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;min-width:40px}
.sc .node{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--card);border:2.5px solid var(--idle);color:var(--ink-faint);font-size:15px;font-family:var(--fm);font-weight:700}
.sc .stop.pre .node{border-color:var(--gold);color:var(--gold)}
.sc .stop.post .node{border-color:var(--teal);color:var(--teal)}
.sc .stop .lab{font-family:var(--fm);font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-faint);text-align:center}

/* Before the first decision point. */
.sc .pre-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
.sc .step{background:var(--card);border:1px solid var(--line);border-top:3px solid var(--gold);border-radius:11px;padding:15px 16px}
.sc .step.underneath{border-top-color:var(--teal)}
.sc .step .k{font-family:var(--fm);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint);margin:0}
.sc .step h3{font-family:var(--fd);font-size:16.5px;font-weight:600;margin:5px 0 0}
.sc .step p{margin:8px 0 0;font-size:13.7px;color:var(--ink-soft);line-height:1.5}
.sc .sig{display:inline-block;margin-top:10px;font-family:var(--fm);font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--teal);border:1px solid var(--teal);border-radius:999px;padding:3px 9px}

/* The canvas, drawn the way the client's own page draws it. */
.sc .canvas-scroll{overflow-x:auto;padding-bottom:8px}
.sc .bmc{min-width:960px;background:var(--card);border:1.5px solid var(--ink);border-radius:14px;box-shadow:var(--shadow);padding:16px;display:flex;flex-direction:column;gap:10px}
.sc .bmc-title{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;padding-bottom:4px;border-bottom:1px solid var(--line-soft)}
.sc .bmc-title .t{font-family:var(--fd);font-size:22px;font-weight:600}
.sc .bmc-title .s{font-size:12.5px;color:var(--ink-soft);margin-top:2px}
.sc .bmc-title .meta{font-family:var(--fm);font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint);text-align:right}
.sc .headbars{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.sc .hb{padding:8px;text-align:center;font-family:var(--fm);font-size:12.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#fff;border-radius:7px}
.sc .hb.internal{background:var(--gold)} .sc .hb.connect{background:var(--navy)} .sc .hb.external{background:var(--teal)}
.sc .row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.sc .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sc .box{--edge:var(--navy);background:var(--box);border:1px solid var(--line);border-top:3px solid var(--edge);border-radius:9px;padding:11px 12px 12px;display:flex;flex-direction:column}
.sc .c-gold{--edge:var(--gold)} .sc .c-navy{--edge:var(--navy)} .sc .c-teal{--edge:var(--teal)} .sc .c-purple{--edge:var(--purple)}
.sc .tagrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sc .dptag{font-family:var(--fm);font-size:12px;font-weight:700;letter-spacing:.05em;color:#fff;background:var(--edge);border-radius:4px;padding:2px 7px}
.sc .sublab{font-family:var(--fm);font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-faint)}
.sc .box h4{font-family:var(--fd);font-weight:600;font-size:14.5px;margin:9px 0 0;line-height:1.15}
.sc .box .q{font-style:italic;font-size:12.5px;color:var(--ink-soft);margin:6px 0 0;line-height:1.35}
.sc .box ul{margin:9px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.sc .box li{position:relative;padding-left:13px;font-size:12.5px;color:var(--ink-soft);line-height:1.35}
.sc .box li::before{content:"-";position:absolute;left:0;color:var(--edge);font-weight:700}
.sc .fit{margin-top:11px;font-family:var(--fm);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:var(--edge);border-radius:4px;padding:4px 8px;align-self:flex-start}
.sc .trans-l{font-family:var(--fm);font-size:12.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint);text-align:center;padding:6px 0 0}
.sc .spine-box{background:var(--spine);color:var(--spine-ink);border-radius:10px;padding:14px 16px;border:1px solid var(--line)}
.sc .spine-head .dptag{background:var(--teal);color:#04222a}
.sc .spine-lab{font-family:var(--fm);font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:rgba(239,234,221,.7)}
.sc .spine-box h4{font-family:var(--fd);font-size:16px;margin:8px 0 0}
.sc .spine-box .q{font-style:italic;font-size:12.5px;color:rgba(239,234,221,.85);margin:5px 0 0}
.sc .stages{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 4px}
.sc .stage{font-family:var(--fm);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:4px;padding:4px 9px}
.sc .stage.s1{background:var(--gold);color:#2a1c04} .sc .stage.s2{background:#3E6E72;color:#eafcff}
.sc .stage.s3{background:var(--teal);color:#04222a} .sc .stage.s4{background:#2E7D32;color:#eafce9}
.sc .fits{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:12px}
.sc .fitc{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:9px}
.sc .fitc .fn{font-family:var(--fm);font-size:12px;letter-spacing:.06em;color:var(--teal)}
.sc .fitc .ft{font-family:var(--fd);font-size:12.5px;margin:3px 0 4px}
.sc .fitc .fdz{font-size:12px;color:rgba(239,234,221,.72);line-height:1.35}
@media (max-width:720px){ .sc .fits{grid-template-columns:repeat(2,1fr)} }

.sc .foot{
  margin-top:44px; padding-top:22px; border-top:1px solid var(--line);
  text-align:center; color:var(--ink-faint); font-family:var(--fd); font-size:13px;
}
.sc .foot p{margin:0 0 6px;}
.sc .gone{
  background:var(--card); border:1px solid var(--line); border-radius:14px;
  padding:36px 30px; margin:60px auto; max-width:52ch; text-align:center;
}
.sc .gone h1{font-family:var(--fd); font-size:24px; font-weight:600; margin:0 0 10px;}
.sc .gone p{color:var(--ink-soft); margin:0;}
`

function progressLine(view) {
  if (!view.underWay) {
    return 'An engagement is set up and has not started work yet.'
  }
  if (view.gatesTotal > 0 && view.gatesComplete >= view.gatesTotal) {
    return 'A live engagement has closed every gate in this canvas.'
  }
  if (view.gatesComplete === 0) {
    return 'A live engagement is under way in this canvas now.'
  }
  return `A live engagement is under way, with ${view.gatesComplete} of ${view.gatesTotal} gates closed on evidence.`
}

// One box, drawn exactly as the client's own journey page draws it, so a
// prospect who signs recognises the page they are handed on day one.
function Box({ id }) {
  const b = BLOCK[id]
  return (
    <article className={`box ${b.color}`}>
      <div className="tagrow">
        <span className="dptag">{dpLabel(id)}</span>
        <span className="sublab">{b.sublab}</span>
      </div>
      <h4>{b.title}</h4>
      <p className="q">&ldquo;{b.q}&rdquo;</p>
      <ul>{b.bullets.map((li, i) => <li key={i}>{li}</li>)}</ul>
      <span className="fit">{b.fit}</span>
    </article>
  )
}

function Step({ step, underneath }) {
  return (
    <div className={underneath ? 'step underneath' : 'step'}>
      <p className="k">{underneath ? 'Runs underneath' : 'Before the first decision point'}</p>
      <h3>{step.label}</h3>
      <p>{step.what}</p>
      {step.signedBy ? <span className="sig">{step.signedBy}</span> : null}
    </div>
  )
}

export default function ShowcaseView({ view }) {
  if (!view) {
    return (
      <div className="sc">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="gone">
          <h1>This link is not open</h1>
          <p>
            It may have expired, or it may have been withdrawn. Ask whoever sent it to you for a
            current one.
          </p>
        </div>
      </div>
    )
  }

  const named = [view.organisation, view.programme, view.country].filter(Boolean).join(' · ')
  const preIds = new Set(['charter', 'diagnostic', 'phase_0'])

  return (
    <div className="sc">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="wrap">

        <div className="band">
          <p className="eyebrow">Grant-to-Commercial Viability Canvas</p>
          <h1>How an organisation moves from grant funding to earned revenue</h1>
          <p>
            Two signed documents, then nine decision points in order. Each decision point asks a
            single question, produces a specific output, and does not close until there is evidence
            behind it and a signature on it. No decision point opens until the one before it has
            closed, and the engagement can be stopped at any one of them.
          </p>
          <span className="live">
            <span className="dot" aria-hidden="true"></span>
            {progressLine(view)}
          </span>
          {named ? (
            <p style={{ fontFamily: 'var(--fm)', fontSize: 12.5, letterSpacing: '.06em', marginTop: 14 }}>
              {named}
            </p>
          ) : null}
        </div>

        <div className="st">
          <h2>The whole arc</h2>
          <p>from the first conversation to handing the work over</p>
        </div>
        <div className="path-scroll"><div className="path">
          {PATH.map((s) => {
            const cls = ['stop', preIds.has(s.id) ? 'pre' : '', s.id === 'handover' ? 'post' : ''].filter(Boolean).join(' ')
            return (
              <div className={cls} key={s.id}>
                <span className="node">{s.glyph}</span>
                <span className="lab">{s.lab}</span>
              </div>
            )
          })}
        </div></div>

        <div className="st">
          <h2>Before the engagement goes live</h2>
          <p>the part most proposals leave out</p>
        </div>
        <p className="lede">
          The work does not begin at Decision Point 1. Two documents are agreed and signed first,
          and either of them can stop the engagement before a penny is spent on delivery.
        </p>
        <div className="pre-grid">
          {BEFORE_THE_CANVAS.map((s) => <Step key={s.id} step={s} underneath={false} />)}
        </div>

        <div className="st">
          <h2>The nine decision points</h2>
          <p>worked in order, each one a decision that has to be made</p>
        </div>
        <p className="lede">
          The canvas never changes. What changes from one organisation to the next is what goes in
          it, and what the evidence turns out to say.
        </p>

        <div className="canvas-scroll">
          <div className="bmc">

            <div className="bmc-title">
              <div>
                <div className="t">Grant-to-Commercial Viability Canvas&trade;</div>
                <div className="s">A structured route from grant-funded organisation to commercial sustainability</div>
              </div>
              <div className="meta">{named || 'The method'}<br />The Canvas Coach · habibonifade.com</div>
            </div>

            <div className="headbars">
              {CANVAS_COLUMNS.map((c) => (
                <div className={`hb ${c.key}`} key={c.key}>{c.label}</div>
              ))}
            </div>

            {CANVAS_ROWS.map((row, i) => (
              <div className="row3" key={i}>{row.map((id) => <Box key={id} id={id} />)}</div>
            ))}

            <div className="trans-l">{TRANSITION_LABEL}</div>
            <div className="row2">{TRANSITION_ROW.map((id) => <Box key={id} id={id} />)}</div>

            <div className="spine-box">
              <div className="spine-head">
                <span className="dptag">{dpLabel(SPINE_BLOCK_ID)}</span>
                <span className="spine-lab">&nbsp;Diagnostic spine · full width · kick-off · mid-point · close</span>
                <h4>{SPINE.title}</h4>
                <p className="q">&ldquo;{SPINE.q}&rdquo;</p>
              </div>
              <div className="stages">
                {SPINE.stages.map((s) => <span className={`stage ${s.c}`} key={s.c}>{s.label}</span>)}
              </div>
              <div className="fits">
                {SPINE.fits.map((f) => (
                  <div className="fitc" key={f.n}>
                    <div className="fn">{f.n}</div>
                    <div className="ft">{f.t}</div>
                    <div className="fdz">{f.d}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        <div className="st">
          <h2>What runs underneath, and what you keep</h2>
          <p>the record, and the test the engagement closes on</p>
        </div>
        <div className="pre-grid">
          {RUNS_UNDERNEATH.map((s) => <Step key={s.id} step={s} underneath />)}
        </div>

        <div className="foot">
          <p>Grant-to-Commercial Viability Canvas&trade; · The Canvas Coach · habibonifade.com</p>
          <p style={{ fontFamily: 'var(--fb)', fontSize: 12.5 }}>
            This is a view of the method. Nothing an engagement records, decides or produces appears
            here.
            {view.expiresAt
              ? ` This link stops working on ${new Date(view.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
              : ''}
          </p>
        </div>

      </div>
    </div>
  )
}
