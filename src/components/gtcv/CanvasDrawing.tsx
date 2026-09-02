// @ts-nocheck
// ============================================================
// THE CANVAS, DRAWN.
//
// One drawing, used by every page that shows the method to somebody who is not
// working in it: the prospect's showcase link and the public website. The
// client's own journey page draws its own version because its boxes are
// buttons with live gate status on them; this one is a picture.
//
// WHY IT IS A COMPONENT AND NOT A COPY. This morning the showcase and the
// client page drew the same nine decisions two different ways, because each
// held its own copy of the layout. That is the failure this file exists to
// prevent. The website asked for the same drawing a third time, and a third
// copy would have gone the same way.
//
// The layout itself — which block sits in which column, what the columns are
// called, which two are the transition row — comes from gtcv-blocks, so this
// file decides how it looks and nothing about what it is.
//
// ON A NARROW SCREEN it stops being a three column drawing and becomes nine
// decisions in the order they are worked, one under the other. The wide canvas
// draws six above five because of the columns they belong to; a single column
// has no columns, so each box carries its own number and sorts itself.
// ============================================================
import {
  BLOCK, SPINE, CANVAS_COLUMNS, CANVAS_ROWS, TRANSITION_ROW, TRANSITION_LABEL,
  SPINE_BLOCK_ID, dpLabel, dpNumber,
} from '@/lib/gtcv-blocks'

/** Scoped to .cvx so a page can drop it in without its own styles leaking in. */
export const CANVAS_CSS = `
.cvx{
  --edge:var(--cvx-navy);
}
.cvx-scroll{overflow-x:auto;padding-bottom:8px}
.cvx{
  min-width:960px;background:var(--cvx-card);border:1.5px solid var(--cvx-ink);border-radius:14px;
  box-shadow:var(--cvx-shadow);padding:16px;display:flex;flex-direction:column;gap:10px;
}
.cvx .bmc-title{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;padding-bottom:4px;border-bottom:1px solid var(--cvx-line-soft)}
.cvx .bmc-title .t{font-family:var(--cvx-fd);font-size:22px;font-weight:600}
.cvx .bmc-title .s{font-size:12.5px;color:var(--cvx-ink-soft);margin-top:2px}
.cvx .bmc-title .meta{font-family:var(--cvx-fm);font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--cvx-ink-faint);text-align:right}
.cvx .headbars{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.cvx .hb{padding:8px;text-align:center;font-family:var(--cvx-fm);font-size:12.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#fff;border-radius:7px}
.cvx .hb.internal{background:var(--cvx-gold)} .cvx .hb.connect{background:var(--cvx-navy)} .cvx .hb.external{background:var(--cvx-teal)}
.cvx .row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.cvx .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cvx .box{--edge:var(--cvx-navy);background:var(--cvx-box);border:1px solid var(--cvx-line);border-top:3px solid var(--edge);border-radius:9px;padding:11px 12px 12px;display:flex;flex-direction:column}
.cvx .c-gold{--edge:var(--cvx-gold)} .cvx .c-navy{--edge:var(--cvx-navy)}
.cvx .c-teal{--edge:var(--cvx-teal)} .cvx .c-purple{--edge:var(--cvx-purple)}
.cvx .tagrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cvx .dptag{font-family:var(--cvx-fm);font-size:12px;font-weight:700;letter-spacing:.05em;color:#fff;background:var(--edge);border-radius:4px;padding:2px 7px}
.cvx .sublab{font-family:var(--cvx-fm);font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--cvx-ink-faint)}
.cvx .box h4{font-family:var(--cvx-fd);font-weight:600;font-size:14.5px;margin:9px 0 0;line-height:1.15}
.cvx .box .q{font-style:italic;font-size:12.5px;color:var(--cvx-ink-soft);margin:6px 0 0;line-height:1.35}
.cvx .box ul{margin:9px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.cvx .box li{position:relative;padding-left:13px;font-size:12.5px;color:var(--cvx-ink-soft);line-height:1.35}
.cvx .box li::before{content:"-";position:absolute;left:0;color:var(--edge);font-weight:700}
.cvx .fit{margin-top:11px;font-family:var(--cvx-fm);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:var(--edge);border-radius:4px;padding:4px 8px;align-self:flex-start}
.cvx .trans-l{font-family:var(--cvx-fm);font-size:12.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--cvx-ink-faint);text-align:center;padding:6px 0 0}
.cvx .spine-box{background:var(--cvx-spine);color:var(--cvx-spine-ink);border-radius:10px;padding:14px 16px;border:1px solid var(--cvx-line)}
.cvx .spine-head .dptag{background:var(--cvx-teal);color:#04222a}
.cvx .spine-lab{font-family:var(--cvx-fm);font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:rgba(239,234,221,.7)}
.cvx .spine-box h4{font-family:var(--cvx-fd);font-size:16px;margin:8px 0 0}
.cvx .spine-box .q{font-style:italic;font-size:12.5px;color:rgba(239,234,221,.85);margin:5px 0 0}
.cvx .stages{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 4px}
.cvx .stage{font-family:var(--cvx-fm);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:4px;padding:4px 9px}
.cvx .stage.s1{background:var(--cvx-gold);color:#2a1c04} .cvx .stage.s2{background:#3E6E72;color:#eafcff}
.cvx .stage.s3{background:var(--cvx-teal);color:#04222a} .cvx .stage.s4{background:#2E7D32;color:#eafce9}
.cvx .fits{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:12px}
.cvx .fitc{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:9px}
.cvx .fitc .fn{font-family:var(--cvx-fm);font-size:12px;letter-spacing:.06em;color:var(--cvx-teal)}
.cvx .fitc .ft{font-family:var(--cvx-fd);font-size:12.5px;margin:3px 0 4px}
.cvx .fitc .fdz{font-size:12px;color:rgba(239,234,221,.72);line-height:1.35}
@media (max-width:720px){ .cvx .fits{grid-template-columns:repeat(2,1fr)} }

/* Narrow screens: the drawing becomes the order the decisions are worked in. */
@media (max-width:860px){
  .cvx-scroll{overflow-x:visible}
  .cvx{min-width:0;padding:12px;border-radius:12px}
  .cvx .headbars{display:none}
  .cvx .row3,.cvx .row2{display:contents}
  .cvx .box{order:var(--n,50)}
  .cvx .trans-l{order:65;text-align:left;padding:12px 0 0;line-height:1.4}
  .cvx .spine-box{order:90}
  .cvx .box h4{font-size:16px}
  .cvx .box .q,.cvx .box li,.cvx .box .sublab{font-size:13.5px}
  .cvx .bmc-title .meta{text-align:left}
}
@media (max-width:520px){ .cvx .fits{grid-template-columns:1fr} }
`

function Box({ id }) {
  const b = BLOCK[id]
  return (
    <article className={`box ${b.color}`} style={{ '--n': (dpNumber(id) || 0) * 10 }}>
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

/**
 * @param meta   the small line top right — an engagement's name, or nothing.
 * @param strap  the line under the title.
 */
export default function CanvasDrawing({ meta = '', strap = 'A structured route from grant-funded organisation to commercial sustainability' }) {
  return (
    <div className="cvx-scroll">
      <div className="cvx">

        <div className="bmc-title">
          <div>
            <div className="t">Grant-to-Commercial Viability Canvas&trade;</div>
            <div className="s">{strap}</div>
          </div>
          <div className="meta">{meta || 'The method'}<br />The Canvas Coach · habibonifade.com</div>
        </div>

        <div className="headbars">
          {CANVAS_COLUMNS.map((c) => <div className={`hb ${c.key}`} key={c.key}>{c.label}</div>)}
        </div>

        {CANVAS_ROWS.map((row, i) => (
          <div className="row3" key={i}>{row.map((id) => <Box key={id} id={id} />)}</div>
        ))}

        <div className="trans-l">{TRANSITION_LABEL}</div>
        <div className="row2">{TRANSITION_ROW.map((id) => <Box key={id} id={id} />)}</div>

        <div className="spine-box" style={{ '--n': 90 }}>
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
  )
}
