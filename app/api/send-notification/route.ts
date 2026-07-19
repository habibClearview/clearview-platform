import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken } from '@/lib/auth/api-authz'
import { escapeHtml } from '@/lib/escape-html'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email is not configured.' }, { status: 500 })
  }

  // This endpoint sends email from the company's verified domain to an
  // arbitrary recipient. It was previously unauthenticated (an open relay with
  // HTML injection). Restrict it to the platform admin, and escape every
  // interpolated field below.
  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: { user }, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: rp } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (!rp || rp.role !== 'super_coach') return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  // Sends email from the company domain — cap the send rate even for the admin.
  const rl = await checkRateLimit(admin, `send-notification:${user.id}`, 30, 3600)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many notifications sent. Please wait a while and try again.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { recipient_email, recipient_name, trigger, engagement_title, phase, coach_note } = body

  if (!recipient_email || !trigger || !engagement_title) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Escape everything that flows into the HTML body.
  const rn = escapeHtml(recipient_name || 'there')
  const et = escapeHtml(engagement_title)
  const ph = escapeHtml(phase)
  const cn = coach_note ? escapeHtml(coach_note) : ''

  const subjects: Record<string, string> = {
    gate_signed: `Gate signed off — ${et}`,
    gate_authorised: `Coach authorisation recorded — ${et}`,
    evidence_submitted: `Evidence submitted — ${et}`,
    dp_complete: `Decision Point complete — ${et}`,
  }

  const bodies: Record<string, string> = {
    gate_signed: `
      <p>Hi ${rn},</p>
      <p>The gate for <strong>${ph}</strong> in the <strong>${et}</strong> engagement has been signed off by the CEO.</p>
      <p>The next section is now unlocked and work can continue.</p>
      <p>Log in to the platform to view the updated progress.</p>
      <p style="color:#4A5A6A;font-size:12px;margin-top:32px;">Canvas Coach &mdash; habibonifade.com</p>
    `,
    gate_authorised: `
      <p>Hi ${rn},</p>
      <p>Progress on <strong>${ph}</strong> in <strong>${et}</strong> has been authorised by the lead consultant.</p>
      ${cn ? `<p><strong>Coach note:</strong> ${cn}</p>` : ''}
      <p>This authorisation is recorded in the platform and is visible to all parties including the Ignite funder view.</p>
      <p style="color:#4A5A6A;font-size:12px;margin-top:32px;">Canvas Coach &mdash; habibonifade.com</p>
    `,
    evidence_submitted: `
      <p>Hi ${rn},</p>
      <p>New evidence has been submitted for <strong>${ph}</strong> in the <strong>${et}</strong> engagement.</p>
      <p>Log in to review the submission.</p>
      <p style="color:#4A5A6A;font-size:12px;margin-top:32px;">Canvas Coach &mdash; habibonifade.com</p>
    `,
    dp_complete: `
      <p>Hi ${rn},</p>
      <p><strong>${ph}</strong> is now complete in the <strong>${et}</strong> engagement.</p>
      <p>Log in to the platform to see what has been completed and what comes next.</p>
      <p style="color:#4A5A6A;font-size:12px;margin-top:32px;">Canvas Coach &mdash; habibonifade.com</p>
    `,
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Canvas Coach <notifications@habibonifade.com>',
        to: [recipient_email],
        subject: subjects[trigger] || `Update — ${et}`,
        html: `
          <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
            <div style="background:#1B2A4A;padding:20px 24px;border-radius:8px 8px 0 0;border-bottom:3px solid #00B4D8;">
              <p style="margin:0;font-size:11px;color:#00B4D8;letter-spacing:1px;text-transform:uppercase;">Canvas Coach | habibonifade.com</p>
              <h1 style="margin:6px 0 0;font-size:18px;color:#FFFFFF;font-family:Georgia,serif;">${et}</h1>
            </div>
            <div style="background:#F8F4EE;padding:24px;border-radius:0 0 8px 8px;border:1px solid #D8E0E8;border-top:none;color:#1B2A4A;line-height:1.7;">
              ${bodies[trigger] || `<p>There is an update on the ${et} engagement.</p>`}
            </div>
          </div>
        `,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('send-notification Resend error:', err)
      return NextResponse.json({ error: 'Could not send the notification.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('send-notification error:', e)
    return NextResponse.json({ error: 'Could not send the notification.' }, { status: 500 })
  }
}
