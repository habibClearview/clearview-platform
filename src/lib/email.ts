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
  /** A blind copy. Used to put a record of a client letter in Habib's own inbox. */
  bcc?: string | string[]
  subject: string
  html: string
  /** The plain-text alternative. Screen readers, text clients and archives. */
  text?: string
  replyTo?: string
  /**
   * Files sent with the message, content base64 encoded.
   *
   * Used for the calendar invitation, which has to arrive as a file the
   * calendar recognises. A link to an invitation is a thing somebody has to
   * act on; an invitation attached to the message is one their calendar
   * offers to accept.
   */
  attachments?: { filename: string; content: string; contentType?: string }[]
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
        ...(input.bcc ? { bcc: Array.isArray(input.bcc) ? input.bcc : [input.bcc] } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        ...(input.attachments?.length
          ? {
            attachments: input.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              ...(a.contentType ? { content_type: a.contentType } : {}),
            })),
          }
          : {}),
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
import { ninePoints, PRE_ENGAGEMENT_QUESTIONS } from '@/lib/gtcv-decision-points'

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
  audience?: 'payer' | 'served' | 'co_implementer'
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
// The PORTAL, not the marketing site. Both letters point at the same address:
// two different ones is how half the recipients end up in the wrong place.
const SIGN_IN_HOME = 'clearview.habibonifade.com'

/** The method paragraph, identical in both letters by design. */
function methodParagraph(org: string): string {
  return 'The method is the Grant-to-Commercial Viability Canvas™. The Canvas has nine sequential '
    + `decision points. Each decision point holds one decision, and each decision is made by ${org}. `
    + 'The engagement moves to the next gate once commercial evidence, internal and external, has been '
    + 'collected and judged to support that decision.'
}

/** The Charter paragraph. The second sentence is the position on method and materials. */
function charterParagraph(org: string, payerName: string | null, toPayer: boolean): string {
  const delivered = toPayer
    ? `while everything produced for ${org} within the assignment is delivered to ${payerName || 'the funder'} under the terms of the purchase order`
    : `while everything produced for ${org} within the assignment is delivered under the terms of the ${payerName ? `${payerName} ` : ''}purchase order`
  return 'The Charter records what each party commits to, how the work is run, and how decisions are made '
    + 'and recorded. It also records the position on method and materials: the Canvas and the ClearView '
    + `platform are existing assets of my practice, brought to this engagement and used under it, ${delivered}. `
    + 'The Charter is agreed and signed at inception, and you will receive it to review ahead of signature.'
}

function accessParagraph(): string {
  return 'The button below signs you in and invites you to set a password. You are welcome to look around '
    + 'immediately; the working sections open when the engagement begins. The platform stays at '
    + `${SIGN_IN_HOME} whenever you return to it.`
}

function signOff(cfg: EngagementEmailConfig): Block[] {
  return [
    { kind: 'p', text: 'I look forward to the meeting and to the work that follows it.' },
    { kind: 'p', text: 'With warm regards,' },
  ]
}

/** Ganiat joins for the duration, when there is a co-implementer on the engagement. */
function coImplementerSentence(brief: EngagementBrief): string {
  return brief.coImplementer
    ? ` ${brief.coImplementer} joins me as co-implementer for the duration.`
    : ''
}

/**
 * THE LETTER TO THE ORGANISATION PAYING FOR THE WORK.
 *
 * Habib's own wording, approved 8 September 2026. It leads on what the funder
 * is left holding at the close, because that is what they are buying, and it
 * says plainly that the record is assembled as the work proceeds rather than
 * reconstructed at the end.
 */
function payerBlocks(cfg: EngagementEmailConfig, brief: EngagementBrief): Block[] {
  const org = brief.servedName || cfg.clientName
  const payer = brief.payerName || 'your organisation'
  const programme = brief.payerProgramme
  const span = durationInWords(brief) || 'the engagement'
  const b: Block[] = []

  b.push({ kind: 'p', text: brief.welcomeIntro
    || `Thank you for your note, and for the confidence the award represents. I am glad to be working with `
      + `you, and I look forward to engaging with ${org} and your team over the ${span} ahead.`
      + coImplementerSentence(brief) })

  b.push({ kind: 'p', text: 'This note sets out how the work will run, what you will see, and when.' })

  b.push({ kind: 'h', text: 'What the engagement is designed to leave you with' })
  b.push({ kind: 'p', text:
    `At the close, ${payer} holds a documented chain running from a subsidised gender and nutrition service `
    + 'to signed commercial transactions: the decision taken at each stage, the evidence that supported it, '
    + `and the customer response that followed. That record is the proof that ${payer} supported a local `
    + 'service provider into commercial viability, and it is assembled as the work proceeds rather than '
    + 'reconstructed at the end.' })

  b.push({ kind: 'h', text: 'The method' })
  b.push({ kind: 'p', text: `The engagement is delivered through the Grant-to-Commercial Viability Canvas™. `
    + `The Canvas has nine sequential decision points. Each holds a single decision, and each decision is `
    + `made by ${org}. Commercial evidence, internal and external, is collected and judged at each point, `
    + `and the next gate opens once that evidence supports the decision. The `
    + `${brief.deliverables && brief.deliverables.length ? `${numberWord(brief.deliverables.length)} ` : ''}`
    + `deliverables in the scope of work are the products of these gates.` })

  b.push({ kind: 'p', text: 'The nine, in sequence:' })
  b.push({ kind: 'ul', items: ninePoints(org, false) })

  b.push({ kind: 'h', text: 'Before inception' })
  b.push({ kind: 'p', text:
    `We will hold one meeting between ${org}, ${payer} and me. It is short and has one purpose: to `
    + `establish what ${org} expects of this period and what each party is committing to it. I will ask `
    + 'three questions.' })
  b.push({ kind: 'ul', items: PRE_ENGAGEMENT_QUESTIONS })
  b.push({ kind: 'p', text:
    `${org}'s answers are recorded in their own words, without interpretation. They become the reference `
    + 'point the nine decisions are judged against, and the baseline the close-out report returns to. '
    + 'Inception follows once they are agreed.' })

  b.push({ kind: 'h', text: 'The Engagement Charter' })
  b.push({ kind: 'p', text: charterParagraph(org, brief.payerName || null, true) })

  b.push({ kind: 'h', text: 'While the engagement runs' })
  b.push({ kind: 'p', text:
    'Each decision point produces a progress report, signed off before it reaches you. The engagement '
    + `closes with a formal handover to ${org} and a close-out report.` })

  b.push({ kind: 'h', text: 'The platform' })
  b.push({ kind: 'p', text:
    'ClearView is where the work is delivered and recorded. Every decision, the evidence supporting it and '
    + 'the current position of the engagement are held there as the work proceeds. You can see where the '
    + 'engagement stands at any moment, without requesting a report.' })

  b.push({ kind: 'h', text: `What ${payer} can do on the platform` })
  b.push({ kind: 'ul', items: [
    'Read the progress report at each of the nine decision points',
    `Open any decision point and the evidence supporting it, in read-only form, across the service ${payer} is funding`,
    'Comment on any item you wish to question, and receive an answer on the record',
    'Receive an invitation to any remote working session you wish to attend',
    'Add as many of your team to the platform as you require',
  ] })

  b.push({ kind: 'h', text: 'Your access' })
  b.push({ kind: 'p', text: accessParagraph() })
  b.push(...signOff(cfg))
  return b
}

/**
 * THE LETTER TO THE ORGANISATION THE WORK IS DELIVERED TO.
 *
 * Habib's own wording, approved 8 September 2026. It asks for the chief
 * executive in the room and says why, and it tells them plainly what the funder
 * can see, so that is not discovered at the meeting.
 */
function servedBlocks(cfg: EngagementEmailConfig, brief: EngagementBrief): Block[] {
  const org = brief.servedName || cfg.clientName
  const payer = brief.payerName
  const span = durationInWords(brief) || 'the engagement'
  const b: Block[] = []

  b.push({ kind: 'p', text: brief.welcomeIntro
    || `I am glad to be working with you and your team. Over the next ${span} we will develop ${org}'s `
      + 'gender and nutrition services into offers that can be priced, sold and defended commercially.'
      + coImplementerSentence(brief) })

  b.push({ kind: 'h', text: 'The method' })
  b.push({ kind: 'p', text: methodParagraph(org) })
  b.push({ kind: 'p', text: 'The nine, in sequence:' })
  b.push({ kind: 'ul', items: ninePoints(org, true) })

  b.push({ kind: 'h', text: 'What you will hold at the close' })
  b.push({ kind: 'p', text:
    'Your services will be defined and packaged, the client segments they serve will be named, the pricing '
    + 'will be built from the true cost of delivery, and the services will have been tested with paying '
    + 'clients. The testing carries the greatest weight and asks the most of your organisation.' })

  b.push({ kind: 'h', text: 'What happens before we start' })
  b.push({ kind: 'p', text:
    `We will hold one meeting between you, ${payer || 'the funder'} and me, to agree what the engagement `
    + 'will produce and what it asks of each party. I will ask three questions.' })
  b.push({ kind: 'ul', items: PRE_ENGAGEMENT_QUESTIONS })
  b.push({ kind: 'p', text:
    'Your answers are recorded in your own words and become the reference point every later decision is '
    + 'judged against.' })
  b.push({ kind: 'p', text:
    'Your attendance in person is required. The nine decisions belong to the person who carries the '
    + 'organisation, and delegation at this stage has caused engagements to be restarted. The timeline does '
    + 'not allow for that.' })

  b.push({ kind: 'h', text: 'The Engagement Charter' })
  b.push({ kind: 'p', text: charterParagraph(org, payer || null, false)
    .replace('agreed and signed at inception, and you will receive it to review ahead of signature',
      'agreed and signed at the inception meeting. You will be able to read it, comment on it and download it before you sign') })

  b.push({ kind: 'h', text: 'The platform' })
  b.push({ kind: 'p', text:
    'ClearView holds each decision, the evidence supporting it and what remains outstanding. You can see the '
    + 'position of the engagement at any time.'
    + (payer ? ` As the funder of this service, ${payer} holds read-only access to the progress report at `
      + 'each decision point and to the evidence behind it, so the record you build is the record they see.' : '') })

  b.push({ kind: 'h', text: 'Your access' })
  b.push({ kind: 'p', text: accessParagraph() })
  b.push(...signOff(cfg))
  return b
}

function numberWord(n: number): string {
  return ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] || String(n)
}


/**
 * THE CO-IMPLEMENTER'S LETTER. 9 September 2026.
 *
 * Habib asked whether there is an email that shows the onboarding of a
 * co-implementer, just like the funders and the served clients. There was not.
 * The one person joining as a professional peer received the platform's stock
 * "you have been invited" and nothing about the work, which is the worst first
 * impression of the three.
 *
 * It is a different letter because they are in a different position. They are
 * not being sold to and they are not being served: they are delivering
 * alongside, so what they need is what the engagement is, what part of it is
 * theirs, what the method will not let them do, and what they can see. The
 * method paragraph and the nine points are shared with the other two letters
 * deliberately, because all three parties should be reading the same
 * description of the same work.
 */
function coImplementerBlocks(cfg: EngagementEmailConfig, brief: EngagementBrief): Block[] {
  const org = brief.servedName || cfg.clientName
  const payer = brief.payerName
  const span = durationInWords(brief) || 'the engagement'
  const b: Block[] = []

  b.push({ kind: 'p', text:
    `Thank you for agreeing to work on this engagement with me. Over the next ${span} we will develop `
    + `${org}'s services into offers that can be priced, sold and defended commercially, and you are `
    + 'delivering it alongside me.' })

  b.push({ kind: 'h', text: 'The method' })
  b.push({ kind: 'p', text: methodParagraph(org) })
  b.push({ kind: 'p', text: 'The nine, in sequence:' })
  b.push({ kind: 'ul', items: ninePoints(org, true) })

  b.push({ kind: 'h', text: 'What the method asks of you' })
  b.push({ kind: 'p', text:
    'Every decision rests on evidence recorded in the client\'s own words, so nothing is written up from '
    + 'memory afterwards and nothing is tidied. Where a session is recorded, the recording and the '
    + 'transcript belong to the engagement and are read and signed by the people who were there.' })
  b.push({ kind: 'p', text:
    'A gate closes when the evidence behind it is on the platform and the decision is signed. It does not '
    + 'close because the work was done.' })

  b.push({ kind: 'h', text: 'What you can see, and what you cannot' })
  b.push({ kind: 'p', text:
    `You have the same view of ${org}'s engagement as I do: the decisions, the evidence, the sessions and `
    + 'what is outstanding. The commercial terms between me and '
    + `${payer || 'the funder'} are not part of that view, and the cost mapping sessions are held under the `
    + 'method\'s own privacy protocol, which restricts them to the organisation\'s finance, human resources '
    + 'and leadership.' })

  b.push({ kind: 'h', text: 'The platform' })
  b.push({ kind: 'p', text:
    'ClearView holds each decision, the evidence supporting it and what remains outstanding. Your sign-in '
    + 'is below. There is nothing to install, and the sessions are held on the platform itself.' })

  b.push({ kind: 'p', text:
    'If anything here does not match what we agreed, tell me before the engagement opens rather than after.' })

  return b
}

/** The generated letter for one audience, as the text a person edits. */
export function letterText(cfg: EngagementEmailConfig): string {
  const brief = cfg.brief || {}
  const audience = cfg.audience || 'served'
  return blocksToText(
    audience === 'payer' ? payerBlocks(cfg, brief)
      : audience === 'co_implementer' ? coImplementerBlocks(cfg, brief)
        : servedBlocks(cfg, brief),
  )
}

export function buildScopeEmail(cfg: EngagementEmailConfig): { subject: string; html: string } {
  const brief = cfg.brief || {}
  const audience = cfg.audience || 'served'
  const subjectName = brief.servedName || cfg.clientName
  // Habib's own subjects: the organisation first, then the programme.
  const prog = brief.payerProgramme ? `, ${brief.payerProgramme}` : ''
  const subject = audience === 'payer'
    ? `${subjectName}${prog} — how the engagement will run`
    : audience === 'co_implementer'
      ? `${subjectName}${prog} — the engagement you are delivering with me`
      : `${subjectName}${prog ? ` and ${brief.payerProgramme}` : ''} — how we will work`

  // An edited letter is the letter. The generated one is only what he starts
  // from, and it is used when he has not written his own.
  const edited = audience === 'payer' ? brief.letterPayer
    : audience === 'co_implementer' ? brief.letterCoImplementer
      : brief.letterServed
  const paragraphs = edited && edited.trim()
    ? textToEmail(edited)
    : blocksToEmail(
      audience === 'payer' ? payerBlocks(cfg, brief)
        : audience === 'co_implementer' ? coImplementerBlocks(cfg, brief)
          : servedBlocks(cfg, brief),
    )

  const html = brandedEmail({
    heading: salutation(cfg.recipientName, cfg.recipientTitle) || 'Dear colleague,',
    paragraphs,
    // IT SAYS WHERE IT GOES. The button lands on their dashboard, so it says
    // dashboard. "Open the engagement" described a page and left the reader to
    // work out that the page was theirs.
    ctaLabel: cfg.signInIncluded ? 'Set your password and open your dashboard' : 'Open your dashboard',
    preheader: audience === 'payer'
      ? 'How the engagement runs, what you will be able to see, and your access.'
      : audience === 'co_implementer'
        ? 'What the engagement is, what the method asks of you, and your access.'
        : 'How we will work, what the nine decision points ask of you, and your access.',
    ctaUrl: cfg.journeyUrl,
    footNote: raw(`${escapeHtml(cfg.coachName)}<br/>Lead Practitioner<br/>The Canvas Coach | habibonifade.com${
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
