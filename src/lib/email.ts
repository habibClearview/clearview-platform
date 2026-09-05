// ============================================================
// Shared email sender for GtCV engagement emails.
//
// Generalises the proven Resend pattern already live in
// app/api/access-grant/[token]/route.ts (a direct fetch to the Resend
// API, gated on RESEND_API_KEY, degrading gracefully when the key is
// absent). That live route is left untouched; this is a reusable copy so
// the engagement emails and any future notifications share one path.
//
// Everything here is CONFIG driven. Recipients, subjects and the link all
// come from the engagement, so nothing is hardcoded to any one client.
// Copy is written in direct phrasing with no dashes.
// ============================================================

// Trimmed so a key pasted with a stray newline (an invalid HTTP header
// value) still works. Same guard as the live access-grant route.
function resendApiKey(): string {
  return (process.env.RESEND_API_KEY || '').trim()
}

/** True when outbound email is configured. Callers should degrade gracefully when false. */
export function emailAvailable(): boolean {
  return !!resendApiKey()
}

/** The one address every email from this platform comes from. */
export const FROM_ADDRESS = 'Canvas Coach <notifications@habibonifade.com>'

export interface SendEmailInput {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
}

export interface SendEmailResult {
  sent: boolean
  reason?: string
}

/**
 * Send one email through Resend. Returns { sent:false, reason } instead of
 * throwing when the key is missing, so a caller can carry on (for example
 * show the link on screen) rather than break the flow.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = resendApiKey()
  if (!key) return { sent: false, reason: 'RESEND_API_KEY is not configured' }

  const to = Array.isArray(input.to) ? input.to : [input.to]

  // A request with no ceiling can hold a serverless invocation open until the
  // platform kills it, and the caller never learns what happened.
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 15000)

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to,
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
      signal: abort.signal,
    })
    if (!res.ok) {
      // The provider's own text goes to the log. What comes back to a caller,
      // and from there possibly to a screen, says only that it did not send.
      const detail = await res.text().catch(() => '')
      console.error('sendEmail: provider rejected the request', res.status, detail)
      return { sent: false, reason: 'The email provider did not accept the message' }
    }
    return { sent: true }
  } catch (e) {
    console.error('sendEmail: request failed', e)
    return { sent: false, reason: 'The email provider could not be reached' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Escape text destined for an HTML email.
 *
 * Everything the template interpolates comes from somewhere a person typed:
 * an organisation name, a coach's name, a covering note. An ampersand in an
 * organisation name breaks the markup and a stray angle bracket does worse, so
 * text is escaped rather than trusted. Callers that genuinely need markup, for
 * example a list of gates, pass it through `raw`.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Mark a string as already-safe markup, so brandedEmail leaves it alone. */
export function raw(markup: string): { __html: string } {
  return { __html: markup }
}

function render(value: string | { __html: string } | undefined): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'object' && '__html' in value) return value.__html
  return escapeHtml(value)
}

// ─── Branded template ────────────────────────────────────────
// Inline hex colours (email clients do not support CSS variables), matching
// the existing OTP template: navy #1B2A41, cyan #00CCCC, cream #F5F0E8.

export type EmailText = string | { __html: string }

export interface BrandedEmailInput {
  heading: EmailText
  /**
   * Paragraphs of body text, in order. Plain strings are escaped. Pass
   * raw('...') for a paragraph that is deliberately markup.
   */
  paragraphs: EmailText[]
  ctaLabel?: string
  ctaUrl?: string
  footNote?: EmailText
}

export function brandedEmail(input: BrandedEmailInput): string {
  const body = input.paragraphs
    .map((p) => `<p style="margin:0 0 14px;">${render(p)}</p>`)
    .join('')
  // A link only goes in when its address is one a browser will follow safely.
  // A javascript: or data: address in a mail template is a way to hand a
  // reader something that is not the page they think they are opening.
  const safeCtaUrl = input.ctaUrl && /^https?:\/\//i.test(input.ctaUrl) ? input.ctaUrl : null
  const cta =
    input.ctaLabel && safeCtaUrl
      ? `<p style="margin:22px 0 6px;"><a href="${escapeHtml(safeCtaUrl)}" style="display:inline-block;background:#00767A;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">${escapeHtml(input.ctaLabel)}</a></p>`
      : ''
  const foot = input.footNote
    ? `<p style="color:#4A5A6A;font-size:13px;margin:18px 0 0;">${render(input.footNote)}</p>`
    : ''
  return `
    <div style="font-family:'Poppins','Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
      <div style="background:#1B2A41;padding:20px 24px;border-radius:8px 8px 0 0;border-bottom:3px solid #00CCCC;">
        <p style="margin:0;font-size:12.5px;color:#00CCCC;letter-spacing:1px;text-transform:uppercase;">The Canvas Coach</p>
        <p style="margin:4px 0 0;font-size:20px;color:#F5F0E8;font-family:'Poppins','Segoe UI',Helvetica,Arial,sans-serif;">Grant-to-Commercial Viability</p>
      </div>
      <div style="background:#F5F0E8;padding:26px 24px;border-radius:0 0 8px 8px;border:1px solid #D8E0E8;border-top:none;color:#1B2A41;line-height:1.6;">
        <h1 style="font-family:'Poppins','Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;margin:0 0 14px;">${render(input.heading)}</h1>
        ${body}
        ${cta}
        ${foot}
      </div>
      <p style="text-align:center;color:#8A94A0;font-size:12.5px;margin:16px 0 0;">Grant-to-Commercial Viability Canvas™ · The Canvas Coach · habibonifade.com</p>
    </div>`
}

import {
  type EngagementBrief, SERVICE_LABEL, SERVICE_SUMMARY,
  periodInWords, accessLines, openingSequence,
} from '@/lib/engagement-brief'

// ─── Engagement email builders (config driven) ───────────────

export interface EngagementEmailConfig {
  engagementTitle: string       // e.g. "IGNITE+ Nigeria"
  clientName: string       // e.g. "Ikore"
  coachName: string             // the lead consultant's name
  journeyUrl: string            // the link to the journey / charter
  recipientName?: string
  /** 'canvas' runs the nine Decision Points; 'financial' is the model-only mode. */
  engagementMode?: string
  /** What the signed Scope of Work and Purchase Order say. */
  brief?: EngagementBrief
  /** Who this copy is addressed to: the organisation paying, or the one served. */
  audience?: 'payer' | 'served'
  /** The person's own name, so the email opens with it. */
  recipientRoleLabel?: string
}

/**
 * "for Tanager on Tanager" is what you get when an engagement has no programme
 * and no brand override, because the title then falls back to the client's own
 * name. Say it once when they are the same thing.
 */
function onTitle(cfg: EngagementEmailConfig): string {
  const title = (cfg.engagementTitle || '').trim()
  const client = (cfg.clientName || '').trim()
  if (!title || title.toLowerCase() === client.toLowerCase()) return ''
  return ` on ${escapeHtml(title)}`
}

/**
 * Stage one email: from the coach to the client, setting out what the
 * engagement covers and sharing the link. Recipients are passed by the caller.
 */
export function buildScopeEmail(cfg: EngagementEmailConfig): { subject: string; html: string } {
  const brief = cfg.brief || {}
  const audience = cfg.audience || 'served'
  const client = escapeHtml(cfg.clientName)
  const payer = brief.payerName ? escapeHtml(brief.payerName) : null
  const served = escapeHtml(brief.servedName || cfg.clientName)
  const programme = brief.payerProgramme ? escapeHtml(brief.payerProgramme) : null
  const period = periodInWords(brief)
  const services = brief.services && brief.services.length
    ? brief.services
    : [cfg.engagementMode === 'financial' ? ('financial' as const) : ('canvas' as const)]

  // The payer is not the one whose platform it is. "Ikore: your engagement
  // platform is ready" is wrong in Tanager's inbox on the first word that
  // matters.
  const subjectName = brief.servedName || cfg.clientName
  const subject = audience === 'payer'
    ? `${subjectName}: the engagement platform is ready`
    : `${subjectName}: your engagement platform is ready`

  const ul = (items: string[]) =>
    `<ul style="margin:0 0 14px;padding-left:20px;">${
      items.map((i) => `<li style="margin:0 0 6px;">${i}</li>`).join('')
    }</ul>`

  const paragraphs: EmailText[] = []

  // Habib's own words come first when he has written any. The generated
  // opening is correct; it is not his voice, and this is a first impression.
  if (brief.welcomeIntro) {
    paragraphs.push(raw(escapeHtml(brief.welcomeIntro).replace(/\n+/g, '<br/>')))
  } else {
    paragraphs.push(raw(
      `I am glad to be working with you. This is the platform the engagement runs on, and this note says what it covers, who does what, and what happens first.`,
    ))
  }

  // WHO IS WHO. Named explicitly, because a payer told they are doing the
  // exercises, or an LSP told they are being invoiced, stops reading.
  const whoRows: string[] = []
  if (payer) {
    whoRows.push(`<b>${payer}</b> is the client commissioning and paying for this work${programme ? `, under ${programme}` : ''}.`)
  }
  whoRows.push(`<b>${served}</b> is the organisation the work is delivered to, and does the work of the engagement.`)
  whoRows.push('<b>Habib Onifade</b> is the lead practitioner.')
  paragraphs.push(raw('<b>Who is who</b>'), raw(ul(whoRows)))

  // THE SERVICE, BY NAME. Not "the platform" — the thing that was bought.
  paragraphs.push(
    raw(`<b>The service${services.length > 1 ? 's' : ''}${period ? `, ${escapeHtml(period)}` : ''}</b>`),
    raw(ul(services.map((s) => `<b>${escapeHtml(SERVICE_LABEL[s])}.</b> ${escapeHtml(SERVICE_SUMMARY[s])}`))),
  )

  if (brief.deliverables && brief.deliverables.length) {
    paragraphs.push(
      raw('<b>What it produces</b>'),
      raw(ul(brief.deliverables.map((d) => escapeHtml(d)))),
    )
  }

  // WHAT HAPPENS FIRST. The pre-engagement questions are the one meeting the
  // whole engagement is conditional on, so they lead.
  paragraphs.push(
    raw('<b>What happens first</b>'),
    raw(`<ol style="margin:0 0 14px;padding-left:20px;">${
      openingSequence({ ...brief, servedName: brief.servedName || cfg.clientName })
        .map((i) => `<li style="margin:0 0 6px;">${escapeHtml(i)}</li>`).join('')
    }</ol>`),
  )

  // ACCESS, FOR THIS READER. The payer and the served organisation get the
  // same email and must not get the same paragraph.
  paragraphs.push(
    raw(`<b>What ${audience === 'payer' ? (payer || 'you') : served} sees on the platform</b>`),
    raw(ul(accessLines(audience).map((l) => escapeHtml(l)))),
  )

  paragraphs.push(raw(
    'Your sign-in arrives in a separate email, which asks you to set a password. Nothing on the platform needs saving: every entry is recorded as it is made.',
  ))
  if (brief.reference) {
    paragraphs.push(raw(`<span style="color:#4A5A6A;">This engagement is under ${escapeHtml(brief.reference)}.</span>`))
  }

  const html = brandedEmail({
    heading: cfg.recipientName ? `${cfg.recipientName},` : 'Welcome,',
    paragraphs,
    ctaLabel: 'Open the engagement',
    ctaUrl: cfg.journeyUrl,
    footNote: `Sent by ${escapeHtml(cfg.coachName)}, The Canvas Coach. Reply to this email if anything here does not open.`,
  })
  return { subject, html }
}

/**
 * Stage two email: to all parties together, once scope is agreed, pointing
 * them to the Charter to review and sign.
 */
export function buildTriPartyEmail(cfg: EngagementEmailConfig): { subject: string; html: string } {
  const subject = `${cfg.engagementTitle}: Engagement Charter ready to review`
  const html = brandedEmail({
    heading: 'The Engagement Charter is ready',
    paragraphs: [
      raw(`The Engagement Charter for <b>${escapeHtml(cfg.clientName)}</b>${onTitle(cfg)} is ready for all parties to review.`),
      `It sets out how we work together, the evidence standard every decision meets, and what the engagement asks of each party. Open it below. You can comment or suggest a change on any section before signing.`,
    ],
    ctaLabel: 'Review the Charter',
    ctaUrl: cfg.journeyUrl,
    footNote: `Sent by ${cfg.coachName}, The Canvas Coach.`,
  })
  return { subject, html }
}
