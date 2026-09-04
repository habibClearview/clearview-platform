// One email, everything in the library. No drip feed of separate gates: a
// reader who has already given an address should not be asked again for the
// next thing.
import type { Metadata } from 'next'
import { C } from '@/components/site/tokens'
import CaptureForm, { FORM_CSS } from '@/components/site/CaptureForm'
import { RESOURCES } from '@/lib/site-content'

export const metadata: Metadata = {
  title: 'Library — give an email once, take everything',
  description:
    'The readiness diagnostic, the canvas as a wall print, the investment case checklist, the intervention design map, and the longer newsletter.',
}

const CSS = `
.hb .res{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:2px}
.hb .res > div{background:rgba(245,245,220,.06);padding:28px 26px;display:flex;flex-direction:column}
.hb .res .k{font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${C.cyan}}
.hb .res .meta{font-size:13px;opacity:.6;margin-left:10px;letter-spacing:.06em}
.hb .res p{margin-top:12px;opacity:.8;font-size:17px}
.hb .res .st{margin-top:auto;padding-top:20px;font-size:14px;font-weight:700;
  letter-spacing:.12em;text-transform:uppercase;opacity:.66}
`

export default function Library() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS + FORM_CSS }} />
      <section style={{ paddingBottom: 56 }}>
        <div className="wrap">
          <p className="eyebrow" style={{ color: C.cyan }}>Library</p>
          <h1 style={{ margin: '24px 0 0' }}>Give an email once. Take everything.</h1>
          <p className="lede" style={{ marginTop: 30, maxWidth: '60ch', opacity: 0.86 }}>
            Every resource here, plus the longer newsletter that only goes out from this site. One
            email, no drip feed of gates.
          </p>
        </div>
      </section>

      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="res">
            {RESOURCES.map((r) => (
              <div key={r.name} data-reveal>
                <div>
                  <span className="k">{r.kind}</span><span className="meta">{r.meta}</span>
                </div>
                <h4 style={{ marginTop: 14 }}>{r.name}</h4>
                <p>{r.what}</p>
                <span className="st">{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: C.cream, color: C.ink }}>
        <div className="wrap">
          <h2 style={{ marginBottom: 18 }} data-reveal>Unlock the library.</h2>
          <p className="lede" style={{ color: C.slate, maxWidth: '54ch', marginBottom: 34 }} data-reveal>
            The links come by email, along with the longer edition of Viable by Design.
          </p>
          <div data-reveal>
            <CaptureForm source="library" cta="Unlock the library" withOrg
              done={{ head: 'On its way.', body: 'Check your inbox for the links, and the spam folder if it is not there in a few minutes.' }} />
          </div>
        </div>
      </section>
    </>
  )
}
