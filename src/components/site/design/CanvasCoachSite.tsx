// @ts-nocheck
'use client'
// ============================================================
// THE PUBLIC SITE. ONE PAGE, EIGHT CHAPTERS, ONE CALL TO ACTION.
//
// Rebuilt 26 September 2026 from Habib's master brief. The site used to speak
// to NGOs worried about their own income. It now speaks to programmes,
// implementers and funders. The visual language is the design Habib approved,
// kept: every colour, type size and spacing below comes from it. What changed
// is the words, the order of a few things, and what the buttons do.
//
// THE RULES THIS FILE KEEPS.
//
//   ONE CALL TO ACTION. Every button on the page leads to Chapter 07, where a
//   visitor books twenty minutes. The only other routes are small links to the
//   enquiry form. Anything that competed was removed.
//
//   THE CALENDAR WAITS FOR TWO ANSWERS. Programme name and Country are both
//   needed before the booking calendar is loaded at all. Nothing from Cal.com
//   reaches the browser until then.
//
//   MEASURED, WITHOUT COOKIES. Vercel Web Analytics, four named events and one
//   marker per chapter. No advertising pixels, recorders or heatmaps.
//
//   CAPTURE IS SERVER SIDE. The newsletter form posts to /api/subscribe, where
//   the server decides the Kit tag and no key reaches the browser.
//
// The nine pages this component used to draw, and every word on them, are in
// docs/site-archive/2026-09-26/.
// ============================================================
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { track } from '@vercel/analytics'
import { DESIGN_CSS } from '@/components/site/design/design.css'
import {
  MENU, AUDIENCES, MOMENTS, METHODS, PROOF, FIGURES, RECOMMENDATIONS, REPORTABLE,
  THREE_QUESTIONS, STATS,
} from '@/components/site/design/data'

/** A screen maps to one address a person can link to. */
export const SCREEN_PATH: Record<string, string> = {
  home: '/',
  contact: '/contact',
}

/** The booking page on Cal.com, as Habib gave it. */
export const CAL_LINK = 'habib-onifade-veikrh/20min'
const CAL_NAMESPACE = '20min'
const CAL_ORIGIN = 'https://app.cal.com'
const CAL_SCRIPT = 'https://app.cal.com/embed/embed.js'

/** The four named events. Anything else sent is a chapter marker. */
export const EVENTS = {
  heroCta: 'hero_cta_click',
  qualifier: 'qualifier_submitted',
  booked: 'call_booked',
  newsletter: 'newsletter_signup',
} as const

/** The chapter markers, one per chapter boundary. */
export const chapterEvent = (n: string) => `chapter_${n}_reached`

/** Analytics must never break the page it is measuring. */
function send(name: string) {
  try { track(name) } catch {}
}

/** Post to our own endpoint. Returns ok, never throws. */
async function capture(source: string, body: Record<string, unknown>) {
  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, source }),
    })
    const out = await res.json().catch(() => ({}))
    return { ok: res.ok, added: res.ok && out?.subscribed !== false, out }
  } catch {
    return { ok: false, added: false, out: {} }
  }
}

/**
 * Cal.com's own loader, from its embed snippet generator. It queues calls
 * until embed.js has arrived, so the order below is safe on a slow connection.
 */
function loadCal() {
  const w: any = window
  if (w.Cal) return w.Cal
  ;(function (C: any, A: string, L: string) {
    const p = function (a: any, ar: any) { a.q.push(ar) }
    const d = C.document
    C.Cal = C.Cal || function () {
      const cal = C.Cal
      const ar = arguments
      if (!cal.loaded) {
        cal.ns = {}
        cal.q = cal.q || []
        d.head.appendChild(d.createElement('script')).src = A
        cal.loaded = true
      }
      if (ar[0] === L) {
        const api: any = function () { p(api, arguments) }
        const namespace = ar[1]
        api.q = api.q || []
        if (typeof namespace === 'string') {
          cal.ns[namespace] = cal.ns[namespace] || api
          p(cal.ns[namespace], ar)
          p(cal, ['initNamespace', namespace])
        } else p(cal, ar)
        return
      }
      p(cal, ar)
    }
  })(w, CAL_SCRIPT, 'init')
  return w.Cal
}

const label = { display: 'block', fontSize: '13px', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: '700', margin: '0 0 12px' }
const field = { width: '100%', fontFamily: 'inherit', fontSize: '20px', padding: '16px 0', border: 'none', background: 'transparent' }

export default function CanvasCoachSite({ screen }: { screen: string }) {
  const router = useRouter()
  // The site lives under /site in the repo and at the root of the domain,
  // where a middleware rewrite hides the prefix. Links have to be written for
  // whichever of the two the reader is actually on, or navigation from
  // staging lands on an address that does not exist.
  const prefix = (usePathname() || '').startsWith('/site') ? '/site' : ''
  const at = (path: string) => (path === '/' ? (prefix || '/') : prefix + path)
  const [menuOpen, setMenuOpen] = useState(false)

  // Chapter 06, the newsletter.
  const [nlFirst, setNlFirst] = useState('')
  const [nlEmail, setNlEmail] = useState('')
  const [nlError, setNlError] = useState('')
  const [nlSending, setNlSending] = useState(false)
  const [nlSent, setNlSent] = useState(false)

  // Chapter 07, the two questions and the calendar behind them.
  const [qProgramme, setQProgramme] = useState('')
  const [qCountry, setQCountry] = useState('')
  const [qNotes, setQNotes] = useState('')
  const [calShown, setCalShown] = useState(false)
  const qualified = qProgramme.trim().length > 0 && qCountry.trim().length > 0

  // The enquiry form.
  const [cName, setCName] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cOrg, setCOrg] = useState('')
  const [cMsg, setCMsg] = useState('')
  const [cError, setCError] = useState('')
  const [contactSent, setContactSent] = useState(false)

  const go = useCallback((key: string) => {
    setMenuOpen(false)
    router.push(at(SCREEN_PATH[key] || '/'))
    try { window.scrollTo(0, 0) } catch {}
  }, [router, prefix])

  /** Scroll to a chapter on the home page, from anywhere on the site. */
  const jump = useCallback((id: string) => {
    setMenuOpen(false)
    const to = () => {
      const el = document.getElementById(id)
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.pageYOffset - 84)
    }
    if (screen === 'home') { setTimeout(to, 40); return }
    router.push(at('/'))
    setTimeout(to, 320)
  }, [router, screen, prefix])

  const sendNewsletter = async () => {
    const email = nlEmail.trim()
    if (!email || email.indexOf('@') < 1) { setNlError('A working email address, please.'); return }
    setNlError(''); setNlSending(true)
    const res = await capture('website', { email, firstName: nlFirst.trim() })
    setNlSending(false)
    if (!res.ok) { setNlError(res.out?.error || 'A working email address, please.'); return }
    // The address has been captured: it is on the list, or, if Kit would not
    // take it, it has been emailed to Habib to add by hand.
    send(EVENTS.newsletter)
    setNlSent(true)
  }

  const submitQualifier = () => {
    if (!qualified) return
    send(EVENTS.qualifier)
    setCalShown(true)
  }

  // The calendar is only loaded once both answers are in, and the answers go
  // into the booking so they arrive with it.
  useEffect(() => {
    if (!calShown) return
    const Cal = loadCal()
    Cal('init', CAL_NAMESPACE, { origin: CAL_ORIGIN })
    Cal.ns[CAL_NAMESPACE]('inline', {
      elementOrSelector: '#book-calendar',
      calLink: CAL_LINK,
      config: {
        layout: 'month_view',
        theme: 'light',
        // Keyed by the identifiers of the booking questions on the event type,
        // read from the live booking form: "Programme Name" is Programme-Name,
        // the country question is Location. "What is this meeting about?" is
        // Cal.com's own required title, answered with the programme name so
        // the visitor is not asked for anything twice.
        'Programme-Name': qProgramme.trim(),
        Location: qCountry.trim(),
        title: qProgramme.trim(),
        notes: qNotes.trim(),
        'metadata[programme]': qProgramme.trim(),
        'metadata[country]': qCountry.trim(),
      },
    })
    Cal.ns[CAL_NAMESPACE]('ui', { hideEventTypeDetails: false, layout: 'month_view' })
    Cal.ns[CAL_NAMESPACE]('on', { action: 'bookingSuccessfulV2', callback: () => send(EVENTS.booked) })
    // Deliberately once: the answers are fixed at the moment the calendar opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calShown])

  // One marker per chapter, the first time its top comes into view.
  useEffect(() => {
    if (screen !== 'home' || !window.IntersectionObserver) return
    const seen = new Set<string>()
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return
        const n = (e.target as HTMLElement).getAttribute('data-chapter') || ''
        if (n && !seen.has(n)) { seen.add(n); send(chapterEvent(n)) }
        obs.unobserve(e.target)
      })
    }, { threshold: 0, rootMargin: '0px 0px -30% 0px' })
    document.querySelectorAll('[data-chapter]').forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [screen])

  const sendContact = () => {
    if (!cName.trim() || !cEmail.trim() || cEmail.indexOf('@') < 1 || !cMsg.trim()) {
      setCError('Name, a working email and a note about the situation, please.'); return
    }
    // The note reaches Habib through the server, which emails it to him and
    // keeps it off the mailing list.
    capture('enquiry', {
      email: cEmail.trim(), firstName: cName.trim(), organisation: cOrg.trim(), message: cMsg.trim(),
    })
    setCError(''); setContactSent(true)
  }

  // ── reveal and count up, the design's own, both failing OPEN ──
  const io = useRef<IntersectionObserver | null>(null)
  const safety = useRef<any>(null)
  useEffect(() => {
    const reveal = (el: HTMLElement) => { el.style.opacity = '1'; el.style.transform = 'none' }
    const vh = window.innerHeight || 800
    const reduceMotion = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches

    const count = (el: HTMLElement) => {
      if (el.getAttribute('data-counted')) return
      const target = parseFloat(el.getAttribute('data-count') || '')
      if (!isFinite(target)) { el.setAttribute('data-counted', '1'); return }
      el.setAttribute('data-counted', '1')
      // Thousands take a separator; a figure with a decimal keeps it.
      const whole = Number.isInteger(target)
      const show = (v: number) => (whole ? Math.round(v).toLocaleString('en-GB') : v.toFixed(1))
      if (reduceMotion || document.visibilityState !== 'visible') { el.textContent = show(target); return }
      let started = false
      const finish = () => { el.textContent = show(target) }
      const guard = setTimeout(() => { if (!started) finish() }, 250)
      const dur = 1100
      let t0 = 0
      const tick = (t: number) => {
        if (!started) { started = true; clearTimeout(guard); t0 = t }
        const p = Math.min(1, (t - t0) / dur)
        const eased = 1 - Math.pow(1 - p, 3)
        el.textContent = show(target * eased)
        if (p < 1) requestAnimationFrame(tick)
        else finish()
      }
      requestAnimationFrame(tick)
    }

    const nodes = document.querySelectorAll<HTMLElement>('[data-rise]:not([data-risen])')
    if (window.IntersectionObserver && !io.current) {
      io.current = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return
          reveal(e.target as HTMLElement)
          ;(e.target as HTMLElement).querySelectorAll<HTMLElement>('[data-count]').forEach(count)
          io.current?.unobserve(e.target)
        })
      }, { threshold: 0, rootMargin: '0px 0px -4% 0px' })
    }
    nodes.forEach((el) => {
      el.setAttribute('data-risen', '1')
      const delay = parseInt(el.getAttribute('data-delay') || '0', 10)
      el.style.transition = 'opacity 0.75s cubic-bezier(0.16,1,0.3,1) ' + delay + 'ms, transform 0.75s cubic-bezier(0.16,1,0.3,1) ' + delay + 'ms'
      if (el.getBoundingClientRect().top < vh * 0.95 || !io.current) {
        reveal(el)
        el.querySelectorAll<HTMLElement>('[data-count]').forEach(count)
        return
      }
      el.style.opacity = '0'
      el.style.transform = 'translateY(26px)'
      io.current.observe(el)
    })

    clearTimeout(safety.current)
    safety.current = setTimeout(() => {
      document.querySelectorAll<HTMLElement>('[data-rise]').forEach((el) => {
        if (el.style.opacity === '0') reveal(el)
      })
      document.querySelectorAll<HTMLElement>('[data-count]').forEach(count)
    }, 900)
    return () => { clearTimeout(safety.current) }
  })

  useEffect(() => () => { io.current?.disconnect() }, [])

  const isContact = screen === 'contact', isHome = screen === 'home'

  const onCName = (e: any) => setCName(e.target.value)
  const onCEmail = (e: any) => setCEmail(e.target.value)
  const onCOrg = (e: any) => setCOrg(e.target.value)
  const onCMsg = (e: any) => setCMsg(e.target.value)
  const contactOpen = !contactSent

  const menu = MENU.map((m: any) => ({
    num: m.num, label: m.label,
    go: m.key === 'contact' ? () => go('contact') : () => jump(m.key),
  }))
  const showLogos = true, showCount = true
  const stats = STATS
  const openMenu = () => setMenuOpen(true)
  const closeMenu = () => setMenuOpen(false)
  const goHome = () => go('home')
  const goContact = () => go('contact')
  const goBook = () => jump('book')
  const heroCta = () => { send(EVENTS.heroCta); jump('book') }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DESIGN_CSS }} />
<div style={{background: "#12222c", color: "#f5f5dc", lineHeight: "1.5", overflowX: "hidden"}}>

  <header style={{background: "#12222c", position: "sticky", top: "0", zIndex: "60", borderBottom: "1px solid rgba(245,245,220,0.14)"}}>
    <div style={{maxWidth: "1440px", margin: "0 auto", padding: "18px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "20px"}}>
      <img src="/site/habib-onifade-wordmark.png" alt="Habib Onifade" onClick={goHome} style={{height: "44px", width: "auto", cursor: "pointer", display: "block", flex: "0 0 auto"}} />
      <div style={{display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto"}}>
        <a className="hv1" href="https://clearview.habibonifade.com" target="_blank" rel="noopener noreferrer" style={{display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "16px", fontWeight: "500", padding: "15px 20px", color: "rgba(245,245,220,0.82)", textDecoration: "none", whiteSpace: "nowrap"}}>
          <span style={{width: "8px", height: "8px", background: "#00afef", borderRadius: "50%", display: "block", animation: "om-pulse 2.4s ease-in-out infinite"}}></span>
          Clearview sign in
        </a>
        <span className="hv2" onClick={openMenu} style={{display: "inline-flex", alignItems: "center", gap: "12px", fontSize: "16.5px", fontWeight: "600", padding: "15px 24px", cursor: "pointer", border: "1px solid rgba(245,245,220,0.28)", color: "#f5f5dc", whiteSpace: "nowrap"}}>
          <span style={{display: "flex", flexDirection: "column", gap: "4px"}}>
            <span style={{width: "20px", height: "2px", background: "currentColor", display: "block"}}></span>
            <span style={{width: "20px", height: "2px", background: "currentColor", display: "block"}}></span>
          </span>
          Menu
        </span>
      </div>
    </div>
  </header>

  {(menuOpen) ? (
    <div style={{position: "fixed", inset: "0", zIndex: "90", background: "#12222c", overflowY: "auto"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto", padding: "28px 40px 80px"}}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", gap: "24px", marginBottom: "60px"}}>
          <img src="/site/habib-onifade-wordmark.png" alt="Habib Onifade" style={{height: "44px", width: "auto", display: "block"}} />
          <span className="hv3" onClick={closeMenu} style={{fontSize: "16.5px", fontWeight: "600", padding: "16px 26px", cursor: "pointer", border: "1px solid rgba(245,245,220,0.28)", color: "#f5f5dc"}}>Close</span>
        </div>
        <div style={{display: "flex", flexWrap: "wrap", gap: "60px"}}>
          <nav style={{flex: "1 1 420px", minWidth: "0", display: "flex", flexDirection: "column"}}>
            {(menu || []).map((m, i) => (
              <span key={i} className="hv4" onClick={m.go} style={{display: "flex", alignItems: "baseline", gap: "22px", padding: "20px 0", borderBottom: "1px solid rgba(245,245,220,0.14)", cursor: "pointer", color: "#f5f5dc"}}>
                <span style={{fontSize: "14px", fontWeight: "700", letterSpacing: "0.12em", color: "#00afef", flex: "0 0 auto"}}>{m.num}</span>
                <span style={{fontSize: "clamp(28px, 3.6vw, 48px)", fontWeight: "600", letterSpacing: "-0.03em", lineHeight: "1.05"}}>{m.label}</span>
              </span>
            ))}
          </nav>
          <div style={{flex: "1 1 300px", minWidth: "0", paddingTop: "12px"}}>
            <p style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,245,220,0.5)", margin: "0 0 20px", fontWeight: "700"}}>Elsewhere</p>
            <div style={{display: "flex", flexDirection: "column", gap: "14px", marginBottom: "40px"}}>
              <a className="hv5" href="https://www.linkedin.com/in/habibonifade/" target="_blank" rel="noopener noreferrer" style={{fontSize: "19px", color: "rgba(245,245,220,0.85)", textDecoration: "none"}}>LinkedIn</a>
              <a className="hv6" href="https://www.youtube.com/@HabibOnifade" target="_blank" rel="noopener noreferrer" style={{fontSize: "19px", color: "rgba(245,245,220,0.85)", textDecoration: "none"}}>YouTube</a>
              <a className="hv7" href="https://www.linkedin.com/newsletters/viable-by-design-7280979699525120000/" target="_blank" rel="noopener noreferrer" style={{fontSize: "19px", color: "rgba(245,245,220,0.85)", textDecoration: "none"}}>Viable by Design</a>
              <a className="hv8" href="mailto:hello@habibonifade.com" style={{fontSize: "19px", color: "rgba(245,245,220,0.85)", textDecoration: "none"}}>hello@habibonifade.com</a>
            </div>
            <span className="hv9" onClick={goBook} style={{display: "inline-block", fontSize: "17px", fontWeight: "600", padding: "19px 32px", cursor: "pointer", background: "#00afef", color: "#12222c"}}>SHOW ME HOW</span>
          </div>
        </div>
      </div>
    </div>
  ) : null}

  {(isHome) ? (
  <div>

    {/* ── Chapter 00 ── */}
    <section style={{background: "#121213", color: "#f5f5dc", position: "relative"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto", padding: "36px 40px 0"}}>
        <div style={{display: "flex", flexWrap: "wrap", gap: "40px 56px", alignItems: "flex-start"}}>
          <div style={{flex: "1 1 520px", minWidth: "0"}}>
            <h1 data-rise data-delay="60" style={{fontSize: "clamp(40px, 5.6vw, 88px)", fontWeight: "700", lineHeight: "0.98", letterSpacing: "-0.04em", margin: "0", maxWidth: "20ch", textWrap: "balance"}}>Do you want the businesses you back to become <span style={{color: "#00afef"}}>commercially viable?</span></h1>
            <p data-rise data-delay="200" style={{margin: "32px 0 0", fontSize: "clamp(24px, 3.1vw, 48px)", fontWeight: "500", color: "rgba(245,245,220,0.86)", maxWidth: "30ch", lineHeight: "1.2", letterSpacing: "-0.02em", textWrap: "pretty"}}>I do the work that gets them there, and give you the numbers your funder is asking for.</p>
            <div data-rise data-delay="300" style={{margin: "40px 0 0"}}>
              <span className="hv10" onClick={heroCta} style={{display: "inline-block", fontSize: "18px", fontWeight: "600", padding: "23px 36px", cursor: "pointer", background: "#00afef", color: "#12222c", whiteSpace: "nowrap"}}>SHOW ME HOW</span>
              <p style={{margin: "20px 0 0"}}>
                <span className="hv18" onClick={goContact} style={{fontSize: "16.5px", color: "rgba(245,245,220,0.7)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px"}}>Send me an enquiry instead</span>
              </p>
            </div>
          </div>
          <div style={{flex: "0 1 460px", minWidth: "260px", alignSelf: "flex-start"}}>
            <img src="/site/portrait-standing.jpg" alt="Habib Onifade" style={{display: "block", width: "100%", height: "auto"}} />
          </div>
        </div>
      </div>
    </section>

    {/* ── Chapter 01 ── */}
    <section data-chapter="01" style={{background: "#f5f5dc", color: "#12222c", padding: "clamp(72px, 9vw, 132px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <div data-rise style={{display: "flex", alignItems: "baseline", gap: "20px", marginBottom: "44px", flexWrap: "wrap"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00767a", fontWeight: "700", margin: "0"}}>What changed</span>
          <span style={{flex: "1 1 60px", height: "1px", background: "rgba(18,34,44,0.25)", display: "block"}}></span>
        </div>
        <h2 data-rise style={{fontSize: "clamp(38px, 6vw, 92px)", fontWeight: "700", margin: "0 0 56px", lineHeight: "0.96", letterSpacing: "-0.04em", maxWidth: "27ch", textWrap: "balance"}}>Aid is becoming investment. Investment expects a return.</h2>
        <div data-rise className="om-row" style={{"--om-n": 4, marginBottom: "56px"}}>
          <div style={{background: "#12222c", color: "#f5f5dc", padding: "34px 30px 38px"}}>
            <div style={{fontSize: "clamp(48px, 5.5vw, 82px)", fontWeight: "700", letterSpacing: "-0.045em", lineHeight: "0.9"}}><span data-count="28">28</span><span style={{color: "#00afef"}}>%</span></div>
            <p style={{margin: "20px 0 0", fontSize: "17px", color: "rgba(245,245,220,0.72)", lineHeight: "1.5"}}>the top of the range bilateral aid to sub-Saharan Africa was projected to fall by in 2025</p>
            <p style={{margin: "12px 0 0", fontSize: "13px", lineHeight: "1.45", color: "rgba(245,245,220,0.42)"}}><a href="https://www.oecd.org/en/publications/2025/06/cuts-in-official-development-assistance_e161f0c5/full-report.html" target="_blank" rel="noopener noreferrer" style={{color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px"}}>OECD, Cuts in Official Development Assistance, June 2025</a></p>
          </div>
          <div style={{background: "#12222c", color: "#f5f5dc", padding: "34px 30px 38px"}}>
            <div style={{fontSize: "clamp(48px, 5.5vw, 82px)", fontWeight: "700", letterSpacing: "-0.045em", lineHeight: "0.9"}}><span data-count="11">11</span></div>
            <p style={{margin: "20px 0 0", fontSize: "17px", color: "rgba(245,245,220,0.72)", lineHeight: "1.5"}}>donor countries with further cuts announced to 2027, together nearly three quarters of all aid</p>
            <p style={{margin: "12px 0 0", fontSize: "13px", lineHeight: "1.45", color: "rgba(245,245,220,0.42)"}}><a href="https://www.oecd.org/en/publications/2025/06/cuts-in-official-development-assistance_e161f0c5/full-report.html" target="_blank" rel="noopener noreferrer" style={{color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px"}}>OECD, Cuts in Official Development Assistance, June 2025</a></p>
          </div>
          <div style={{background: "#c9a84c", color: "#2a1c04", padding: "34px 30px 38px"}}>
            <div style={{fontSize: "clamp(48px, 5.5vw, 82px)", fontWeight: "700", letterSpacing: "-0.045em", lineHeight: "0.9"}}><span style={{fontSize: "0.5em", verticalAlign: "super", opacity: "0.7"}}>$</span><span data-count="65">65</span>m</div>
            <p style={{margin: "20px 0 0", fontSize: "17px", color: "rgba(42,28,4,0.75)", lineHeight: "1.5"}}>the median blended finance deal now, up from 38m</p>
            <p style={{margin: "12px 0 0", fontSize: "13px", lineHeight: "1.45", color: "rgba(42,28,4,0.5)"}}><a href="https://www.convergence.finance/resource/state-of-blended-finance-2025/view" target="_blank" rel="noopener noreferrer" style={{color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px"}}>Convergence, State of Blended Finance 2025</a></p>
          </div>
          <div style={{background: "#00767a", color: "#eafcff", padding: "34px 30px 38px"}}>
            <div style={{fontSize: "clamp(48px, 5.5vw, 82px)", fontWeight: "700", letterSpacing: "-0.045em", lineHeight: "0.9"}}><span data-count="3">3</span></div>
            <p style={{margin: "20px 0 0", fontSize: "17px", color: "rgba(234,252,255,0.8)", lineHeight: "1.5"}}>ex-post evaluations among 72 market systems documents reviewed in 2024</p>
            <p style={{margin: "12px 0 0", fontSize: "13px", lineHeight: "1.45", color: "rgba(234,252,255,0.55)"}}><a href="https://beamexchange.org/evidence/evidence-review-2024/" target="_blank" rel="noopener noreferrer" style={{color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px"}}>BEAM Evidence Review, September 2024</a></p>
          </div>
        </div>
        <div data-rise style={{display: "flex", flexWrap: "wrap", gap: "56px"}}>
          <p style={{flex: "1 1 340px", minWidth: "0", margin: "0", fontSize: "22px", color: "#4a5560", lineHeight: "1.6", textWrap: "pretty"}}>Most people in the sector know about the cuts. The part that gets less attention is what happened to the money that stayed. It did not disappear. It got fussier. Fewer deals, each one bigger, and local money matters more than it did five years ago.</p>
          <div style={{flex: "1 1 340px", minWidth: "0"}}>
            <p style={{margin: "0 0 32px", paddingLeft: "26px", borderLeft: "4px solid #00afef", fontSize: "clamp(23px, 2.4vw, 32px)", fontWeight: "600", lineHeight: "1.3", letterSpacing: "-0.022em", color: "#12222c"}}>That is not a funding problem. It is a commercial one, and commercial problems can be solved.</p>
            <p style={{margin: "0", fontSize: "22px", color: "#4a5560", lineHeight: "1.6", textWrap: "pretty"}}>Funders have started behaving like investors. Programmes are now asked to report investment readiness, commercial finance accessed and capital leveraged — questions about the businesses they work with, not about the intervention. Most only discover they cannot answer them near the end.</p>
          </div>
        </div>
      </div>
    </section>

    {/* ── Chapter 02 ── */}
    <section data-chapter="02" style={{background: "#12222c", color: "#f5f5dc", padding: "clamp(72px, 9vw, 132px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <div data-rise style={{display: "flex", alignItems: "baseline", gap: "20px", marginBottom: "44px", flexWrap: "wrap"}}>
          <h2 style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00afef", fontWeight: "700", margin: "0"}}>Who this is for</h2>
          <span style={{flex: "1 1 60px", height: "1px", background: "rgba(245,245,220,0.25)", display: "block"}}></span>
        </div>
        <p data-rise style={{fontSize: "clamp(30px, 4.2vw, 62px)", fontWeight: "700", margin: "0 0 36px", lineHeight: "1.02", letterSpacing: "-0.036em", maxWidth: "30ch", textWrap: "balance"}}>Programmes that back private businesses and are judged on whether those businesses last.</p>
        <p data-rise style={{margin: "0 0 60px", fontSize: "22px", color: "rgba(245,245,220,0.8)", lineHeight: "1.55", maxWidth: "62ch", textWrap: "pretty"}}>You are a team leader, a private sector lead, or a results and evidence manager on a market systems or challenge fund programme. Or you are in a head office, carrying the past performance of a closing programme into the next bid. Or you are the funder, and you wrote the indicators.</p>
        <div style={{display: "flex", flexDirection: "column"}}>
          {AUDIENCES.map((a, i) => (
            <div key={i} data-rise style={{display: "flex", flexWrap: "wrap", gap: "24px 48px", alignItems: "baseline", padding: "40px 0", borderTop: "1px solid rgba(245,245,220,0.2)"}}>
              <span style={{flex: "0 0 auto", fontSize: "clamp(28px, 3vw, 42px)", fontWeight: "700", color: "#00afef", letterSpacing: "-0.03em", lineHeight: "1"}}>{a.mark}</span>
              <p style={{flex: "0 1 300px", margin: "0", fontSize: "clamp(30px, 3.6vw, 52px)", fontWeight: "600", letterSpacing: "-0.032em", lineHeight: "1.02"}}>{a.who}</p>
              <p style={{flex: "1 1 340px", minWidth: "0", margin: "0", fontSize: "22px", color: "rgba(245,245,220,0.8)", lineHeight: "1.55"}}>{a.what}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── Chapter 03 ── the six moments, as a programme timeline */}
    <section id="services" data-chapter="03" style={{background: "#f5f5dc", color: "#12222c", padding: "clamp(72px, 9vw, 132px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <div data-rise style={{display: "flex", alignItems: "baseline", gap: "20px", marginBottom: "44px", flexWrap: "wrap"}}>
          <h2 style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00767a", fontWeight: "700", margin: "0"}}>What I do</h2>
          <span style={{flex: "1 1 60px", height: "1px", background: "rgba(18,34,44,0.25)", display: "block"}}></span>
        </div>
        <ol style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column"}}>
          {MOMENTS.map((m, i) => (
            <li key={i} data-rise style={{display: "flex", flexWrap: "wrap", gap: "20px 48px", alignItems: "baseline", padding: "40px 0", borderTop: "1px solid rgba(18,34,44,0.2)"}}>
              <span style={{flex: "0 0 64px", fontSize: "clamp(40px, 4.4vw, 62px)", fontWeight: "700", letterSpacing: "-0.045em", lineHeight: "0.9", color: "#00afef"}}>{m.n}</span>
              <div style={{flex: "1 1 520px", minWidth: "0", maxWidth: "860px"}}>
                <p style={{margin: "0 0 14px", fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#00767a", fontWeight: "700"}}>{m.label}</p>
                <p style={{margin: "0", fontSize: "clamp(24px, 2.6vw, 36px)", fontWeight: "600", lineHeight: "1.15", letterSpacing: "-0.026em", textWrap: "pretty"}}>{m.q}</p>
                <p style={{margin: "20px 0 0", fontSize: "19px", color: "#4a5560", lineHeight: "1.62", textWrap: "pretty"}}>{m.body}</p>
                <p style={{margin: "22px 0 0", paddingLeft: "20px", borderLeft: "4px solid #00afef", fontSize: "18px", fontWeight: "600", color: "#12222c", lineHeight: "1.5", textWrap: "pretty"}}>{m.out}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>

    {/* ── Chapter 04 ── how the work is done, deliberately quieter */}
    <section id="method" data-chapter="04" style={{background: "#c9a84c", color: "#2a1c04", padding: "clamp(56px, 6vw, 88px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <div data-rise style={{display: "flex", alignItems: "baseline", gap: "20px", marginBottom: "32px", flexWrap: "wrap"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#2a1c04", fontWeight: "700", margin: "0"}}>The method</span>
          <span style={{flex: "1 1 60px", height: "1px", background: "rgba(42,28,4,0.3)", display: "block"}}></span>
        </div>
        <h2 data-rise style={{fontSize: "clamp(26px, 3.2vw, 46px)", fontWeight: "700", margin: "0 0 18px", lineHeight: "1.02", letterSpacing: "-0.036em"}}>How the work gets done</h2>
        <p data-rise style={{margin: "0 0 32px", fontSize: "clamp(20px, 1.9vw, 25px)", fontWeight: "600", lineHeight: "1.4", letterSpacing: "-0.015em", maxWidth: "50ch"}}>Five tools do that work. They are how it is done, not what you buy.</p>
        <div data-rise style={{display: "flex", flexWrap: "wrap", gap: "40px", marginBottom: "40px"}}>
          <p style={{flex: "1 1 340px", minWidth: "0", margin: "0", fontSize: "18px", color: "rgba(42,28,4,0.82)", lineHeight: "1.62", textWrap: "pretty"}}>Alex Osterwalder made this argument for business models and he was right. Put every decision on one page and three things happen. You see the whole picture at once. You see which pieces do not fit. And everyone in the room is looking at the same thing.</p>
          <p style={{flex: "1 1 340px", minWidth: "0", margin: "0", fontSize: "18px", color: "rgba(42,28,4,0.82)", lineHeight: "1.62", textWrap: "pretty"}}>That last one matters more than it sounds. A canvas is the only format I have found that a chief executive, a field team, a partner and a donor can all read together without a translator. So each method is a canvas of numbered decisions, each with one question, one output, and a test that says whether it is finished.</p>
        </div>
        <div data-rise className="om-row" style={{"--om-n": 5}}>
          {METHODS.map((c, i) => (
            <div key={i} style={{background: "#2a1c04", color: "#f5f5dc", padding: "26px 24px 28px"}}>
              <div style={{fontSize: "clamp(34px, 3.4vw, 48px)", fontWeight: "700", letterSpacing: "-0.045em", lineHeight: "0.9", color: "#c9a84c"}}><span data-count={c.n}>{c.n}</span></div>
              <p style={{margin: "14px 0 8px", fontSize: "12.5px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,220,0.55)", fontWeight: "700"}}>{c.unit}</p>
              <h3 style={{margin: "0 0 8px", fontSize: "18px", fontWeight: "600", lineHeight: "1.2", letterSpacing: "-0.015em"}}>{c.name}</h3>
              <p style={{margin: "0", fontSize: "15.5px", color: "rgba(245,245,220,0.7)", lineHeight: "1.5"}}>{c.blocks}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── Chapter 05 ── */}
    <section id="evidence" data-chapter="05" style={{background: "#12222c", color: "#f5f5dc", padding: "clamp(72px, 9vw, 132px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <div data-rise style={{display: "flex", alignItems: "baseline", gap: "20px", marginBottom: "44px", flexWrap: "wrap"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00afef", fontWeight: "700", margin: "0"}}>Evidence</span>
          <span style={{flex: "1 1 60px", height: "1px", background: "rgba(245,245,220,0.25)", display: "block"}}></span>
        </div>
        <div data-rise style={{display: "flex", flexWrap: "wrap", gap: "40px", alignItems: "flex-end", marginBottom: "12px"}}>
          <h2 style={{flex: "1 1 400px", minWidth: "0", fontSize: "clamp(34px, 5.2vw, 78px)", fontWeight: "700", margin: "0", lineHeight: "0.98", letterSpacing: "-0.04em", maxWidth: "16ch"}}>What the work found.</h2>
          <p style={{flex: "1 1 300px", minWidth: "0", margin: "0", fontSize: "20px", color: "rgba(245,245,220,0.75)", lineHeight: "1.55"}}>Fifteen engagements. Some of this contradicts what the sector tells itself, and it is written plainly because that is how it turned up.</p>
        </div>
        <div style={{display: "flex", flexDirection: "column"}}>
          {PROOF.map((p, i) => (
            <div key={i} data-rise style={{display: "flex", flexWrap: "wrap", gap: "24px 44px", alignItems: "flex-start", padding: "44px 0", borderTop: "1px solid rgba(245,245,220,0.2)"}}>
              <span style={{flex: "0 0 auto", fontSize: "15px", fontWeight: "700", letterSpacing: "0.14em", color: "#00afef"}}>{'0' + (i + 1)}</span>
              <p style={{flex: "1 1 340px", minWidth: "0", margin: "0", fontSize: "clamp(26px, 3.2vw, 44px)", fontWeight: "600", lineHeight: "1.06", letterSpacing: "-0.032em", textWrap: "balance"}}>{p.title}</p>
              <div style={{flex: "1 1 320px", minWidth: "0"}}>
                <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,245,220,0.5)", fontWeight: "700"}}>{p.cat}</span>
                <p style={{margin: "16px 0 0", color: "rgba(245,245,220,0.78)", fontSize: "18.5px", lineHeight: "1.6", textWrap: "pretty"}}>{p.what}</p>
              </div>
            </div>
          ))}
        </div>

        <div data-rise className="om-row" style={{"--om-n": 6, borderTop: "1px solid rgba(245,245,220,0.2)", paddingTop: "44px"}}>
          {FIGURES.map((f, i) => (
            <div key={i} style={{background: "#0b1620", padding: "26px 20px 28px"}}>
              <div style={{fontSize: "clamp(26px, 2.5vw, 42px)", fontWeight: "700", letterSpacing: "-0.045em", lineHeight: "0.95", whiteSpace: "nowrap"}}>{f.pre}<span data-count={f.n}>{f.n.toLocaleString('en-GB')}</span><span style={{color: "#00afef"}}>{f.post}</span></div>
              <p style={{margin: "14px 0 0", fontSize: "15.5px", color: "rgba(245,245,220,0.72)", lineHeight: "1.5"}}>{f.label}</p>
            </div>
          ))}
        </div>

        {RECOMMENDATIONS.map((r, i) => (
          <figure key={i} data-rise style={{margin: "56px 0 0", paddingLeft: "26px", borderLeft: "4px solid #00afef", maxWidth: "62ch"}}>
            <blockquote style={{margin: "0", fontSize: "clamp(20px, 1.9vw, 25px)", lineHeight: "1.5", color: "#f5f5dc", textWrap: "pretty"}}>&ldquo;{r.quote}&rdquo;</blockquote>
            <figcaption style={{marginTop: "22px"}}>
              <span style={{display: "block", fontSize: "18px", fontWeight: "600"}}>{r.name}</span>
              <span style={{display: "block", fontSize: "16px", color: "rgba(245,245,220,0.6)", marginTop: "4px"}}>{r.role}</span>
            </figcaption>
          </figure>
        ))}

        <div data-rise style={{marginTop: "72px", borderTop: "1px solid rgba(245,245,220,0.2)", paddingTop: "44px"}}>
          <h3 style={{fontSize: "clamp(26px, 3vw, 42px)", fontWeight: "700", margin: "0 0 32px", lineHeight: "1.02", letterSpacing: "-0.032em"}}>What you will be able to report</h3>
          <ul className="om-row" style={{"--om-n": 4, listStyle: "none", margin: "0", padding: "0"}}>
            {REPORTABLE.map((line, i) => (
              <li key={i} style={{background: "#0b1620", borderTop: "4px solid #00afef", padding: "26px 26px 28px", fontSize: "18.5px", lineHeight: "1.5", color: "rgba(245,245,220,0.88)"}}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>

    {(showLogos) ? (
      <section style={{background: "#0b1620", padding: "40px 0", overflow: "hidden", borderTop: "1px solid rgba(245,245,220,0.14)", borderBottom: "1px solid rgba(245,245,220,0.14)"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto", padding: "0 40px 26px"}}>
          <p style={{fontSize: "14px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(245,245,220,0.45)", margin: "0", fontWeight: "700"}}>Programmes I have worked on</p>
        </div>
        <div style={{display: "flex", width: "max-content", animation: "om-marquee 26s linear infinite", alignItems: "center"}}>
          <img src="/site/client-logos.png" alt="Adam Smith International, Mercy Corps, Palladium" style={{height: "58px", width: "auto", display: "block", padding: "0 44px", opacity: "0.9"}} />
          <img src="/site/client-logos.png" alt="" style={{height: "58px", width: "auto", display: "block", padding: "0 44px", opacity: "0.9"}} />
          <img src="/site/client-logos.png" alt="" style={{height: "58px", width: "auto", display: "block", padding: "0 44px", opacity: "0.9"}} />
          <img src="/site/client-logos.png" alt="" style={{height: "58px", width: "auto", display: "block", padding: "0 44px", opacity: "0.9"}} />
        </div>
      </section>
    ) : null}

    <section style={{background: "#f5f5dc", color: "#12222c", padding: "clamp(72px, 9vw, 132px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "64px", alignItems: "center"}}>
        <div data-rise style={{flex: "1 1 320px", minWidth: "0"}}>
          <img src="/site/portrait-seated.jpg" alt="Habib Onifade" style={{display: "block", width: "100%", height: "auto", maxHeight: "660px", objectFit: "cover", objectPosition: "50% 12%"}} />
        </div>
        <div data-rise style={{flex: "1 1 400px", minWidth: "0"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00767a", fontWeight: "700"}}>Who does this</span>
          <h2 style={{fontSize: "clamp(30px, 4vw, 56px)", fontWeight: "700", margin: "24px 0 28px", lineHeight: "1.0", letterSpacing: "-0.036em", maxWidth: "20ch"}}>Corporate finance first. Development second.</h2>
          <p style={{color: "#4a5560", margin: "0 0 22px", fontSize: "20px", lineHeight: "1.6", maxWidth: "50ch", textWrap: "pretty"}}>That order matters. I came to development from corporate finance, which is why the models I build are meant to be used rather than filed.</p>
          <p style={{color: "#4a5560", margin: "0 0 22px", fontSize: "20px", lineHeight: "1.6", maxWidth: "50ch", textWrap: "pretty"}}>My career began in corporate finance in the City of London: HSBC, ABN Amro, Capita.</p>
          <p style={{color: "#4a5560", margin: "0", fontSize: "20px", lineHeight: "1.6", maxWidth: "50ch", textWrap: "pretty"}}>The steps are the same every time. Assess the businesses. Fix the ones worth fixing. Take the ready ones to finance. Prove what lasted.</p>
        </div>
      </div>
      <div data-rise className="om-row" style={{"--om-n": 4, maxWidth: "1440px", margin: "56px auto 0"}}>
        {(stats || []).map((st, i) => (
          <div key={i} style={{background: "#12222c", color: "#f5f5dc", padding: "22px 20px 24px"}}>
            <div style={{fontSize: "clamp(24px, 2.4vw, 34px)", fontWeight: "700", letterSpacing: "-0.032em", lineHeight: "1.05", whiteSpace: "nowrap"}}>{st.pre}<span data-count={st.n}>{st.n}</span>{st.post}</div>
            <div style={{fontSize: "14.5px", color: "rgba(245,245,220,0.65)", marginTop: "10px", lineHeight: "1.4"}}>{st.label}</div>
          </div>
        ))}
      </div>
    </section>

    {/* ── Chapter 06 ── */}
    <section id="newsletter" data-chapter="06" style={{background: "#12222c", color: "#f5f5dc", padding: "clamp(72px, 9vw, 132px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <div data-rise style={{display: "flex", alignItems: "baseline", gap: "20px", marginBottom: "44px", flexWrap: "wrap"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00afef", fontWeight: "700", margin: "0"}}>Take something with you</span>
          <span style={{flex: "1 1 60px", height: "1px", background: "rgba(245,245,220,0.25)", display: "block"}}></span>
        </div>
        <div style={{display: "flex", flexWrap: "wrap", gap: "56px", alignItems: "flex-start"}}>
          <div data-rise style={{flex: "1 1 460px", minWidth: "0"}}>
            <h2 style={{fontSize: "clamp(34px, 5.2vw, 78px)", fontWeight: "700", margin: "0 0 40px", lineHeight: "0.98", letterSpacing: "-0.04em", maxWidth: "16ch"}}>Three questions worth answering</h2>
            <ol style={{listStyle: "none", margin: "0", padding: "0"}}>
              {THREE_QUESTIONS.map((q, i) => (
                <li key={i} style={{display: "flex", gap: "22px", alignItems: "baseline", padding: "24px 0", borderTop: "1px solid rgba(245,245,220,0.2)"}}>
                  <span style={{flex: "0 0 auto", fontSize: "15px", fontWeight: "700", letterSpacing: "0.14em", color: "#00afef"}}>{'0' + (i + 1)}</span>
                  <span style={{fontSize: "clamp(21px, 2vw, 28px)", fontWeight: "600", lineHeight: "1.25", letterSpacing: "-0.02em"}}>{q}</span>
                </li>
              ))}
            </ol>
          </div>
          <div data-rise style={{flex: "1 1 360px", minWidth: "0"}}>
            {(nlSent) ? (
              <div style={{borderTop: "4px solid #00afef", paddingTop: "30px"}}>
                <p style={{fontSize: "clamp(24px, 2.8vw, 34px)", fontWeight: "700", margin: "0", letterSpacing: "-0.03em", lineHeight: "1.1"}}>You are in.</p>
              </div>
            ) : (
              <div style={{background: "#0b1620", padding: "34px 30px 36px", borderTop: "4px solid #00afef", display: "flex", flexDirection: "column", gap: "26px"}}>
                <img src="/site/viable-by-design.png" alt="Viable by Design" style={{height: "56px", width: "auto", display: "block", alignSelf: "flex-start"}} />
                <div>
                  <label htmlFor="nl-first" style={{...label, color: "rgba(245,245,220,0.6)"}}>First name</label>
                  <input id="nl-first" type="text" autoComplete="given-name" value={nlFirst} onChange={(e) => setNlFirst(e.target.value)} style={{...field, borderBottom: "2px solid rgba(245,245,220,0.35)", color: "#f5f5dc"}} />
                </div>
                <div>
                  <label htmlFor="nl-email" style={{...label, color: "rgba(245,245,220,0.6)"}}>Email</label>
                  <input id="nl-email" type="email" autoComplete="email" value={nlEmail} onChange={(e) => setNlEmail(e.target.value)} style={{...field, borderBottom: "2px solid rgba(245,245,220,0.35)", color: "#f5f5dc"}} />
                </div>
                <div>
                  <span className="hv36" role="button" tabIndex={0} onClick={sendNewsletter} onKeyDown={(e) => { if (e.key === 'Enter') sendNewsletter() }} style={{display: "inline-block", fontSize: "18px", fontWeight: "600", padding: "21px 34px", cursor: nlSending ? "wait" : "pointer", background: "#00afef", color: "#12222c"}}>Send me Viable by Design</span>
                  <p style={{margin: "16px 0 0", fontSize: "16px", color: "rgba(245,245,220,0.65)"}}>Every Wednesday. One idea. Unsubscribe whenever.</p>
                </div>
                {(nlError) ? (
                  <p style={{color: "#ff8b7e", fontSize: "16.5px", margin: "0", fontWeight: "600"}}>{nlError}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>

    {/* ── Chapter 07 ── the one call to action */}
    <section id="book" data-chapter="07" style={{background: "#00afef", color: "#12222c", padding: "clamp(76px, 10vw, 148px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <h2 data-rise style={{fontSize: "clamp(40px, 7vw, 116px)", fontWeight: "700", margin: "0 0 34px", lineHeight: "0.92", letterSpacing: "-0.045em", maxWidth: "18ch", textWrap: "balance"}}>Book twenty minutes</h2>
        <p data-rise style={{color: "rgba(18,34,44,0.78)", margin: "0 0 46px", fontSize: "clamp(20px, 2vw, 27px)", maxWidth: "40ch", lineHeight: "1.45"}}>Two questions first, so I know who I am talking to. Then pick a time.</p>
        <div data-rise style={{maxWidth: "860px", display: "flex", flexDirection: "column", gap: "28px"}}>
          <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "26px"}}>
            <div>
              <label htmlFor="bk-programme" style={{...label, color: "rgba(18,34,44,0.7)"}}>Programme name</label>
              <input id="bk-programme" type="text" required value={qProgramme} onChange={(e) => setQProgramme(e.target.value)} disabled={calShown} style={{...field, borderBottom: "2px solid rgba(18,34,44,0.5)", color: "#12222c"}} />
            </div>
            <div>
              <label htmlFor="bk-country" style={{...label, color: "rgba(18,34,44,0.7)"}}>Country</label>
              <input id="bk-country" type="text" required autoComplete="country-name" value={qCountry} onChange={(e) => setQCountry(e.target.value)} disabled={calShown} style={{...field, borderBottom: "2px solid rgba(18,34,44,0.5)", color: "#12222c"}} />
            </div>
          </div>
          <div>
            <label htmlFor="bk-notes" style={{...label, color: "rgba(18,34,44,0.7)"}}>Anything you want me to look at before we speak?</label>
            <textarea id="bk-notes" rows={3} value={qNotes} onChange={(e) => setQNotes(e.target.value)} disabled={calShown} style={{...field, lineHeight: "1.5", borderBottom: "2px solid rgba(18,34,44,0.5)", color: "#12222c", resize: "vertical"}}></textarea>
          </div>
          {(!calShown) ? (
            <div>
              <span className="hv22" role="button" tabIndex={0} aria-disabled={!qualified} data-testid="qualifier-submit" onClick={submitQualifier} onKeyDown={(e) => { if (e.key === 'Enter') submitQualifier() }} style={{display: "inline-block", fontSize: "19px", fontWeight: "600", padding: "25px 42px", cursor: qualified ? "pointer" : "not-allowed", background: "#12222c", color: "#f5f5dc", opacity: qualified ? "1" : "0.4"}}>SHOW ME AVAILABLE TIMES</span>
            </div>
          ) : null}
        </div>
        {(calShown) ? (
          <div id="book-calendar" data-testid="book-calendar" style={{marginTop: "44px", background: "#ffffff", minHeight: "620px", width: "100%", overflow: "auto"}}></div>
        ) : null}
        <p data-rise style={{margin: "36px 0 0"}}>
          <span onClick={goContact} style={{fontSize: "16.5px", color: "rgba(18,34,44,0.8)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px"}}>Send me an enquiry instead</span>
        </p>
      </div>
    </section>

  </div>
  ) : null}

  {(isContact) ? (
    <section style={{background: "#12222c", color: "#f5f5dc", padding: "clamp(56px, 7.5vw, 104px) 40px clamp(64px, 9vw, 120px)", minHeight: "74vh"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "64px"}}>
        <div style={{flex: "1 1 400px", minWidth: "0"}}>
          <div style={{display: "flex", alignItems: "center", gap: "16px", margin: "0 0 32px"}}>
            <span style={{width: "60px", height: "3px", background: "#00afef", display: "block", flex: "0 0 auto"}}></span>
            <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>Get in touch</span>
          </div>
          <h1 style={{fontSize: "clamp(38px, 5.6vw, 84px)", fontWeight: "700", lineHeight: "0.95", letterSpacing: "-0.042em", margin: "0", maxWidth: "16ch"}}>Tell me where you are stuck.</h1>
          <p style={{margin: "34px 0 0", fontSize: "clamp(20px, 1.9vw, 26px)", color: "rgba(245,245,220,0.8)", maxWidth: "42ch", lineHeight: "1.5"}}>A short note is enough. Your programme, the country, and what you are trying to prove. I reply to everything myself.</p>
          <div style={{marginTop: "48px", borderTop: "1px solid rgba(245,245,220,0.2)", paddingTop: "34px"}}>
            <p style={{margin: "0 0 12px", fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,245,220,0.55)", fontWeight: "700"}}>Or write directly</p>
            <a href="mailto:hello@habibonifade.com" style={{fontSize: "24px", fontWeight: "600", color: "#00afef", textDecoration: "none"}}>hello@habibonifade.com</a>
            <p style={{margin: "26px 0 0", fontSize: "17px", color: "rgba(245,245,220,0.65)", lineHeight: "1.6"}}>Based in Nairobi. I work across East, West and Southern Africa.</p>
          </div>
        </div>
        <div style={{flex: "1 1 400px", minWidth: "0"}}>
          {(contactSent) ? (
            <div style={{borderTop: "4px solid #00afef", paddingTop: "34px"}}>
              <p style={{fontSize: "clamp(26px, 3vw, 38px)", fontWeight: "700", margin: "0 0 20px", letterSpacing: "-0.032em", lineHeight: "1.1"}}>That has reached me.</p>
              <p style={{margin: "0", fontSize: "19px", color: "rgba(245,245,220,0.8)", lineHeight: "1.6"}}>I read everything myself and usually reply within two working days. If it is urgent, write to hello@habibonifade.com and put URGENT in the subject.</p>
            </div>
          ) : null}
          {(contactOpen) ? (
            <div style={{display: "flex", flexDirection: "column", gap: "28px"}}>
              <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "26px"}}>
                <div>
                  <label htmlFor="ec-name" style={{display: "block", fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: "700", margin: "0 0 12px", color: "rgba(245,245,220,0.6)"}}>Your name</label>
                  <input id="ec-name" type="text" value={cName} onChange={onCName} placeholder="Required" style={{width: "100%", fontFamily: "inherit", fontSize: "20px", padding: "16px 0", border: "none", borderBottom: "2px solid rgba(245,245,220,0.35)", background: "transparent", color: "#f5f5dc"}} />
                </div>
                <div>
                  <label htmlFor="ec-email" style={{display: "block", fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: "700", margin: "0 0 12px", color: "rgba(245,245,220,0.6)"}}>Email</label>
                  <input id="ec-email" type="email" value={cEmail} onChange={onCEmail} placeholder="Required" style={{width: "100%", fontFamily: "inherit", fontSize: "20px", padding: "16px 0", border: "none", borderBottom: "2px solid rgba(245,245,220,0.35)", background: "transparent", color: "#f5f5dc"}} />
                </div>
              </div>
              <div>
                <label htmlFor="ec-org" style={{display: "block", fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: "700", margin: "0 0 12px", color: "rgba(245,245,220,0.6)"}}>Organisation</label>
                <input id="ec-org" type="text" value={cOrg} onChange={onCOrg} placeholder="Optional" style={{width: "100%", fontFamily: "inherit", fontSize: "20px", padding: "16px 0", border: "none", borderBottom: "2px solid rgba(245,245,220,0.35)", background: "transparent", color: "#f5f5dc"}} />
              </div>
              <div>
                <label htmlFor="ec-msg" style={{display: "block", fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: "700", margin: "0 0 12px", color: "rgba(245,245,220,0.6)"}}>What is the situation</label>
                <textarea id="ec-msg" rows="5" value={cMsg} onChange={onCMsg} placeholder="Your programme, the country, and what you are trying to prove." style={{width: "100%", fontFamily: "inherit", fontSize: "20px", lineHeight: "1.5", padding: "16px 0", border: "none", borderBottom: "2px solid rgba(245,245,220,0.35)", background: "transparent", color: "#f5f5dc", resize: "vertical"}}></textarea>
              </div>
              <div>
                <span className="hv38" onClick={sendContact} style={{display: "inline-block", fontSize: "19px", fontWeight: "600", padding: "23px 38px", cursor: "pointer", background: "#00afef", color: "#12222c"}}>Send it</span>
              </div>
              {(cError) ? (
                <p style={{color: "#ff8b7e", fontSize: "17px", margin: "0", fontWeight: "600"}}>{cError}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  ) : null}

  <footer style={{background: "#0b1620", color: "#f5f5dc"}}>
    <div style={{maxWidth: "1440px", margin: "0 auto", padding: "64px 40px 40px"}}>
      <div style={{display: "flex", flexWrap: "wrap", gap: "40px 60px", alignItems: "center", paddingBottom: "52px", borderBottom: "1px solid rgba(245,245,220,0.16)"}}>
        <div style={{flex: "1 1 380px", minWidth: "0"}}>
          <img src="/site/viable-by-design.png" alt="Viable by Design" style={{height: "76px", width: "auto", display: "block", marginBottom: "26px"}} />
          <p style={{margin: "0", fontSize: "19px", color: "rgba(245,245,220,0.85)", maxWidth: "40ch", lineHeight: "1.6"}}>The longer edition, from here rather than LinkedIn. Every Wednesday. One idea about what makes the businesses programmes back actually work.</p>
          {(showCount) ? (
            <p style={{margin: "16px 0 0", fontSize: "17px", color: "#00afef", fontWeight: "600"}}><span data-count="1145">1145</span> people read it on LinkedIn.</p>
          ) : null}
        </div>
        <div style={{flex: "0 1 auto"}}>
          <span className="hv39" onClick={() => jump('newsletter')} style={{display: "inline-block", fontSize: "18px", fontWeight: "600", padding: "21px 36px", cursor: "pointer", background: "#00afef", color: "#12222c"}}>Subscribe</span>
        </div>
      </div>

      <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "40px", padding: "48px 0", borderBottom: "1px solid rgba(245,245,220,0.16)"}}>
        <div>
          <img src="/site/habib-onifade-wordmark.png" alt="Habib Onifade" style={{height: "38px", width: "auto", display: "block", marginBottom: "24px"}} />
          <p style={{fontSize: "17px", color: "rgba(245,245,220,0.68)", margin: "0", maxWidth: "30ch", lineHeight: "1.6"}}>Assess the businesses. Fix the ones worth fixing. Take the ready ones to finance. Prove what lasted.</p>
        </div>
        <div>
          <p style={{fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,245,220,0.5)", margin: "0 0 20px", fontWeight: "700"}}>What I do</p>
          <div style={{display: "flex", flexDirection: "column", gap: "13px"}}>
            {METHODS.map((s, i) => (
              <span key={i} className="hv40" onClick={() => jump('method')} style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", cursor: "pointer", lineHeight: "1.45"}}>{s.name}</span>
            ))}
          </div>
        </div>
        <div>
          <p style={{fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,245,220,0.5)", margin: "0 0 20px", fontWeight: "700"}}>Explore</p>
          <div style={{display: "flex", flexDirection: "column", gap: "13px"}}>
            <span className="hv41" onClick={() => jump('evidence')} style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", cursor: "pointer"}}>Evidence</span>
            <span className="hv42" onClick={goBook} style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", cursor: "pointer"}}>Book a call</span>
          </div>
        </div>
        <div>
          <p style={{fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,245,220,0.5)", margin: "0 0 20px", fontWeight: "700"}}>Get in touch</p>
          <div style={{display: "flex", flexDirection: "column", gap: "13px"}}>
            <span className="hv45" onClick={goContact} style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", cursor: "pointer"}}>Contact</span>
            <a className="hv46" href="mailto:hello@habibonifade.com" style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", textDecoration: "none"}}>hello@habibonifade.com</a>
            <a className="hv47" href="https://www.linkedin.com/in/habibonifade/" target="_blank" rel="noopener noreferrer" style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", textDecoration: "none"}}>LinkedIn</a>
            <a className="hv48" href="https://www.youtube.com/@HabibOnifade" target="_blank" rel="noopener noreferrer" style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", textDecoration: "none"}}>YouTube</a>
            <a className="hv49" href="https://clearview.habibonifade.com" target="_blank" rel="noopener noreferrer" style={{fontSize: "16.5px", color: "#00afef", textDecoration: "none", fontWeight: "600"}}>Clearview sign in</a>
          </div>
        </div>
      </div>

      <div style={{paddingTop: "30px", display: "flex", justifyContent: "space-between", gap: "24px", flexWrap: "wrap", alignItems: "center"}}>
        <p style={{fontSize: "15px", color: "rgba(245,245,220,0.55)", margin: "0"}}>Grant to Commercial Viability Canvas. The Canvas Coach. habibonifade.com</p>
        <p style={{fontSize: "15px", color: "rgba(245,245,220,0.55)", margin: "0"}}>&copy; 2026 Verido UK Limited</p>
      </div>
    </div>
  </footer>

</div>
    </>
  )
}
