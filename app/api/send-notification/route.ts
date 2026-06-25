import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
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

  const subjects: Record<string, string> = {
    gate_signed: `Gate signed off — ${engagement_title}`,
    gate_authorised: `Coach authorisation recorded — ${engagement_title}`,
    evidence_submitted: `Evidence submitted — ${engagement_title}`,
    dp_complete: `Decision Point complete — ${engagement_title}`,
  }

  const bodies: Record<string, string> = {
    gate_signed: `
      <p>Hi ${recipient_name || 'there'},</p>
      <p>The gate for <strong>${phase}</strong> in the <strong>${engagement_title}</strong> engagement has been signed off by the CEO.</p>
      <p>The next section is now unlocked and work can continue.</p>
      <p>Log in to the platform to view the updated progress.</p>
      <p style="color:#4A5A6A;font-size:12px;margin-top:32px;">Canvas Coach &mdash; habibonifade.com</p>
    `,
    gate_authorised: `
      <p>Hi ${recipient_name || 'there'},</p>
      <p>Progress on <strong>${phase}</strong> in <strong>${engagement_title}</strong> has been authorised by the lead consultant.</p>
      ${coach_note ? `<p><strong>Coach note:</strong> ${coach_note}</p>` : ''}
      <p>This authorisation is recorded in the platform and is visible to all parties including the Ignite funder view.</p>
      <p style="color:#4A5A6A;font-size:12px;margin-top:32px;">Canvas Coach &mdash; habibonifade.com</p>
    `,
    evidence_submitted: `
      <p>Hi ${recipient_name || 'there'},</p>
      <p>New evidence has been submitted for <strong>${phase}</strong> in the <strong>${engagement_title}</strong> engagement.</p>
      <p>Log in to review the submission.</p>
      <p style="color:#4A5A6A;font-size:12px;margin-top:32px;">Canvas Coach &mdash; habibonifade.com</p>
    `,
    dp_complete: `
      <p>Hi ${recipient_name || 'there'},</p>
      <p><strong>${phase}</strong> is now complete in the <strong>${engagement_title}</strong> engagement.</p>
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
        subject: subjects[trigger] || `Update — ${engagement_title}`,
        html: `
          <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
            <div style="background:#1B2A4A;padding:20px 24px;border-radius:8px 8px 0 0;border-bottom:3px solid #00B4D8;">
              <p style="margin:0;font-size:11px;color:#00B4D8;letter-spacing:1px;text-transform:uppercase;">Canvas Coach | habibonifade.com</p>
              <h1 style="margin:6px 0 0;font-size:18px;color:#FFFFFF;font-family:Georgia,serif;">${engagement_title}</h1>
            </div>
            <div style="background:#F8F4EE;padding:24px;border-radius:0 0 8px 8px;border:1px solid #D8E0E8;border-top:none;color:#1B2A4A;line-height:1.7;">
              ${bodies[trigger] || `<p>There is an update on the ${engagement_title} engagement.</p>`}
            </div>
          </div>
        `,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
