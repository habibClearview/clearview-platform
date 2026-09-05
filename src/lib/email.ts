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
  type EngagementBrief, SERVICE_LABEL,
  periodInWords, durationInWords, salutation,
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
  /** Mr, Ms, Dr — whatever they are addressed as. */
  recipientTitle?: string
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
const SIGN_IN_HOME = 'https://habibonifade.com'

/** A bulleted list, already-safe HTML in, HTML out. */
function ul(items: string[]): string {
  return `<ul style="margin:0 0 14px;padding-left:20px;">${
    items.map((i) => `<li style="margin:0 0 7px;">${i}</li>`).join('')
  }</ul>`
}

/**
 * THE LETTER TO THE ORGANISATION PAYING FOR THE WORK.
 *
 * They commissioned it and they wrote the Scope of Work, so this does not tell
 * them what is in it. What they have not seen is how the work is actually run,
 * what it will ask of both organisations, and what they will be able to watch
 * from where they sit. That is the whole letter.
 */
function payerLetter(cfg: EngagementEmailConfig, brief: EngagementBrief): EmailText[] {
  const served = escapeHtml(brief.servedName || cfg.clientName)
  const programme = brief.payerProgramme ? escapeHtml(brief.payerProgramme) : null
  const span = durationInWords(brief) || 'the engagement'
  const serviceName = escapeHtml(SERVICE_LABEL[(brief.services && brief.services[0]) || 'canvas'])
  const p: EmailText[] = []

  p.push(raw(
    brief.welcomeIntro
      ? escapeHtml(brief.welcomeIntro).replace(/\n+/g, '<br/>')
      : `I am glad to be working with you, and I look forward to engaging with ${served} and your team over the next ${escapeHtml(span)}.`,
  ))

  p.push(raw(
    `The work runs on the <b>${serviceName}</b> method. It takes services an organisation already delivers and turns them into offers that can be priced, sold and defended commercially — the segments named, the value proposition sharpened, the pricing built off real costs, and the whole thing tested with paying clients rather than argued about on paper.`,
  ))

  p.push(raw('<b>How it runs</b>'), raw(ul([
    `<b>Before it starts.</b> One meeting with ${programme ? `${programme}, ` : ''}${served} and me together. We agree what the outputs will be and what each side is committing — the time ${served}&rsquo;s leadership will give it, and what ${programme || 'you'} needs to see along the way. The engagement does not begin until that is settled, and it is the meeting everything after depends on.`,
    `<b>While it runs.</b> Nine decisions, taken in sequence. Each one is ${served}&rsquo;s decision, signed by their leadership, on evidence recorded at the time. Nothing moves to the next decision until the one before it is signed, so progress is never a matter of opinion.`,
    `<b>When it closes.</b> A handover so the work keeps running without me, and a close-out report.`,
  ])))

  p.push(raw(
    `<b>The platform is how the work is delivered</b>, not a report written about it afterwards. Every decision, the evidence behind it and where the work stands is on Clearview as it happens. That is what lets you see the engagement without having to ask anyone how it is going.`,
  ))

  p.push(raw(`<b>What ${programme || 'you'} will be able to do</b>`), raw(ul([
    'Read the progress report at each of the nine decisions, signed off before it reaches you',
    'Open any decision and the evidence behind it, read only',
    'Comment wherever you want something questioned, and get it answered on the record',
    'An invitation to any remote working session you want to sit in on, and everything a session produces on the record afterwards',
    'Add as many of your team as you like, so nobody is waiting on one person to forward things',
  ])))

  p.push(raw(
    `<b>Your access starts today.</b> Go to <a href="${SIGN_IN_HOME}" style="color:#00767A;">habibonifade.com</a> and press <b>Clearview sign in</b>. A separate email gives you a temporary password to set your own. You will be able to look around straight away; the working areas open when the engagement does.`,
  ))

  return p
}

/**
 * THE LETTER TO THE ORGANISATION THE WORK IS DELIVERED TO.
 *
 * A different letter, not a variant of the one above. This one is asking for
 * something: the chief executive's own time, in the room, undelegated, on a
 * timeline that does not have slack in it. If that is not understood at the
 * start it is discovered in month three, which is too late.
 */
function servedLetter(cfg: EngagementEmailConfig, brief: EngagementBrief): EmailText[] {
  const org = escapeHtml(brief.servedName || cfg.clientName)
  const payer = brief.payerName ? escapeHtml(brief.payerName) : null
  const span = durationInWords(brief) || 'the engagement'
  const serviceName = escapeHtml(SERVICE_LABEL[(brief.services && brief.services[0]) || 'canvas'])
  const p: EmailText[] = []

  p.push(raw(
    brief.welcomeIntro
      ? escapeHtml(brief.welcomeIntro).replace(/\n+/g, '<br/>')
      : `I am glad to be working with you and your team. Over the next ${escapeHtml(span)} we will work through this together — not me delivering something to ${org}, but the two of us building services ${org} can sell and go on selling after I have gone.`,
  ))

  p.push(raw(
    `The method is <b>${serviceName}</b>. By the end of it your services will be defined and packaged, the client segments they are for will be named, the pricing will be built from what delivery actually costs you, and the services will have been tested with real paying clients. That last part is the one that makes the difference, and it is also the one that needs your organisation&rsquo;s attention most.`,
  ))

  p.push(raw('<b>Nine decisions, and why they are yours</b>'))
  p.push(raw(
    `The engagement turns on nine decisions, taken in order. Each one is a decision <b>${org}</b> makes and signs — not a recommendation I hand you. None of them can be signed without evidence recorded behind it, so a decision can always be justified later, or revisited when the evidence changes. And the work does not move past a decision until you are satisfied with it. That is the whole safeguard: nothing is built on a decision you were not comfortable making.`,
  ))

  p.push(raw('<b>What happens before we start</b>'))
  p.push(raw(
    `One meeting, with ${payer ? `${payer}, ` : ''}you and me, to agree what the engagement will produce and what it will ask of each of us. <b>It needs you personally, not a delegate.</b> The nine decisions belong to the person who carries the organisation, and every engagement that has been delegated at this point has had to be restarted at it. The timeline we are working to has no room for that.`,
  ))

  p.push(raw(
    `<b>The platform is where the work lives.</b> Clearview holds each decision, the evidence behind it and what is outstanding, so at any point you can see exactly where the engagement stands rather than waiting for a report. ${payer ? `${payer} sees the same picture, read only, which means progress is never something you have to write up for them.` : ''}`,
  ))

  p.push(raw(
    `<b>You can look around today.</b> Go to <a href="${SIGN_IN_HOME}" style="color:#00767A;">habibonifade.com</a> and press <b>Clearview sign in</b>. A separate email gives you a temporary password to set your own. The pre-engagement material is there to read now; the rest opens as we work through it.`,
  ))

  return p
}

export function buildScopeEmail(cfg: EngagementEmailConfig): { subject: string; html: string } {
  const brief = cfg.brief || {}
  const audience = cfg.audience || 'served'
  const subjectName = brief.servedName || cfg.clientName
  const subject = audience === 'payer'
    ? `${subjectName}: how the engagement will run, and your access`
    : `${subjectName}: how we will work, and your access`

  const html = brandedEmail({
    // A client is written to by name. A bare first name reads as talking down
    // to them, and no salutation at all is better than the wrong one.
    heading: salutation(cfg.recipientName, cfg.recipientTitle) || 'Dear colleague,',
    paragraphs: audience === 'payer' ? payerLetter(cfg, brief) : servedLetter(cfg, brief),
    ctaLabel: 'Open the engagement',
    ctaUrl: cfg.journeyUrl,
    // raw, because footNote is escaped like every other string: a signature
    // written as plain text arrives with its own <br/> tags showing.
    footNote: raw(`${escapeHtml(cfg.coachName)}<br/>Lead Practitioner, The Canvas Coach${
      brief.reference ? `<br/><span style="color:#8A94A0;">${escapeHtml(brief.reference)}</span>` : ''
    }`),
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
