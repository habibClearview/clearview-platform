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
  payerName?: string
  servedName?: string
  payerProgramme?: string
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


/**
 * WHO IS ON THIS CONTRACT.
 *
 * A purchase order names the organisation issuing it in several places, and a
 * scope of work names the organisation the work is delivered to. Between them
 * that is the payer and the served client, which is most of the brief.
 *
 * Every rule here is anchored on wording that only appears in one role, so a
 * document that does not say it plainly returns nothing for that field. The
 * screen shows what was found and the coach corrects it before saving, so a
 * miss costs one line of typing and a wrong guess costs a client's name in a
 * letter.
 */
export function findParties(text: string): { payerName?: string; servedName?: string; payerProgramme?: string } {
  const flat = (text || '').replace(/\s+/g, ' ')
  const out: { payerName?: string; servedName?: string; payerProgramme?: string } = {}

  // The payer. A purchase order repeats its own issuer as a charge code owner
  // ("TANAGER CHARGE CODE"), as the party the vendor contracts with, and in the
  // terms. The charge-code form is the least ambiguous.
  const chargeCode = /\b([A-Z][A-Za-z&.'-]{2,30})\s+(?:CHARGE\s+CODE|JOB\s+CODE)\b/.exec(flat)
  if (chargeCode) out.payerName = titleCase(chargeCode[1])
  if (!out.payerName) {
    const willBook = /\b([A-Z][A-Za-z&.'-]{2,30})\s+will\s+book\s+and\s+pay\b/i.exec(flat)
    if (willBook) out.payerName = titleCase(willBook[1])
  }

  // The served organisation. A scope of work says who the consultancy helps,
  // and an LSP contract marks it explicitly.
  const lsp = /\b([A-Z][\w&.,'-]*(?:\s+[A-Z][\w&.,'-]*){0,5}?)\s*\(\s*LSP\s*\)/.exec(flat)
  if (lsp) out.servedName = cleanOrg(lsp[1])
  if (!out.servedName) {
    const support = /(?:walk\s+alongside|support(?:ing)?\s+the\s+LSP,?|helping)\s+([A-Z][\w&.,'-]*(?:\s+[A-Z][\w&.,'-]*){0,5})/.exec(flat)
    if (support) out.servedName = cleanOrg(support[1])
  }

  // The programme the work sits under. Written in capitals with a plus or a
  // roman numeral more often than not.
  // No trailing \b: it would refuse the + on the end of IGNITE+, because the
  // character after it is a comma and two non-word characters are not a word
  // boundary, so the engine backtracks and hands back IGNITE.
  const prog = /\bunder\s+([A-Z][A-Z0-9]{2,19}\+?)(?![A-Za-z0-9])/.exec(flat)
  if (prog && prog[1] !== 'THE') out.payerProgramme = prog[1]

  // A payer and a served client that came out the same is a rule that matched
  // the wrong sentence. Neither is trustworthy, so neither is offered.
  if (out.payerName && out.servedName
    && out.payerName.toLowerCase() === out.servedName.toLowerCase()) {
    delete out.servedName
  }
  return out
}

function titleCase(v: string): string {
  const s = v.trim()
  if (!/[a-z]/.test(s)) return s.charAt(0) + s.slice(1).toLowerCase()
  return s
}

/** Trim the trailing noise a name picks up from running text. */
function cleanOrg(v: string): string {
  return v.replace(/\s+/g, ' ').trim()
    .replace(/[.,;:]+$/, '')
    .replace(/\s+(?:International|Ltd|Limited)$/i, (m) => m)
    .slice(0, 120)
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
    ...findParties(flat),
  }
}
