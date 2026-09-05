// ============================================================
// READING A SCOPE OF WORK AND A PURCHASE ORDER
//
// Best-effort extraction of the handful of facts the welcome letter needs from
// the documents that were signed. It is a PREFILL, not a parser anybody should
// trust: the coach sees every field it filled and corrects it before saving,
// because a purchase order is a legal document and a confident wrong date in a
// first letter to a client is worse than an empty box.
//
// So the rules here are deliberately conservative. Anything it is not sure of
// it leaves alone rather than guessing, and everything it does return is
// something a person can see and overwrite on the screen.
// ============================================================

export interface TorFields {
  reference?: string
  periodStart?: string
  periodEnd?: string
  deliverables?: string[]
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

/** "7 September 2026" -> "2026-09-07". Nothing when it is not a real date. */
export function parseLongDate(input: string): string | undefined {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(input || '')
  if (!m) return undefined
  const day = Number(m[1])
  const month = MONTHS[m[2].toLowerCase()]
  const year = Number(m[3])
  if (month === undefined || day < 1 || day > 31) return undefined
  const d = new Date(Date.UTC(year, month, day))
  if (d.getUTCMonth() !== month || d.getUTCDate() !== day) return undefined
  return d.toISOString().slice(0, 10)
}

/**
 * The period of performance. Written on a purchase order as a range with an
 * en dash, an em dash or the word "to", so all three are accepted.
 */
export function findPeriod(text: string): { periodStart?: string; periodEnd?: string } {
  const near = /period\s+of\s*\n?\s*performance[^\n]*\n?([^\n]*)/i.exec(text)
  const line = near ? near[1] : ''
  const source = /\d{1,2}\s+[A-Za-z]+\s+\d{4}/.test(line) ? line : text
  const range = /(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*(?:[–—-]|to)\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/.exec(source)
  if (!range) return {}
  const periodStart = parseLongDate(range[1])
  const periodEnd = parseLongDate(range[2])
  if (!periodStart || !periodEnd || periodEnd < periodStart) return {}
  return { periodStart, periodEnd }
}

/** "Order no 149" on a purchase order becomes "Purchase Order 149". */
export function findReference(text: string): string | undefined {
  const order = /order\s*(?:no|number|#)\.?\s*[:.]?\s*(\d{1,8})\b/i.exec(text)
  if (order) return `Purchase Order ${order[1]}`
  const tor = /\b(ToR\s*[\w/-]{2,20})/i.exec(text)
  if (tor) return tor[1].trim()
  return undefined
}

/**
 * The deliverables, from the numbered list under the heading that names them.
 * Stops at the next heading, because a purchase order follows its deliverables
 * with payment milestones and terms, and those are not deliverables.
 */
export function findDeliverables(text: string): string[] {
  const head = /(?:reports?\s*\/?\s*deliverables|deliverables\s+include)\s*[:.]?/i.exec(text)
  if (!head) return []
  const after = text.slice(head.index + head[0].length)
  // Cut at whatever follows the list. A purchase order puts payment milestones
  // and terms straight after its deliverables, and those are not deliverables.
  // Two rules, because one of them has to be case SENSITIVE: a following
  // section heading is written in capitals ("7. LEVEL OF EFFORT"), and under an
  // /i flag [A-Z] also matches lowercase, which cut the list off at its own
  // first item.
  const stopAny = /(?:payment\s+milestone|terms\s*[:.]|level\s+of\s+effort|billing\s*\/?\s*invoicing|qualifications)/i.exec(after)
  const stopHeading = /\d{1,2}\.\s+[A-Z]{4,}/.exec(after)
  const ends = [stopAny?.index, stopHeading?.index].filter((i): i is number => typeof i === 'number')
  const body = after.slice(0, ends.length ? Math.min(...ends) : 2500)

  // PDF text arrives as one long line per page, so the numbering is the only
  // separator there is — newlines cannot be relied on to find the boundaries.
  const marker = /(?:^|\s)(\d{1,2}(?:\.\d{1,2})?)[.)]\s+/g
  const cuts: { at: number; after: number }[] = []
  let m: RegExpExecArray | null
  while ((m = marker.exec(body)) !== null) cuts.push({ at: m.index, after: marker.lastIndex })
  if (!cuts.length) return []

  const items: string[] = []
  for (let i = 0; i < cuts.length && items.length < 12; i++) {
    const slice = body.slice(cuts[i].after, i + 1 < cuts.length ? cuts[i + 1].at : body.length)
    let line = slice.replace(/\s+/g, ' ').trim()
    // A deliverable ends where the rate table starts bleeding into it.
    line = line.split(/\s(?:Up to|USD\b|\d{2}\/\d{2}\/\d{4})/)[0].trim()
    line = line.replace(/[.;,]+$/, '').trim()
    if (line.length < 8 || /^page\s+\d/i.test(line)) continue
    items.push(line)
  }
  return items
}

/** Everything the letter needs, or as much of it as the document actually says. */
export function parseTor(text: string): TorFields {
  const flat = (text || '').replace(/\r/g, '')
  const { periodStart, periodEnd } = findPeriod(flat)
  const deliverables = findDeliverables(flat)
  return {
    reference: findReference(flat),
    periodStart,
    periodEnd,
    deliverables: deliverables.length ? deliverables : undefined,
  }
}
