// The channel. The video cards carry no thumbnails yet because no video ids
// have been supplied; each links to the channel rather than pretending to be
// a specific film. A card that looks like a video and is not is worse than a
// card that says where it goes.
import type { Metadata } from 'next'
import { C } from '@/components/site/tokens'
import { VIDEOS, LINKS } from '@/lib/site-content'

export const metadata: Metadata = {
  title: 'Watch — twenty years of implementation, in short pieces',
  description:
    'Lessons from running economic development programmes, and from advising the people who run them now.',
}

const CSS = `
.hb .vids{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:2px}
.hb .vid{background:rgba(245,245,220,.06);padding:30px 26px;text-decoration:none;color:${C.cream};display:block}
.hb .vid:hover{background:rgba(245,245,220,.1)}
.hb .vid .tag{font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${C.cyan}}
.hb .vid p{margin-top:12px;opacity:.8;font-size:17px}
.hb .vid .go{display:block;margin-top:20px;font-weight:600;color:${C.cyan}}
`

export default function Watch() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <section style={{ paddingBottom: 56 }}>
        <div className="wrap">
          <p className="eyebrow" style={{ color: C.cyan }}>Watch</p>
          <h1 style={{ margin: '24px 0 0' }}>Twenty years of implementation, in short pieces.</h1>
          <p className="lede" style={{ marginTop: 30, maxWidth: '60ch', opacity: 0.86 }}>
            Lessons from running economic development programmes, and from advising the people who
            run them now. Everything plays on YouTube.
          </p>
        </div>
      </section>
      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="vids">
            {VIDEOS.map((v) => (
              <a className="vid" key={v.title} href={LINKS.youtube} target="_blank" rel="noopener noreferrer" data-reveal>
                <span className="tag">{v.tag}</span>
                <h4 style={{ marginTop: 12 }}>{v.title}</h4>
                <p>{v.what}</p>
                <span className="go">Watch on YouTube →</span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
