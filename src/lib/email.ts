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
  /** The plain-text alternative. Screen readers, text clients and archives. */
  text?: string
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
        ...(input.text ? { text: input.text } : {}),
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
export { escapeHtml, raw, render, type EmailText } from '@/lib/email-format'
import { escapeHtml, raw, render, type EmailText } from '@/lib/email-format'

// ─── Branded template ────────────────────────────────────────
// Inline hex colours (email clients do not support CSS variables), matching
// the existing OTP template: navy #1B2A41, cyan #00CCCC, cream #F5F0E8.


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
  /** The preview line shown beside the subject in an inbox. */
  preheader?: string
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
  // THE SECOND LINE IN THE INBOX. Without one, Gmail previews the first text
  // in the body, which is the salutation, so the list shows "Dear Mr Mercer,"
  // and nothing about why the letter is worth opening.
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}${
        '&#8203;&nbsp;'.repeat(60)
      }</div>`
    : ''
  return `${preheader}
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
import { type Block, blocksToText, blocksToEmail, textToEmail } from '@/lib/letter'

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
  /** Mr, Ms, Dr, whatever they are addressed as. */
  recipientTitle?: string
  /** True when the journey link IS this person's one-time sign-in link. */
  signInIncluded?: boolean
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
// The PORTAL, not the marketing site. habibonifade.com is rewritten by the
// middleware to the public site, so the old value sent a paying client to a
// landing page and asked them to find the sign-in link themselves.
const SIGN_IN_HOME = 'https://clearview.habibonifade.com'

/**
 * THE SENTENCE THE WHOLE METHOD RESTS ON.
 *
 * Written once and used in both letters, because the payer and the served
 * organisation being told two different versions of how a decision closes is
 * how a dispute starts in month four.
 */
function theCanvas(org: string): string {
  return `The canvas has nine sequential decision points. Each decision point contains one decision, `
    + `which is made by ${org}. The engagement moves to the next decision gate only after internal and `
    + `external commercial evidence has been collected and judged to support that decision.`
}

/**
 * THE LETTER TO THE ORGANISATION PAYING FOR THE WORK.
 *
 * They wrote the Scope of Work, so this does not recite it back to them. It
 * covers how the work is run, what it asks of both organisations, and what
 * they will be able to see.
 */
function payerBlocks(cfg: EngagementEmailConfig, brief: EngagementBrief): Block[] {
  const served = brief.servedName || cfg.clientName
  const programme = brief.payerProgramme || null
  const who = programme || brief.payerName || 'your organisation'
  const span = durationInWords(brief) || 'the engagement'
  const service = SERVICE_LABEL[(brief.services && brief.services[0]) || 'canvas']
  const b: Block[] = []

  b.push({ kind: 'p', text: brief.welcomeIntro
    || `I am glad to be working with you. I look forward to engaging with ${served} and your team over the next ${span}.` })

  b.push({ kind: 'p', text: `The method is the ${service} Canvas. ${theCanvas(served)}` })

  b.push({ kind: 'h', text: 'Before the engagement begins' })
  b.push({ kind: 'p', text:
    `We will hold one meeting with ${[programme, served].filter(Boolean).join(', ')} and me. `
    + `Its purpose is to agree the outputs of the engagement and the commitment each party is making, `
    + `including the time ${served}'s leadership will give to the work and what ${who} requires to see as it proceeds. `
    + `The engagement begins once that is agreed.` })

  b.push({ kind: 'h', text: 'The Engagement Charter' })
  b.push({ kind: 'p', text:
    'The Charter records what each party commits to, how the work is run, and how decisions are made and '
    + 'recorded. It is agreed and signed at the inception meeting. You will receive it to review before signature.' })

  b.push({ kind: 'h', text: 'While the engagement runs' })
  b.push({ kind: 'p', text:
    'Each decision point produces a progress report, which is signed off before it reaches you. '
    + 'At the close of the engagement there is a handover and a close out report.' })

  b.push({ kind: 'h', text: 'The platform' })
  b.push({ kind: 'p', text:
    'Clearview is where the work is delivered and recorded. Every decision, the evidence supporting it and '
    + 'the current position of the engagement are held there as the work proceeds. You can see the position '
    + 'of the engagement at any time without requesting a report.' })

  b.push({ kind: 'h', text: `What ${who} can do on the platform` })
  b.push({ kind: 'ul', items: [
    'Read the progress report at each of the nine decision points',
    'Open any decision point and the evidence supporting it, in read only form',
    'Comment on any item you wish to question, and receive an answer on the record',
    'Receive an invitation to any remote working session you wish to attend',
    'Add as many of your team to the platform as you require',
  ] })

  b.push({ kind: 'h', text: 'Your access' })
  b.push({ kind: 'p', text: cfg.signInIncluded
    ? 'The button below signs you in and asks you to set a password. You may look around immediately. '
      + `The working sections open when the engagement begins. The platform is at ${SIGN_IN_HOME.replace('https://', '')} `
      + 'whenever you return to it.'
    : `Go to ${SIGN_IN_HOME.replace('https://', '')} and press Clearview sign in. A separate email provides a `
      + 'temporary password for you to replace. You may look around immediately. The working sections open when '
      + 'the engagement begins.' })

  return b
}

/**
 * THE LETTER TO THE ORGANISATION THE WORK IS DELIVERED TO.
 *
 * This one asks for something: the chief executive's own time, in the room,
 * undelegated, on a timeline with no slack in it.
 */
function servedBlocks(cfg: EngagementEmailConfig, brief: EngagementBrief): Block[] {
  const org = brief.servedName || cfg.clientName
  const payer = brief.payerName || null
  const span = durationInWords(brief) || 'the engagement'
  const service = SERVICE_LABEL[(brief.services && brief.services[0]) || 'canvas']
  const b: Block[] = []

  b.push({ kind: 'p', text: brief.welcomeIntro
    || `I am glad to be working with you and your team. Over the next ${span} we will work together to develop `
      + `${org}'s services into offers that can be priced, sold and defended commercially.` })

  b.push({ kind: 'p', text: `The method is the ${service} Canvas. ${theCanvas(org)}` })

  b.push({ kind: 'p', text:
    `By the close of the engagement your services will be defined and packaged, the client segments they serve `
    + `will be named, the pricing will be built from the true cost of delivery, and the services will have been `
    + `tested with paying clients. The testing carries the greatest weight and requires the closest attention `
    + `from your organisation.` })

  b.push({ kind: 'h', text: 'The Engagement Charter' })
  b.push({ kind: 'p', text:
    'The Charter records what each party commits to, how the work is run, and how decisions are made and '
    + 'recorded. It is agreed and signed at the inception meeting. You will be able to read it, comment on it '
    + 'and download it before you sign.' })

  b.push({ kind: 'h', text: 'What happens before we start' })
  b.push({ kind: 'p', text:
    `We will hold one meeting with ${[payer, 'you'].filter(Boolean).join(', ')} and me, to agree what the `
    + `engagement will produce and what it asks of each party. Your attendance in person is required. The nine `
    + `decisions belong to the person who carries the organisation, and delegation at this stage has caused `
    + `engagements to be restarted. The timeline does not allow for that.` })

  b.push({ kind: 'h', text: 'The platform' })
  b.push({ kind: 'p', text:
    `Clearview holds each decision, the evidence supporting it and what remains outstanding. You can see the `
    + `position of the engagement at any time.`
    + (payer ? ` ${payer} sees the same record in read only form, so progress does not have to be written up for them.` : '') })

  b.push({ kind: 'h', text: 'Your access' })
  b.push({ kind: 'p', text: cfg.signInIncluded
    ? 'The button below signs you in and asks you to set a password. The pre-engagement material is available '
      + `to read now, and the remaining sections open as the work proceeds. The platform is at `
      + `${SIGN_IN_HOME.replace('https://', '')} whenever you return to it.`
    : `Go to ${SIGN_IN_HOME.replace('https://', '')} and press Clearview sign in. A separate email provides a `
      + 'temporary password for you to replace. The pre-engagement material is available to read now. The '
      + 'remaining sections open as the work proceeds.' })

  return b
}

/** The generated letter for one audience, as the text a person edits. */
export function letterText(cfg: EngagementEmailConfig): string {
  const brief = cfg.brief || {}
  return blocksToText((cfg.audience || 'served') === 'payer'
    ? payerBlocks(cfg, brief)
    : servedBlocks(cfg, brief))
}

export function buildScopeEmail(cfg: EngagementEmailConfig): { subject: string; html: string } {
  const brief = cfg.brief || {}
  const audience = cfg.audience || 'served'
  const subjectName = brief.servedName || cfg.clientName
  const subject = audience === 'payer'
    ? `${subjectName}: how the engagement will run, and your access`
    : `${subjectName}: how we will work, and your access`

  // An edited letter is the letter. The generated one is only what he starts
  // from, and it is used when he has not written his own.
  const edited = audience === 'payer' ? brief.letterPayer : brief.letterServed
  const paragraphs = edited && edited.trim()
    ? textToEmail(edited)
    : blocksToEmail(audience === 'payer' ? payerBlocks(cfg, brief) : servedBlocks(cfg, brief))

  const html = brandedEmail({
    heading: salutation(cfg.recipientName, cfg.recipientTitle) || 'Dear colleague,',
    paragraphs,
    ctaLabel: cfg.signInIncluded ? 'Set your password and open the engagement' : 'Open the engagement',
    preheader: audience === 'payer'
      ? 'How the engagement runs, what you will be able to see, and your access.'
      : 'How we will work, what the nine decision points ask of you, and your access.',
    ctaUrl: cfg.journeyUrl,
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
