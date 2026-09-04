// @vitest-environment jsdom
// ============================================================
// THE PUBLIC SITE COMES UP, AND SAYS ONLY WHAT IT CAN EVIDENCE.
//
// These pages are the ones a stranger is meant to find, which makes them the
// ones where a crash costs a subscriber rather than a support message. The
// files carry no @ts-nocheck, but a missing import or a handler removed while
// its button stayed is still invisible to the compiler in JSX, and this is
// the cheapest way to catch it.
//
// It also pins the promises the design makes about itself: the score is never
// gated behind an email, the diagnostic asks the method's own ten questions,
// the five services loop rather than dead ending, and no market figure appears
// without the publication it came from.
// ============================================================
import { describe, expect, it } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'

import ScoreFlow from '@/components/site/ScoreFlow'
import CaptureForm from '@/components/site/CaptureForm'
import { CanvasDiagram, IntelDiagram, IccDiagram, IdcDiagram, TralimmDiagram } from '@/components/site/Diagrams'
import { READINESS } from '@/lib/readiness-questions'
import { SERVICES, serviceBySlug, neighbours, PROOF_FIFTEEN, MENU } from '@/lib/site-content'
import { MARKET_STATS } from '@/lib/site-stats'

function render(el: React.ReactElement) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  act(() => { createRoot(host).render(el) })
  return host
}

describe('the readiness diagnostic', () => {
  it('opens on an invitation rather than a form', () => {
    const t = render(<ScoreFlow />).textContent || ''
    expect(t).toContain('Begin. Question 1 of 10.')
    expect(t).toContain('whether or not you give an email')
  })

  it('asks one question at a time, and only the method\'s own ten', () => {
    const host = render(<ScoreFlow />)
    act(() => { (host.querySelector('button.btn') as HTMLButtonElement).click() })
    expect(host.textContent).toContain('Question 1 of 10')
    expect(host.textContent).toContain(READINESS[0].question)
    // The second question is not on screen yet.
    expect(host.textContent).not.toContain(READINESS[1].question)
  })

  it('shows the score without asking for an email first', () => {
    const host = render(<ScoreFlow />)
    act(() => { (host.querySelector('button.btn') as HTMLButtonElement).click() })
    // Answer all ten "no", which is the worst case and the one most likely to
    // be gated by a careless change.
    for (let i = 0; i < READINESS.length; i++) {
      const no = host.querySelectorAll('.q-yn button')[1] as HTMLButtonElement
      act(() => { no.click() })
    }
    const t = host.textContent || ''
    expect(t).toContain('Below threshold')
    expect(t).toContain('Where the gaps are')
    expect(t).toContain('Settled at')
    // The email box is offered after the score, not before it.
    expect(t).toContain('Where should the report go?')
  })

  it('counts a yes as a yes', () => {
    const host = render(<ScoreFlow />)
    act(() => { (host.querySelector('button.btn') as HTMLButtonElement).click() })
    for (let i = 0; i < READINESS.length; i++) {
      const yes = host.querySelectorAll('.q-yn button')[0] as HTMLButtonElement
      act(() => { yes.click() })
    }
    const t = host.textContent || ''
    expect(t).toContain('Strong readiness')
    expect(t).toContain('You answered yes to all ten')
  })
})

describe('the five diagrams', () => {
  it('each draw something rather than describing it', () => {
    expect(render(<CanvasDiagram />).querySelectorAll('.dgb').length).toBe(8)
    expect(render(<CanvasDiagram />).querySelectorAll('.dg-fits > div').length).toBe(6)
    expect(render(<IntelDiagram />).querySelectorAll('.bar').length).toBe(7)
    expect(render(<IntelDiagram />).querySelectorAll('.tier').length).toBe(4)
    expect(render(<IccDiagram />).querySelectorAll('.block').length).toBe(8)
    expect(render(<IdcDiagram />).querySelectorAll('.phase').length).toBe(4)
    expect(render(<TralimmDiagram />).querySelectorAll('.model').length).toBe(3)
  })

  it('names the canvas decisions the way the rest of the system does', () => {
    const t = render(<CanvasDiagram />).textContent || ''
    expect(t).toContain('Decision Point 1')
    expect(t).toContain('Decision Point 9')
    expect(t).not.toMatch(/\bZone \d/)
    expect(t).not.toMatch(/\bDP\s?\d/)
  })
})

describe('the shape of the site', () => {
  it('gives every service a page, and loops so none dead ends', () => {
    expect(SERVICES).toHaveLength(5)
    for (const s of SERVICES) {
      expect(serviceBySlug(s.slug)).toBeTruthy()
      const nb = neighbours(s.slug)!
      expect(nb.prev.slug).not.toBe(s.slug)
      expect(nb.next.slug).not.toBe(s.slug)
    }
    // The last leads back to the first.
    expect(neighbours(SERVICES[SERVICES.length - 1].slug)!.next.slug).toBe(SERVICES[0].slug)
  })

  it('gives each service its own call to action', () => {
    const ctas = new Set(SERVICES.map((s) => s.ctaLabel))
    expect(ctas.size).toBe(SERVICES.length)
  })

  it('shows fifteen engagements where it says fifteen', () => {
    expect(PROOF_FIFTEEN).toHaveLength(15)
    expect(new Set(PROOF_FIFTEEN.map((p) => p.title)).size).toBe(15)
  })

  it('points every menu item somewhere real', () => {
    const known = new Set(['/method', '/evidence', '/library', '/watch', '/score', '/contact'])
    for (const m of MENU) {
      const ok = known.has(m.href) || SERVICES.some((s) => m.href === `/what-i-do/${s.slug}`)
      expect(ok, `${m.href} goes nowhere`).toBe(true)
    }
  })

  it('cites a source for every claim about the world', () => {
    for (const s of MARKET_STATS) expect(s.url).toMatch(/^https:\/\//)
  })
})

describe('the capture form', () => {
  it('says what happens to the address before asking for it', () => {
    const t = render(
      <CaptureForm source="library" cta="Unlock the library" done={{ head: 'x', body: 'y' }} />,
    ).textContent || ''
    expect(t).toContain('unsubscribe')
    expect(t).toContain('nowhere else')
  })
})
