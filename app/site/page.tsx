// ============================================================
// THE HOME PAGE. EIGHT CHAPTERS, EACH A FULL BLEED COLOUR BLOCK
// CARRYING ONE IDEA.
//
// The chapter eyebrows are literal because the page is an argument in order:
// what changed, who it changed for, what I do about it, how the work is
// structured, what it found, what you can take away, and what to do now.
//
// THE HERO ALIGNMENT took several attempts and is easy to undo by tidying.
// The eyebrow sits full width ABOVE the two column row. The row is
// align-items:flex-start, the image column is align-self:flex-start, and the
// image is width:100%/height:auto inside flex:0 1 460px. That puts the top of
// the photograph on the same line as the first line of the headline. Do not
// restructure it.
//
// THE HERO BACKGROUND IS #121213 and must stay so while the portrait is not a
// cutout: it is the photograph's own backdrop, and any other colour shows a
// seam where the picture ends.
//
// HEADINGS IN CHAPTERS 03 AND 04 break one sentence per line using a block
// span per sentence AND no max-width. Both are needed. display:block alone
// still lets a sentence wrap inside itself, and a max-width in ch resolves
// narrower than this type wants and orphans two word lines.
// ============================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { C } from '@/components/site/tokens'
import { MARKET_STATS, OWN_STATS, LINKEDIN_READERS } from '@/lib/site-stats'
import { MARQUEE, AUDIENCES, SERVICES, CANVAS_FAMILY, PROOF, MAGNETS } from '@/lib/site-content'

export const metadata: Metadata = {
  title: 'Habib Onifade — your work was funded, now it has to sell',
  description:
    'I work out who holds the budget, what they will pay, and what it costs you to deliver. Four advisory methods and one subscription, for organisations that have to start earning what they used to be given.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Your work was funded. Now it has to sell.',
    description:
      'Nine decisions, in order, from funded delivery to a paying customer. Score your organisation in two minutes.',
    type: 'website',
  },
}

const CSS = `
.hb .hero{background:${C.photoBg};padding:78px 0 0}
.hb .hero-row{display:flex;align-items:flex-start;gap:56px}
.hb .hero-copy{flex:1 1 auto;min-width:0}
.hb .hero-img{flex:0 1 460px;align-self:flex-start}
.hb .hero-img img{width:100%;height:auto;display:block}
.hb .hero h1 .two{color:${C.cyan};display:block}
@media (max-width:980px){
  .hb .hero-row{flex-direction:column;gap:34px}
  .hb .hero-img{flex:1 1 auto;max-width:360px}
}

.hb .statgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:2px;margin:0 0 60px}
.hb .stat{background:${C.creamWarm};padding:36px 30px 30px}
.hb .stat .n{font-size:clamp(46px,6vw,86px);font-weight:700;letter-spacing:-0.045em;line-height:0.9;display:block}
.hb .stat .n sup{font-size:0.42em;vertical-align:super;opacity:.7}
.hb .stat .lab{margin-top:14px;font-size:17px;line-height:1.45;color:${C.slate}}
.hb .stat .cite{margin-top:12px;color:${C.slate}}
.hb .stat.dark{background:rgba(245,245,220,.06)}
.hb .stat.dark .lab,.hb .stat.dark .cite{color:rgba(245,245,220,.76)}

.hb .cols2{display:grid;grid-template-columns:1fr 1fr;gap:44px}
@media (max-width:900px){.hb .cols2{grid-template-columns:1fr;gap:26px}}

.hb .aud{display:grid;grid-template-columns:88px 200px 1fr;gap:28px;align-items:baseline;
  padding:34px 0;border-top:1px solid rgba(245,245,220,.16)}
.hb .aud:last-of-type{border-bottom:1px solid rgba(245,245,220,.16)}
.hb .aud .mark{font-size:15px;font-weight:700;letter-spacing:.16em;color:${C.cyan}}
@media (max-width:760px){.hb .aud{grid-template-columns:1fr;gap:8px}}

.hb .rail{display:flex;gap:2px;overflow-x:auto;padding-bottom:10px;scroll-snap-type:x mandatory}
.hb .rail::-webkit-scrollbar{height:8px}
.hb .rail::-webkit-scrollbar-thumb{background:rgba(18,34,44,.28)}
.hb .card{flex:0 0 380px;background:${C.creamWarm};padding:34px 30px;display:flex;flex-direction:column;
  scroll-snap-align:start;text-decoration:none;color:${C.ink}}
.hb .card .kind{font-size:12.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
  padding:6px 12px;align-self:flex-start}
.hb .card .mirror{font-size:23px;font-weight:600;line-height:1.25;margin:22px 0 0;letter-spacing:-0.02em}
.hb .card .blurb{font-size:17px;line-height:1.55;color:${C.slate};margin:16px 0 0}
.hb .card .go{margin-top:auto;padding-top:26px;font-size:17px;font-weight:600;color:${C.teal}}
@media (max-width:560px){.hb .card{flex:0 0 84vw}}

.hb .fam{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:2px}
.hb .fam a{background:rgba(18,34,44,.09);padding:30px 26px;text-decoration:none;color:${C.ink};display:block}
.hb .fam .n{font-size:60px;font-weight:700;letter-spacing:-0.045em;line-height:0.9}
.hb .fam .unit{font-size:15px;font-weight:600;opacity:.7;margin-top:6px}
.hb .fam h4{margin-top:18px}
.hb .fam p{font-size:17px;margin-top:10px;opacity:.82}

.hb .findings{display:grid;grid-template-columns:190px 1fr 1.4fr;gap:30px;align-items:baseline;
  padding:34px 0;border-top:1px solid rgba(245,245,220,.16)}
.hb .findings:last-of-type{border-bottom:1px solid rgba(245,245,220,.16)}
.hb .findings .cat{font-size:14px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${C.cyan}}
@media (max-width:860px){.hb .findings{grid-template-columns:1fr;gap:10px}}

.hb .logos{background:${C.inkDeep};padding:52px 0}
.hb .who{background:${C.cream};color:${C.ink}}
.hb .who-row{display:grid;grid-template-columns:1fr 1.15fr;gap:56px;align-items:start}
@media (max-width:900px){.hb .who-row{grid-template-columns:1fr;gap:34px}}
.hb .who img{width:100%;height:auto;max-height:660px;object-fit:cover;object-position:50% 12%;display:block}

.hb .mags{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:2px}
.hb .mag{background:rgba(245,245,220,.06);padding:32px 28px;display:flex;flex-direction:column;
  text-decoration:none;color:${C.cream}}
.hb .mag .kind{font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${C.cyan}}
.hb .mag h4{margin-top:14px}
.hb .mag p{font-size:17px;margin-top:12px;opacity:.8}
.hb .mag .go{margin-top:auto;padding-top:24px;font-weight:600;color:${C.cyan}}
`

function Stat({ s, dark }: { s: any; dark?: boolean }) {
  return (
    <div className={dark ? 'stat dark' : 'stat'} data-reveal>
      <span className="n">
        {s.pre ? <sup>{s.pre.trim()}</sup> : null}
        <span data-count={String(s.n)}>{s.n}</span>
        {s.post}
      </span>
      <div className="lab">{s.label}</div>
      {s.source ? (
        <div className="cite">
          <a href={s.url} target="_blank" rel="noopener noreferrer">{s.source}</a>
        </div>
      ) : null}
    </div>
  )
}

export default function Home() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── 00 ── */}
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow" style={{ color: C.cyan, marginBottom: 34 }}>Chapter 00 · The situation</p>
          <div className="hero-row">
            <div className="hero-copy">
              <h1>
                Your work was funded.
                <span className="two">Now it has to sell.</span>
              </h1>
              <p className="lede" style={{ marginTop: 34, maxWidth: '46ch', opacity: 0.88 }}>
                Being funded proved the need was real. What changes is who pays. I work out who
                holds that budget, what they will pay, and what it costs you to deliver.
              </p>
              <p style={{ marginTop: 38, paddingBottom: 78 }}>
                <Link className="btn" href="/score">Score your organisation</Link>
              </p>
            </div>
            <div className="hero-img">
              <img src="/site/portrait-standing.jpg" alt="Habib Onifade" />
            </div>
          </div>
        </div>
      </section>

      {/* ── marquee ── */}
      <div className="mq" style={{ background: C.cyan, color: C.ink, padding: '20px 0' }} aria-hidden="true">
        <div className="mq-track">
          {[0, 1].map((dup) => (
            <div className="mq-item" key={dup} style={{ fontSize: 20, fontWeight: 600 }}>
              {MARQUEE.map((m) => (
                <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 34 }}>
                  {m}<span style={{ opacity: 0.45 }}>／</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── 01 ── */}
      <section style={{ background: C.cream, color: C.ink }}>
        <div className="wrap">
          <p className="eyebrow" style={{ color: C.teal }} data-reveal>Chapter 01 · What changed</p>
          <h2 style={{ margin: '22px 0 52px' }} data-reveal>
            Aid is becoming investment. Investment expects a return.
          </h2>
          <div className="statgrid">
            {MARKET_STATS.map((s) => <Stat key={s.label} s={s} />)}
            <div className="stat" data-reveal>
              <span className="n"><span data-count="1">1</span></span>
              <div className="lab">question that now decides everything. Who pays you?</div>
            </div>
          </div>
          <div className="cols2">
            <p data-reveal>
              Most people in the sector know about the cuts. The part that gets less attention is
              what happened to the money that stayed. It did not disappear. It got fussier. Fewer
              deals, each one bigger, and local money matters more than it did five years ago.
            </p>
            <div data-reveal>
              <p style={{ fontWeight: 600 }}>
                That is not a funding problem. It is a commercial one, and commercial problems can
                be solved.
              </p>
              <p style={{ marginTop: 26 }}>
                <Link className="btn" href="/score">Find out where you stand</Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 02 ── */}
      <section>
        <div className="wrap">
          <p className="eyebrow" style={{ color: C.cyan }} data-reveal>Chapter 02 · Who this is for</p>
          <h2 style={{ margin: '22px 0 52px' }} data-reveal>
            People who have to start earning what they used to be given.
          </h2>
          {AUDIENCES.map((a) => (
            <div className="aud" key={a.mark} data-reveal>
              <span className="mark">{a.mark}</span>
              <h4>{a.who}</h4>
              <p style={{ opacity: 0.84 }}>{a.what}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 03 ── */}
      <section style={{ background: C.cream, color: C.ink }}>
        <div className="wrap">
          <p className="eyebrow" style={{ color: C.teal }} data-reveal>Chapter 03 · What I do</p>
          <h2 style={{ margin: '22px 0 20px' }} data-reveal>
            <span style={{ display: 'block' }}>Four advisory methods.</span>
            <span style={{ display: 'block' }}>One subscription.</span>
          </h2>
          <p className="lede" style={{ color: C.slate, marginBottom: 46, maxWidth: '54ch' }} data-reveal>
            Find the sentence that sounds like your situation. Each one leads somewhere specific.
          </p>
          <div className="rail">
            {SERVICES.map((s) => (
              <Link className="card" key={s.key} href={`/what-i-do/${s.slug}`}>
                <span className="kind" style={{ background: s.kindBg, color: s.kindInk }}>{s.kind}</span>
                <p className="mirror">{s.mirror}</p>
                <p className="blurb">{s.blurb}</p>
                <span className="go">{s.ctaLabel} →</span>
              </Link>
            ))}
          </div>
          <p className="small" style={{ color: C.slate, marginTop: 30 }}>
            Scroll the row to see all five. Not sure which one fits your situation?{' '}
            <Link href="/contact" style={{ color: C.teal, fontWeight: 600 }}>Send me an enquiry</Link>
            {' '}or{' '}
            <Link href="/score" style={{ color: C.teal, fontWeight: 600 }}>start with the score</Link>.
          </p>
        </div>
      </section>

      {/* ── 04 ── */}
      <section style={{ background: C.gold, color: '#2a1c04' }}>
        <div className="wrap">
          <p className="eyebrow" style={{ color: '#2a1c04', opacity: 0.72 }} data-reveal>Chapter 04 · The method</p>
          <h2 style={{ margin: '22px 0 34px' }} data-reveal>
            <span style={{ display: 'block' }}>Every method runs on a canvas.</span>
            <span style={{ display: 'block' }}>That is the whole idea.</span>
          </h2>
          <div className="cols2" style={{ marginBottom: 52 }}>
            <p data-reveal>
              Alex Osterwalder made this argument for business models and he was right. Put every
              decision on one page and three things happen. You see the whole picture at once. You
              see which pieces do not fit. And everyone in the room is looking at the same thing.
            </p>
            <p data-reveal>
              That last one matters more than it sounds. A canvas is the only format I have found
              that a chief executive, a field team, a partner and a donor can all read together
              without a translator. So each method is a canvas of numbered decisions, each with one
              question, one output, and a test that says whether it is finished.
            </p>
          </div>
          <div className="fam">
            {CANVAS_FAMILY.map((f) => (
              <Link href={`/what-i-do/${f.slug}`} key={f.slug} data-reveal>
                <div className="n"><span data-count={String(f.n)}>{f.n}</span></div>
                <div className="unit">{f.unit}</div>
                <h4>{f.name}</h4>
                <p>{f.blocks}</p>
              </Link>
            ))}
          </div>
          <p style={{ marginTop: 40 }} data-reveal>
            <Link className="btn ghost" href="/method" style={{ color: '#2a1c04' }}>See a canvas in full</Link>
          </p>
        </div>
      </section>

      {/* ── 05 ── */}
      <section>
        <div className="wrap">
          <p className="eyebrow" style={{ color: C.cyan }} data-reveal>Chapter 05 · Evidence</p>
          <h2 style={{ margin: '22px 0 20px' }} data-reveal>What the work found.</h2>
          <p className="lede" style={{ opacity: 0.82, marginBottom: 40, maxWidth: '60ch' }} data-reveal>
            Fifteen engagements. Some of this contradicts what the sector tells itself, and it is
            written plainly because that is how it turned up.
          </p>
          {PROOF.map((p) => (
            <div className="findings" key={p.title} data-reveal>
              <span className="cat">{p.cat}</span>
              <h4>{p.title}</h4>
              <p style={{ opacity: 0.82 }}>{p.what}</p>
            </div>
          ))}
          <p style={{ marginTop: 40 }} data-reveal>
            <Link className="btn ghost" href="/evidence">All fifteen, and the frameworks behind them</Link>
          </p>
        </div>
      </section>

      {/* ── the logo strip ── */}
      <div className="logos">
        <div className="wrap">
          <p className="eyebrow" style={{ opacity: 0.55, marginBottom: 26 }}>Programmes I have worked on</p>
        </div>
        <div className="mq" aria-label="Adam Smith International, Mercy Corps, Palladium">
          <div className="mq-track">
            {[0, 1].map((dup) => (
              <div className="mq-item" key={dup}>
                {[0, 1, 2].map((i) => (
                  <img key={i} src="/site/client-logos.png" alt={dup === 0 && i === 0 ? 'Adam Smith International, Mercy Corps, Palladium' : ''}
                    style={{ height: 58, width: 'auto', display: 'block', padding: '0 44px', opacity: 0.9 }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── who does this ── */}
      <section className="who">
        <div className="wrap">
          <div className="who-row">
            <div data-reveal>
              <img src="/site/portrait-seated.jpg" alt="Habib Onifade" />
            </div>
            <div>
              <p className="eyebrow" style={{ color: C.teal }} data-reveal>Who does this</p>
              <h2 style={{ margin: '22px 0 26px' }} data-reveal>
                <span style={{ display: 'block' }}>Corporate finance first.</span>
                <span style={{ display: 'block' }}>Development second.</span>
              </h2>
              <p style={{ color: C.slate }} data-reveal>
                That order matters. I came to development from corporate finance, which is why the
                models I build are meant to be used rather than filed.
              </p>
              <p style={{ color: C.slate, marginTop: 20 }} data-reveal>
                The steps are the same every time. Find out who pays. Design the service for them.
                Build the numbers. Test it on a real customer. Hand it over.
              </p>
              <div className="statgrid" style={{ marginTop: 44, marginBottom: 0 }}>
                {OWN_STATS.map((s) => <Stat key={s.label} s={s} />)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 06 ── */}
      <section>
        <div className="wrap">
          <p className="eyebrow" style={{ color: C.cyan }} data-reveal>Chapter 06 · Take something with you</p>
          <h2 style={{ margin: '22px 0 20px' }} data-reveal>Useful without me.</h2>
          <p className="lede" style={{ opacity: 0.82, marginBottom: 46, maxWidth: '58ch' }} data-reveal>
            Free. Give an email once and take everything in the library, plus the longer newsletter
            that only goes out from here. <span data-count={String(LINKEDIN_READERS)}>{LINKEDIN_READERS}</span>{' '}
            people read the short version on LinkedIn.
          </p>
          <div className="mags">
            {MAGNETS.map((m) => (
              <Link className="mag" key={m.name} href={m.href} data-reveal>
                <span className="kind">{m.kind}</span>
                <h4>{m.name}</h4>
                <p>{m.what}</p>
                <span className="go">{m.cta} →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 07 ── */}
      <section style={{ background: C.cyan, color: C.ink }}>
        <div className="wrap">
          <p className="eyebrow" style={{ opacity: 0.72 }} data-reveal>Chapter 07 · Where to start</p>
          <h2 style={{ margin: '22px 0 20px' }} data-reveal>Find out where you stand.</h2>
          <p className="lede" style={{ marginBottom: 40, maxWidth: '58ch' }} data-reveal>
            Ten questions. Two minutes. A report naming where your work starts, and what being
            wrong about each gap costs you.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }} data-reveal>
            <Link className="btn" href="/score" style={{ background: C.ink, color: C.cream }}>
              Score your organisation
            </Link>
            <Link className="btn ghost" href="/contact">Or just talk to me</Link>
          </div>
        </div>
      </section>
    </>
  )
}
