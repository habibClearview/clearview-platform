// ============================================================
// WHAT THE BROWSER IS ALLOWED TO DO
//
// 10 September 2026. The recording, the call and the transcript were built,
// tested and deployed, and the first time a real browser opened a session room
// two of the three were refused before they started:
//
//   "could not establish signal connection: Failed to fetch"
//   "The microphone was refused."
//
// Neither was the key, the secret, the address or the person's browser. Both
// were our own response headers. Permissions-Policy said microphone=(), which
// forbids the microphone on this site for everybody including us, so pressing
// Allow could never work. And connect-src listed only ourselves and Supabase,
// so the browser blocked the socket to the media service.
//
// EVERY TEST UP TO THAT POINT RAN AGAINST THE SERVER, AND A SERVER HAS NO
// CONTENT SECURITY POLICY. That is the whole gap this file closes. A feature
// that needs a device or a third party host has two halves: the code, and
// permission for the browser to run it. The second half was never checked.
//
// So: for each thing the app asks a browser to do, assert the header allows it.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest'

let headers: { key: string; value: string }[]
let csp: Record<string, string>

function directives(value: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of value.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const at = trimmed.indexOf(' ')
    if (at === -1) out[trimmed] = ''
    else out[trimmed.slice(0, at)] = trimmed.slice(at + 1)
  }
  return out
}

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_LIVEKIT_URL = 'wss://clearview-test.livekit.cloud'
  const { createRequire } = await import('module')
  const path = await import('path')
  const require_ = createRequire(path.join(process.cwd(), 'noop.js'))
  const resolved = path.join(process.cwd(), 'next.config.js')
  delete require_.cache[resolved]
  const config = require_(resolved)
  const rules = await config.headers()
  headers = rules[0].headers
  csp = directives(headers.find((h) => h.key === 'Content-Security-Policy')!.value)
})

describe('the microphone the whole method depends on', () => {
  const policy = () => headers.find((h) => h.key === 'Permissions-Policy')!.value

  it('is allowed for this site', () => {
    // microphone=() is not "ask the person", it is "never, to anyone".
    expect(policy()).toContain('microphone=(self)')
    expect(policy()).not.toMatch(/microphone=\(\)/)
  })

  it('allows the camera and screen sharing the call offers', () => {
    // A control on screen that the headers forbid is worse than no control.
    expect(policy()).toContain('camera=(self)')
    expect(policy()).toContain('display-capture=(self)')
  })

  it('is still refused to anybody who embeds this page', () => {
    // self is this site and nothing else, and the browser still asks first.
    expect(policy()).not.toContain('microphone=*')
    expect(policy()).not.toContain('camera=*')
  })

  it('keeps off what the platform has no business with', () => {
    expect(policy()).toContain('geolocation=()')
    expect(policy()).toContain('browsing-topics=()')
  })
})

describe('the hosts the browser is allowed to reach', () => {
  it('may open the call, over both schemes', () => {
    // The client checks the room over https before opening the socket. Allowing
    // only the socket fails, with the same unhelpful "Failed to fetch".
    expect(csp['connect-src']).toContain('wss://clearview-test.livekit.cloud')
    expect(csp['connect-src']).toContain('https://clearview-test.livekit.cloud')
  })

  it('keeps a safety net for the regional hosts the media service answers from', () => {
    expect(csp['connect-src']).toContain('wss://*.livekit.cloud')
    expect(csp['connect-src']).toContain('https://*.livekit.cloud')
  })

  it('still reaches the database', () => {
    expect(csp['connect-src']).toContain('*.supabase.co')
  })

  it('has not been opened to everything', () => {
    // The point of the policy is what it refuses.
    expect(csp['connect-src']).not.toContain(" *")
    expect(csp['default-src']).toBe("'self'")
    expect(csp['frame-ancestors']).toBe("'none'")
    expect(csp['object-src']).toBe("'none'")
  })
})

describe('playing a recording back', () => {
  it('is allowed to play from the browser own memory', () => {
    // The audio is fetched with the sign in on the request and played from a
    // blob: address. Without media-src it falls through to default-src and the
    // player is refused with no message at all.
    expect(csp['media-src']).toBeDefined()
    expect(csp['media-src']).toContain('blob:')
  })
})

describe('every host the app talks to is in the policy', () => {
  it('names the media service the code actually connects to', () => {
    // Guards against the address being changed in one place and not the other,
    // which presents as a call that will not connect and a green build.
    const url = process.env.NEXT_PUBLIC_LIVEKIT_URL!
    const host = new URL(url).host
    expect(csp['connect-src']).toContain(host)
  })
})

// ============================================================
// A PHONE IS A NARROW SCREEN, NOT A SMALL DESKTOP
//
// 10 September 2026. Habib: it was impossible to join on the phone because of
// the mobile responsiveness, it does not change with the size of the screen, I
// could not read the site.
//
// The responsive rules had been written months earlier and had never once
// applied, because the application declared no viewport. A phone that is not
// told the width of the device lays the page out at a virtual 980 pixels and
// shrinks the result, so no max-width rule ever matches and every word arrives
// at a third of its size.
//
// This is the same class of fault as the headers: something the server never
// sees and no server test can reach.
// ============================================================
describe('the page fits the screen it is on', () => {
  const fs = require('fs')
  const LAYOUT = fs.readFileSync('app/layout.tsx', 'utf8')
  const CSS = fs.readFileSync('app/globals.css', 'utf8')

  it('declares the viewport, which is what switches the rest on', () => {
    expect(LAYOUT).toContain('export const viewport')
    expect(LAYOUT).toContain("width: 'device-width'")
    expect(LAYOUT).toContain('initialScale: 1')
  })

  it('does not take zooming away', () => {
    // Locking zoom is a habit of app-like sites and it shuts out anybody who
    // enlarges text to read it.
    expect(LAYOUT).not.toContain('maximumScale')
    expect(LAYOUT).not.toContain('userScalable: false')
  })

  it('stops one wide element making every screen scroll sideways', () => {
    expect(CSS).toContain('overflow-x: hidden')
    expect(CSS).toMatch(/table, pre \{[^}]*overflow-x: auto/)
  })

  it('makes fields large enough to touch, and large enough not to trigger a zoom', () => {
    expect(CSS).toContain('min-height: 40px')
    expect(CSS).toContain('font-size: 16px')
  })

  it('changes nothing on a wide screen', () => {
    // THE RULE, STATED PROPERLY: every declaration added for phones lives
    // inside a max-width query. One outside would silently redesign the desktop
    // the whole platform is worked on, which is a far more expensive mistake
    // than a phone that does not fit.
    //
    // This is checked by looking for a style block before the first query
    // rather than by counting queries, because counting them meant the test
    // failed the moment a second, entirely correct, query was added. It caught
    // that on the day it was written, which is the right kind of wrong.
    const added = CSS.slice(CSS.indexOf('A PHONE IS A NARROW SCREEN'))
    const sections = added.split('@media (max-width:')
    // Anything before the first query must be comment only, so no braces.
    expect(sections[0].replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('{')
    // And every query added is a narrow-screen one.
    expect(added).not.toMatch(/@media\s*\(min-width/)
    expect(sections.length).toBeGreaterThan(1)
  })

  it('gives the client screen its whole width on a phone', () => {
    // A 220 pixel sidebar beside the work leaves 170 pixels on a phone, which
    // is why the session list could not be reached. The sidebar becomes a strip
    // that scrolls sideways above the work instead.
    const DASH = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')
    expect(DASH).toContain('className="cv-client-shell"')
    expect(DASH).toContain('className="cv-client-nav"')
    expect(CSS).toContain('.cv-client-shell')
    expect(CSS).toContain('grid-template-columns: 1fr !important')
  })

  it('does not lay the navigation out sideways, which broke it on a real phone', () => {
    // The tabs are each wrapped in a div, so a rule aimed at the buttons
    // matched only the collapse control and every tab was squeezed to its
    // narrowest and printed one letter per line. Reverted the same day.
    const phone = CSS.slice(CSS.indexOf('THE CLIENT SCREEN ON A PHONE'))
    expect(phone).not.toContain('display: flex !important')
    expect(phone).not.toContain('overflow-x: auto !important')
  })
})
