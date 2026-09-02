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
// A dead, revoked or expired link renders the same page as a link that never
// existed. Telling a stranger which one it was tells them something about a
// token they do not hold.
// ============================================================
import { BLOCK } from '@/lib/gtcv-blocks'

const ORDER = ['dp01', 'dp02', 'dp03', 'dp04', 'dp05', 'dp06', 'dp07', 'dp08', 'dp09']

const CSS = `
.sc{
  --paper:#EDE6D6; --card:#FBF7EE; --box:#FFFDF8;
  --ink:#1B2A41; --ink-soft:#4C5A6B; --ink-faint:#8B8272;
  --line:rgba(27,42,65,.16);
  --gold:#B7791F; --navy:#22344F; --teal:#00767A; --purple:#6B4A8B;
  --fd:var(--cv-font);
  --fb:var(--cv-font);
  --fm:var(--cv-font);
  background:var(--paper); color:var(--ink); font-family:var(--fb);
  line-height:1.55; min-height:100vh; padding:0 20px 70px;
  -webkit-font-smoothing:antialiased;
}
@media (prefers-color-scheme: dark){
  .sc{
    --paper:#141C26; --card:#1B2530; --box:#212C38;
    --ink:#EDE6D6; --ink-soft:#B4BFC9; --ink-faint:#8A93A0;
    --line:rgba(237,230,214,.16);
    --gold:#D9A441; --navy:#0F1721; --teal:#3FB0B4; --purple:#A98BC4;
  }
}
.sc .wrap{max-width:1120px;margin:0 auto;}
.sc .band{
  background:var(--navy); color:#F3ECDE; border-radius:0 0 16px 16px;
  padding:34px 30px 30px; margin:0 -4px 30px;
}
.sc .eyebrow{
  font-family:var(--fm); font-size:12.5px; letter-spacing:.24em;
  text-transform:uppercase; color:var(--gold); margin:0;
}
.sc .band h1{
  font-family:var(--fd); font-size:clamp(26px,4.4vw,38px); font-weight:600;
  margin:10px 0 0; line-height:1.15;
}
.sc .band p{margin:12px 0 0; color:rgba(243,236,222,.86); max-width:62ch; font-size:15.5px;}
.sc .live{
  display:inline-flex; align-items:center; gap:9px; margin-top:20px;
  border:1px solid rgba(243,236,222,.3); border-radius:999px; padding:6px 14px;
  font-family:var(--fm); font-size:12.5px; letter-spacing:.06em; color:rgba(243,236,222,.9);
}
.sc .dot{width:7px;height:7px;border-radius:50%;background:var(--gold);}

.sc h2{font-family:var(--fd); font-size:21px; font-weight:600; margin:0 0 6px;}
.sc .lede{color:var(--ink-soft); margin:0 0 20px; max-width:66ch;}

.sc .cols{display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px;}
.sc .blk{
  background:var(--card); border:1px solid var(--line); border-radius:12px;
  padding:16px 17px; border-top:3px solid var(--line);
}
.sc .blk.c-gold{border-top-color:var(--gold);}
.sc .blk.c-navy{border-top-color:var(--teal);}
.sc .blk.c-purple{border-top-color:var(--purple);}
.sc .blk .no{
  font-family:var(--fm); font-size:12.5px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--ink-faint); margin:0;
}
.sc .blk h3{font-family:var(--fd); font-size:17px; font-weight:600; margin:5px 0 0;}
.sc .blk .q{font-style:italic; color:var(--ink-soft); margin:7px 0 0; font-size:14.5px;}
.sc .blk ul{margin:11px 0 0; padding-left:17px; color:var(--ink-soft); font-size:13.7px; line-height:1.55;}
.sc .blk li{margin-bottom:4px;}
.sc .blk .fit{
  display:inline-block; margin-top:11px; font-family:var(--fm); font-size:12.5px;
  letter-spacing:.1em; text-transform:uppercase; color:var(--teal);
  border:1px solid var(--teal); border-radius:999px; padding:3px 9px;
}
.sc .foot{
  margin-top:40px; padding-top:22px; border-top:1px solid var(--line);
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

  return (
    <div className="sc">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="wrap">

        <div className="band">
          <p className="eyebrow">Grant-to-Commercial Viability Canvas</p>
          <h1>How an organisation moves from grant funding to earned revenue</h1>
          <p>
            Nine decision blocks, in order. Each one asks a single question, produces a specific
            output, and does not close until there is evidence behind it and a signature on it. No
            block opens until the one before it has closed.
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

        <h2>The nine blocks</h2>
        <p className="lede">
          The canvas never changes. What changes from one organisation to the next is what goes in
          it, and what the evidence turns out to say.
        </p>

        <div className="cols">
          {ORDER.map((id, i) => {
            const b = BLOCK[id]
            if (!b) return null
            return (
              <div key={id} className={`blk ${b.color}`}>
                <p className="no">Block {i + 1} · {b.sublab}</p>
                <h3>{b.title}</h3>
                <p className="q">&ldquo;{b.q}&rdquo;</p>
                <ul>
                  {b.bullets.map((li, n) => <li key={n}>{li}</li>)}
                </ul>
                <span className="fit">{b.fit}</span>
              </div>
            )
          })}
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
