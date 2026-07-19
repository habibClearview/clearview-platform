import { describe, it, expect } from 'vitest'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

// Minimal stand-ins for the Supabase client and NextRequest — we only exercise
// the tiny bits of surface the helper touches.
function fakeSupabase(rpcImpl: () => Promise<{ data: unknown; error: unknown }>) {
  return { rpc: rpcImpl } as any
}
function fakeReq(headers: Record<string, string>) {
  return {
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
  } as any
}

describe('checkRateLimit', () => {
  it('allows when the function reports under the limit', async () => {
    const r = await checkRateLimit(fakeSupabase(async () => ({ data: true, error: null })), 'k', 5, 60)
    expect(r.allowed).toBe(true)
    expect(r.retryAfter).toBe(60)
  })

  it('blocks when the function reports over the limit', async () => {
    const r = await checkRateLimit(fakeSupabase(async () => ({ data: false, error: null })), 'k', 5, 60)
    expect(r.allowed).toBe(false)
  })

  it('FAILS OPEN when the limiter errors (a broken limiter must not block users)', async () => {
    const r = await checkRateLimit(fakeSupabase(async () => ({ data: null, error: { message: 'db down' } })), 'k', 5, 60)
    expect(r.allowed).toBe(true)
  })

  it('FAILS OPEN when the limiter throws', async () => {
    const r = await checkRateLimit(fakeSupabase(async () => { throw new Error('boom') }), 'k', 5, 60)
    expect(r.allowed).toBe(true)
  })
})

describe('clientIp', () => {
  it('uses the left-most x-forwarded-for entry', () => {
    expect(clientIp(fakeReq({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip', () => {
    expect(clientIp(fakeReq({ 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9')
  })

  it('returns "unknown" when no IP header is present', () => {
    expect(clientIp(fakeReq({}))).toBe('unknown')
  })
})
