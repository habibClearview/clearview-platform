// ============================================================
// Audit log helper — records a sensitive admin action to the audit_log table
// (see supabase/migrations/2026_07_19_audit_log.sql). Call from a route with a
// SERVICE-ROLE Supabase client after the action has succeeded.
//
// It NEVER throws into the request path: a failed audit write must not break
// (or roll back) the action being audited. Failures are logged instead.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuditEntry {
  actorId?: string | null
  actorEmail?: string | null
  actorRole?: string | null
  action: string
  targetId?: string | null
  targetEmail?: string | null
  detail?: Record<string, unknown> | null
  ip?: string | null
}

export async function writeAuditLog(admin: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    const { error } = await admin.from('audit_log').insert({
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      target_id: entry.targetId ?? null,
      target_email: entry.targetEmail ?? null,
      detail: entry.detail ?? null,
      ip: entry.ip ?? null,
    })
    if (error) console.error(`audit_log write failed (action=${entry.action}):`, error.message)
  } catch (e) {
    console.error(`audit_log write threw (action=${entry.action}):`, e)
  }
}

/** Best-effort client IP from proxy headers, for the audit row's `ip` field. */
export function auditIp(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || null
}
