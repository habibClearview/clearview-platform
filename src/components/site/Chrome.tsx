'use client'
// ============================================================
// THE SITE'S HEADER AND FOOTER.
//
// Plain <img> rather than next/image throughout the site: these are brand
// marks and two portraits at known sizes, served from the same origin, and
// the optimiser buys nothing for them while adding a runtime dependency to
// every page a stranger loads.
//
// The header carries the wordmark, the seven numbered sections, and one link
// into Clearview with a live indicator. That link never gets a competing call
// to action beside it: the platform is where clients work, not something a
// visitor is being sold.
// ============================================================
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { C } from '@/components/site/tokens'
import { MENU, LINKS } from '@/lib/site-content'

const HEADER_CSS = `
.hb .hd{background:${C.ink};position:sticky;top:0;z-index:60;border-bottom:1px solid rgba(245,245,220,.12)}
.hb .hd-in{max-width:1440px;margin:0 auto;padding:18px 40px;display:flex;justify-content:space-between;align-items:center;gap:24px}
.hb .hd nav{display:flex;gap:26px;align-items:center;flex-wrap:wrap}
.hb .hd nav a{font-size:15.5px;font-weight:500;text-decoration:none;opacity:.86;white-space:nowrap}
.hb .hd nav a:hover,.hb .hd nav a[aria-current='page']{opacity:1;color:${C.cyan}}
.hb .hd .num{font-size:11.5px;font-weight:700;letter-spacing:.14em;opacity:.5;margin-right:7px}
.hb .live{display:inline-flex;align-items:center;gap:9px;font-size:14.5px;font-weight:600;
  border:1px solid rgba(245,245,220,.28);padding:9px 16px;text-decoration:none;white-space:nowrap}
.hb .live i{width:7px;height:7px;background:${C.green};display:block;flex:0 0 auto}
.hb .burger{display:none;background:none;border:1px solid rgba(245,245,220,.3);color:inherit;
  font-family:inherit;font-size:15px;font-weight:600;padding:10px 15px;cursor:pointer}
@media (max-width:1180px){
  .hb .hd nav{display:none}
  .hb .hd nav.open{display:flex;flex-direction:column;align-items:flex-start;gap:0;
    position:absolute;left:0;right:0;top:100%;background:${C.ink};padding:8px 22px 22px;
    border-bottom:1px solid rgba(245,245,220,.12)}
  .hb .hd nav.open a{padding:14px 0;width:100%;border-bottom:1px solid rgba(245,245,220,.08)}
  .hb .burger{display:block}
  .hb .hd-in{padding:16px 22px;position:relative}
}
.hb .ft{background:${C.inkDeep};color:${C.cream};padding:82px 0 40px}
.hb .ft-grid{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:56px}
.hb .ft h4{margin-bottom:18px}
.hb .ft ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
.hb .ft a{font-size:17px;text-decoration:none;opacity:.84}
.hb .ft a:hover{opacity:1;color:${C.cyan}}
.hb .ft-base{margin-top:64px;padding-top:26px;border-top:1px solid rgba(245,245,220,.14);
  display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;font-size:14.5px;opacity:.62}
@media (max-width:900px){.hb .ft-grid{grid-template-columns:1fr;gap:44px}}
`

export function Header() {
  const [open, setOpen] = useState(false)
  // The site is served at the domain root but lives under /site in the repo,
  // so the address the reader sees and the path Next reports differ by that
  // prefix. Strip it before deciding which item is current.
  const here = (usePathname() || '/').replace(/^\/site/, '') || '/'
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HEADER_CSS }} />
      <header className="hd">
        <div className="hd-in">
          <Link href="/" aria-label="Habib Onifade, home" style={{ display: 'block', flex: '0 0 auto' }}>
            <img src="/site/habib-onifade-wordmark.png" alt="Habib Onifade" style={{ height: 44, width: 'auto', display: 'block' }} />
          </Link>

          <button type="button" className="burger" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Close' : 'Menu'}
          </button>

          <nav className={open ? 'open' : ''} onClick={() => setOpen(false)}>
            {MENU.map((m) => (
              <Link key={m.href} href={m.href} aria-current={here === m.href ? 'page' : undefined}>
                <span className="num">{m.num}</span>{m.label}
              </Link>
            ))}
            <a className="live" href={LINKS.platform} target="_blank" rel="noopener noreferrer">
              <i aria-hidden="true"></i>Clearview
            </a>
          </nav>
        </div>
      </header>
    </>
  )
}

export function Footer() {
  return (
    <footer className="ft">
      <div className="wrap">
        <div className="ft-grid">
          <div>
            <img src="/site/viable-by-design.png" alt="Viable by Design" style={{ height: 76, width: 'auto', display: 'block', marginBottom: 26 }} />
            <p className="small" style={{ maxWidth: '38ch', opacity: 0.86 }}>
              The newsletter. What is working, what is not, and the decisions organisations get
              wrong on the way from grant funding to earned revenue.
            </p>
            <p style={{ marginTop: 22 }}>
              <a className="btn" href={LINKS.linkedinNewsletter} target="_blank" rel="noopener noreferrer">
                Subscribe on LinkedIn
              </a>
            </p>
          </div>

          <div>
            <h4>The site</h4>
            <ul>
              {MENU.map((m) => <li key={m.href}><Link href={m.href}>{m.label}</Link></li>)}
            </ul>
          </div>

          <div>
            <h4>Elsewhere</h4>
            <ul>
              <li><a href={LINKS.linkedinProfile} target="_blank" rel="noopener noreferrer">LinkedIn</a></li>
              <li><a href={LINKS.youtube} target="_blank" rel="noopener noreferrer">YouTube</a></li>
              <li><a href={LINKS.platform} target="_blank" rel="noopener noreferrer">Clearview, for clients</a></li>
              <li><Link href="/contact">Ask a question</Link></li>
            </ul>
          </div>
        </div>

        <div className="ft-base">
          <span>Habib Onifade. The Canvas Coach.</span>
          <span>Verido UK Limited</span>
        </div>
      </div>
    </footer>
  )
}
