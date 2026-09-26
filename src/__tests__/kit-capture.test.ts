// ============================================================
// A SIGN-UP IS EITHER FILED OR REPORTED. 26 September 2026.
//
// The website form files people under the tag "source: website", and later
// into a Kit form. If either step fails, capture() has to say so: the
// subscribe route only emails Habib to add someone by hand when capture
// reports a failure. A failure reported as success is a subscriber nobody
// knows is missing.
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

type Reply = { status: number; body?: unknown }

function kit(routes: Record<string, Reply>) {
  const calls: string[] = []
  const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    const key = `${init?.method || 'GET'} ${new URL(url).pathname}`
    calls.push(key)
    const hit = routes[key] || { status: 404, body: {} }
    return new Response(JSON.stringify(hit.body ?? {}), { status: hit.status })
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

async function load() {
  vi.resetModules()
  return import('@/lib/kit')
}

describe('capture from the website form', () => {
  beforeEach(() => {
    vi.stubEnv('KIT_API_KEY', 'test-key')
    vi.stubEnv('KIT_WEBSITE_FORM_ID', '')
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('succeeds when the subscriber is added and tagged', async () => {
    kit({
      'POST /v4/subscribers': { status: 201 },
      'GET /v4/tags': { status: 200, body: { tags: [{ id: 7, name: 'source: website' }] } },
      'POST /v4/tags/7/subscribers': { status: 201 },
    })
    const { capture } = await load()
    const r = await capture({ email: 'a@example.org', source: 'website' })
    expect(r).toEqual({ added: true, tagged: ['source: website'], form: undefined })
  })

  it('creates the tag when it does not exist yet', async () => {
    const calls = kit({
      'POST /v4/subscribers': { status: 201 },
      'GET /v4/tags': { status: 200, body: { tags: [] } },
      'POST /v4/tags': { status: 201, body: { tag: { id: 9, name: 'source: website' } } },
      'POST /v4/tags/9/subscribers': { status: 201 },
    })
    const { capture } = await load()
    const r = await capture({ email: 'a@example.org', source: 'website' })
    expect(r.added).toBe(true)
    expect(calls).toContain('POST /v4/tags')
  })

  it('reports a failure when the source tag cannot be created', async () => {
    kit({
      'POST /v4/subscribers': { status: 201 },
      'GET /v4/tags': { status: 200, body: { tags: [] } },
      'POST /v4/tags': { status: 422 },
    })
    const { capture } = await load()
    const r = await capture({ email: 'a@example.org', source: 'website' })
    expect(r.added).toBe(false)
    expect(r.reason).toContain('source: website')
  })

  it('reports a failure when the source tag will not apply', async () => {
    kit({
      'POST /v4/subscribers': { status: 201 },
      'GET /v4/tags': { status: 200, body: { tags: [{ id: 7, name: 'source: website' }] } },
      'POST /v4/tags/7/subscribers': { status: 500 },
    })
    const { capture } = await load()
    expect((await capture({ email: 'a@example.org', source: 'website' })).added).toBe(false)
  })

  it('files into the Kit form once one is set, and reports it', async () => {
    vi.stubEnv('KIT_WEBSITE_FORM_ID', '123')
    kit({
      'POST /v4/subscribers': { status: 201 },
      'GET /v4/tags': { status: 200, body: { tags: [{ id: 7, name: 'source: website' }] } },
      'POST /v4/tags/7/subscribers': { status: 201 },
      'POST /v4/forms/123/subscribers': { status: 201 },
    })
    const { capture } = await load()
    const r = await capture({ email: 'a@example.org', source: 'website' })
    expect(r).toMatchObject({ added: true, form: '123' })
  })

  it('reports a failure when the Kit form refuses the subscriber', async () => {
    vi.stubEnv('KIT_WEBSITE_FORM_ID', '123')
    kit({
      'POST /v4/subscribers': { status: 201 },
      'GET /v4/tags': { status: 200, body: { tags: [{ id: 7, name: 'source: website' }] } },
      'POST /v4/tags/7/subscribers': { status: 201 },
      'POST /v4/forms/123/subscribers': { status: 404 },
    })
    const { capture } = await load()
    const r = await capture({ email: 'a@example.org', source: 'website' })
    expect(r.added).toBe(false)
    expect(r.tagged).toEqual(['source: website'])
    expect(r.reason).toContain('123')
  })
})
