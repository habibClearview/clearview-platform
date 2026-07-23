// ============================================================
// REMOVED ENDPOINT (tombstone) — /api/send-notification
//
// This route was intentionally retired on 2026-07-23 after a security audit.
// It had ZERO callers anywhere in the app (verified by grepping app/ and src/
// for `send-notification` — no fetch and no import references), and it was a
// dead email-sending path (sent mail from the company's verified domain). A
// live-but-unused email endpoint is pure attack surface, so its logic is gone.
//
// This tombstone stays only so any stray, cached, or malicious call fails
// LOUDLY with 410 Gone instead of 404-ing ambiguously — and so the removal is
// self-documenting. Do NOT add logic here: if notifications are needed again,
// build a fresh, narrowly-scoped, authenticated route.
// ============================================================
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'This endpoint has been removed.' }, { status: 410 })
}
