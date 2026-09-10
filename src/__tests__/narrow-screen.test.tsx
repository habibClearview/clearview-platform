// @vitest-environment jsdom
// ============================================================
// IS THIS A PHONE, AND DOES IT NOTICE WHEN THE PHONE TURNS
//
// 10 September 2026. Habib: people will join this on the phone and use it for
// interview capture and remote session capture, and right now the phone cannot
// capture because the platform is not usable on it.
//
// He also reported that turning the phone changed nothing. A media query read
// once is read in whichever orientation the page happened to load in, so this
// holds that it listens rather than looks once.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNarrowScreen, NARROW } from '@/lib/narrow-screen'

let listeners: (() => void)[] = []
let matches = false

function installMatchMedia(supportsModern = true) {
  listeners = []
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      media: query,
      get matches() { return matches },
      addEventListener: supportsModern ? (_: string, fn: () => void) => listeners.push(fn) : undefined,
      removeEventListener: supportsModern ? () => {} : undefined,
      addListener: supportsModern ? undefined : (fn: () => void) => listeners.push(fn),
      removeListener: supportsModern ? undefined : () => {},
    })),
  })
}

beforeEach(() => { matches = false; installMatchMedia() })

describe('knowing a phone from a desktop', () => {
  it('says no on a wide screen', () => {
    const { result } = renderHook(() => useNarrowScreen())
    expect(result.current).toBe(false)
  })

  it('says yes on a narrow one', () => {
    matches = true
    const { result } = renderHook(() => useNarrowScreen())
    expect(result.current).toBe(true)
  })

  it('starts as a wide screen, so a desktop never flashes the phone layout', () => {
    // The first paint happens before any measurement is possible, and a
    // laptop briefly showing a phone layout on every page load reads as a bug.
    matches = true
    const { result } = renderHook(() => useNarrowScreen())
    expect(typeof result.current).toBe('boolean')
  })

  it('changes when the phone is turned', () => {
    // Habib: it does not change orientation when you turn the phone. A match
    // read once is read in whichever orientation the page loaded in.
    const { result } = renderHook(() => useNarrowScreen())
    expect(result.current).toBe(false)
    act(() => { matches = true; listeners.forEach((fn) => fn()) })
    expect(result.current).toBe(true)
  })

  it('listens on browsers that only offer the older way', () => {
    installMatchMedia(false)
    const { result } = renderHook(() => useNarrowScreen())
    act(() => { matches = true; listeners.forEach((fn) => fn()) })
    expect(result.current).toBe(true)
  })

  it('does not fall over where the browser cannot answer at all', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined })
    const { result } = renderHook(() => useNarrowScreen())
    expect(result.current).toBe(false)
  })

  it('treats a phone as 720 pixels or less', () => {
    expect(NARROW).toBe(720)
  })
})

describe('what the client screen does with it', () => {
  const fs = require('fs')
  const DASH = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')

  it('replaces twenty five rows with one control on a phone', () => {
    // Twenty five tabs in a column is right on a laptop and unusable on a
    // phone, where it is either 170 pixels of work or twenty five rows to
    // scroll past before reaching any.
    expect(DASH).toContain('const onAPhone=useNarrowScreen()')
    expect(DASH).toContain('id="cv-phone-tab"')
    expect(DASH).toContain('Where you are')
  })

  it('keeps the group headings, so the list still reads in order', () => {
    expect(DASH).toContain('<optgroup')
  })

  it('does not draw the sidebar and the control at the same time', () => {
    expect(DASH).toContain("display:onAPhone?'none':'block'")
  })

  it('sizes the control for a thumb, and large enough not to trigger a zoom', () => {
    // Under 16px, iOS zooms the page in on focus and leaves it there.
    expect(DASH).toContain('fontSize:16')
    expect(DASH).toContain('minHeight:44')
  })

  it('does it in the component, not in the stylesheet', () => {
    // The first attempt was a stylesheet override. It assumed the tabs were
    // direct children of the navigation, they are not, and every tab printed
    // one letter per line on a real phone.
    const CSS = fs.readFileSync('app/globals.css', 'utf8')
    const phone = CSS.slice(CSS.indexOf('THE CLIENT SCREEN ON A PHONE'))
    expect(phone).not.toContain('display: flex !important')
  })
})
