// ============================================================
// Client-side actions for the engagement pages.
//
// One typed place for the journey and Charter pages to call the engagement
// API routes, so the buttons (comment, suggest, sign, send email, schedule)
// all go through the same authenticated path. Each call attaches the current
// Supabase session token as a Bearer header; the routes verify it and
// authorize the caller server-side.
// ============================================================
import { supabase } from '@/lib/supabase'
import type { CharterCommentKind, CharterCommentStatus, MeetingStatus } from '@/lib/engagement-types'

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function postJson(url: string, body: unknown, method: 'POST' | 'PATCH' = 'POST') {
  const res = await fetch(url, { method, headers: await authHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`)
  }
  return data
}

// ─── Charter comments and suggestions ────────────────────────
export function addCharterComment(input: {
  clientId: string
  charterId: string
  sectionKey?: string
  kind?: CharterCommentKind
  body: string
}) {
  return postJson('/api/charter-comment', input)
}

export function resolveCharterComment(input: {
  id: string
  clientId: string
  status: CharterCommentStatus
}) {
  return postJson('/api/charter-comment', input, 'PATCH')
}

// ─── Charter signing ─────────────────────────────────────────
// The signer's identity is resolved on the server from the engagement's party
// list, so the name is deliberately not sent from here. signerRole is what the
// screen believed the role to be; the route checks it against the party it
// resolved and refuses a mismatch rather than accepting the caller's word.
export function signCharter(input: {
  clientId: string
  charterId: string
  signerRole: string
  signatureMethod?: 'click' | 'typed'
  typedName?: string
  /** Set only when the lead consultant enters a signature given in the room. */
  onBehalfOfPartyId?: string
}) {
  return postJson('/api/charter-sign', input)
}

// ─── Engagement emails ───────────────────────────────────────
// Returns the route's JSON. When email is not configured the route responds
// with { ok:false, emailConfigured:false }, so the caller can fall back to
// sharing the journey link on screen rather than treat it as an error.
export async function sendEngagementEmail(input: {
  clientId: string
  stage: 'scope' | 'triparty'
  recipients: string[]
  journeyUrl: string
  /** Build it and hand it back instead of sending it. Same route, same builder. */
  preview?: boolean
  /** Whether this copy is for the organisation paying or the one served. */
  audience?: 'payer' | 'served'
  /** Their full name, so the letter opens "Dear Mr Morgan Mercer,". */
  recipientName?: string
  /** Mr, Ms, Dr — whatever they are addressed as. */
  recipientTitle?: string
}) {
  const res = await fetch('/api/engagement-email', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 || res.status === 403) {
    throw new Error(data?.error || 'You do not have permission to send this email')
  }
  // Any other failure is a failure. Returning the body on a 500 made the
  // screen say the email had gone when nothing had been sent, which is the
  // worst possible answer: the coach stops waiting for a reply that will
  // never come. The one case that is not a failure is email being switched
  // off, which the route answers with 200 and emailConfigured false.
  if (!res.ok) {
    throw new Error(data?.error || 'The email could not be sent. Try again.')
  }
  return data as {
    ok?: boolean; emailConfigured?: boolean; message?: string; reason?: string
    preview?: boolean; subject?: string; html?: string
  }
}

// ─── Meeting scheduling ──────────────────────────────────────
export function createMeeting(input: {
  clientId: string
  title?: string
  purpose?: string
  dpId?: string
  startsAt?: string
  endsAt?: string
  location?: string
  meetingUrl?: string
}) {
  return postJson('/api/engagement-meeting', input)
}

export function updateMeetingStatus(input: { id: string; clientId: string; status: MeetingStatus }) {
  return postJson('/api/engagement-meeting', input, 'PATCH')
}
