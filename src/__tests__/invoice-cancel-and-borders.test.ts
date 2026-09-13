// ============================================================
// AN INVOICE CAN BE WITHDRAWN, AND A CARD HAS AN EDGE
//
// Habib, 14 September 2026:
//   "I cant remove the test invoice I put on there which is showing as
//    outstanding. I should be able to reject an invice or remove from the
//    account until accepted."
//   "Borders around the card, the chart and the other section is not visible
//    on the team tab."
//
// These read the source and the stylesheet, because both are about screens
// with no seam to test through. They are standing rules: each names what was
// wrong and fails if it comes back.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { monthlyTeamCost } from '@/lib/coach-business-metrics'

const TEAM = readFileSync('src/components/coach/TeamPayments.tsx', 'utf8')
const CSS = readFileSync('app/globals.css', 'utf8')
const SQL = readFileSync('supabase/migrations/2026_09_14_invoice_cancel.sql', 'utf8')

describe('an issued invoice can be withdrawn', () => {
  it('cancelling is offered while it is unpaid, and removing once it is cancelled', () => {
    expect(TEAM).toContain('async function cancelInvoice(inv)')
    expect(TEAM).toContain('async function deleteInvoice(inv)')
    expect(TEAM).toContain('Cancel invoice')
    expect(TEAM).toContain('Remove')
  })

  it('a paid invoice is not cancelled by a button', () => {
    expect(TEAM).toContain("if(inv.status==='paid')return setMsg")
  })

  it('removing is only ever possible after cancelling', () => {
    expect(TEAM).toContain("if(inv.status!=='cancelled'&&inv.status!=='draft')return setMsg")
    expect(TEAM).toContain("iv.status==='cancelled'||iv.status==='draft'")
  })

  it('both ask first, because neither can be undone by pressing again', () => {
    const cancel = TEAM.slice(TEAM.indexOf('async function cancelInvoice'), TEAM.indexOf('async function deleteInvoice'))
    expect(cancel).toContain('window.confirm(')
    const remove = TEAM.slice(TEAM.indexOf('async function deleteInvoice'))
    expect(remove.slice(0, 900)).toContain('window.confirm(')
  })

  it('the database decides, not a screen that may be out of date', () => {
    // CodeRabbit on #262: the status check reads whatever this browser last
    // loaded, so an invoice marked paid in another session could still be
    // cancelled or deleted here.
    expect(TEAM).toContain(".eq('id',inv.id).eq('status','issued').select('id')")
    expect(TEAM).toContain(".eq('id',inv.id).in('status',['draft','cancelled']).select('id')")
    expect(TEAM).toContain('Something changed it since this page was loaded')
    // And the other side of the same door: marking one paid requires it to
    // still be issued, so a screen loaded before a cancellation cannot mark a
    // cancelled invoice paid and leave its advances open. CodeRabbit on #263.
    expect(TEAM).toContain('async function markPaid(inv)')
    expect(TEAM).toContain('It is no longer issued, so something changed it since this page was loaded.')
  })

  it('cancelling puts back every advance the invoice retired', () => {
    // Issuing retires the open advances against the invoice. Undoing one
    // without the other is how money quietly goes missing.
    expect(TEAM).toContain("update({reconciled:false,reconciled_at:null,applied_invoice_id:null})")
    expect(TEAM).toContain(".eq('applied_invoice_id',inv.id)")
  })

  it('it says so when the invoice went but the advances did not come back', () => {
    expect(TEAM).toContain('The invoice was cancelled, but the advances it netted off were not put back')
  })
})

describe('a cancelled invoice stops counting, everywhere a live one counts', () => {
  it('it no longer blocks the period, and is not invoiced this period', () => {
    expect(TEAM).toContain("const liveInvoice=i=>i.status!=='draft'&&i.status!=='cancelled'")
    expect(TEAM).toContain("i.period===period&&i.status!=='draft'&&i.status!=='cancelled'")
  })

  it('outstanding money counts only what was issued, so a cancelled one drops out', () => {
    expect(TEAM).toContain("const outstandingInvoices=invoices.filter(i=>i.status==='issued')")
  })

  it('it is not counted as the cost of running the team', () => {
    const periods = ['2026-08']
    const live = monthlyTeamCost([{ period: '2026-08', status: 'issued', time_amount: 1000, expenses_amount: 200 }], periods)
    expect(live['2026-08']).toBe(1200)
    const withdrawn = monthlyTeamCost([{ period: '2026-08', status: 'cancelled', time_amount: 1000, expenses_amount: 200 }], periods)
    expect(withdrawn['2026-08']).toBe(0)
  })

  it('the number a cancelled invoice used is not reused', () => {
    // invoice_number is unique and the withdrawn row stays in the history, so
    // re-issuing the same period has to take the next free suffix instead of
    // failing on a duplicate key.
    expect(TEAM).toContain('const takenNumbers=new Set(invoices.map(i=>i.invoice_number))')
    expect(TEAM).toContain('for(let n=2;takenNumbers.has(invoiceNumber)&&n<100;n++)')
  })

  it('the column it writes exists, and the status values are written down', () => {
    expect(SQL).toContain('add column if not exists cancelled_at timestamptz')
    expect(SQL).toContain('draft | issued | paid | cancelled')
  })
})

describe('a card has a visible edge', () => {
  // #E6ECF2 against a #FDFBF7 card on a #F5F0E8 page is three shades of the
  // same near-white, so every card edge on the platform disappeared.
  const value = (name: 'soft' | 'solid', from: string) => {
    const hit = from.match(name === 'soft' ? /--cv-border-soft:\s*([^;]+);/ : /--cv-border:\s*([^;]+);/)
    return hit ? hit[1].trim() : ''
  }
  const darkAt = CSS.indexOf(':root[data-theme="dark"] {')
  const light = CSS.slice(CSS.indexOf(':root {'), darkAt)
  const dark = CSS.slice(darkAt)

  it('the soft border is no longer the near-white it was', () => {
    expect(value('soft', light)).not.toBe('#E6ECF2')
    expect(value('solid', light)).not.toBe('#D8E0E8')
  })

  it('the dark theme has the same fix', () => {
    expect(value('soft', dark)).not.toBe('rgba(255,255,255,0.08)')
    expect(value('solid', dark)).not.toBe('rgba(255,255,255,0.10)')
  })

  it('soft is still the lighter of the two, so the names keep meaning something', () => {
    const lum = (hex: string) => {
      const m = hex.match(/^#([0-9a-f]{6})$/i)
      if (!m) return null
      const n = parseInt(m[1], 16)
      return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
    }
    const soft = lum(value('soft', light))
    const solid = lum(value('solid', light))
    expect(soft).not.toBeNull()
    expect(solid).not.toBeNull()
    expect(soft as number).toBeGreaterThan(solid as number)
  })

  it('the card, the chart and the sections on Team all use it', () => {
    // One style, used by all three, so a fix to the token reaches every one.
    expect(TEAM).toContain("const card = {background:C.white,border:'1px solid var(--cv-border-soft)'")
    expect(TEAM).toContain('function CostOfDeliveryChart(')
    expect(TEAM).toContain('<div style={{...card}}>')
  })
})
