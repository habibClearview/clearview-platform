import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { parseTor, parseLongDate, findPeriod, findReference, findDeliverables } from '@/lib/tor-parse'

// ============================================================
// READING PURCHASE ORDER 149 AND ITS SCOPE OF WORK.
// The text below is what pdfjs actually returns for those two documents: one
// long line per page, no newlines inside a page. That shape is the whole
// difficulty -- the numbering is the only separator there is.
// ============================================================
const PO = 'Purchase Order 1. Order no 149 2. Price USD 35,227.50 3. Effective Date '
  + '4. Period of Performance 7 September 2026 \u2013 15 March 2027 5. VENDOR NAME & ADDRESS '
  + 'Deliverables include: 1. Refined gender and/or nutrition technical assistance service '
  + 'bundles that respond to client needs. Up to 38.5 days USD 750.00 08/31/2026 '
  + '2. Strong, easy to- communicate value propositions that differentiate the LSP in the market. '
  + '3. Pricing models that support both client uptake and organizational sustainability. '
  + '4. To go market and communication strategies. 5. Documented lessons from two rounds of piloting '
  + 'Payment Milestone & Deliverable Trigger: 1. Inception: Approved Inception Report - USD 7,800'

const SOW = '6. REPORTS/DELIVERABLES 6.1. Refined service bundles that respond to client needs. '
  + '6.2. Strong value propositions that differentiate the LSP in the market. '
  + '6.3. Pricing models that support both client uptake and organizational sustainability. '
  + '7. LEVEL OF EFFORT AND ACTIVITY DETAILS Timeframe of project.'

describe('a date on a purchase order', () => {
  it('reads the long form', () => {
    expect(parseLongDate('7 September 2026')).toBe('2026-09-07')
    expect(parseLongDate('15 March 2027')).toBe('2027-03-15')
  })

  it('refuses a date that is not one, rather than inventing it', () => {
    for (const v of ['45 March 2027', 'next spring', '']) {
      expect(parseLongDate(v)).toBeUndefined()
    }
    expect(parseLongDate('31 February 2026')).toBeUndefined()
  })
})

describe('the period of performance', () => {
  it('comes off the purchase order', () => {
    expect(findPeriod(PO)).toEqual({ periodStart: '2026-09-07', periodEnd: '2027-03-15' })
  })

  it('takes a hyphen or the word to, not only an en dash', () => {
    expect(findPeriod('Period of Performance 7 September 2026 to 15 March 2027').periodStart).toBe('2026-09-07')
    expect(findPeriod('Period of Performance 7 September 2026 - 15 March 2027').periodEnd).toBe('2027-03-15')
  })

  it('returns nothing rather than a backwards range', () => {
    expect(findPeriod('Period of Performance 15 March 2027 to 7 September 2026')).toEqual({})
    expect(findPeriod('no dates here at all')).toEqual({})
  })
})

describe('the reference', () => {
  it('names the purchase order', () => {
    expect(findReference(PO)).toBe('Purchase Order 149')
  })

  it('falls back to a ToR reference', () => {
    expect(findReference('under ToR 2026-04 the consultant shall')).toBe('ToR 2026-04')
  })

  it('says nothing when the document does not', () => {
    expect(findReference('a document with no reference in it')).toBeUndefined()
  })
})

describe('the deliverables', () => {
  it('come out one per item, from a page with no line breaks in it', () => {
    const d = findDeliverables(PO)
    expect(d).toHaveLength(5)
    expect(d[0]).toBe('Refined gender and/or nutrition technical assistance service bundles that respond to client needs')
    expect(d[4]).toBe('Documented lessons from two rounds of piloting')
  })

  it('drop the rate table that bleeds into the first one', () => {
    expect(findDeliverables(PO)[0]).not.toMatch(/USD|Up to|38/)
  })

  it('stop before the payment milestones, which are not deliverables', () => {
    expect(findDeliverables(PO).join(' ')).not.toMatch(/Inception Report/)
  })

  it('handle the sub-numbered form, and stop at the next capitalised heading', () => {
    const d = findDeliverables(SOW)
    expect(d).toHaveLength(3)
    expect(d[2]).toBe('Pricing models that support both client uptake and organizational sustainability')
    expect(d.join(' ')).not.toMatch(/LEVEL OF EFFORT|Timeframe/)
  })

  it('return nothing when there is no deliverables section', () => {
    expect(findDeliverables('a contract that never lists what it produces')).toEqual([])
  })
})

describe('the whole read', () => {
  it('fills what the letter needs and leaves the rest alone', () => {
    const f = parseTor(PO)
    expect(f.reference).toBe('Purchase Order 149')
    expect(f.periodStart).toBe('2026-09-07')
    expect(f.periodEnd).toBe('2027-03-15')
    expect(f.deliverables).toHaveLength(5)
  })

  it('never invents a field from a document that does not have it', () => {
    const f = parseTor('An agreement with no reference, no dates and no list.')
    expect(f.reference).toBeUndefined()
    expect(f.periodStart).toBeUndefined()
    expect(f.deliverables).toBeUndefined()
  })

  it('survives junk without throwing', () => {
    for (const junk of ['', ' ', 'x'.repeat(50000)]) {
      expect(() => parseTor(junk)).not.toThrow()
    }
  })
})

describe('the route that reads the document', () => {
  const ROUTE = fs.readFileSync('app/api/tor-extract/route.ts', 'utf8')

  it('stores nothing', () => {
    expect(ROUTE).not.toMatch(/storage\.from|\.upload\(/)
  })

  it('is manager-only, on a client they manage', () => {
    expect(ROUTE).toContain('resolveClientAccess')
    expect(ROUTE).toContain('access.canManage')
  })

  it('caps the size and checks it really is a PDF', () => {
    expect(ROUTE).toContain('MAX_BYTES')
    expect(ROUTE).toContain('0x25')
  })
})

describe('the library actually reaches the deployment', () => {
  it('is traced into the tor-extract function', () => {
    // THE FAULT THIS CATCHES. 7 September 2026. pdfjs is behind a dynamic
    // import so it only loads when a document is attached. webpack cannot see
    // through that, so it was traced into the deployment ZERO times: the route
    // built clean, deployed clean, and threw module-not-found the first time
    // Habib attached a purchase order. Nothing in a normal build failed --
    // only the trace file knew.
    const cfg = fs.readFileSync('next.config.js', 'utf8')
    expect(cfg).toContain("serverComponentsExternalPackages: ['pdfjs-dist']")
    expect(cfg).toContain("'/api/tor-extract': ['./node_modules/pdfjs-dist/legacy/build/**/*']")
  })

  it('and the trace really lists it, when a build is present', () => {
    const p = '.next/server/app/api/tor-extract/route.js.nft.json'
    if (!fs.existsSync(p)) return
    const files = JSON.parse(fs.readFileSync(p, 'utf8')).files as string[]
    expect(files.some((f) => f.includes('pdfjs-dist'))).toBe(true)
  })
})

describe('reading the letter is not sending it', () => {
  const PACK = fs.readFileSync('src/components/gtcv/WelcomePack.tsx', 'utf8')

  it('does not hide the letter when nobody has an address yet', () => {
    // The whole block used to collapse to "no email address yet", so on a
    // fresh engagement there was no way to read the letter at all.
    expect(PACK).not.toMatch(/if \(to\.length === 0\) \{\s*return <p/)
    expect(PACK).toContain('it can be read but not sent')
  })

  it('gates only the send button on having somewhere to send it', () => {
    expect(PACK).toContain("disabled={busy === 'welcome' || !journeyUrl || to.length === 0}")
    expect(PACK).toContain("disabled={busy === 'preview'}")
  })

  it('says what an upload did, beside the upload', () => {
    expect(PACK).toContain('torSaid')
  })
})
