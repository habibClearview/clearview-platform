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
