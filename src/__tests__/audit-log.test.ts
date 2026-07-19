import { describe, it, expect, vi } from 'vitest'
import { writeAuditLog, auditIp } from '@/lib/audit-log'

function fakeAdmin(insertImpl: (row: any) => Promise<{ error: unknown }>) {
  return { from: () => ({ insert: insertImpl }) } as any
}
function fakeHeaders(h: Record<string, string>) {
  return { get: (k: string) => h[k.toLowerCase()] ?? null } as unknown as Headers
}

describe('writeAuditLog', () => {
  it('maps the entry into the audit_log row', async () => {
    let captured: any = null
    await writeAuditLog(
      fakeAdmin(async (row) => { captured = row; return { error: null } }),
      { actorId: 'a1', actorEmail: 'a@x.com', actorRole: 'ceo', action: 'user.invited', targetId: 't1', targetEmail: 't@x.com', detail: { role: 'unit_head' }, ip: '203.0.113.1' },
    )
    expect(captured).toMatchObject({
      actor_id: 'a1', actor_email: 'a@x.com', actor_role: 'ceo',
      action: 'user.invited', target_id: 't1', target_email: 't@x.com',
      detail: { role: 'unit_head' }, ip: '203.0.113.1',
    })
  })

  it('never throws when the insert errors (audit failure must not break the action)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      writeAuditLog(fakeAdmin(async () => ({ error: { message: 'db down' } })), { action: 'user.updated' }),
    ).resolves.toBeUndefined()
    spy.mockRestore()
  })

  it('never throws when the insert itself throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      writeAuditLog(fakeAdmin(async () => { throw new Error('boom') }), { action: 'user.updated' }),
    ).resolves.toBeUndefined()
    spy.mockRestore()
  })
})

describe('auditIp', () => {
  it('takes the left-most x-forwarded-for entry', () => {
    expect(auditIp(fakeHeaders({ 'x-forwarded-for': '203.0.113.9, 10.0.0.2' }))).toBe('203.0.113.9')
  })
  it('falls back to x-real-ip then null', () => {
    expect(auditIp(fakeHeaders({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4')
    expect(auditIp(fakeHeaders({}))).toBeNull()
  })
})
