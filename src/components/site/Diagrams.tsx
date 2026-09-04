// ============================================================
// ONE DIAGRAM PER METHOD.
//
// Each service page carries its own, because the argument of every page is
// that the method has a shape. A page that describes a canvas without drawing
// it is a page asking to be taken on trust.
//
// The canvas column colours carry meaning and are not reassigned: gold is
// internal capability, navy the connecting layer, teal the external market,
// purple the threshold decision.
// ============================================================
import { C } from '@/components/site/tokens'
import {
  CANVAS, FITS, DIMENSIONS, TIERS, ICC_BLOCKS, PHASES, IDC_TOOLS, TRALIMM_MODELS,
  GOLD, NAVY, TEAL,
} from '@/lib/site-content'

export const DIAGRAM_CSS = `
.hb .dg{background:${C.creamWarm};color:${C.ink};padding:34px}
.hb .dg-scroll{overflow-x:auto}
.hb .dg-head{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-bottom:2px}
.hb .dg-head > div{padding:12px;text-align:center;font-size:13px;font-weight:700;
  letter-spacing:.16em;text-transform:uppercase;color:#fff}
.hb .dg-row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-bottom:2px}
.hb .dg-row2{display:grid;grid-template-columns:1fr 1fr;gap:2px;margin-bottom:2px}
.hb .dgb{background:${C.cream};padding:16px 18px;border-top:4px solid var(--edge);display:flex;flex-direction:column}
.hb .dgb .tag{font-size:12.5px;font-weight:700;letter-spacing:.06em;color:#fff;
  background:var(--edge);padding:3px 9px;align-self:flex-start}
.hb .dgb h5{font-family:inherit;font-size:17px;font-weight:600;margin:12px 0 0;line-height:1.2}
.hb .dgb .q{font-size:14.5px;font-style:italic;color:${C.slate};margin:8px 0 0;line-height:1.4}
.hb .dgb ul{margin:12px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px}
.hb .dgb li{font-size:14px;color:${C.slate};line-height:1.4;padding-left:14px;position:relative}
.hb .dgb li:before{content:'';position:absolute;left:0;top:8px;width:6px;height:2px;background:var(--edge)}
.hb .dgb .fit{margin-top:14px;align-self:flex-start;font-size:12.5px;font-weight:700;
  letter-spacing:.06em;text-transform:uppercase;color:#fff;background:var(--edge);padding:5px 10px}
.hb .dg-trans{text-align:center;font-size:13px;font-weight:700;letter-spacing:.16em;
  text-transform:uppercase;color:${C.slate};padding:16px 0 14px}
.hb .dg-spine{background:${C.ink};color:${C.cream};padding:22px 24px}
.hb .dg-spine .tag{background:${C.cyan};color:${C.ink}}
.hb .dg-fits{display:grid;grid-template-columns:repeat(6,1fr);gap:2px;margin-top:18px}
.hb .dg-fits > div{background:rgba(245,245,220,.07);padding:12px;display:flex;flex-direction:column}
.hb .dg-fits .fn{font-size:12.5px;font-weight:700;color:${C.cyan}}
.hb .dg-fits .ft{font-size:14px;font-weight:600;margin:5px 0 5px}
.hb .dg-fits .fd{font-size:13px;opacity:.74;line-height:1.4}
.hb .dg-stages{display:flex;flex-wrap:wrap;gap:2px;margin-top:16px}
.hb .dg-stages span{font-size:12.5px;font-weight:700;letter-spacing:.08em;
  text-transform:uppercase;padding:7px 13px}
@media (max-width:820px){
  .hb .dg{padding:18px}
  .hb .dg-head{display:none}
  .hb .dg-row3,.hb .dg-row2{grid-template-columns:1fr}
  .hb .dg-fits{grid-template-columns:1fr 1fr}
}

/* Market intelligence */
.hb .bars{display:flex;flex-direction:column;gap:2px}
.hb .bar{display:grid;grid-template-columns:210px 1fr 62px;gap:16px;align-items:center;
  background:${C.cream};padding:13px 18px}
.hb .bar .track{height:16px;background:rgba(18,34,44,.1)}
.hb .bar .fill{height:16px;background:${C.teal}}
.hb .bar .pct{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
.hb .tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:2px;margin-top:2px}
.hb .tier{padding:20px 18px}
.hb .tier .n{font-size:34px;font-weight:700;line-height:1}
.hb .tier h5{font-size:17px;font-weight:600;margin:8px 0 6px}
.hb .tier p{font-size:14.5px;line-height:1.4;opacity:.86}
@media (max-width:700px){.hb .bar{grid-template-columns:1fr;gap:7px}.hb .bar .pct{text-align:left}}

/* Blocks, phases, models */
.hb .blocks{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:2px}
.hb .block{background:${C.cream};padding:22px 20px;border-top:4px solid ${C.cyan}}
.hb .block .n{font-size:13px;font-weight:700;letter-spacing:.16em;color:${C.teal}}
.hb .block h5{font-size:18px;font-weight:600;margin:10px 0 8px;line-height:1.2}
.hb .block p{font-size:15px;line-height:1.5;color:${C.slate}}
.hb .fork{display:grid;grid-template-columns:1fr 1fr;gap:2px;margin-top:2px}
.hb .fork > div{padding:26px 24px;background:${C.ink};color:${C.cream}}
.hb .fork > div:last-child{background:${C.cyan};color:${C.ink}}
@media (max-width:700px){.hb .fork{grid-template-columns:1fr}}
.hb .phase{background:${C.cream};padding:22px 20px;border-top:4px solid ${GOLD}}
.hb .phase .pn{font-size:22px;font-weight:700;letter-spacing:-0.02em}
.hb .phase .ps{font-size:14px;color:${C.slate};margin-top:2px}
.hb .phase ol{margin:16px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px}
.hb .phase li .dn{font-size:12.5px;font-weight:700;color:${TEAL}}
.hb .phase li h6{font-family:inherit;font-size:15.5px;font-weight:600;margin:3px 0 3px}
.hb .phase li p{font-size:14px;color:${C.slate};line-height:1.4}
.hb .models{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:2px}
.hb .model{background:${C.cream};padding:24px 22px;border-top:4px solid ${NAVY}}
.hb .model .abbr{font-size:30px;font-weight:700;letter-spacing:-0.02em;color:${NAVY}}
.hb .model h5{font-size:18px;font-weight:600;margin:8px 0 12px}
.hb .model p{font-size:15px;line-height:1.5;color:${C.slate}}
.hb .model .when{margin-top:12px;font-size:14px;font-weight:600;color:${C.teal}}
`

function Box({ b }: { b: any }) {
  return (
    <article className="dgb" style={{ ['--edge' as any]: b.c }}>
      <span className="tag">Decision Point {b.n}</span>
      <h5>{b.title}</h5>
      <p className="q">&ldquo;{b.q}&rdquo;</p>
      <ul>{b.bullets.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
      <span className="fit">{b.fit}</span>
    </article>
  )
}

/** The Grant to Commercial Viability canvas, in its real positions. */
export function CanvasDiagram() {
  const by = (n: number) => CANVAS.find((b) => b.n === n)!
  return (
    <div className="dg-scroll">
      <div className="dg" style={{ minWidth: 820 }}>
        <div className="dg-head">
          <div style={{ background: GOLD }}>← What you can do</div>
          <div style={{ background: NAVY }}>The layer that joins them</div>
          <div style={{ background: TEAL }}>What the market pays for →</div>
        </div>
        <div className="dg-row3">{[1, 2, 3].map((n) => <Box key={n} b={by(n)} />)}</div>
        <div className="dg-row3">{[4, 6, 5].map((n) => <Box key={n} b={by(n)} />)}</div>
        <div className="dg-trans">Where the model meets real customers, then travels</div>
        <div className="dg-row2">{[7, 8].map((n) => <Box key={n} b={by(n)} />)}</div>
        <div className="dg-spine">
          <span className="tag" style={{ fontSize: 12.5, fontWeight: 700, padding: '3px 9px' }}>Decision Point 9</span>
          <h5 style={{ fontSize: 20, fontWeight: 600, margin: '12px 0 0' }}>Commercial Readiness Diagnostic</h5>
          <p style={{ fontSize: 15, fontStyle: 'italic', opacity: 0.84, marginTop: 6 }}>
            Scored at the start, the middle and the end, so the movement is the finding.
          </p>
          <div className="dg-stages">
            <span style={{ background: GOLD, color: '#2a1c04' }}>Grant dependent</span>
            <span style={{ background: '#3e6e72', color: '#eafcff' }}>Commercially aware</span>
            <span style={{ background: TEAL, color: '#eafcff' }}>Market ready</span>
            <span style={{ background: C.green, color: '#eafce9' }}>Commercially viable</span>
          </div>
          <div className="dg-fits">
            {FITS.map((f) => (
              <div key={f.n}>
                <div className="fn">{f.n}</div>
                <div className="ft">{f.t}</div>
                <div className="fd">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Market intelligence: what gets scored, and the four tiers. */
export function IntelDiagram() {
  return (
    <div className="dg">
      <p className="eyebrow" style={{ color: C.teal, marginBottom: 18 }}>Seven things we score</p>
      <div className="bars">
        {DIMENSIONS.map((d) => (
          <div className="bar" key={d.name}>
            <span style={{ fontWeight: 600 }}>{d.name}</span>
            <span className="track"><span className="fill" style={{ width: `${d.n}%`, display: 'block' }} /></span>
            <span className="pct">{d.n}%</span>
          </div>
        ))}
      </div>
      <p className="cite" style={{ color: C.slate, marginTop: 14 }}>
        An illustrative portfolio middle. The live report scores each business and ranks it against
        others like it.
      </p>
      <p className="eyebrow" style={{ color: C.teal, margin: '30px 0 14px' }}>Four tiers, each with a confidence level attached</p>
      <div className="tiers">
        {TIERS.map((t) => (
          <div className="tier" key={t.n} style={{ background: t.bg, color: t.ink }}>
            <div className="n">{t.n}</div>
            <h5>{t.name}</h5>
            <p>{t.what}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The Investment Case Canvas: eight steps, then a fork. */
export function IccDiagram() {
  return (
    <div className="dg">
      <p className="eyebrow" style={{ color: C.teal, marginBottom: 18 }}>Eight steps, then a fork</p>
      <div className="blocks">
        {ICC_BLOCKS.map((b) => (
          <div className="block" key={b.n}>
            <div className="n">{b.n}</div>
            <h5>{b.title}</h5>
            <p>{b.q}</p>
          </div>
        ))}
      </div>
      <div className="fork">
        <div>
          <p className="eyebrow" style={{ opacity: 0.7 }}>Step nine A</p>
          <h5 style={{ fontSize: 21, fontWeight: 600, margin: '10px 0 8px' }}>If you are running the programme</h5>
          <p style={{ fontSize: 16, opacity: 0.86 }}>
            Three things to do in the next thirty days. One of them is not optional. Each has a
            name against it.
          </p>
        </div>
        <div>
          <p className="eyebrow" style={{ opacity: 0.7 }}>Step nine B</p>
          <h5 style={{ fontSize: 21, fontWeight: 600, margin: '10px 0 8px' }}>If you are asking for the money</h5>
          <p style={{ fontSize: 16 }}>
            Six parts, built in this order. The problem with evidence first. The kind of money and
            how it is structured. Proof people want it. Who carries the risk. The ask, and its
            condition. Then the team.
          </p>
        </div>
      </div>
    </div>
  )
}

/** Intervention design: nine decisions across four stages. */
export function IdcDiagram() {
  return (
    <div className="dg">
      <p className="eyebrow" style={{ color: C.teal, marginBottom: 18 }}>Nine decisions, four stages</p>
      <div className="blocks">
        {PHASES.map((p) => (
          <div className="phase" key={p.name}>
            <div className="pn">{p.name}</div>
            <div className="ps">{p.sub}</div>
            <ol>
              {p.dps.map((d) => (
                <li key={d.n}>
                  <div className="dn">Decision Point {d.n}</div>
                  <h6>{d.title}</h6>
                  <p>{d.q}</p>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <p className="eyebrow" style={{ color: C.teal, margin: '30px 0 14px' }}>Tools built into it</p>
      <div className="blocks">
        {IDC_TOOLS.map((t) => (
          <div className="block" key={t} style={{ borderTopColor: C.purple }}>
            <p style={{ fontSize: 16, color: C.ink, fontWeight: 500 }}>{t}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Trade liquidity: the idea, then the three ways to build the reserve. */
export function TralimmDiagram() {
  return (
    <div className="dg">
      <p className="eyebrow" style={{ color: C.teal, marginBottom: 14 }}>The idea in one line</p>
      <h4 style={{ marginBottom: 8 }}>Money that sits still is worth more than money you lend out.</h4>
      <p style={{ color: C.slate, marginBottom: 26 }}>
        What you unlock is your reserve multiplied by how much your suppliers trust it.
      </p>
      <p className="eyebrow" style={{ color: C.teal, marginBottom: 14 }}>Three ways to build the reserve. Use one, or stack them.</p>
      <div className="models">
        {TRALIMM_MODELS.map((m) => (
          <div className="model" key={m.abbr}>
            <div className="abbr">{m.abbr}</div>
            <h5>{m.name}</h5>
            <p>{m.converts}</p>
            <div className="when">Use when: {m.useWhen}</div>
          </div>
        ))}
      </div>
      <p className="eyebrow" style={{ color: C.teal, margin: '30px 0 14px' }}>Three things have to be true first</p>
      <div className="blocks">
        {['Your trading is on the record', 'Your debts are clean or clearing', 'Your season is predictable'].map((t) => (
          <div className="block" key={t} style={{ borderTopColor: C.green }}>
            <p style={{ fontSize: 16, color: C.ink, fontWeight: 500 }}>{t}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export const DIAGRAM_FOR: Record<string, () => JSX.Element> = {
  'grant-to-commercial-viability': CanvasDiagram,
  'market-intelligence': IntelDiagram,
  'investment-case': IccDiagram,
  'intervention-design': IdcDiagram,
  'trade-liquidity': TralimmDiagram,
}
