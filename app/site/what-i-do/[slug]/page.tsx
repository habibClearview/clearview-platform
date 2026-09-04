// ============================================================
// THE FIVE SERVICE PAGES, FROM ONE PATTERN.
//
// Every one has the same five parts, in the same order, because the argument
// is the same shape each time: here is the situation you recognise, here is
// what it costs to leave it alone, here is what I do, here is the shape of the
// method, and here is the one thing to do next.
//
// The calls to action differ per service deliberately. Somebody whose funding
// is ending should score their organisation; somebody who was turned down for
// capital should send the case. One generic "get in touch" across all five
// would waste the only moment the reader is ready to act.
//
// The five loop, so the last leads back to the first and a reader can walk the
// whole set without reaching a dead end.
// ============================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { C } from '@/components/site/tokens'
import { DIAGRAM_CSS, DIAGRAM_FOR } from '@/components/site/Diagrams'
import { SERVICES, serviceBySlug, neighbours } from '@/lib/site-content'

export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const s = serviceBySlug(params.slug)
  if (!s) return { title: 'Not found' }
  return {
    title: `${s.name} — Habib Onifade`,
    description: s.blurb,
    openGraph: { title: s.mirror, description: s.blurb, type: 'article' },
  }
}

const CSS = `
.hb .sv-hero{background:${C.ink};padding:92px 0 84px;border-bottom:2px solid rgba(245,245,220,.12)}
.hb .sv-kind{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.16em;
  text-transform:uppercase;padding:8px 15px}
.hb .sv-hero h1{font-size:clamp(38px,5.6vw,86px);margin:26px 0 0}
.hb .sv-mirror{color:${C.cyan};font-size:clamp(22px,2.6vw,36px);font-weight:600;
  line-height:1.24;letter-spacing:-0.02em;margin:30px 0 0;max-width:24ch}
.hb .sv-body{background:${C.cream};color:${C.ink}}
.hb .sv-cols{display:grid;grid-template-columns:1fr 1fr;gap:60px}
.hb .sv-cols h3{margin-bottom:18px}
.hb .sv-cost{border-left:5px solid ${C.gold};padding-left:22px;margin-top:26px}
.hb .sv-cost .lab{font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
  color:${C.gold};margin-bottom:10px}
.hb .sv-who{margin-top:34px;padding-top:26px;border-top:1px solid rgba(18,34,44,.16)}
.hb .sv-who .lab{font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
  color:${C.teal};margin-bottom:12px}
.hb .sv-cta{background:${C.cyan};color:${C.ink}}
.hb .sv-nav{background:${C.inkDeep};padding:0}
.hb .sv-pair{display:grid;grid-template-columns:1fr 1fr;gap:2px}
.hb .sv-pair a{display:block;padding:54px 44px;background:rgba(245,245,220,.05);text-decoration:none;color:${C.cream}}
.hb .sv-pair a:hover{background:rgba(245,245,220,.1)}
.hb .sv-pair .dir{font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
  color:${C.cyan};margin-bottom:14px}
.hb .sv-all{display:grid;grid-template-columns:repeat(5,1fr);gap:2px;margin-top:2px}
.hb .sv-all a{display:block;padding:24px 20px;background:rgba(245,245,220,.05);
  text-decoration:none;color:${C.cream};font-size:15.5px;font-weight:600}
.hb .sv-all a[aria-current='page']{background:${C.cyan};color:${C.ink}}
@media (max-width:900px){
  .hb .sv-cols{grid-template-columns:1fr;gap:34px}
  .hb .sv-pair{grid-template-columns:1fr}
  .hb .sv-pair a{padding:34px 22px}
  .hb .sv-all{grid-template-columns:1fr}
}
`

export default function ServicePage({ params }: { params: { slug: string } }) {
  const s = serviceBySlug(params.slug)
  if (!s) notFound()
  const nb = neighbours(s.slug)!
  const Diagram = DIAGRAM_FOR[s.slug]

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS + DIAGRAM_CSS }} />

      {/* 1 — dark hero */}
      <section className="sv-hero">
        <div className="wrap">
          <span className="sv-kind" style={{ background: s.kindBg, color: s.kindInk }}>{s.kind}</span>
          <h1>{s.name}</h1>
          <p className="sv-mirror">&ldquo;{s.mirror}&rdquo;</p>
        </div>
      </section>

      {/* 2 — the problem, and what I do about it */}
      <section className="sv-body">
        <div className="wrap">
          <div className="sv-cols">
            <div data-reveal>
              <h3>What is happening</h3>
              <p style={{ color: C.slate }}>{s.what}</p>
              <div className="sv-cost">
                <div className="lab">What it costs to leave it</div>
                <p style={{ color: C.slate }}>{s.cost}</p>
              </div>
            </div>
            <div data-reveal>
              <h3>What I do about it</h3>
              <p style={{ color: C.slate }}>{s.does}</p>
              <div className="sv-who">
                <div className="lab">Who recognises themselves here</div>
                <p style={{ color: C.slate }}>{s.who}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 — the method's own shape */}
      <section style={{ background: C.cream, paddingTop: 0 }}>
        <div className="wrap" data-reveal>{Diagram ? <Diagram /> : null}</div>
      </section>

      {/* 4 — this service's own call to action */}
      <section className="sv-cta">
        <div className="wrap">
          <h2 style={{ marginBottom: 18 }} data-reveal>{s.ctaHead}</h2>
          <p className="lede" style={{ maxWidth: '56ch', marginBottom: 36 }} data-reveal>{s.ctaBody}</p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }} data-reveal>
            <Link className="btn" href={s.ctaHref} style={{ background: C.ink, color: C.cream }}>
              {s.ctaLabel}
            </Link>
            <Link className="btn ghost" href="/contact">Ask a question first</Link>
          </div>
        </div>
      </section>

      {/* 5 — the five, looping */}
      <nav className="sv-nav" aria-label="The five methods">
        <div className="sv-pair">
          <Link href={`/what-i-do/${nb.prev.slug}`}>
            <div className="dir">← Before this</div>
            <h3>{nb.prev.name}</h3>
            <p style={{ opacity: 0.76, marginTop: 10 }}>{nb.prev.mirror}</p>
          </Link>
          <Link href={`/what-i-do/${nb.next.slug}`}>
            <div className="dir">Next →</div>
            <h3>{nb.next.name}</h3>
            <p style={{ opacity: 0.76, marginTop: 10 }}>{nb.next.mirror}</p>
          </Link>
        </div>
        <div className="sv-all">
          {SERVICES.map((x) => (
            <Link key={x.slug} href={`/what-i-do/${x.slug}`}
              aria-current={x.slug === s.slug ? 'page' : undefined}>
              {x.tag}
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
