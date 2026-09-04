// Fifteen engagements and the frameworks behind them. Written plainly, because
// several of these contradict what the sector tells itself and hedging them
// would waste the only reason they are interesting.
import type { Metadata } from 'next'
import Link from 'next/link'
import { C } from '@/components/site/tokens'
import { PROOF_FIFTEEN, FRAMEWORKS } from '@/lib/site-content'

export const metadata: Metadata = {
  title: 'Evidence — what the work found',
  description:
    'Fifteen engagements across seven countries, and the nine named frameworks that came out of them. Some of it contradicts what the sector tells itself.',
}

const CSS = `
.hb .ev{display:grid;grid-template-columns:200px 1fr 1.5fr;gap:30px;align-items:baseline;
  padding:32px 0;border-top:1px solid rgba(245,245,220,.16)}
.hb .ev:last-of-type{border-bottom:1px solid rgba(245,245,220,.16)}
.hb .ev .cat{font-size:13.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${C.cyan}}
.hb .fw{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:2px}
.hb .fw div{background:rgba(18,34,44,.08);padding:26px 24px}
@media (max-width:860px){.hb .ev{grid-template-columns:1fr;gap:10px}}
`

export default function Evidence() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <section style={{ paddingBottom: 60 }}>
        <div className="wrap">
          <p className="eyebrow" style={{ color: C.cyan }}>Evidence</p>
          <h1 style={{ margin: '24px 0 0' }}>What the work found.</h1>
          <p className="lede" style={{ marginTop: 30, maxWidth: '62ch', opacity: 0.86 }}>
            Fifteen engagements. Some of this contradicts what the sector tells itself, and it is
            written plainly because that is how it turned up.
          </p>
        </div>
      </section>

      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          {PROOF_FIFTEEN.map((p) => (
            <div className="ev" key={p.title} data-reveal>
              <span className="cat">{p.cat}</span>
              <h4>{p.title}</h4>
              <p style={{ opacity: 0.82 }}>{p.what}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: C.cream, color: C.ink }}>
        <div className="wrap">
          <p className="eyebrow" style={{ color: C.teal }} data-reveal>Named, and field tested</p>
          <h2 style={{ margin: '22px 0 18px' }} data-reveal>The frameworks behind the methods.</h2>
          <p className="lede" style={{ color: C.slate, maxWidth: '62ch', marginBottom: 44 }} data-reveal>
            Each one came out of a real job, in a real country, with a real client. Naming them is
            how you tell practice from theory.
          </p>
          <div className="fw">
            {FRAMEWORKS.map((f) => (
              <div key={f.name} data-reveal>
                <h4>{f.name}</h4>
                <p style={{ marginTop: 12, color: C.slate, fontSize: 17 }}>{f.origin}</p>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 44 }} data-reveal>
            <Link className="btn" href="/contact" style={{ background: C.ink, color: C.cream }}>
              Tell me where you are stuck
            </Link>
          </p>
        </div>
      </section>
    </>
  )
}
