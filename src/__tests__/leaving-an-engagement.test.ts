// ============================================================
// GETTING BACK OUT OF AN ENGAGEMENT
//
// 12 September 2026. Habib: there is a situation that I cannot return from a
// client's page to the coach's dashboard, this should not be, I should be able
// to do so.
//
// There was a button, at the very top of the page in the breadcrumb. An
// engagement page is thousands of pixels long, so the moment you scroll into
// the work it is gone. The one thing that does follow you down the page, the
// sticky tab sidebar, had no way out in it at all. And an address carrying a
// client that is not on your list printed "Client not found." on an otherwise
// empty page with nothing to press.
//
// Three separate dead ends, each of which leaves somebody using the browser's
// back button on a platform that should not need one.
// ============================================================
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const DASH = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')

describe('there is always a way back', () => {
  it('is in the sidebar, which is the part that follows you down the page', () => {
    // The breadcrumb at the top might as well not exist from two thousand
    // pixels down, and the sidebar is sticky.
    const nav = DASH.slice(DASH.indexOf('className="cv-client-nav"'))
    expect(nav.slice(0, 1400)).toContain('onClick={leaveEngagement}')
    expect(DASH).toContain("position:'sticky'")
  })

  it('is on the phone too, where the sidebar is one control', () => {
    const phone = DASH.slice(DASH.indexOf('id="cv-phone-tab"') - 900, DASH.indexOf('id="cv-phone-tab"'))
    expect(phone).toContain('{leaveButton}')
  })

  it('is on both kinds of engagement, from one definition', () => {
    // A canvas engagement and a financial one are two separate returns in this
    // component, and they used to carry two separate copies of the button.
    expect(DASH.split('{leaveButton}')).toHaveLength(4)
  })

  it('is there even when the engagement itself cannot be found', () => {
    // An address carrying a client that has been deleted, or belongs to
    // somebody else, or a list that has not finished loading.
    expect(DASH).toContain('That engagement is not on this list')
    expect(DASH).not.toContain('return<div style={{color:C.slate,padding:\'2rem\'}}>Client not found.</div>')
  })
})

describe('leaving actually leaves', () => {
  it('clears the engagement, so the address stops pointing at it', () => {
    // It used to leave it selected, so the address still read
    // ?client=...&zone=... while you were on the dashboard, and reloading or
    // sharing that address put you straight back inside the engagement.
    const fn = DASH.slice(DASH.indexOf('function leaveEngagement()'))
    expect(fn.slice(0, 200)).toContain('setSelClientId(null)')
  })

  it('goes somewhere the person actually has', () => {
    // The Coach Dashboard is a super coach's page. For a co-implementer it was
    // a button to nowhere.
    expect(DASH).toContain("setView(isSuperCoach?'overview':'clients')")
    expect(DASH).toContain("const leaveLabel=isSuperCoach?'← Coach Dashboard':'← All clients'")
  })
})
