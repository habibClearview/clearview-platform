// @vitest-environment jsdom
// ============================================================
// THE PUBLIC PAGE COMES UP, AND THE FORM IS ANSWERABLE.
//
// This is the one page in the system a stranger is meant to find, which means
// it is the one page where a crash costs a subscriber rather than a support
// message. The same class of fault that took Phase 0 down twice — a reference
// to something declared later, a handler removed while its button stayed —
// would not be caught by tsc here either, because the file carries @ts-nocheck.
//
// It also pins the two things that are easy to break by accident: a social
// button whose address is not configured must not render at all (a button
// that goes nowhere is worse than no button), and the ten questions must be
// the ten from the method.
// ============================================================
import { describe, expect, it } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'

import SiteLanding from '@/components/site/SiteLanding'
import { READINESS } from '@/lib/readiness-score'
import { BLOCK, CANVAS_BLOCK_IDS, dpLabel } from '@/lib/gtcv-blocks'

const QUESTIONS = READINESS.map((q) => ({ id: q.id, question: q.question }))

function render() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  act(() => { createRoot(host).render(<SiteLanding questions={QUESTIONS} />) })
  return host
}

describe('the public site', () => {
  it('comes up', () => {
    const text = render().textContent || ''
    expect(text).toContain('The grant will end')
  })

  it('asks all ten questions, each with a yes and a no', () => {
    const host = render()
    const text = host.textContent || ''
    for (const q of QUESTIONS) expect(text, `missing: ${q.question}`).toContain(q.question)
    expect(host.querySelectorAll('.q').length).toBe(10)
    expect(host.querySelectorAll('.yn button').length).toBe(20)
  })

  it('shows all nine decision points, in worked order', () => {
    const host = render()
    const tags = Array.from(host.querySelectorAll('.dp .n')).map((e) => e.textContent)
    expect(tags).toEqual(
      ['dp01','dp02','dp03','dp04','dp05','dp06','dp07','dp08','dp09'].map(dpLabel),
    )
    const text = host.textContent || ''
    for (const id of CANVAS_BLOCK_IDS) expect(text).toContain(BLOCK[id].title)
  })

  it('takes an email address and counts what has been answered', () => {
    const host = render()
    // Matched by attribute, not by '#hs-email': jsdom resolves an id selector
    // against the whole document first, and by this point earlier tests have
    // mounted the same form elsewhere on the page.
    expect(host.querySelector('input[type="email"][id="hs-email"]')).toBeTruthy()
    expect(host.textContent).toContain('0 of 10 answered')
  })

  it('records an answer when a button is pressed', () => {
    const host = render()
    const yes = host.querySelector('.q .yn button.y') as HTMLButtonElement
    act(() => { yes.click() })
    expect(host.textContent).toContain('1 of 10 answered')
    expect(host.querySelector('.q .yn button.y')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('renders no social button while no address is configured', () => {
    // NEXT_PUBLIC_LINKEDIN_NEWSLETTER_URL and NEXT_PUBLIC_YOUTUBE_URL are unset
    // in the test environment, which is the state the site ships in until the
    // two links are given. A dead button is worse than no button.
    const host = render()
    expect(host.textContent).not.toContain('Subscribe on LinkedIn')
    expect(host.textContent).not.toContain('Watch on YouTube')
  })

  it('says plainly what happens to the address', () => {
    const text = render().textContent || ''
    expect(text).toContain('unsubscribe')
    expect(text).toContain('never shared')
  })
})
