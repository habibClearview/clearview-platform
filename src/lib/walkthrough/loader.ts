// ============================================================
// WHAT A CLIENT WALKTHROUGH IS ALLOWED TO KNOW.
//
// The walkthrough link opens with no sign-in, so this is written the same way
// the showcase link is: an allowlist of the few fields that may leave, read on
// the server, with the page receiving only what comes back. There is no larger
// payload sitting behind it.
//
// WHAT MAY LEAVE
//   the organisation's short name, the funder's name, the programme's name,
//   the service being commercialised, the paying customer segment, the contract
//   dates and the milestone titles. All of it is wording the funder wrote or
//   agreed, and all of it is said out loud in the room this link is shown in.
//
// WHAT NEVER LEAVES. Every signature and who gave it. Every piece of evidence.
// Decisions, their wording and their status. Party names and email addresses.
// Fees, amounts, invoices and payment status. Nothing on this page is read from
// a client's working tables at all.
//
// The link only works while the engagement has it switched on, and a switched
// off link is a 404, not a message, because "this link is disabled" tells a
// stranger that the engagement exists.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { supabaseServiceKey, supabaseUrl } from '@/lib/supabase-env'
import { buildContext, type WalkthroughContext, type WalkthroughMilestone, type WalkthroughTimeline } from './context'

function admin() {
  const url = supabaseUrl()
  const key = supabaseServiceKey()
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/**
 * A date as the timeline axis writes it. Date-only values are read as the
 * calendar day they say, not shifted into whatever time zone the server is in,
 * which is how a 1 March contract start becomes 28 February on a page.
 */
export function axisDate(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  const [, y, mo, d] = m
  return `${Number(d)} ${MONTHS[Number(mo) - 1]} ${y}`
}

/** The month in the middle of the engagement, for the middle of the axis. */
export function middleLabel(start: string, end: string): string {
  const a = Date.parse(start + 'T12:00:00Z')
  const b = Date.parse(end + 'T12:00:00Z')
  if (!Number.isFinite(a) || !Number.isFinite(b)) return ''
  const mid = new Date((a + b) / 2)
  return `${MONTHS[mid.getUTCMonth()]} ${mid.getUTCFullYear()}`
}

const WORDS = ['no', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']

/** "Six months.", from the two contract dates. */
export function spanLabel(start: string, end: string): string {
  const a = new Date(start + 'T12:00:00Z')
  const b = new Date(end + 'T12:00:00Z')
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 'The engagement.'
  const months = Math.max(1, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
  if (months >= 24 && months % 12 === 0) {
    const years = months / 12
    return `${WORDS[years] || years} years.`
  }
  return `${WORDS[months] || months} months.`
}

/**
 * The milestones, from the deliverables the engagement already records. One
 * column per payment milestone, with the deliverables under it named in the
 * line beneath. Deliverables with no milestone number are left out rather than
 * guessed at.
 */
export function milestonesFrom(rows: any[]): WalkthroughMilestone[] {
  const byNumber = new Map<number, { label: string; titles: string[] }>()
  rows.forEach((r) => {
    const n = Number(r?.milestone_no)
    if (!Number.isFinite(n) || n <= 0) return
    const entry = byNumber.get(n) || { label: '', titles: [] }
    if (!entry.label) entry.label = String(r?.milestone_label || r?.code || `Milestone ${n}`).trim()
    const title = String(r?.title || '').trim()
    if (title) entry.titles.push(title)
    byNumber.set(n, entry)
  })
  return Array.from(byNumber.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, e]) => ({
      title: e.label,
      detail: e.titles.length ? e.titles.join(', ') + '.' : '',
    }))
}

export interface WalkthroughRecord {
  ctx: WalkthroughContext
  slug: string
}

/**
 * The client walkthrough for one link, or null when there is nothing to show.
 * Null covers every reason equally: no such link, the link switched off, or the
 * engagement gone. A stranger learns the same thing from all three, which is
 * nothing.
 */
export async function loadWalkthrough(slug: string, workspaceOrigin: string): Promise<WalkthroughRecord | null> {
  const wanted = String(slug || '').trim().toLowerCase()
  if (!wanted || !/^[a-z0-9-]{1,64}$/.test(wanted)) return null

  let db
  try { db = admin() } catch { return null }

  const { data: clientRow, error } = await db
    .from('engagement_clients')
    .select('id, name, slug, programme_id, start_date, expected_close, commercialised_service,'
      + ' walkthrough_enabled, walkthrough_slug, organisation_display_name,'
      + ' paying_customer_segment, close_phrase, portfolio_phrase')
    .eq('walkthrough_slug', wanted)
    .maybeSingle()
  if (error || !clientRow) return null
  // One row of wording, typed loosely on purpose: the generated types do not
  // know about the columns this change adds until they are regenerated.
  const client = clientRow as Record<string, any>
  if (client.walkthrough_enabled === false) return null

  let programmeName = ''
  let funder = ''
  if (client.programme_id) {
    const { data: programme } = await db
      .from('programmes').select('name, funder').eq('id', client.programme_id).maybeSingle()
    programmeName = String(programme?.name || '').trim()
    funder = String(programme?.funder || '').trim()
  }

  const { data: deliverables } = await db
    .from('engagement_deliverables')
    .select('code, title, milestone_no, milestone_label, sort_order')
    .eq('client_id', client.id)
    .order('milestone_no', { ascending: true })
    .order('sort_order', { ascending: true })

  const start = axisDate(client.start_date)
  const end = axisDate(client.expected_close)
  const milestones = milestonesFrom(deliverables || [])
  const timeline: WalkthroughTimeline | null = start && end && milestones.length
    ? {
      start,
      end,
      middle: middleLabel(String(client.start_date), String(client.expected_close)),
      span: spanLabel(String(client.start_date), String(client.expected_close)),
      milestones,
    }
    : null

  return {
    slug: wanted,
    ctx: buildContext({
      funder,
      org: client.organisation_display_name || client.name,
      service: client.commercialised_service,
      programme: programmeName,
      market: client.paying_customer_segment,
      close: client.close_phrase,
      portfolio: client.portfolio_phrase,
      timeline,
      // Screen 18. THE WORKSPACE, NOT THE PAGE ABOUT THE WORKSPACE.
      // 17 September 2026. This pointed at /engagement/<slug>, which is the
      // journey page: a description of the method with the organisation's name
      // on it. Habib, showing it: "it goes to the marketing screen ... that is
      // a problem, a massive one, it should go straight to Ikore workspace."
      // He is right. The moment after saying "here is what your keys open" is
      // not the moment to open a page that explains what the keys are for.
      // /dashboard/<slug> is the working record itself.
      //
      // It is an ordinary link the presenter clicks on the laptop, because a
      // browser will not open a tab on one computer because a phone asked it to.
      workspaceUrl: client.slug ? `${workspaceOrigin}/dashboard/${client.slug}` : '',
    }),
  }
}
