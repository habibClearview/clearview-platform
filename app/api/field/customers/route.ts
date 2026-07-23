// ============================================================
// REMOVED ENDPOINT (tombstone) — /api/field/customers
//
// This route was intentionally retired on 2026-07-23 after a security audit.
// It had ZERO callers anywhere in the app (verified by grepping app/ and src/):
// the field PWA (app/field/page.tsx) uses field/auth, field/history,
// field/stock and field/sync, and named customers are created via field/sync —
// this list/create endpoint was never used. Removing its live handlers cuts
// unused attack surface.
//
// This tombstone stays only so any stray or malicious call fails LOUDLY with
// 410 Gone and the removal is self-documenting. Do NOT add logic here; build a
// fresh, token-scoped route if field customer management is ever needed.
// ============================================================
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ error: 'This endpoint has been removed.' }, { status: 410 })
}

export async function POST() {
  return NextResponse.json({ error: 'This endpoint has been removed.' }, { status: 410 })
}
