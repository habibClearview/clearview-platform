// ============================================================
// API ROUTE: /api/access-grant/[token]
// Redeems a coach-issued external access token -- an investor,
// programme officer, DFI, or subscriber visiting the link a coach
// handed them, with no ClearView login of their own. Uses the
// service-role key and so bypasses RLS entirely, exactly like the
// existing field-sync and provider-webhook routes; the coach-side
// management of these grants (create/list/revoke) goes through the
// ordinary browser Supabase client instead, scoped by RLS (see
// supabase/migrations/2026_07_13_client_access_grants.sql,
// 2026_07_13_access_grants_portfolio_scope.sql and
// 2026_07_14_access_grant_otp.sql).
//
// GET returns grant metadata ONLY -- enough for the public /access/[token]
// page to render a "you've been granted access to X" screen and an email
// field, never the underlying data.
//
// POST redeems the grant. When RESEND_API_KEY is configured (otpAvailable),
// this is a real two-step verification: step 'request' emails a one-time
// code to the visitor's email (checked against grantee_email first, if the
// coach set one), step 'verify' checks the code and only then returns the
// document. A code proves the visitor actually controls that inbox --
// stronger than the plain email-match check this replaces, which anyone
// could satisfy just by typing the right string.
//
// If RESEND_API_KEY is NOT configured, this falls back to the previous,
// single-step direct email-match behaviour (a "step" in the request body
// is simply ignored) rather than breaking every external link until the
// coach sets up email sending -- see GET's otpAvailable flag, which is
// what the public page uses to decide which flow to render.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { buildInvestmentBrief } from '@/lib/investment-brief-builder'
import { loadAllClientSnapshots, buildPortfolioViewData } from '@/lib/portfolio-snapshot-loader'
import { buildPortfolioBrief } from '@/lib/portfolio-brief-builder'
import {
  isGrantActive, grantStatus, emailSatisfiesGrant, requiresEmailConfirmation,
  generateOtpCode, otpExpiryFromNow, isOtpValid, otpAttemptsExceeded,
  GRANT_TYPE_LABELS, GRANT_SCOPE_LABELS, type GrantSegmentFilter,
} from '@/lib/access-grants'
import type { SegmentFilter } from '@/lib/portfolio-intelligence'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel environment variables.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Trimmed so a key pasted with a stray trailing newline/space (which makes an
// invalid HTTP header value) still works -- a very easy mistake to make when
// copying a secret into a hosting dashboard.
function resendApiKey() {
  return (process.env.RESEND_API_KEY || '').trim()
}

function otpAvailable() {
  return !!resendApiKey()
}

async function sendOtpEmail(toEmail: string, code: string, granteeName: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Canvas Coach <notifications@habibonifade.com>',
      to: [toEmail],
      subject: `Your access code: ${code}`,
      html: `
        <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <div style="background:#1B2A41;padding:20px 24px;border-radius:8px 8px 0 0;border-bottom:3px solid #00CCCC;">
            <p style="margin:0;font-size:11px;color:#00CCCC;letter-spacing:1px;text-transform:uppercase;">Canvas Coach | ClearView</p>
          </div>
          <div style="background:#F5F0E8;padding:24px;border-radius:0 0 8px 8px;border:1px solid #D8E0E8;border-top:none;color:#1B2A41;line-height:1.6;">
            <p>Hi ${granteeName || 'there'},</p>
            <p>Use this code to open the link you were sent. It expires in 15 minutes.</p>
            <p style="font-size:32px;font-weight:700;letter-spacing:6px;text-align:center;margin:20px 0;">${code}</p>
            <p style="color:#4A5A6A;font-size:13px;">If you didn't request this, you can ignore this email.</p>
          </div>
        </div>
      `,
    }),
  })
  if (!res.ok) throw new Error(`Could not send the access code (${await res.text()})`)
}

async function loadGrantOrThrow(admin: ReturnType<typeof getAdminClient>, token: string) {
  const { data: grant } = await admin.from('client_access_grants').select('*').eq('access_token', token).maybeSingle()
  if (!grant) throw Object.assign(new Error('This link is not valid.'), { status: 404 })

  const now = new Date().toISOString()
  if (!isGrantActive(grant, now)) {
    const status = grantStatus(grant, now)
    const message = status === 'revoked'
      ? 'This link has been revoked and is no longer active.'
      : 'This link has expired.'
    throw Object.assign(new Error(message), { status: 410 })
  }
  return grant
}

async function serveGrantContent(admin: ReturnType<typeof getAdminClient>, grant: any) {
  if (grant.scope_type === 'client') {
    if (!grant.client_id) throw Object.assign(new Error('This link has no business attached to it.'), { status: 500 })
    const { buffer, fileName } = await buildInvestmentBrief(grant.client_id)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  }

  // scope_type 'portfolio' or 'segment': same aggregation the coach's own
  // dashboard uses, filtered the same way -- see
  // src/lib/portfolio-snapshot-loader.ts. A 'portfolio' grant passes no
  // filter (the whole portfolio); a 'segment' grant's filter was fixed by
  // the coach at grant-creation time, never chosen by the visitor.
  const snapshots = await loadAllClientSnapshots(admin)
  const filter: SegmentFilter | null = grant.scope_type === 'segment' ? (grant.segment_filter || null) : null
  const data = buildPortfolioViewData(snapshots, filter)
  const { buffer, fileName } = await buildPortfolioBrief(data, grant.scope_type as 'portfolio' | 'segment', filter)
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}

// The interactive online view: same authorization as the download, but returns
// the scoped PortfolioViewData as JSON so the public page can render a live,
// read-only Market Intelligence dashboard instead of only a Word download.
// A 'client'-scope grant (a single business's Investment Brief) has no portfolio
// view -- the page falls back to the Word download for those.
async function serveGrantView(admin: ReturnType<typeof getAdminClient>, grant: any) {
  if (grant.scope_type === 'client') {
    return NextResponse.json({ scopeType: 'client', viewAvailable: false })
  }
  const snapshots = await loadAllClientSnapshots(admin)
  const filter: SegmentFilter | null = grant.scope_type === 'segment' ? (grant.segment_filter || null) : null
  const data = buildPortfolioViewData(snapshots, filter)
  let scopeDescription = 'Whole portfolio'
  if (grant.scope_type === 'segment' && grant.segment_filter) {
    const f: GrantSegmentFilter = grant.segment_filter
    const parts = [f.sector, f.country, f.readinessStage].filter(Boolean)
    if (parts.length > 0) scopeDescription = `Segment: ${parts.join(' · ')}`
  }
  return NextResponse.json({ scopeType: grant.scope_type, viewAvailable: true, scopeDescription, data })
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const { token } = params
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    const admin = getAdminClient()
    const grant = await loadGrantOrThrow(admin, token)

    let scopeDescription = GRANT_SCOPE_LABELS[grant.scope_type as keyof typeof GRANT_SCOPE_LABELS] || 'Access'
    if (grant.scope_type === 'segment' && grant.segment_filter) {
      const f: GrantSegmentFilter = grant.segment_filter
      const parts = [f.sector, f.country, f.readinessStage].filter(Boolean)
      if (parts.length > 0) scopeDescription = `Segment: ${parts.join(' · ')}`
    }

    return NextResponse.json({
      granteeName: grant.grantee_name,
      grantTypeLabel: GRANT_TYPE_LABELS[grant.grant_type as keyof typeof GRANT_TYPE_LABELS] || grant.grant_type,
      scopeType: grant.scope_type,
      scopeDescription,
      requiresEmail: requiresEmailConfirmation(grant),
      otpAvailable: otpAvailable(),
    })
  } catch (err: any) {
    // 4xx errors here are thrown deliberately with visitor-safe messages
    // (e.g. "This link has expired"). Anything else is unexpected — log it and
    // return a generic message rather than leaking raw detail to the public page.
    const status = err?.status || 500
    if (status >= 500) { console.error('Access grant GET error:', err); return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 }) }
    return NextResponse.json({ error: err.message || 'Request could not be completed.' }, { status })
  }
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const { token } = params
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    const { step, email, code, format } = await req.json().catch(() => ({})) as { step?: 'request' | 'verify'; email?: string; code?: string; format?: 'view' | 'download' }
    const serve = (admin: ReturnType<typeof getAdminClient>, grant: any) => format === 'view' ? serveGrantView(admin, grant) : serveGrantContent(admin, grant)

    const admin = getAdminClient()
    const grant = await loadGrantOrThrow(admin, token)

    // No email service configured -- fall back to the plain email-match
    // check rather than breaking every external link. GET's otpAvailable
    // flag is what tells the public page not to offer the two-step flow
    // in the first place, so this path is what actually runs for it.
    if (!otpAvailable()) {
      if (requiresEmailConfirmation(grant)) {
        if (!email) return NextResponse.json({ error: 'Enter the email address this link was sent to.', requiresEmail: true }, { status: 401 })
        if (!emailSatisfiesGrant(grant, email)) {
          return NextResponse.json({ error: "That email doesn't match the one this link was sent to.", requiresEmail: true }, { status: 401 })
        }
      }
      const now = new Date().toISOString()
      await admin.from('client_access_grants').update({
        last_accessed_at: now,
        ...(grant.email_confirmed_at ? {} : { email_confirmed_at: now }),
      }).eq('id', grant.id)
      return serve(admin, grant)
    }

    if (step === 'request') {
      if (!email) return NextResponse.json({ error: 'Enter your email address.' }, { status: 400 })
      if (requiresEmailConfirmation(grant) && !emailSatisfiesGrant(grant, email)) {
        return NextResponse.json({ error: "That email doesn't match the one this link was sent to." }, { status: 401 })
      }
      const now = new Date()
      const otpCode = generateOtpCode()
      await admin.from('client_access_grants').update({
        otp_code: otpCode, otp_email: email.trim().toLowerCase(),
        otp_expires_at: otpExpiryFromNow(now.getTime()), otp_attempts: 0,
      }).eq('id', grant.id)
      await sendOtpEmail(email.trim(), otpCode, grant.grantee_name)
      return NextResponse.json({ otpSent: true })
    }

    if (step === 'verify') {
      if (!email || !code) return NextResponse.json({ error: 'Enter the code sent to your email.' }, { status: 400 })
      if (otpAttemptsExceeded(grant)) {
        return NextResponse.json({ error: 'Too many incorrect attempts. Request a new code.', expired: true }, { status: 429 })
      }
      const now = new Date().toISOString()
      const emailMatches = (grant.otp_email || '') === email.trim().toLowerCase()
      if (!emailMatches || !isOtpValid(grant, code, now)) {
        await admin.from('client_access_grants').update({ otp_attempts: (grant.otp_attempts || 0) + 1 }).eq('id', grant.id)
        return NextResponse.json({ error: 'That code is incorrect or has expired.' }, { status: 401 })
      }
      await admin.from('client_access_grants').update({
        otp_code: null, otp_email: null, otp_expires_at: null, otp_attempts: 0,
        last_accessed_at: now,
        ...(grant.email_confirmed_at ? {} : { email_confirmed_at: now }),
      }).eq('id', grant.id)
      return serve(admin, grant)
    }

    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  } catch (err: any) {
    console.error('Access grant redemption error:', err)
    // Keep visitor-safe 4xx messages; genericise unexpected 5xx errors.
    const status = err?.status || 500
    if (status >= 500) return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
    return NextResponse.json({ error: err.message || 'Request could not be completed.' }, { status })
  }
}
