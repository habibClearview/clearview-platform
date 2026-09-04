// @ts-nocheck
'use client'
// ============================================================
// THE APPROVED SITE, PORTED RATHER THAN REINTERPRETED.
//
// The markup below is the design Habib approved, converted from its own export
// mechanically: every inline style, every value and every element as designed.
// It is one component because the design is one component. Cutting it into
// pieces is how the first attempt at this drifted into a redesign.
//
// WHAT IS DIFFERENT FROM THE PROTOTYPE, AND WHY.
//
//   SCREENS ARE ROUTES. The prototype switched screens with local state, which
//   cannot be linked to or indexed. Here the screen arrives as a prop, so the
//   server renders the right one and the page is complete on first paint, and
//   go() pushes a real address. That also fixes content only appearing after a
//   refresh: nothing waits for the browser to decide what to draw.
//
//   CAPTURE IS SERVER SIDE. The prototype posted to Kit's public form endpoint
//   with five form ids pasted in by hand. Those ids never existed. Capture goes
//   through /api/readiness and /api/subscribe, where the server decides the tag
//   and no key reaches the browser.
//
// Everything else is the design.
// ============================================================
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { DESIGN_CSS } from '@/components/site/design/design.css'
import {
  MENU, MARQUEE, AUDIENCES, SERVICES, CANVAS, FITS, INTEL_STEPS, DIMENSIONS,
  TIERS, ICC_BLOCKS, PHASES, IDC_TOOLS, TRALIMM_MODELS, QUESTIONS, PROOF_ALL,
  FRAMEWORKS, RESOURCES, VIDEOS, CANVAS_FAMILY, MAGNETS, PROOF, STATS,
} from '@/components/site/design/data'

/** A screen in the design maps to one address a person can link to. */
export const SCREEN_PATH: Record<string, string> = {
  home: '/',
  gtcv: '/what-i-do/grant-to-commercial-viability',
  intel: '/what-i-do/market-intelligence',
  icc: '/what-i-do/investment-case',
  idcms: '/what-i-do/intervention-design',
  tralimm: '/what-i-do/trade-liquidity',
  proof: '/evidence',
  library: '/library',
  videos: '/watch',
  assess: '/score',
  contact: '/contact',
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
    return { ok: res.ok && out?.subscribed !== false, out }
  } catch {
    return { ok: false, out: {} }
  }
}

export default function CanvasCoachSite({ screen }: { screen: string }) {
  const router = useRouter()
  // The site lives under /site in the repo and at the root of the domain,
  // where a middleware rewrite hides the prefix. Links have to be written for
  // whichever of the two the reader is actually on, or navigation from
  // staging lands on an address that does not exist.
  const prefix = (usePathname() || '').startsWith('/site') ? '/site' : ''
  const at = (path: string) => (path === '/' ? (prefix || '/') : prefix + path)
  const [menuOpen, setMenuOpen] = useState(false)
  const [step, setStep] = useState(-1)
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const [result, setResult] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [kitDone, setKitDone] = useState(false)
  const [libEmail, setLibEmail] = useState('')
  const [libError, setLibError] = useState('')
  const [libSent, setLibSent] = useState(false)
  const [libKit, setLibKit] = useState(false)
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

  const scrollToServices = useCallback(() => {
    setMenuOpen(false)
    const jump = () => {
      const el = document.getElementById('services')
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.pageYOffset - 84)
    }
    if (screen === 'home') { setTimeout(jump, 40); return }
    router.push(at('/'))
    setTimeout(jump, 320)
  }, [router, screen, prefix])

  // ── the diagnostic, scored exactly as designed ──
  const computeScore = useCallback(() => {
    const said = (id: string) => answers[id] === true
    const s = QUESTIONS.filter((q: any) => said(q.id)).length
    const gaps = QUESTIONS.filter((q: any) => !said(q.id))
    if (s < 6) return {
      score: s, gaps, bandLabel: 'Below threshold',
      headline: 'There is groundwork to do before a commercial move will hold.',
      meaning: 'Under six does not mean you are not viable. It means the foundations a paid service stands on are not there yet. Selling before they are is how organisations spend a year proving something they could have found out in a month.',
      nextStep: 'Take the two lowest numbered gaps above. They come first for a reason. Nothing later works without them.',
    }
    if (s >= 8) return {
      score: s, gaps, bandLabel: 'Strong readiness',
      headline: 'The foundations are there.',
      meaning: 'Eight or more says the hard conversations have already happened inside your organisation. What separates you from somebody already earning is not readiness, it is order. Doing the nine in sequence, with evidence behind each, rather than jumping to pricing because that feels like progress.',
      nextStep: gaps.length
        ? 'Close the gaps above first. At this score they are usually quick, and the later work leans on them.'
        : 'Ten out of ten is rare and worth testing. Decision Point 1 exists to check whether what you believe about your own services survives contact with the evidence.',
    }
    return {
      score: s, gaps, bandLabel: 'Moderate readiness',
      headline: 'Real momentum, with specific holes in it.',
      meaning: 'This is the most common result and the most useful one, because your gaps are specific rather than general. You are not starting from nothing and you are not ready to sell. What matters is which questions your no answers fell against, not how many there were.',
      nextStep: 'If most of your gaps sit in Decision Points 2 and 3, your problem is customer clarity. If they sit in Decision Point 4, your problem is money. Those need different first moves.',
    }
  }, [answers])

  const answer = (val: boolean) => {
    const q: any = QUESTIONS[step]
    if (!q) return
    setAnswers((a) => ({ ...a, [q.id]: val }))
    setStep((n) => (n + 1 >= QUESTIONS.length ? QUESTIONS.length : n + 1))
  }

  const submitScore = async () => {
    if (!email.trim() || email.indexOf('@') < 1) {
      setError('An email address is needed to send the score.'); return
    }
    setError(''); setSending(true)
    // The server scores the same answers again and uses its own result for the
    // email and the tag. What is shown here is the reader's own arithmetic.
    const r = computeScore()
    const res = await fetch('/api/readiness', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(), firstName: firstName.trim(), organisation: organisation.trim(),
        answers, referrer: typeof window !== 'undefined' ? window.location.href : '',
      }),
    }).then((x) => x.json().catch(() => ({}))).catch(() => ({}))
    setResult(r); setSending(false); setKitDone(!!res?.emailed || !!res?.subscribed)
    try { window.scrollTo(0, 0) } catch {}
  }

  const sendLib = async () => {
    if (!libEmail.trim() || libEmail.indexOf('@') < 1) {
      setLibError('A working email address, please.'); return
    }
    const res = await capture('library', { email: libEmail.trim() })
    setLibError(''); setLibSent(true); setLibKit(res.ok)
  }

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
      if (reduceMotion || document.visibilityState !== 'visible') { el.textContent = String(target); return }
      let started = false
      const finish = () => { el.textContent = String(target) }
      const guard = setTimeout(() => { if (!started) finish() }, 250)
      const dur = 1100
      let t0 = 0
      const tick = (t: number) => {
        if (!started) { started = true; clearTimeout(guard); t0 = t }
        const p = Math.min(1, (t - t0) / dur)
        const eased = 1 - Math.pow(1 - p, 3)
        el.textContent = String(Math.round(target * eased))
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

  // ── the bindings the markup reads, exactly as the design computed them ──
  const svc: any = SERVICES.find((x: any) => x.key === screen)
  const si = SERVICES.findIndex((x: any) => x.key === screen)
  const svcPrev: any = SERVICES[(si - 1 + SERVICES.length) % SERVICES.length] || SERVICES[SERVICES.length - 1]
  const svcNext: any = SERVICES[(si + 1) % SERVICES.length] || SERVICES[0]
  const r = result
  const q: any = QUESTIONS[step] || QUESTIONS[0]
  const shape = (b: any) => ({ n: b.n, title: b.title, q: b.q, fit: b.fit, accent: b.c.accent, ink: b.c.ink, bullets: b.bullets.map((t: string) => ({ t })) })

  const isService = !!svc
  const svcName = svc ? svc.name : '', svcKind = svc ? svc.kind : ''
  const svcKindBg = svc ? svc.kindBg : '#00afef', svcKindInk = svc ? svc.kindInk : '#12222c'
  const svcMirror = svc ? svc.mirror : '', svcWhat = svc ? svc.what : '', svcCost = svc ? svc.cost : ''
  const svcDoes = svc ? svc.does : '', svcWho = svc ? svc.who : ''
  const svcCtaHead = svc ? svc.ctaHead : '', svcCtaBody = svc ? svc.ctaBody : ''
  const svcCtaLabel = svc ? svc.ctaLabel : ''
  const svcCtaGo = () => go(svc ? svc.ctaKey : 'contact')
  const svcPrevName = svcPrev.name, svcPrevGo = () => go(svcPrev.key)
  const svcNextName = svcNext.name, svcNextGo = () => go(svcNext.key)

  const isGtcv = screen === 'gtcv', isIntel = screen === 'intel', isIcc = screen === 'icc'
  const isIdcms = screen === 'idcms', isTralimm = screen === 'tralimm'
  const isAssess = screen === 'assess', isProof = screen === 'proof'
  const isLibrary = screen === 'library', isVideos = screen === 'videos'
  const isContact = screen === 'contact', isHome = screen === 'home'

  const canvasRow1 = CANVAS.slice(0, 3).map(shape)
  const canvasRow2 = CANVAS.slice(3, 6).map(shape)
  const canvasRow3 = CANVAS.slice(6, 8).map(shape)
  const fits = FITS, intelSteps = INTEL_STEPS, dimensions = DIMENSIONS, tiers = TIERS
  const iccBlocks = ICC_BLOCKS, phases = PHASES, idcTools = IDC_TOOLS, tralimmModels = TRALIMM_MODELS
  const proofAll = PROOF_ALL.map((p: any, i: number) => ({ ...p, num: '0' + (i + 1) }))
  const frameworks = FRAMEWORKS, resources = RESOURCES, videos = VIDEOS

  const showIntro = step === -1 && !r
  const showQuestion = step >= 0 && step < QUESTIONS.length && !r
  const showCapture = step >= QUESTIONS.length && !r
  const showResult = !!r
  const qNum = step + 1, qText = q.question, qSettled = q.settledAt
  const progress = Math.round((step / QUESTIONS.length) * 100) + '%'
  const start = () => setStep(0)
  const answerYes = () => answer(true)
  const answerNo = () => answer(false)
  const back = () => setStep((n) => Math.max(-1, n - 1))
  const onEmail = (e: any) => setEmail(e.target.value)
  const onFirstName = (e: any) => setFirstName(e.target.value)
  const onOrg = (e: any) => setOrganisation(e.target.value)
  const submit = submitScore
  const submitLabel = sending ? 'Sending' : 'Send me my score'
  const sentNote = kitDone
    ? 'A copy is on its way to your inbox. If it is not there in a few minutes, look in the spam folder.'
    : 'Your score is on screen above. The emailed copy could not be sent just now, so take a screenshot before you close this.'
  const retake = () => { setResult(null); setAnswers({}); setStep(-1); setKitDone(false) }
  const score = r ? r.score : 0, bandLabel = r ? r.bandLabel : '', headline = r ? r.headline : ''
  const meaning = r ? r.meaning : '', nextStep = r ? r.nextStep : ''
  const gaps = r ? r.gaps : [], hasGaps = r ? r.gaps.length > 0 : false

  const libOpen = !libSent
  const onLibEmail = (e: any) => setLibEmail(e.target.value)
  const libNote = libKit
    ? 'Everything below is on its way to your inbox, and the long edition of the newsletter comes fortnightly.'
    : 'That has reached me. If it does not arrive shortly I will add you by hand.'

  const onCName = (e: any) => setCName(e.target.value)
  const onCEmail = (e: any) => setCEmail(e.target.value)
  const onCOrg = (e: any) => setCOrg(e.target.value)
  const onCMsg = (e: any) => setCMsg(e.target.value)
  const contactOpen = !contactSent

  const menu = MENU.map((m: any) => ({
    num: m.num, label: m.label,
    go: m.key === 'services' ? scrollToServices : () => go(m.key),
  }))
  const marquee = MARQUEE
  const showMarquee = true, showLogos = true, showCount = true
  const audiences = AUDIENCES
  const services = SERVICES.map((x: any, i: number) => ({
    name: x.name, kind: x.kind, kindBg: x.kindBg, kindInk: x.kindInk,
    mirror: x.mirror, blurb: x.blurb, ctaLabel: x.ctaLabel,
    num: '0' + (i + 1), go: () => go(x.key), tag: x.tag,
    navInk: x.key === screen ? '#00afef' : 'rgba(245,245,220,0.82)',
    navRule: x.key === screen ? '#00afef' : 'transparent',
  }))
  const canvasFamily = CANVAS_FAMILY.map((c: any) => ({
    n: c.n, unit: c.unit, name: c.name, blocks: c.blocks, go: () => go(c.key),
  }))
  const magnets = MAGNETS.map((m: any) => ({ kind: m.kind, name: m.name, what: m.what, cta: m.cta, go: () => go(m.key) }))
  const proofTop = PROOF.map((p: any, i: number) => ({ ...p, num: '0' + (i + 1) }))
  const stats = STATS
  const openMenu = () => setMenuOpen(true)
  const closeMenu = () => setMenuOpen(false)
  const goHome = () => go('home')
  const goAssess = () => go('assess')
  const goGtcv = () => go('gtcv')
  const goProof = () => go('proof')
  const goLibrary = () => go('library')
  const goVideos = () => go('videos')
  const goContact = () => go('contact')
  const goServices = scrollToServices

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
              <a className="hv6" href="https://www.youtube.com/@DevTVorg" target="_blank" rel="noopener noreferrer" style={{fontSize: "19px", color: "rgba(245,245,220,0.85)", textDecoration: "none"}}>YouTube</a>
              <a className="hv7" href="https://www.linkedin.com/newsletters/viable-by-design-7280979699525120000/" target="_blank" rel="noopener noreferrer" style={{fontSize: "19px", color: "rgba(245,245,220,0.85)", textDecoration: "none"}}>Viable by Design</a>
              <a className="hv8" href="mailto:hello@habibonifade.com" style={{fontSize: "19px", color: "rgba(245,245,220,0.85)", textDecoration: "none"}}>hello@habibonifade.com</a>
            </div>
            <span className="hv9" onClick={goAssess} style={{display: "inline-block", fontSize: "17px", fontWeight: "600", padding: "19px 32px", cursor: "pointer", background: "#00afef", color: "#12222c"}}>Score your organisation</span>
          </div>
        </div>
      </div>
    </div>
  ) : null}

  {(isHome) ? (
  <div>

    <section style={{background: "#121213", color: "#f5f5dc", position: "relative"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto", padding: "60px 40px 0"}}>
        <div data-rise data-delay="0" style={{display: "flex", alignItems: "center", gap: "16px", margin: "0 0 40px"}}>
          <span style={{width: "60px", height: "3px", background: "#00afef", display: "block", flex: "0 0 auto"}}></span>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>Chapter 00</span>
        </div>
        <div style={{display: "flex", flexWrap: "wrap", gap: "40px 56px", alignItems: "flex-start"}}>
          <div style={{flex: "1 1 520px", minWidth: "0"}}>
            <h1 data-rise data-delay="60" style={{fontSize: "clamp(48px, 7.4vw, 116px)", fontWeight: "700", lineHeight: "0.92", letterSpacing: "-0.045em", margin: "0", maxWidth: "15ch"}}>Your work was funded.</h1>
            <h1 data-rise data-delay="150" style={{fontSize: "clamp(48px, 7.4vw, 116px)", fontWeight: "700", lineHeight: "0.92", letterSpacing: "-0.045em", margin: "0", maxWidth: "15ch", color: "#00afef"}}>Now it has to sell.</h1>
            <p data-rise data-delay="250" style={{margin: "40px 0 0", fontSize: "clamp(21px, 1.8vw, 27px)", color: "rgba(245,245,220,0.82)", maxWidth: "46ch", lineHeight: "1.5", textWrap: "pretty"}}>Being funded proved the need was real. What changes is who pays. I work out who holds that budget, what they will pay, and what it costs you to deliver.</p>
            <div data-rise data-delay="340" style={{display: "flex", gap: "2px", flexWrap: "wrap", margin: "46px 0 0"}}>
              <span className="hv10" onClick={goAssess} style={{display: "inline-block", fontSize: "18px", fontWeight: "600", padding: "23px 36px", cursor: "pointer", background: "#00afef", color: "#12222c", whiteSpace: "nowrap"}}>Score your organisation</span>
              <span className="hv11" onClick={goServices} style={{display: "inline-block", fontSize: "18px", fontWeight: "600", padding: "23px 36px", cursor: "pointer", color: "#f5f5dc", border: "1px solid rgba(245,245,220,0.3)", whiteSpace: "nowrap"}}>See what I do</span>
            </div>
          </div>
          <div style={{flex: "0 1 460px", minWidth: "260px", alignSelf: "flex-start"}}>
            <img src="/site/portrait-standing.jpg" alt="Habib Onifade" style={{display: "block", width: "100%", height: "auto"}} />
          </div>
        </div>
      </div>
    </section>

    {(showMarquee) ? (
      <section style={{background: "#00afef", color: "#12222c", overflow: "hidden", padding: "22px 0", borderTop: "3px solid #12222c", borderBottom: "3px solid #12222c"}}>
        <div style={{display: "flex", width: "max-content", animation: "om-marquee 30s linear infinite"}}>
          {(marquee || []).map((m, i) => (
            <span key={i} style={{fontSize: "clamp(20px, 2.2vw, 30px)", fontWeight: "600", letterSpacing: "-0.02em", whiteSpace: "nowrap", padding: "0 28px", display: "inline-flex", alignItems: "center", gap: "28px"}}>
              {m.t}
              <span style={{width: "9px", height: "9px", background: "#12222c", borderRadius: "50%", display: "block"}}></span>
            </span>
          ))}
        </div>
      </section>
    ) : null}

    <section style={{background: "#f5f5dc", color: "#12222c", padding: "clamp(72px, 9vw, 132px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <div data-rise style={{display: "flex", alignItems: "baseline", gap: "20px", marginBottom: "44px", flexWrap: "wrap"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00767a", fontWeight: "700"}}>Chapter 01</span>
          <span style={{flex: "1 1 60px", height: "1px", background: "rgba(18,34,44,0.25)", display: "block"}}></span>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", fontWeight: "700"}}>What changed</span>
        </div>
        <h2 data-rise style={{fontSize: "clamp(38px, 6vw, 92px)", fontWeight: "700", margin: "0 0 56px", lineHeight: "0.96", letterSpacing: "-0.04em", maxWidth: "27ch", textWrap: "balance"}}>Aid is becoming investment. Investment expects a return.</h2>
        <div data-rise style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2px", marginBottom: "56px"}}>
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
            <div style={{fontSize: "clamp(48px, 5.5vw, 82px)", fontWeight: "700", letterSpacing: "-0.045em", lineHeight: "0.9"}}><span data-count="1">1</span></div>
            <p style={{margin: "20px 0 0", fontSize: "17px", color: "rgba(234,252,255,0.8)", lineHeight: "1.5"}}>question that now decides everything. Who pays you?</p>
          </div>
        </div>
        <div data-rise style={{display: "flex", flexWrap: "wrap", gap: "56px"}}>
          <p style={{flex: "1 1 340px", minWidth: "0", margin: "0", fontSize: "22px", color: "#4a5560", lineHeight: "1.6", textWrap: "pretty"}}>Most people in the sector know about the cuts. The part that gets less attention is what happened to the money that stayed. It did not disappear. It got fussier. Fewer deals, each one bigger, and local money matters more than it did five years ago.</p>
          <div style={{flex: "1 1 340px", minWidth: "0"}}>
            <p style={{margin: "0 0 32px", paddingLeft: "26px", borderLeft: "4px solid #00afef", fontSize: "clamp(23px, 2.4vw, 32px)", fontWeight: "600", lineHeight: "1.3", letterSpacing: "-0.022em", color: "#12222c"}}>That is not a funding problem. It is a commercial one, and commercial problems can be solved.</p>
            <span className="hv12" onClick={goAssess} style={{display: "inline-block", fontSize: "17px", fontWeight: "600", padding: "19px 32px", cursor: "pointer", background: "#12222c", color: "#f5f5dc"}}>Find out where you stand</span>
          </div>
        </div>
      </div>
    </section>

    <section style={{background: "#12222c", color: "#f5f5dc", padding: "clamp(72px, 9vw, 132px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <div data-rise style={{display: "flex", alignItems: "baseline", gap: "20px", marginBottom: "44px", flexWrap: "wrap"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>Chapter 02</span>
          <span style={{flex: "1 1 60px", height: "1px", background: "rgba(245,245,220,0.25)", display: "block"}}></span>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(245,245,220,0.5)", fontWeight: "700"}}>Who this is for</span>
        </div>
        <h2 data-rise style={{fontSize: "clamp(34px, 5.2vw, 78px)", fontWeight: "700", margin: "0 0 60px", lineHeight: "0.98", letterSpacing: "-0.04em", maxWidth: "30ch", textWrap: "balance"}}>People who have to start earning what they used to be given.</h2>
        <div style={{display: "flex", flexDirection: "column"}}>
          {(audiences || []).map((a, i) => (
            <div key={i} data-rise style={{display: "flex", flexWrap: "wrap", gap: "24px 48px", alignItems: "baseline", padding: "40px 0", borderTop: "1px solid rgba(245,245,220,0.2)"}}>
              <span style={{flex: "0 0 auto", fontSize: "clamp(28px, 3vw, 42px)", fontWeight: "700", color: "#00afef", letterSpacing: "-0.03em", lineHeight: "1"}}>{a.mark}</span>
              <p style={{flex: "0 1 300px", margin: "0", fontSize: "clamp(30px, 3.6vw, 52px)", fontWeight: "600", letterSpacing: "-0.032em", lineHeight: "1.02"}}>{a.who}</p>
              <p style={{flex: "1 1 340px", minWidth: "0", margin: "0", fontSize: "22px", color: "rgba(245,245,220,0.8)", lineHeight: "1.55"}}>{a.what}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section id="services" style={{background: "#f5f5dc", color: "#12222c", padding: "clamp(72px, 9vw, 132px) 0"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto", padding: "0 40px"}}>
        <div data-rise style={{display: "flex", alignItems: "baseline", gap: "20px", marginBottom: "44px", flexWrap: "wrap"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00767a", fontWeight: "700"}}>Chapter 03</span>
          <span style={{flex: "1 1 60px", height: "1px", background: "rgba(18,34,44,0.25)", display: "block"}}></span>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", fontWeight: "700"}}>What I do</span>
        </div>
        <div data-rise style={{display: "flex", flexWrap: "wrap", gap: "40px", alignItems: "flex-end", marginBottom: "52px"}}>
          <h2 style={{flex: "1 1 100%", minWidth: "0", fontSize: "clamp(34px, 5.2vw, 78px)", fontWeight: "700", margin: "0", lineHeight: "0.98", letterSpacing: "-0.04em"}}><span style={{display: "block"}}>Four advisory methods.</span><span style={{display: "block"}}>One subscription.</span></h2>
          <p style={{flex: "1 1 300px", minWidth: "0", margin: "0", fontSize: "22px", color: "#4a5560", lineHeight: "1.55"}}>Find the sentence that sounds like your situation. Each one leads somewhere specific.</p>
        </div>
      </div>
      <div className="om-rail" style={{overflowX: "auto", padding: "0 40px 24px", scrollSnapType: "x mandatory"}}>
        <div style={{display: "flex", gap: "2px", width: "max-content", maxWidth: "none", margin: "0 auto"}}>
          {(services || []).map((s, i) => (
            <div key={i} className="hv13" onClick={s.go} style={{flex: "0 0 auto", width: "min(420px, 82vw)", background: "#12222c", color: "#f5f5dc", padding: "38px 34px 34px", cursor: "pointer", scrollSnapAlign: "start", display: "flex", flexDirection: "column"}}>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "16px", marginBottom: "26px"}}>
                <span style={{fontSize: "15px", fontWeight: "700", letterSpacing: "0.14em", color: "#00afef"}}>{s.num}</span>
                <span style={{fontSize: "12.5px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase", padding: "6px 12px", background: "{{ s.kindBg }}", color: "{{ s.kindInk }}"}}>{s.kind}</span>
              </div>
              <p style={{margin: "0 0 22px", fontSize: "clamp(22px, 2.2vw, 30px)", fontWeight: "600", lineHeight: "1.18", letterSpacing: "-0.024em", color: "#00afef", textWrap: "pretty"}}>&ldquo;{s.mirror}&rdquo;</p>
              <h3 style={{margin: "0 0 18px", fontSize: "23px", fontWeight: "600", lineHeight: "1.22", letterSpacing: "-0.018em"}}>{s.name}</h3>
              <p style={{margin: "0 0 28px", fontSize: "19px", color: "rgba(245,245,220,0.78)", lineHeight: "1.55", flex: "1"}}>{s.blurb}</p>
              <span style={{display: "inline-flex", alignItems: "center", gap: "12px", fontSize: "16.5px", fontWeight: "600", color: "#f5f5dc"}}>
                {s.ctaLabel}
                <span style={{width: "22px", height: "2px", background: "#00afef", display: "block"}}></span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div style={{maxWidth: "1440px", margin: "0 auto", padding: "26px 40px 0", display: "flex", flexWrap: "wrap", gap: "24px 40px", alignItems: "center", justifyContent: "space-between"}}>
        <p style={{margin: "0", fontSize: "18px", color: "rgba(18,34,44,0.65)", maxWidth: "34ch"}}>Scroll the row to see all five. Not sure which one fits your situation?</p>
        <div style={{display: "flex", gap: "2px", flexWrap: "wrap"}}>
          <span className="hv14" onClick={goContact} style={{display: "inline-block", fontSize: "17px", fontWeight: "600", padding: "20px 32px", cursor: "pointer", background: "#12222c", color: "#f5f5dc", whiteSpace: "nowrap"}}>Send me an enquiry</span>
          <span className="hv15" onClick={goAssess} style={{display: "inline-block", fontSize: "17px", fontWeight: "600", padding: "20px 32px", cursor: "pointer", border: "2px solid #12222c", color: "#12222c", whiteSpace: "nowrap"}}>Or start with the score</span>
        </div>
      </div>
    </section>

    <section style={{background: "#c9a84c", color: "#2a1c04", padding: "clamp(72px, 9vw, 132px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <div data-rise style={{display: "flex", alignItems: "baseline", gap: "20px", marginBottom: "44px", flexWrap: "wrap"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#2a1c04", fontWeight: "700"}}>Chapter 04</span>
          <span style={{flex: "1 1 60px", height: "1px", background: "rgba(42,28,4,0.3)", display: "block"}}></span>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(42,28,4,0.6)", fontWeight: "700"}}>The method</span>
        </div>
        <h2 data-rise style={{fontSize: "clamp(36px, 5.6vw, 86px)", fontWeight: "700", margin: "0 0 48px", lineHeight: "0.96", letterSpacing: "-0.04em"}}><span style={{display: "block"}}>Every method runs on a canvas.</span><span style={{display: "block"}}>That is the whole idea.</span></h2>
        <div data-rise style={{display: "flex", flexWrap: "wrap", gap: "56px", marginBottom: "56px"}}>
          <p style={{flex: "1 1 340px", minWidth: "0", margin: "0", fontSize: "20px", color: "rgba(42,28,4,0.82)", lineHeight: "1.62", textWrap: "pretty"}}>Alex Osterwalder made this argument for business models and he was right. Put every decision on one page and three things happen. You see the whole picture at once. You see which pieces do not fit. And everyone in the room is looking at the same thing.</p>
          <p style={{flex: "1 1 340px", minWidth: "0", margin: "0", fontSize: "20px", color: "rgba(42,28,4,0.82)", lineHeight: "1.62", textWrap: "pretty"}}>That last one matters more than it sounds. A canvas is the only format I have found that a chief executive, a field team, a partner and a donor can all read together without a translator. So each method is a canvas of numbered decisions, each with one question, one output, and a test that says whether it is finished.</p>
        </div>
        <div data-rise style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "2px"}}>
          {(canvasFamily || []).map((c, i) => (
            <div key={i} className="hv16" onClick={c.go} style={{background: "#2a1c04", color: "#f5f5dc", padding: "32px 28px 34px", cursor: "pointer"}}>
              <div style={{fontSize: "clamp(40px, 4.4vw, 62px)", fontWeight: "700", letterSpacing: "-0.045em", lineHeight: "0.9", color: "#c9a84c"}}><span data-count={c.n}>{c.n}</span></div>
              <p style={{margin: "16px 0 10px", fontSize: "13px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,220,0.55)", fontWeight: "700"}}>{c.unit}</p>
              <p style={{margin: "0 0 10px", fontSize: "20px", fontWeight: "600", lineHeight: "1.2", letterSpacing: "-0.018em"}}>{c.name}</p>
              <p style={{margin: "0", fontSize: "16.5px", color: "rgba(245,245,220,0.7)", lineHeight: "1.5"}}>{c.blocks}</p>
            </div>
          ))}
        </div>
        <div style={{marginTop: "48px"}}>
          <span className="hv17" onClick={goGtcv} style={{display: "inline-block", fontSize: "18px", fontWeight: "600", padding: "22px 36px", cursor: "pointer", background: "#2a1c04", color: "#f5f5dc"}}>See a canvas in full</span>
        </div>
      </div>
    </section>

    <section style={{background: "#12222c", color: "#f5f5dc", padding: "clamp(72px, 9vw, 132px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <div data-rise style={{display: "flex", alignItems: "baseline", gap: "20px", marginBottom: "44px", flexWrap: "wrap"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>Chapter 05</span>
          <span style={{flex: "1 1 60px", height: "1px", background: "rgba(245,245,220,0.25)", display: "block"}}></span>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(245,245,220,0.5)", fontWeight: "700"}}>Evidence</span>
        </div>
        <div data-rise style={{display: "flex", flexWrap: "wrap", gap: "40px", alignItems: "flex-end", marginBottom: "12px"}}>
          <h2 style={{flex: "1 1 400px", minWidth: "0", fontSize: "clamp(34px, 5.2vw, 78px)", fontWeight: "700", margin: "0", lineHeight: "0.98", letterSpacing: "-0.04em", maxWidth: "16ch"}}>What the work found.</h2>
          <p style={{flex: "1 1 300px", minWidth: "0", margin: "0", fontSize: "20px", color: "rgba(245,245,220,0.75)", lineHeight: "1.55"}}>Fifteen engagements. Some of this contradicts what the sector tells itself, and it is written plainly because that is how it turned up.</p>
        </div>
        <div style={{display: "flex", flexDirection: "column"}}>
          {(proofTop || []).map((p, i) => (
            <div key={i} data-rise style={{display: "flex", flexWrap: "wrap", gap: "24px 44px", alignItems: "flex-start", padding: "44px 0", borderTop: "1px solid rgba(245,245,220,0.2)"}}>
              <span style={{flex: "0 0 auto", fontSize: "15px", fontWeight: "700", letterSpacing: "0.14em", color: "#00afef"}}>{p.num}</span>
              <p style={{flex: "1 1 340px", minWidth: "0", margin: "0", fontSize: "clamp(26px, 3.2vw, 44px)", fontWeight: "600", lineHeight: "1.06", letterSpacing: "-0.032em", textWrap: "balance"}}>{p.title}</p>
              <div style={{flex: "1 1 320px", minWidth: "0"}}>
                <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,245,220,0.5)", fontWeight: "700"}}>{p.cat}</span>
                <p style={{margin: "16px 0 0", color: "rgba(245,245,220,0.78)", fontSize: "18.5px", lineHeight: "1.6", textWrap: "pretty"}}>{p.what}</p>
              </div>
            </div>
          ))}
        </div>
        <div style={{borderTop: "1px solid rgba(245,245,220,0.2)", paddingTop: "36px"}}>
          <span className="hv18" onClick={goProof} style={{display: "inline-flex", alignItems: "center", gap: "14px", fontSize: "18px", fontWeight: "600", color: "#f5f5dc", cursor: "pointer"}}>
            All fifteen, and the frameworks behind them
            <span style={{width: "26px", height: "2px", background: "#00afef", display: "block"}}></span>
          </span>
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
          <p style={{color: "#4a5560", margin: "0 0 30px", fontSize: "20px", lineHeight: "1.6", maxWidth: "50ch", textWrap: "pretty"}}>The steps are the same every time. Find out who pays. Design the service for them. Build the numbers. Test it on a real customer. Hand it over.</p>
          <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "2px"}}>
            {(stats || []).map((st, i) => (
              <div key={i} style={{background: "#12222c", color: "#f5f5dc", padding: "22px 20px 24px"}}>
                <div style={{fontSize: "clamp(24px, 2.4vw, 34px)", fontWeight: "700", letterSpacing: "-0.032em", lineHeight: "1.05", whiteSpace: "nowrap"}}>{st.pre}<span data-count={st.n}>{st.n}</span>{st.post}</div>
                <div style={{fontSize: "14.5px", color: "rgba(245,245,220,0.65)", marginTop: "10px", lineHeight: "1.4"}}>{st.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>

    <section style={{background: "#12222c", color: "#f5f5dc", padding: "clamp(72px, 9vw, 132px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <div data-rise style={{display: "flex", alignItems: "baseline", gap: "20px", marginBottom: "44px", flexWrap: "wrap"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>Chapter 06</span>
          <span style={{flex: "1 1 60px", height: "1px", background: "rgba(245,245,220,0.25)", display: "block"}}></span>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(245,245,220,0.5)", fontWeight: "700"}}>Take something with you</span>
        </div>
        <div data-rise style={{display: "flex", flexWrap: "wrap", gap: "40px", alignItems: "flex-end", marginBottom: "48px"}}>
          <h2 style={{flex: "1 1 400px", minWidth: "0", fontSize: "clamp(34px, 5.2vw, 78px)", fontWeight: "700", margin: "0", lineHeight: "0.98", letterSpacing: "-0.04em", maxWidth: "16ch"}}>Useful without me.</h2>
          <p style={{flex: "1 1 300px", minWidth: "0", margin: "0", fontSize: "20px", color: "rgba(245,245,220,0.75)", lineHeight: "1.55"}}>Free. Give an email once and take everything in the library, plus the longer newsletter that only goes out from here.</p>
        </div>
        <div data-rise style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2px", marginBottom: "44px"}}>
          {(magnets || []).map((m, i) => (
            <div key={i} className="hv19" onClick={m.go} style={{background: "#0b1620", borderTop: "4px solid #00afef", padding: "34px 30px 36px", cursor: "pointer", display: "flex", flexDirection: "column"}}>
              <span style={{fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,245,220,0.5)", fontWeight: "700"}}>{m.kind}</span>
              <p style={{margin: "18px 0 14px", fontSize: "25px", fontWeight: "600", lineHeight: "1.16", letterSpacing: "-0.022em"}}>{m.name}</p>
              <p style={{margin: "0 0 26px", fontSize: "17.5px", color: "rgba(245,245,220,0.72)", lineHeight: "1.55", flex: "1"}}>{m.what}</p>
              <span style={{fontSize: "16.5px", fontWeight: "600", color: "#00afef"}}>{m.cta}</span>
            </div>
          ))}
        </div>
        <div style={{display: "flex", gap: "2px", flexWrap: "wrap"}}>
          <span className="hv20" onClick={goLibrary} style={{display: "inline-block", fontSize: "18px", fontWeight: "600", padding: "22px 36px", cursor: "pointer", background: "#00afef", color: "#12222c"}}>Open the library</span>
          <span className="hv21" onClick={goVideos} style={{display: "inline-block", fontSize: "18px", fontWeight: "600", padding: "22px 36px", cursor: "pointer", border: "1px solid rgba(245,245,220,0.3)", color: "#f5f5dc"}}>Watch instead</span>
        </div>
      </div>
    </section>

    <section style={{background: "#00afef", color: "#12222c", padding: "clamp(76px, 10vw, 148px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <span data-rise style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(18,34,44,0.65)", fontWeight: "700"}}>Chapter 07</span>
        <h2 data-rise style={{fontSize: "clamp(40px, 7vw, 116px)", fontWeight: "700", margin: "30px 0 34px", lineHeight: "0.92", letterSpacing: "-0.045em", maxWidth: "18ch", textWrap: "balance"}}>Find out where you stand.</h2>
        <p data-rise style={{color: "rgba(18,34,44,0.78)", margin: "0 0 46px", fontSize: "clamp(20px, 2vw, 27px)", maxWidth: "40ch", lineHeight: "1.45"}}>Ten questions. Two minutes. A report naming where your work starts, and what being wrong about each gap costs you.</p>
        <div data-rise style={{display: "flex", gap: "2px", flexWrap: "wrap"}}>
          <span className="hv22" onClick={goAssess} style={{display: "inline-block", fontSize: "19px", fontWeight: "600", padding: "25px 42px", cursor: "pointer", background: "#12222c", color: "#f5f5dc"}}>Score your organisation</span>
          <span className="hv23" onClick={goContact} style={{display: "inline-block", fontSize: "19px", fontWeight: "600", padding: "25px 42px", cursor: "pointer", border: "2px solid #12222c", color: "#12222c"}}>Or just talk to me</span>
        </div>
      </div>
    </section>

  </div>
  ) : null}

  {(isService) ? (
    <div>
      <section style={{background: "#12222c", color: "#f5f5dc", padding: "clamp(60px, 7.5vw, 104px) 40px"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto"}}>
          <div style={{display: "flex", alignItems: "center", gap: "16px", margin: "0 0 32px", flexWrap: "wrap"}}>
            <span style={{width: "60px", height: "3px", background: "#00afef", display: "block", flex: "0 0 auto"}}></span>
            <span style={{fontSize: "12.5px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase", padding: "7px 14px", background: "{{ svcKindBg }}", color: "{{ svcKindInk }}"}}>{svcKind}</span>
          </div>
          <h1 style={{fontSize: "clamp(36px, 5.6vw, 88px)", fontWeight: "700", lineHeight: "0.96", letterSpacing: "-0.042em", margin: "0", maxWidth: "20ch", textWrap: "balance"}}>{svcName}</h1>
          <p style={{margin: "36px 0 0", fontSize: "clamp(22px, 2.4vw, 34px)", fontWeight: "600", color: "#00afef", maxWidth: "32ch", lineHeight: "1.2", letterSpacing: "-0.024em"}}>&ldquo;{svcMirror}&rdquo;</p>
        </div>
      </section>
      <section style={{background: "#f5f5dc", color: "#12222c", padding: "clamp(56px, 7vw, 96px) 40px"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "56px"}}>
          <div style={{flex: "1 1 340px", minWidth: "0"}}>
            <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,34,44,0.55)", fontWeight: "700"}}>What is happening</span>
            <p style={{margin: "20px 0 22px", fontSize: "20px", color: "#4a5560", lineHeight: "1.62", textWrap: "pretty"}}>{svcWhat}</p>
            <p style={{margin: "0", paddingLeft: "24px", borderLeft: "4px solid #c9a84c", fontSize: "20px", color: "#12222c", lineHeight: "1.6", textWrap: "pretty"}}>{svcCost}</p>
          </div>
          <div style={{flex: "1 1 340px", minWidth: "0"}}>
            <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#00767a", fontWeight: "700"}}>What I do about it</span>
            <p style={{margin: "20px 0 30px", fontSize: "20px", color: "#12222c", lineHeight: "1.62", textWrap: "pretty"}}>{svcDoes}</p>
            <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,34,44,0.55)", fontWeight: "700"}}>Who recognises themselves here</span>
            <p style={{margin: "20px 0 0", fontSize: "19px", color: "#4a5560", lineHeight: "1.6", textWrap: "pretty"}}>{svcWho}</p>
          </div>
        </div>
      </section>
      <section style={{background: "#00afef", color: "#12222c", padding: "clamp(56px, 7vw, 96px) 40px"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "56px", alignItems: "flex-end"}}>
          <div style={{flex: "1 1 380px", minWidth: "0"}}>
            <h2 style={{fontSize: "clamp(30px, 4.2vw, 60px)", fontWeight: "700", margin: "0 0 22px", lineHeight: "0.98", letterSpacing: "-0.038em", textWrap: "balance"}}>{svcCtaHead}</h2>
            <p style={{margin: "0", fontSize: "20px", color: "rgba(18,34,44,0.78)", maxWidth: "44ch", lineHeight: "1.55"}}>{svcCtaBody}</p>
          </div>
          <div style={{flex: "0 1 auto", display: "flex", gap: "2px", flexWrap: "wrap"}}>
            <span className="hv24" onClick={svcCtaGo} style={{display: "inline-block", fontSize: "18px", fontWeight: "600", padding: "23px 38px", cursor: "pointer", background: "#12222c", color: "#f5f5dc"}}>{svcCtaLabel}</span>
            <span className="hv25" onClick={goContact} style={{display: "inline-block", fontSize: "18px", fontWeight: "600", padding: "23px 38px", cursor: "pointer", border: "2px solid #12222c", color: "#12222c"}}>Ask a question first</span>
          </div>
        </div>
      </section>
    </div>
  ) : null}

  {(isGtcv) ? (
    <div>
      <section style={{background: "#f5f5dc", color: "#12222c", padding: "clamp(56px, 7vw, 96px) 40px 44px"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00767a", fontWeight: "700"}}>Before Decision 1 opens</span>
          <h2 style={{fontSize: "clamp(30px, 4.2vw, 58px)", fontWeight: "700", margin: "24px 0 22px", lineHeight: "0.98", letterSpacing: "-0.038em", maxWidth: "26ch"}}>The part most proposals leave out.</h2>
          <div style={{display: "flex", flexWrap: "wrap", gap: "48px"}}>
            <p style={{flex: "1 1 340px", minWidth: "0", margin: "0", fontSize: "21px", color: "#4a5560", lineHeight: "1.6"}}>Nothing starts until two things are signed. What each side is committing to, in writing. And three questions asked of your chief executive out loud, with everyone in the room, written down in their own words.</p>
            <p style={{flex: "1 1 340px", minWidth: "0", margin: "0", paddingLeft: "26px", borderLeft: "4px solid #00afef", fontSize: "21px", color: "#12222c", lineHeight: "1.6"}}>If those answers are weak, we do not start. I would rather lose the work than take your money for something that ends up as a document.</p>
          </div>
        </div>
      </section>

      <section style={{background: "#f5f5dc", color: "#12222c", padding: "0 40px clamp(56px, 7vw, 96px)"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00767a", fontWeight: "700"}}>The canvas</span>
          <h2 style={{fontSize: "clamp(30px, 4.2vw, 58px)", fontWeight: "700", margin: "24px 0 22px", lineHeight: "0.98", letterSpacing: "-0.038em", maxWidth: "26ch"}}>What you can do, what the market pays for, and the layer that joins them.</h2>
          <p style={{color: "#4a5560", margin: "0 0 40px", maxWidth: "58ch", fontSize: "21px", lineHeight: "1.6"}}>Left is what you can do. Right is what the market will pay for. The middle joins the two. The diagnostic runs underneath, scored three times so the movement is the finding.</p>

          <div style={{overflowX: "auto", paddingBottom: "10px"}}>
            <div style={{minWidth: "980px", background: "#fffdf5", border: "2px solid #12222c", padding: "22px", display: "flex", flexDirection: "column", gap: "11px"}}>

              <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "18px", flexWrap: "wrap", paddingBottom: "14px", borderBottom: "1px solid rgba(18,34,44,0.18)"}}>
                <img src="/site/canvas-coach.png" alt="Canvas Coach" style={{height: "52px", width: "auto", display: "block"}} />
                <div style={{fontSize: "13px", letterSpacing: "0.13em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", textAlign: "right", lineHeight: "1.5"}}>Grant to Commercial Viability Canvas<br />habibonifade.com</div>
              </div>

              <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "11px"}}>
                <div style={{padding: "12px", textAlign: "center", fontSize: "13px", fontWeight: "700", letterSpacing: "0.15em", textTransform: "uppercase", color: "#2a1c04", background: "#c9a84c"}}>What we can do</div>
                <div style={{padding: "12px", textAlign: "center", fontSize: "13px", fontWeight: "700", letterSpacing: "0.15em", textTransform: "uppercase", color: "#f5f5dc", background: "#12222c"}}>The joining layer</div>
                <div style={{padding: "12px", textAlign: "center", fontSize: "13px", fontWeight: "700", letterSpacing: "0.15em", textTransform: "uppercase", color: "#eafcff", background: "#00767a"}}>What the market pays for</div>
              </div>

              <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "11px"}}>
                {(canvasRow1 || []).map((b, i) => (
                  <article key={i} style={{background: "#f5f5dc", border: "1px solid rgba(18,34,44,0.16)", borderTop: "4px solid {{ b.accent }}", padding: "16px 17px 17px", display: "flex", flexDirection: "column"}}>
                    <span style={{fontSize: "13px", fontWeight: "700", padding: "5px 10px", background: "{{ b.accent }}", color: "{{ b.ink }}", alignSelf: "flex-start"}}>Decision {b.n}</span>
                    <h4 style={{fontWeight: "600", fontSize: "19px", margin: "13px 0 0", lineHeight: "1.15", letterSpacing: "-0.016em"}}>{b.title}</h4>
                    <p style={{fontSize: "15.5px", color: "#4a5560", margin: "10px 0 0", lineHeight: "1.42"}}>&ldquo;{b.q}&rdquo;</p>
                    <div style={{display: "flex", flexDirection: "column", gap: "7px", margin: "13px 0 0"}}>
                      {(b.bullets || []).map((t, i) => (
                        <p key={i} style={{margin: "0", fontSize: "15.5px", color: "#4a5560", lineHeight: "1.42"}}>{t.t}</p>
                      ))}
                    </div>
                    <span style={{marginTop: "15px", fontSize: "12.5px", fontWeight: "700", letterSpacing: "0.09em", textTransform: "uppercase", color: "{{ b.ink }}", background: "{{ b.accent }}", padding: "7px 11px", alignSelf: "flex-start"}}>{b.fit}</span>
                  </article>
                ))}
              </div>

              <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "11px"}}>
                {(canvasRow2 || []).map((b, i) => (
                  <article key={i} style={{background: "#f5f5dc", border: "1px solid rgba(18,34,44,0.16)", borderTop: "4px solid {{ b.accent }}", padding: "16px 17px 17px", display: "flex", flexDirection: "column"}}>
                    <span style={{fontSize: "13px", fontWeight: "700", padding: "5px 10px", background: "{{ b.accent }}", color: "{{ b.ink }}", alignSelf: "flex-start"}}>Decision {b.n}</span>
                    <h4 style={{fontWeight: "600", fontSize: "19px", margin: "13px 0 0", lineHeight: "1.15", letterSpacing: "-0.016em"}}>{b.title}</h4>
                    <p style={{fontSize: "15.5px", color: "#4a5560", margin: "10px 0 0", lineHeight: "1.42"}}>&ldquo;{b.q}&rdquo;</p>
                    <div style={{display: "flex", flexDirection: "column", gap: "7px", margin: "13px 0 0"}}>
                      {(b.bullets || []).map((t, i) => (
                        <p key={i} style={{margin: "0", fontSize: "15.5px", color: "#4a5560", lineHeight: "1.42"}}>{t.t}</p>
                      ))}
                    </div>
                    <span style={{marginTop: "15px", fontSize: "12.5px", fontWeight: "700", letterSpacing: "0.09em", textTransform: "uppercase", color: "{{ b.ink }}", background: "{{ b.accent }}", padding: "7px 11px", alignSelf: "flex-start"}}>{b.fit}</span>
                  </article>
                ))}
              </div>

              <div style={{fontSize: "13px", fontWeight: "700", letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", textAlign: "center", padding: "14px 0 2px"}}>Where the model meets real customers</div>

              <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "11px"}}>
                {(canvasRow3 || []).map((b, i) => (
                  <article key={i} style={{background: "#f5f5dc", border: "1px solid rgba(18,34,44,0.16)", borderTop: "4px solid {{ b.accent }}", padding: "16px 17px 17px", display: "flex", flexDirection: "column"}}>
                    <span style={{fontSize: "13px", fontWeight: "700", padding: "5px 10px", background: "{{ b.accent }}", color: "{{ b.ink }}", alignSelf: "flex-start"}}>Decision {b.n}</span>
                    <h4 style={{fontWeight: "600", fontSize: "19px", margin: "13px 0 0", lineHeight: "1.15", letterSpacing: "-0.016em"}}>{b.title}</h4>
                    <p style={{fontSize: "15.5px", color: "#4a5560", margin: "10px 0 0", lineHeight: "1.42"}}>&ldquo;{b.q}&rdquo;</p>
                    <div style={{display: "flex", flexDirection: "column", gap: "7px", margin: "13px 0 0"}}>
                      {(b.bullets || []).map((t, i) => (
                        <p key={i} style={{margin: "0", fontSize: "15.5px", color: "#4a5560", lineHeight: "1.42"}}>{t.t}</p>
                      ))}
                    </div>
                    <span style={{marginTop: "15px", fontSize: "12.5px", fontWeight: "700", letterSpacing: "0.09em", textTransform: "uppercase", color: "{{ b.ink }}", background: "{{ b.accent }}", padding: "7px 11px", alignSelf: "flex-start"}}>{b.fit}</span>
                  </article>
                ))}
              </div>

              <div style={{background: "#12222c", color: "#f5f5dc", padding: "22px 24px"}}>
                <div style={{display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap"}}>
                  <span style={{fontSize: "13px", fontWeight: "700", padding: "5px 10px", background: "#00afef", color: "#12222c"}}>Decision 9</span>
                  <span style={{fontSize: "12.5px", letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(245,245,220,0.65)"}}>Scored at the start, the middle and the end</span>
                </div>
                <h4 style={{fontSize: "21px", fontWeight: "600", margin: "15px 0 0", letterSpacing: "-0.018em"}}>Commercial Readiness Diagnostic</h4>
                <p style={{fontSize: "15.5px", color: "rgba(245,245,220,0.85)", margin: "9px 0 0", lineHeight: "1.45"}}>&ldquo;Where are we today on the road from funded to paid?&rdquo;</p>
                <div style={{display: "flex", flexWrap: "wrap", gap: "7px", margin: "20px 0 0"}}>
                  <span style={{fontSize: "12.5px", fontWeight: "700", letterSpacing: "0.09em", textTransform: "uppercase", padding: "8px 13px", background: "#c9a84c", color: "#2a1c04"}}>Grant dependent</span>
                  <span style={{fontSize: "12.5px", fontWeight: "700", letterSpacing: "0.09em", textTransform: "uppercase", padding: "8px 13px", background: "#3e6e72", color: "#eafcff"}}>Commercially aware</span>
                  <span style={{fontSize: "12.5px", fontWeight: "700", letterSpacing: "0.09em", textTransform: "uppercase", padding: "8px 13px", background: "#00767a", color: "#eafcff"}}>Market ready</span>
                  <span style={{fontSize: "12.5px", fontWeight: "700", letterSpacing: "0.09em", textTransform: "uppercase", padding: "8px 13px", background: "#2e7d32", color: "#eafce9"}}>Commercially viable</span>
                </div>
                <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "9px", marginTop: "20px"}}>
                  {(fits || []).map((f, i) => (
                    <div key={i} style={{background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", padding: "14px"}}>
                      <div style={{fontSize: "12.5px", letterSpacing: "0.08em", color: "#00afef", fontWeight: "700"}}>{f.n}</div>
                      <div style={{fontSize: "16px", fontWeight: "600", margin: "6px 0 7px", lineHeight: "1.2"}}>{f.t}</div>
                      <div style={{fontSize: "15px", color: "rgba(245,245,220,0.75)", lineHeight: "1.42"}}>{f.d}</div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>

          <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "0", borderTop: "2px solid #12222c", marginTop: "56px"}}>
            <div style={{padding: "36px 40px 36px 0", borderRight: "1px solid rgba(18,34,44,0.18)"}}>
              <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", fontWeight: "700"}}>Runs underneath all of it</span>
              <p style={{margin: "18px 0 16px", fontSize: "30px", fontWeight: "700", letterSpacing: "-0.026em"}}>Evidence library</p>
              <p style={{margin: "0", color: "#4a5560", fontSize: "19.5px", lineHeight: "1.6"}}>Every decision closes on evidence, filed against the decision it supports. Interviews, cost figures, pricing tests, pilot results, what clients actually said. No evidence, no close. The library is yours at the end.</p>
            </div>
            <div style={{padding: "36px 0 36px 40px"}}>
              <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", fontWeight: "700"}}>How it ends</span>
              <p style={{margin: "18px 0 16px", fontSize: "30px", fontWeight: "700", letterSpacing: "-0.026em"}}>Five tests, done without me</p>
              <p style={{margin: "0", color: "#4a5560", fontSize: "19.5px", lineHeight: "1.6"}}>At handover your team presents its own commercial model, alone, with me in the room saying nothing. The model stays with you, built so somebody without a finance background can keep it current.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  ) : null}

  {(isIntel) ? (
    <div>
      <section style={{background: "#f5f5dc", color: "#12222c", padding: "clamp(56px, 7vw, 96px) 40px"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00767a", fontWeight: "700"}}>How it works</span>
          <h2 style={{fontSize: "clamp(30px, 4.2vw, 58px)", fontWeight: "700", margin: "24px 0 22px", lineHeight: "0.98", letterSpacing: "-0.038em"}}><span style={{display: "block"}}>Three steps.</span><span style={{display: "block"}}>Then you can see the whole portfolio.</span></h2>
          <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2px", margin: "48px 0 0"}}>
            {(intelSteps || []).map((st, i) => (
              <div key={i} style={{background: "#12222c", color: "#f5f5dc", borderTop: "4px solid #00afef", padding: "34px 30px 36px"}}>
                <div style={{fontSize: "48px", fontWeight: "700", color: "#00afef", lineHeight: "0.9", letterSpacing: "-0.04em"}}>{st.n}</div>
                <p style={{margin: "20px 0 14px", fontSize: "26px", fontWeight: "600", letterSpacing: "-0.024em", lineHeight: "1.1"}}>{st.name}</p>
                <p style={{margin: "0", fontSize: "18.5px", color: "rgba(245,245,220,0.78)", lineHeight: "1.55"}}>{st.what}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{background: "#fffdf5", color: "#12222c", padding: "clamp(56px, 7vw, 96px) 40px"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00767a", fontWeight: "700"}}>Seven things we score</span>
          <h2 style={{fontSize: "clamp(28px, 3.8vw, 52px)", fontWeight: "700", margin: "24px 0 20px", lineHeight: "0.98", letterSpacing: "-0.036em"}}><span style={{display: "block"}}>Scored on how the business actually trades.</span><span style={{display: "block"}}>Not on a survey.</span></h2>
          <p style={{color: "#4a5560", margin: "0 0 48px", maxWidth: "58ch", fontSize: "21px", lineHeight: "1.6"}}>Real numbers from businesses we work with week to week. Nothing names an individual business.</p>
          <div style={{display: "flex", flexDirection: "column", borderTop: "2px solid #12222c", marginBottom: "20px"}}>
            {(dimensions || []).map((d, i) => (
              <div key={i} data-rise style={{display: "flex", flexWrap: "wrap", gap: "16px 32px", alignItems: "center", padding: "24px 0", borderBottom: "1px solid rgba(18,34,44,0.16)"}}>
                <div style={{flex: "1 1 200px", minWidth: "0", fontSize: "22px", fontWeight: "500", letterSpacing: "-0.016em"}}>{d.name}</div>
                <div style={{flex: "2 1 160px", minWidth: "110px", height: "16px", background: "rgba(18,34,44,0.1)"}}>
                  <div style={{height: "100%", background: "#00767a", width: "{{ d.pct }}"}}></div>
                </div>
                <div style={{flex: "0 0 68px", fontSize: "20px", fontWeight: "600", textAlign: "right", fontVariantNumeric: "tabular-nums"}}><span data-count={d.n}>{d.n}</span>%</div>
              </div>
            ))}
          </div>
          <p style={{margin: "0 0 60px", fontSize: "17px", color: "rgba(18,34,44,0.55)"}}>An illustrative portfolio middle. The live report scores each business and ranks it against others like it.</p>

          <h2 style={{fontSize: "clamp(24px, 3vw, 38px)", fontWeight: "700", margin: "0 0 30px", letterSpacing: "-0.03em"}}>Four tiers, each with a confidence level attached</h2>
          <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "2px", marginBottom: "60px"}}>
            {(tiers || []).map((t, i) => (
              <div key={i} style={{background: "{{ t.bg }}", color: "{{ t.ink }}", padding: "34px 28px 38px"}}>
                <div style={{fontSize: "13.5px", fontWeight: "700", letterSpacing: "0.16em", textTransform: "uppercase", opacity: "0.75"}}>Tier {t.n}</div>
                <div style={{fontSize: "30px", fontWeight: "700", marginTop: "14px", letterSpacing: "-0.028em"}}>{t.name}</div>
                <div style={{fontSize: "17px", marginTop: "12px", opacity: "0.82", lineHeight: "1.5"}}>{t.what}</div>
              </div>
            ))}
          </div>

          <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px"}}>
            <div style={{background: "#12222c", color: "#f5f5dc", padding: "38px"}}>
              <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>How much, and what kind</span>
              <p style={{margin: "20px 0 26px", color: "rgba(245,245,220,0.85)", fontSize: "19.5px", lineHeight: "1.6"}}>How much money the business could actually use, and which kind of money suits it.</p>
              <div style={{display: "flex", flexWrap: "wrap", gap: "9px"}}>
                <span style={{fontSize: "16px", padding: "10px 17px", border: "1px solid rgba(245,245,220,0.28)"}}>A loan</span>
                <span style={{fontSize: "16px", padding: "10px 17px", border: "1px solid rgba(245,245,220,0.28)"}}>A grant</span>
                <span style={{fontSize: "16px", padding: "10px 17px", border: "1px solid rgba(245,245,220,0.28)"}}>Equity</span>
                <span style={{fontSize: "16px", padding: "10px 17px", border: "1px solid rgba(245,245,220,0.28)"}}>Stock on credit</span>
                <span style={{fontSize: "16px", padding: "10px 17px", border: "1px solid rgba(245,245,220,0.28)"}}>A grant that gets repaid</span>
              </div>
            </div>
            <div style={{background: "#f5f5dc", padding: "38px", borderTop: "4px solid #00afef"}}>
              <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", fontWeight: "700"}}>How you get it</span>
              <p style={{margin: "20px 0 14px", fontSize: "19.5px", color: "#4a5560", lineHeight: "1.6"}}>A live report you browse through your own access link, plus a version you can download.</p>
              <p style={{margin: "0", fontSize: "19.5px", color: "#4a5560", lineHeight: "1.6"}}>Business by business, benchmarked against others in the same segment.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  ) : null}

  {(isIcc) ? (
    <section style={{background: "#f5f5dc", color: "#12222c", padding: "clamp(56px, 7vw, 96px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00767a", fontWeight: "700"}}>Eight steps, then a fork</span>
        <h2 style={{fontSize: "clamp(30px, 4.2vw, 58px)", fontWeight: "700", margin: "24px 0 22px", lineHeight: "0.98", letterSpacing: "-0.038em"}}><span style={{display: "block"}}>The first eight are the same for everyone.</span><span style={{display: "block"}}>The last one depends on who you are.</span></h2>
        <p style={{color: "#4a5560", margin: "0 0 48px", maxWidth: "58ch", fontSize: "21px", lineHeight: "1.6"}}>Worked in order. The ask comes last, once the evidence is sitting in front of it.</p>
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "0", borderTop: "2px solid #12222c"}}>
          {(iccBlocks || []).map((b, i) => (
            <div key={i} style={{padding: "32px 32px 36px 0", borderBottom: "1px solid rgba(18,34,44,0.2)"}}>
              <div style={{fontSize: "44px", fontWeight: "700", color: "#00afef", lineHeight: "0.9", letterSpacing: "-0.04em"}}>{b.n}</div>
              <div style={{fontSize: "25px", fontWeight: "600", margin: "16px 0 12px", lineHeight: "1.15", letterSpacing: "-0.022em"}}>{b.title}</div>
              <div style={{fontSize: "18.5px", color: "#4a5560", lineHeight: "1.55", textWrap: "pretty"}}>{b.q}</div>
            </div>
          ))}
        </div>
        <div style={{textAlign: "center", fontSize: "13.5px", fontWeight: "700", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", padding: "54px 0 30px"}}>Step nine, one canvas, two people</div>
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "20px"}}>
          <div style={{background: "#fffdf5", borderTop: "5px solid #c9a84c", padding: "40px"}}>
            <div style={{fontSize: "13.5px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)"}}>If you are running the programme</div>
            <p style={{margin: "18px 0 18px", fontSize: "38px", fontWeight: "700", letterSpacing: "-0.032em", lineHeight: "1.0"}}>Your next move</p>
            <p style={{margin: "0", color: "#4a5560", fontSize: "19.5px", lineHeight: "1.6"}}>Three things to do in the next thirty days. One of them is not optional. Each has a name against it.</p>
          </div>
          <div style={{background: "#12222c", color: "#f5f5dc", borderTop: "5px solid #00afef", padding: "40px"}}>
            <div style={{fontSize: "13.5px", fontWeight: "700", letterSpacing: "0.14em", textTransform: "uppercase", color: "#00afef"}}>If you are asking for the money</div>
            <p style={{margin: "18px 0 18px", fontSize: "38px", fontWeight: "700", letterSpacing: "-0.032em", lineHeight: "1.0"}}>Your investment case</p>
            <p style={{margin: "0 0 26px", color: "rgba(245,245,220,0.82)", fontSize: "19.5px", lineHeight: "1.6"}}>Six parts, built in this order.</p>
            <div style={{display: "flex", flexWrap: "wrap", gap: "9px"}}>
              <span style={{fontSize: "16px", padding: "10px 17px", border: "1px solid rgba(245,245,220,0.28)"}}>The problem</span>
              <span style={{fontSize: "16px", padding: "10px 17px", border: "1px solid rgba(245,245,220,0.28)"}}>The kind of money and how it is structured</span>
              <span style={{fontSize: "16px", padding: "10px 17px", border: "1px solid rgba(245,245,220,0.28)"}}>Proof people want it</span>
              <span style={{fontSize: "16px", padding: "10px 17px", border: "1px solid rgba(245,245,220,0.28)"}}>Who carries the risk</span>
              <span style={{fontSize: "16px", padding: "10px 17px", border: "1px solid rgba(245,245,220,0.28)"}}>The ask, and its condition</span>
              <span style={{fontSize: "16px", padding: "10px 17px", border: "1px solid rgba(245,245,220,0.28)"}}>Who runs it</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  ) : null}

  {(isIdcms) ? (
    <section style={{background: "#f5f5dc", color: "#12222c", padding: "clamp(56px, 7vw, 96px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00767a", fontWeight: "700"}}>Nine decisions, four stages</span>
        <h2 style={{fontSize: "clamp(30px, 4.2vw, 58px)", fontWeight: "700", margin: "24px 0 22px", lineHeight: "0.98", letterSpacing: "-0.038em"}}><span style={{display: "block"}}>One page your team can read.</span><span style={{display: "block"}}>And your partners. And your donor.</span></h2>
        <p style={{color: "#4a5560", margin: "0 0 48px", maxWidth: "58ch", fontSize: "21px", lineHeight: "1.6"}}>A decision is finished only when the team can pass its test. That is what separates a design from a report.</p>
        <div style={{display: "flex", flexDirection: "column"}}>
          {(phases || []).map((ph, i) => (
            <div key={i} style={{display: "flex", flexWrap: "wrap", gap: "44px", padding: "40px 0", borderTop: "2px solid #12222c", alignItems: "flex-start"}}>
              <div style={{flex: "0 1 260px", minWidth: "0"}}>
                <p style={{fontSize: "clamp(32px, 3.4vw, 48px)", fontWeight: "700", margin: "0", letterSpacing: "-0.032em", lineHeight: "1"}}>{ph.name}</p>
                <p style={{fontSize: "18px", color: "rgba(18,34,44,0.55)", margin: "14px 0 0"}}>{ph.sub}</p>
              </div>
              <div style={{flex: "1 1 320px", minWidth: "0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "32px"}}>
                {(ph.dps || []).map((d, i) => (
                  <div key={i}>
                    <div style={{fontSize: "13.5px", fontWeight: "700", letterSpacing: "0.12em", textTransform: "uppercase", color: "#00afef"}}>Decision {d.n}</div>
                    <div style={{fontSize: "23px", fontWeight: "600", margin: "12px 0 12px", lineHeight: "1.18", letterSpacing: "-0.02em"}}>{d.title}</div>
                    <div style={{fontSize: "18.5px", color: "#4a5560", lineHeight: "1.5"}}>&ldquo;{d.q}&rdquo;</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "0", borderTop: "2px solid #12222c", marginTop: "12px"}}>
          <div style={{padding: "38px 40px 38px 0", borderRight: "1px solid rgba(18,34,44,0.18)"}}>
            <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", fontWeight: "700"}}>Tools built into it</span>
            <div style={{display: "flex", flexDirection: "column", gap: "16px", marginTop: "26px"}}>
              {(idcTools || []).map((t, i) => (
                <p key={i} style={{margin: "0", fontSize: "19.5px", paddingLeft: "22px", borderLeft: "3px solid #00afef", lineHeight: "1.5"}}>{t.t}</p>
              ))}
            </div>
          </div>
          <div style={{padding: "38px 0 38px 40px"}}>
            <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", fontWeight: "700"}}>What your team receives</span>
            <div style={{display: "flex", flexWrap: "wrap", gap: "9px", marginTop: "26px"}}>
              <span style={{fontSize: "17px", padding: "12px 20px", border: "1px solid rgba(18,34,44,0.22)"}}>Handbook</span>
              <span style={{fontSize: "17px", padding: "12px 20px", border: "1px solid rgba(18,34,44,0.22)"}}>Workbook</span>
              <span style={{fontSize: "17px", padding: "12px 20px", border: "1px solid rgba(18,34,44,0.22)"}}>Reference cards</span>
              <span style={{fontSize: "17px", padding: "12px 20px", border: "1px solid rgba(18,34,44,0.22)"}}>Canvas wall print</span>
              <span style={{fontSize: "17px", padding: "12px 20px", border: "1px solid rgba(18,34,44,0.22)"}}>Delivery protocols</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  ) : null}

  {(isTralimm) ? (
    <section style={{background: "#f5f5dc", color: "#12222c", padding: "clamp(56px, 7vw, 96px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <div style={{background: "#12222c", color: "#f5f5dc", padding: "clamp(40px, 5vw, 64px)", marginBottom: "60px"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>The idea in one line</span>
          <p style={{fontSize: "clamp(30px, 4.6vw, 62px)", fontWeight: "700", lineHeight: "0.98", letterSpacing: "-0.038em", margin: "26px 0 30px", maxWidth: "24ch"}}>Money that sits still is worth more than money you lend out.</p>
          <div style={{display: "inline-flex", alignItems: "center", gap: "18px", flexWrap: "wrap", borderTop: "2px solid rgba(0,175,239,0.5)", borderBottom: "2px solid rgba(0,175,239,0.5)", padding: "26px 0"}}>
            <span style={{fontSize: "clamp(18px, 1.9vw, 24px)", fontWeight: "600"}}>Credit you unlock</span>
            <span style={{fontSize: "clamp(18px, 1.9vw, 24px)", color: "#00afef"}}>=</span>
            <span style={{fontSize: "clamp(18px, 1.9vw, 24px)", fontWeight: "600"}}>your reserve</span>
            <span style={{fontSize: "clamp(18px, 1.9vw, 24px)", color: "#00afef"}}>&times;</span>
            <span style={{fontSize: "clamp(18px, 1.9vw, 24px)", fontWeight: "600", color: "#00afef"}}>how much your suppliers trust it</span>
          </div>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "0", borderTop: "2px solid #12222c", marginBottom: "60px"}}>
          <div style={{padding: "36px 40px 36px 0", borderRight: "1px solid rgba(18,34,44,0.18)"}}>
            <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", fontWeight: "700"}}>For a whole sector</span>
            <p style={{margin: "18px 0 16px", fontSize: "34px", fontWeight: "700", letterSpacing: "-0.03em"}}>TraLiMM</p>
            <p style={{margin: "0", color: "#4a5560", fontSize: "19.5px", lineHeight: "1.6"}}>Built in Northern Uganda for agricultural distribution. A UGX 1bn reserve, structured to unlock UGX 24 to 33bn of trade a year.</p>
          </div>
          <div style={{padding: "36px 0 36px 40px"}}>
            <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", fontWeight: "700"}}>For one business</span>
            <p style={{margin: "18px 0 16px", fontSize: "34px", fontWeight: "700", letterSpacing: "-0.03em", color: "#00767a"}}>E-TraLiMM</p>
            <p style={{margin: "0", color: "#4a5560", fontSize: "19.5px", lineHeight: "1.6"}}>The same trick for a single trading business, using what it already owns, who it already sells to, or who it already knows.</p>
          </div>
        </div>

        <h2 style={{fontSize: "clamp(28px, 3.8vw, 52px)", fontWeight: "700", margin: "0 0 20px", lineHeight: "0.98", letterSpacing: "-0.036em"}}><span style={{display: "block"}}>Three ways to build the reserve.</span><span style={{display: "block"}}>Use one, or stack them.</span></h2>
        <p style={{color: "#4a5560", margin: "0 0 44px", maxWidth: "58ch", fontSize: "21px", lineHeight: "1.6"}}>Each turns something you already have into money your suppliers will act on.</p>
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2px", marginBottom: "56px"}}>
          {(tralimmModels || []).map((m, i) => (
            <div key={i} style={{background: "#fffdf5", borderTop: "4px solid #6b4a8b", padding: "34px 30px 36px"}}>
              <div style={{fontSize: "16px", fontWeight: "700", letterSpacing: "0.14em", color: "#6b4a8b"}}>{m.abbr}</div>
              <p style={{margin: "16px 0 26px", fontSize: "26px", fontWeight: "600", lineHeight: "1.15", letterSpacing: "-0.022em"}}>{m.name}</p>
              <p style={{margin: "0 0 8px", fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", fontWeight: "700"}}>Turns</p>
              <p style={{margin: "0 0 22px", fontSize: "18.5px", color: "#4a5560", lineHeight: "1.55"}}>{m.converts}</p>
              <p style={{margin: "0 0 8px", fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", fontWeight: "700"}}>Use it when</p>
              <p style={{margin: "0", fontSize: "18.5px", color: "#4a5560", lineHeight: "1.55"}}>{m.useWhen}</p>
            </div>
          ))}
        </div>

        <div style={{borderLeft: "4px solid #00afef", padding: "10px 0 10px 32px"}}>
          <p style={{margin: "0 0 24px", fontSize: "30px", fontWeight: "700", letterSpacing: "-0.026em"}}>Three things have to be true first</p>
          <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "22px"}}>
            <p style={{margin: "0", fontSize: "20px", color: "#4a5560"}}>Your trading is on the record</p>
            <p style={{margin: "0", fontSize: "20px", color: "#4a5560"}}>Your debts are clean or clearing</p>
            <p style={{margin: "0", fontSize: "20px", color: "#4a5560"}}>Your season is predictable</p>
          </div>
        </div>
      </div>
    </section>
  ) : null}

  {(isService) ? (
    <section style={{background: "#12222c", color: "#f5f5dc", padding: "clamp(48px, 6vw, 80px) 40px"}}>
      <div style={{maxWidth: "1440px", margin: "0 auto"}}>
        <div style={{display: "flex", flexWrap: "wrap", gap: "2px", marginBottom: "44px"}}>
          <span className="hv26" onClick={svcPrevGo} style={{flex: "1 1 320px", minWidth: "0", padding: "32px 34px 34px", cursor: "pointer", border: "1px solid rgba(245,245,220,0.24)", display: "flex", flexDirection: "column", gap: "14px"}}>
            <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,245,220,0.55)", fontWeight: "700"}}>&larr; Previous</span>
            <span style={{fontSize: "clamp(21px, 2.2vw, 28px)", fontWeight: "600", lineHeight: "1.18", letterSpacing: "-0.022em"}}>{svcPrevName}</span>
          </span>
          <span className="hv27" onClick={svcNextGo} style={{flex: "1 1 320px", minWidth: "0", padding: "32px 34px 34px", cursor: "pointer", border: "1px solid rgba(245,245,220,0.24)", display: "flex", flexDirection: "column", gap: "14px", alignItems: "flex-end", textAlign: "right"}}>
            <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>Next &rarr;</span>
            <span style={{fontSize: "clamp(21px, 2.2vw, 28px)", fontWeight: "600", lineHeight: "1.18", letterSpacing: "-0.022em"}}>{svcNextName}</span>
          </span>
        </div>
        <div style={{borderTop: "1px solid rgba(245,245,220,0.2)", paddingTop: "30px", display: "flex", flexWrap: "wrap", gap: "18px 32px", alignItems: "center"}}>
          <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,245,220,0.5)", fontWeight: "700"}}>All five</span>
          {(services || []).map((s, i) => (
            <span key={i} className="hv28" onClick={s.go} style={{fontSize: "17px", fontWeight: "500", cursor: "pointer", color: "{{ s.navInk }}", borderBottom: "2px solid {{ s.navRule }}", paddingBottom: "3px"}}>{s.tag}</span>
          ))}
        </div>
      </div>
    </section>
  ) : null}

  {(isAssess) ? (
    <section style={{background: "#12222c", color: "#f5f5dc", padding: "clamp(56px, 7.5vw, 104px) 40px clamp(64px, 9vw, 132px)", minHeight: "78vh"}}>
      <div style={{maxWidth: "980px", margin: "0 auto"}}>
        {(showIntro) ? (
          <div>
            <div style={{display: "flex", alignItems: "center", gap: "16px", margin: "0 0 32px"}}>
              <span style={{width: "60px", height: "3px", background: "#00afef", display: "block", flex: "0 0 auto"}}></span>
              <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>The first step</span>
            </div>
            <h1 style={{fontSize: "clamp(38px, 6vw, 92px)", fontWeight: "700", lineHeight: "0.94", letterSpacing: "-0.042em", margin: "0", maxWidth: "18ch", textWrap: "balance"}}>Ten questions. The same ten I ask in a first session.</h1>
            <p style={{margin: "36px 0 0", fontSize: "clamp(20px, 1.9vw, 26px)", color: "rgba(245,245,220,0.8)", maxWidth: "46ch", lineHeight: "1.5"}}>Answer honestly. A low score is more useful than a flattering one, because it tells you where your work starts.</p>
            <span className="hv29" onClick={start} style={{display: "inline-block", fontSize: "19px", fontWeight: "600", padding: "25px 40px", cursor: "pointer", background: "#00afef", color: "#12222c", marginTop: "46px"}}>Begin. Question 1 of 10.</span>
          </div>
        ) : null}
        {(showQuestion) ? (
          <div>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "18px", gap: "24px", flexWrap: "wrap"}}>
              <span style={{fontSize: "14px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,245,220,0.55)", fontWeight: "700"}}>Question {qNum} of 10</span>
              <span style={{fontSize: "14px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>{qSettled}</span>
            </div>
            <div style={{height: "4px", background: "rgba(245,245,220,0.18)", marginBottom: "58px"}}>
              <div style={{height: "100%", background: "#00afef", width: "{{ progress }}"}}></div>
            </div>
            <p style={{fontSize: "clamp(30px, 4.8vw, 58px)", fontWeight: "700", lineHeight: "1.04", letterSpacing: "-0.038em", margin: "0 0 54px", maxWidth: "22ch", textWrap: "balance"}}>{qText}</p>
            <div style={{display: "flex", gap: "2px", flexWrap: "wrap"}}>
              <span className="hv30" onClick={answerYes} style={{flex: "1", minWidth: "170px", textAlign: "center", fontSize: "21px", fontWeight: "600", padding: "26px 32px", cursor: "pointer", border: "2px solid rgba(245,245,220,0.3)", color: "#f5f5dc"}}>Yes</span>
              <span className="hv31" onClick={answerNo} style={{flex: "1", minWidth: "170px", textAlign: "center", fontSize: "21px", fontWeight: "600", padding: "26px 32px", cursor: "pointer", border: "2px solid rgba(245,245,220,0.3)", color: "#f5f5dc"}}>No</span>
            </div>
            <span className="hv32" onClick={back} style={{display: "inline-block", marginTop: "30px", fontSize: "16px", color: "rgba(245,245,220,0.55)", cursor: "pointer"}}>Back</span>
          </div>
        ) : null}
        {(showCapture) ? (
          <div>
            <span style={{fontSize: "14px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>Ten of ten answered</span>
            <h2 style={{fontSize: "clamp(32px, 4.8vw, 62px)", fontWeight: "700", lineHeight: "0.98", letterSpacing: "-0.038em", margin: "22px 0 22px", maxWidth: "18ch"}}>Where should the report go?</h2>
            <p style={{color: "rgba(245,245,220,0.8)", margin: "0 0 44px", fontSize: "20px", maxWidth: "46ch", lineHeight: "1.55"}}>Your score appears on screen either way. The emailed copy is the one you can put in front of your leadership team.</p>
            <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "26px", marginBottom: "36px"}}>
              <div>
                <label htmlFor="ed-email" style={{display: "block", fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: "700", margin: "0 0 12px", color: "rgba(245,245,220,0.6)"}}>Email address</label>
                <input id="ed-email" type="email" value={email} onChange={onEmail} placeholder="you@organisation.org" style={{width: "100%", fontFamily: "inherit", fontSize: "20px", padding: "16px 0", border: "none", borderBottom: "2px solid rgba(245,245,220,0.35)", background: "transparent", color: "#f5f5dc"}} />
              </div>
              <div>
                <label htmlFor="ed-name" style={{display: "block", fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: "700", margin: "0 0 12px", color: "rgba(245,245,220,0.6)"}}>First name</label>
                <input id="ed-name" type="text" value={firstName} onChange={onFirstName} placeholder="Optional" style={{width: "100%", fontFamily: "inherit", fontSize: "20px", padding: "16px 0", border: "none", borderBottom: "2px solid rgba(245,245,220,0.35)", background: "transparent", color: "#f5f5dc"}} />
              </div>
              <div>
                <label htmlFor="ed-org" style={{display: "block", fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: "700", margin: "0 0 12px", color: "rgba(245,245,220,0.6)"}}>Organisation</label>
                <input id="ed-org" type="text" value={organisation} onChange={onOrg} placeholder="Optional" style={{width: "100%", fontFamily: "inherit", fontSize: "20px", padding: "16px 0", border: "none", borderBottom: "2px solid rgba(245,245,220,0.35)", background: "transparent", color: "#f5f5dc"}} />
              </div>
            </div>
            <span className="hv33" onClick={submit} style={{display: "inline-block", fontSize: "19px", fontWeight: "600", padding: "24px 40px", cursor: "pointer", background: "#00afef", color: "#12222c"}}>{submitLabel}</span>
            {(error) ? (
              <p style={{color: "#ff8b7e", fontSize: "17px", margin: "22px 0 0", fontWeight: "600"}}>{error}</p>
            ) : null}
            <p style={{fontSize: "16px", color: "rgba(245,245,220,0.55)", margin: "30px 0 0", maxWidth: "52ch", lineHeight: "1.6"}}>Your address goes on the Viable by Design list and nowhere else. Every email has an unsubscribe link.</p>
          </div>
        ) : null}
        {(showResult) ? (
          <div>
            <div style={{borderBottom: "3px solid rgba(0,175,239,0.5)", paddingBottom: "42px"}}>
              <p style={{fontSize: "clamp(96px, 19vw, 210px)", fontWeight: "700", lineHeight: "0.8", margin: "0", letterSpacing: "-0.055em", color: "#00afef"}}>{score}<span style={{fontSize: "0.26em", color: "rgba(245,245,220,0.45)", letterSpacing: "-0.02em"}}> / 10</span></p>
              <p style={{fontSize: "14px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(245,245,220,0.75)", margin: "30px 0 0", fontWeight: "700"}}>{bandLabel}</p>
              <h3 style={{fontSize: "clamp(27px, 3.6vw, 44px)", fontWeight: "700", margin: "24px 0 0", lineHeight: "1.04", letterSpacing: "-0.034em", maxWidth: "24ch"}}>{headline}</h3>
              <p style={{color: "rgba(245,245,220,0.8)", margin: "24px 0 0", fontSize: "19.5px", lineHeight: "1.6", maxWidth: "58ch", textWrap: "pretty"}}>{meaning}</p>
            </div>
            {(hasGaps) ? (
              <div style={{marginTop: "52px"}}>
                <span style={{fontSize: "14px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>Where the gaps are</span>
                <div style={{display: "flex", flexDirection: "column", borderTop: "1px solid rgba(245,245,220,0.2)", marginTop: "26px"}}>
                  {(gaps || []).map((g, i) => (
                    <div key={i} style={{padding: "32px 0", borderBottom: "1px solid rgba(245,245,220,0.2)"}}>
                      <p style={{margin: "0 0 16px", fontWeight: "600", fontSize: "24px", lineHeight: "1.22", letterSpacing: "-0.02em"}}>{g.question}</p>
                      <p style={{margin: "0 0 16px", color: "rgba(245,245,220,0.75)", fontSize: "18.5px", lineHeight: "1.6", maxWidth: "60ch", textWrap: "pretty"}}>{g.ifNot}</p>
                      <p style={{margin: "0", fontSize: "13px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>Settled at: {g.settledAt}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div style={{marginTop: "52px"}}>
              <span style={{fontSize: "14px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>What to do next</span>
              <p style={{color: "rgba(245,245,220,0.88)", margin: "20px 0 40px", fontSize: "clamp(21px, 2.3vw, 29px)", lineHeight: "1.38", maxWidth: "46ch", textWrap: "pretty"}}>{nextStep}</p>
              <div style={{display: "flex", gap: "2px", flexWrap: "wrap"}}>
                <span className="hv34" onClick={goContact} style={{display: "inline-block", fontSize: "19px", fontWeight: "600", padding: "23px 38px", cursor: "pointer", background: "#00afef", color: "#12222c"}}>Talk it through with me</span>
                <span className="hv35" onClick={retake} style={{display: "inline-block", fontSize: "19px", fontWeight: "600", padding: "23px 38px", cursor: "pointer", border: "2px solid rgba(245,245,220,0.3)", color: "#f5f5dc"}}>Answer again</span>
              </div>
              <p style={{fontSize: "16px", color: "rgba(245,245,220,0.55)", margin: "30px 0 0"}}>{sentNote}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  ) : null}

  {(isProof) ? (
    <div>
      <section style={{background: "#12222c", color: "#f5f5dc", padding: "clamp(56px, 7.5vw, 104px) 40px"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto"}}>
          <div style={{display: "flex", alignItems: "center", gap: "16px", margin: "0 0 32px"}}>
            <span style={{width: "60px", height: "3px", background: "#00afef", display: "block", flex: "0 0 auto"}}></span>
            <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>Evidence</span>
          </div>
          <h1 style={{fontSize: "clamp(40px, 6.4vw, 100px)", fontWeight: "700", lineHeight: "0.94", letterSpacing: "-0.044em", margin: "0", maxWidth: "16ch"}}>What the work found.</h1>
          <p style={{margin: "34px 0 0", fontSize: "clamp(20px, 1.9vw, 26px)", color: "rgba(245,245,220,0.8)", maxWidth: "46ch", lineHeight: "1.5"}}>Fifteen engagements. Some of this contradicts what the sector tells itself, and it is written plainly because that is how it turned up.</p>
        </div>
      </section>
      <section style={{background: "#f5f5dc", color: "#12222c", padding: "clamp(50px, 6vw, 84px) 40px"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto", display: "flex", flexDirection: "column"}}>
          {(proofAll || []).map((p, i) => (
            <div key={i} style={{display: "flex", flexWrap: "wrap", gap: "24px 44px", alignItems: "flex-start", padding: "44px 0", borderTop: "2px solid #12222c"}}>
              <span style={{flex: "0 0 auto", fontSize: "15px", fontWeight: "700", letterSpacing: "0.14em", color: "#00767a"}}>{p.num}</span>
              <p style={{flex: "1 1 340px", minWidth: "0", margin: "0", fontSize: "clamp(25px, 3vw, 40px)", fontWeight: "600", lineHeight: "1.08", letterSpacing: "-0.03em", textWrap: "balance"}}>{p.title}</p>
              <div style={{flex: "1 1 320px", minWidth: "0"}}>
                <span style={{fontSize: "13.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,34,44,0.5)", fontWeight: "700"}}>{p.cat}</span>
                <p style={{margin: "16px 0 0", color: "#4a5560", fontSize: "18.5px", lineHeight: "1.6", textWrap: "pretty"}}>{p.what}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section style={{background: "#0b1620", color: "#f5f5dc", padding: "clamp(50px, 6vw, 84px) 40px"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto"}}>
          <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>Named, and field tested</span>
          <h2 style={{fontSize: "clamp(28px, 3.8vw, 54px)", fontWeight: "700", margin: "24px 0 20px", lineHeight: "1.0", letterSpacing: "-0.036em", maxWidth: "24ch"}}>The frameworks behind the methods.</h2>
          <p style={{color: "rgba(245,245,220,0.75)", margin: "0 0 46px", maxWidth: "54ch", fontSize: "19.5px", lineHeight: "1.6"}}>Each one came out of a real job, in a real country, with a real client. Naming them is how you tell practice from theory.</p>
          <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: "2px"}}>
            {(frameworks || []).map((f, i) => (
              <div key={i} style={{background: "#12222c", padding: "30px 28px 32px"}}>
                <div style={{fontSize: "22px", fontWeight: "600", lineHeight: "1.2", letterSpacing: "-0.02em"}}>{f.name}</div>
                <div style={{fontSize: "17.5px", color: "rgba(245,245,220,0.7)", marginTop: "14px", lineHeight: "1.55"}}>{f.origin}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  ) : null}

  {(isLibrary) ? (
    <div>
      <section style={{background: "#12222c", color: "#f5f5dc", padding: "clamp(56px, 7.5vw, 104px) 40px"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "56px", alignItems: "flex-end"}}>
          <div style={{flex: "1 1 420px", minWidth: "0"}}>
            <div style={{display: "flex", alignItems: "center", gap: "16px", margin: "0 0 32px"}}>
              <span style={{width: "60px", height: "3px", background: "#00afef", display: "block", flex: "0 0 auto"}}></span>
              <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>The library</span>
            </div>
            <h1 style={{fontSize: "clamp(38px, 6vw, 92px)", fontWeight: "700", lineHeight: "0.94", letterSpacing: "-0.042em", margin: "0", maxWidth: "16ch"}}>Give an email once. Take everything.</h1>
            <p style={{margin: "34px 0 0", fontSize: "clamp(20px, 1.9vw, 26px)", color: "rgba(245,245,220,0.8)", maxWidth: "46ch", lineHeight: "1.5"}}>Every resource here, plus the longer newsletter that only goes out from this site. One email, no drip feed of gates.</p>
          </div>
          <div style={{flex: "1 1 340px", minWidth: "0"}}>
            {(libSent) ? (
              <div style={{borderTop: "4px solid #00afef", paddingTop: "30px"}}>
                <p style={{fontSize: "clamp(24px, 2.8vw, 34px)", fontWeight: "700", margin: "0 0 18px", letterSpacing: "-0.03em", lineHeight: "1.1"}}>You are in.</p>
                <p style={{margin: "0", fontSize: "19px", color: "rgba(245,245,220,0.8)", lineHeight: "1.6"}}>{libNote}</p>
              </div>
            ) : null}
            {(libOpen) ? (
              <div style={{background: "#0b1620", padding: "34px 30px 36px", borderTop: "4px solid #00afef"}}>
                <label htmlFor="lib-email" style={{display: "block", fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: "700", margin: "0 0 14px", color: "rgba(245,245,220,0.6)"}}>Email address</label>
                <input id="lib-email" type="email" value={libEmail} onChange={onLibEmail} placeholder="you@organisation.org" style={{width: "100%", fontFamily: "inherit", fontSize: "20px", padding: "16px 0", border: "none", borderBottom: "2px solid rgba(245,245,220,0.35)", background: "transparent", color: "#f5f5dc", marginBottom: "26px"}} />
                <span className="hv36" onClick={sendLib} style={{display: "inline-block", fontSize: "18px", fontWeight: "600", padding: "21px 34px", cursor: "pointer", background: "#00afef", color: "#12222c"}}>Unlock the library</span>
                {(libError) ? (
                  <p style={{color: "#ff8b7e", fontSize: "16.5px", margin: "20px 0 0", fontWeight: "600"}}>{libError}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>
      <section style={{background: "#f5f5dc", color: "#12222c", padding: "clamp(50px, 6vw, 84px) 40px"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: "2px"}}>
          {(resources || []).map((r, i) => (
            <div key={i} style={{background: "#fffdf5", borderTop: "4px solid #00767a", padding: "34px 30px 36px", display: "flex", flexDirection: "column"}}>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "14px", marginBottom: "20px"}}>
                <span style={{fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#00767a", fontWeight: "700"}}>{r.kind}</span>
                <span style={{fontSize: "14px", color: "rgba(18,34,44,0.5)"}}>{r.meta}</span>
              </div>
              <p style={{margin: "0 0 14px", fontSize: "24px", fontWeight: "600", lineHeight: "1.18", letterSpacing: "-0.022em"}}>{r.name}</p>
              <p style={{margin: "0 0 24px", fontSize: "17.5px", color: "#4a5560", lineHeight: "1.55", flex: "1"}}>{r.what}</p>
              <span style={{fontSize: "15px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(18,34,44,0.45)"}}>{r.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  ) : null}

  {(isVideos) ? (
    <div>
      <section style={{background: "#12222c", color: "#f5f5dc", padding: "clamp(56px, 7.5vw, 104px) 40px"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto"}}>
          <div style={{display: "flex", alignItems: "center", gap: "16px", margin: "0 0 32px"}}>
            <span style={{width: "60px", height: "3px", background: "#00afef", display: "block", flex: "0 0 auto"}}></span>
            <span style={{fontSize: "14.5px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#00afef", fontWeight: "700"}}>Watch</span>
          </div>
          <h1 style={{fontSize: "clamp(38px, 6vw, 92px)", fontWeight: "700", lineHeight: "0.94", letterSpacing: "-0.042em", margin: "0", maxWidth: "18ch"}}>Twenty years of implementation, in short pieces.</h1>
          <p style={{margin: "34px 0 0", fontSize: "clamp(20px, 1.9vw, 26px)", color: "rgba(245,245,220,0.8)", maxWidth: "48ch", lineHeight: "1.5"}}>Lessons from running economic development programmes, and from advising the people who run them now. Everything plays on YouTube.</p>
          <a className="hv37" href="https://www.youtube.com/@DevTVorg" target="_blank" rel="noopener noreferrer" style={{display: "inline-block", fontSize: "18px", fontWeight: "600", padding: "22px 36px", background: "#00afef", color: "#12222c", textDecoration: "none", marginTop: "40px"}}>Open the channel</a>
        </div>
      </section>
      <section style={{background: "#f5f5dc", color: "#12222c", padding: "clamp(50px, 6vw, 84px) 40px"}}>
        <div style={{maxWidth: "1440px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: "28px"}}>
          {(videos || []).map((v, i) => (
            <a key={i} href="https://www.youtube.com/@DevTVorg" target="_blank" rel="noopener noreferrer" style={{textDecoration: "none", color: "inherit", display: "block"}}>
              <div style={{position: "relative", aspectRatio: "16 / 9", background: "#12222c", color: "#f5f5dc", overflow: "hidden"}}>
                {/* The design left a drop target here for a thumbnail. Real thumbnails
                    need YouTube video ids, which have not been supplied, and a
                    picture that is not the film it claims to be is worse than
                    none. The frame keeps its shape until the ids arrive. */}
                <span style={{position: "absolute", inset: "0", display: "flex", alignItems: "center",
                  justifyContent: "center", background: "#0b1620", color: "rgba(245,245,220,0.34)",
                  fontSize: "14px", letterSpacing: "0.14em", textTransform: "uppercase"}}>Watch on YouTube</span>
                <span style={{position: "absolute", left: "18px", bottom: "18px", fontSize: "12.5px", fontWeight: "700", letterSpacing: "0.12em", textTransform: "uppercase", background: "#00afef", color: "#12222c", padding: "7px 12px", pointerEvents: "none"}}>{v.tag}</span>
              </div>
              <p style={{margin: "20px 0 10px", fontSize: "22px", fontWeight: "600", lineHeight: "1.2", letterSpacing: "-0.02em"}}>{v.title}</p>
              <p style={{margin: "0", fontSize: "17px", color: "#4a5560", lineHeight: "1.55"}}>{v.what}</p>
            </a>
          ))}
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
          <p style={{margin: "34px 0 0", fontSize: "clamp(20px, 1.9vw, 26px)", color: "rgba(245,245,220,0.8)", maxWidth: "42ch", lineHeight: "1.5"}}>A short note is enough. What you do, who pays for it now, and what happens when that stops. I reply to everything myself.</p>
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
                <textarea id="ec-msg" rows="5" value={cMsg} onChange={onCMsg} placeholder="What you do, who pays for it now, and what happens when that stops." style={{width: "100%", fontFamily: "inherit", fontSize: "20px", lineHeight: "1.5", padding: "16px 0", border: "none", borderBottom: "2px solid rgba(245,245,220,0.35)", background: "transparent", color: "#f5f5dc", resize: "vertical"}}></textarea>
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
          <p style={{margin: "0", fontSize: "19px", color: "rgba(245,245,220,0.85)", maxWidth: "40ch", lineHeight: "1.6"}}>The longer edition, from here rather than LinkedIn. What is working, what is not, and the mistakes organisations make on the way from funded to paid.</p>
          {(showCount) ? (
            <p style={{margin: "16px 0 0", fontSize: "17px", color: "#00afef", fontWeight: "600"}}><span data-count="1145">1145</span> people read it on LinkedIn.</p>
          ) : null}
        </div>
        <div style={{flex: "0 1 auto"}}>
          <span className="hv39" onClick={goLibrary} style={{display: "inline-block", fontSize: "18px", fontWeight: "600", padding: "21px 36px", cursor: "pointer", background: "#00afef", color: "#12222c"}}>Subscribe</span>
        </div>
      </div>

      <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "40px", padding: "48px 0", borderBottom: "1px solid rgba(245,245,220,0.16)"}}>
        <div>
          <img src="/site/habib-onifade-wordmark.png" alt="Habib Onifade" style={{height: "38px", width: "auto", display: "block", marginBottom: "24px"}} />
          <p style={{fontSize: "17px", color: "rgba(245,245,220,0.68)", margin: "0", maxWidth: "30ch", lineHeight: "1.6"}}>Find out who pays. Design the service for them. Build the numbers. Test it on a real customer. Hand it over.</p>
        </div>
        <div>
          <p style={{fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,245,220,0.5)", margin: "0 0 20px", fontWeight: "700"}}>What I do</p>
          <div style={{display: "flex", flexDirection: "column", gap: "13px"}}>
            {(services || []).map((s, i) => (
              <span key={i} className="hv40" onClick={s.go} style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", cursor: "pointer", lineHeight: "1.45"}}>{s.name}</span>
            ))}
          </div>
        </div>
        <div>
          <p style={{fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,245,220,0.5)", margin: "0 0 20px", fontWeight: "700"}}>Explore</p>
          <div style={{display: "flex", flexDirection: "column", gap: "13px"}}>
            <span className="hv41" onClick={goProof} style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", cursor: "pointer"}}>Evidence</span>
            <span className="hv42" onClick={goLibrary} style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", cursor: "pointer"}}>Library</span>
            <span className="hv43" onClick={goVideos} style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", cursor: "pointer"}}>Watch</span>
            <span className="hv44" onClick={goAssess} style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", cursor: "pointer"}}>Score yourself</span>
          </div>
        </div>
        <div>
          <p style={{fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(245,245,220,0.5)", margin: "0 0 20px", fontWeight: "700"}}>Get in touch</p>
          <div style={{display: "flex", flexDirection: "column", gap: "13px"}}>
            <span className="hv45" onClick={goContact} style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", cursor: "pointer"}}>Contact</span>
            <a className="hv46" href="mailto:hello@habibonifade.com" style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", textDecoration: "none"}}>hello@habibonifade.com</a>
            <a className="hv47" href="https://www.linkedin.com/in/habibonifade/" target="_blank" rel="noopener noreferrer" style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", textDecoration: "none"}}>LinkedIn</a>
            <a className="hv48" href="https://www.youtube.com/@DevTVorg" target="_blank" rel="noopener noreferrer" style={{fontSize: "16.5px", color: "rgba(245,245,220,0.82)", textDecoration: "none"}}>YouTube</a>
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
