// ============================================================
// ALL FOUR SERVICES, AND A FLAG THAT CAN BE SET ASIDE
//
// Habib went to add a Market Intelligence client and found the only choices
// were the two services that happen to have a dashboard of their own. Advisory
// and Market Intelligence were reachable only by first giving the organisation
// a canvas or a financial model they had not bought, then recording the real
// service underneath it. He also asked to be able to dismiss a flag.
//
// These read the source, because the screens they are about are one very large
// component with no seam to test through. They are the standing rules rather
// than a description: each one names the thing that was wrong and fails if it
// comes back.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SERVICE_TYPES, SERVICE_LABEL } from '@/lib/engagement-brief'

const DASH = readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')
const NEEDS = readFileSync('src/components/gtcv/WhatNeedsYou.tsx', 'utf8')
const CONFIG = readFileSync('app/api/engagement-config/route.ts', 'utf8')

describe('a client can be onboarded into any of the four services', () => {
  it('the form offers all four, not the two with a dashboard', () => {
    for (const value of SERVICE_TYPES) {
      expect(DASH).toContain(`<option value="${value}">`)
    }
  })

  it('the four are the four the rest of the platform knows about', () => {
    expect([...SERVICE_TYPES].sort()).toEqual(['advisory', 'canvas', 'financial', 'portfolio_intelligence'])
    expect(SERVICE_LABEL.portfolio_intelligence).toBe('Portfolio Intelligence')
  })

  it('an advisory or intelligence client is not offered a financial model they did not buy', () => {
    // The header, the open link and the three financial setup steps all used
    // to render for every client that was not a canvas one.
    expect(DASH).toContain("selClient.engagement_mode==='financial'&&<a href={`/dashboard/${selClient.slug}`}")
    expect(DASH).toContain("{selClient.engagement_mode==='financial'&&<div style={{display:'grid'")
    expect(DASH).toContain('SERVICE_NAME[selClient.engagement_mode]')
  })

  it('names the service on the client’s own screen', () => {
    expect(DASH).toContain("portfolio_intelligence:'Market Intelligence'")
    expect(DASH).toContain("advisory:'Advisory'")
  })

  it('a client whose service is on their own record still appears under it', () => {
    // Advisory and Intelligence were read only from service_engagements, so a
    // client carrying one with no service row yet would show under no service
    // at all and read as deleted.
    expect(DASH).toContain('const ownMode=clients.filter(c=>c.engagement_mode===service)')
    expect(DASH).toContain('No subscription recorded yet')
    expect(DASH).toContain('No service engagement recorded yet')
  })
})

describe('a service a client pays for themselves', () => {
  it('is recordable on every client, not only the ones with no programme', () => {
    // A programme paying for the canvas does not stop the same organisation
    // buying Market Intelligence with its own money.
    expect(DASH).not.toContain('{!selClient.programme_id&&<ServicesSection')
    expect(DASH).toContain('<ServicesSection payerType="client"')
  })
})

describe('a flag can be set aside and brought back', () => {
  it('offers to set aside, and to bring back', () => {
    expect(NEEDS).toContain('Set aside')
    expect(NEEDS).toContain('Bring it back')
  })

  it('only the coaching team may, and the list is filtered by it', () => {
    expect(NEEDS).toContain('const showing = items.filter((i) => !setAsideKeys.has(i.key))')
    expect(NEEDS).toContain('const held = items.filter((i) => setAsideKeys.has(i.key))')
  })

  it('nothing is hidden for good: what is set aside is still counted and shown', () => {
    expect(NEEDS).toContain('set aside')
    expect(NEEDS).toContain('flags have')
  })

  it('is kept in the database, never in the browser', () => {
    // The whole reason the database exists. A dismissal held in one browser is
    // invisible to whoever opens the engagement next and gone when that
    // browser is cleared.
    expect(NEEDS).not.toMatch(/localStorage|sessionStorage/)
    expect(NEEDS).toContain("fetch(`/api/engagement-config")
    expect(CONFIG).toContain('body.dismissed')
    expect(CONFIG).toContain('base.dismissed = Array.from(new Set(keys))')
  })

  it('the record is read back with the engagement', () => {
    expect(CONFIG).toContain('brief: briefFromConfig(data?.brand_overrides), dismissed')
  })

  it('caps what can be stored, so the flag list cannot be used as a notes field', () => {
    expect(CONFIG).toContain('.slice(0, 200)')
  })

  it('writes before it shows, so a failed save never disagrees with the record', () => {
    const order = NEEDS.indexOf('await saveDismissed(clientId, next)')
    const shown = NEEDS.indexOf('setDismissed(next)')
    expect(order).toBeGreaterThan(0)
    expect(shown).toBeGreaterThan(order)
  })
})

// ============================================================
// THE FLAG ON THE CLIENTS SCREEN, WHICH IS THE ONE HE MEANT
//
// I added dismissal to "What needs you" on a client's Cover tab. The flags
// Habib was looking at are the "flagged this week" panel that opens the
// Clients screen, which is a different list in a different component, and it
// still had no way to acknowledge anything. Fixing the wrong panel and saying
// it was done is worse than not fixing it.
// ============================================================
describe('a flagged client can be set aside on the Clients screen', () => {
  it('offers to set aside, and to bring back', () => {
    expect(DASH).toContain('Set aside')
    expect(DASH).toContain('Bring it back')
    expect(DASH).toContain('Set aside until the next health check')
  })

  it('comes back by itself when a newer health check is generated', () => {
    // Hidden only while the moment it was set aside is later than the check
    // being shown, so acknowledging what you read never hides what comes next.
    expect(DASH).toContain('const flagIsSetAside=(c)=>{')
    expect(DASH).toContain('return !Number.isFinite(generated)||at>=generated')
  })

  it('keeps the panel visible when everything in it has been set aside', () => {
    // A panel that disappears entirely leaves no way to bring anything back.
    expect(DASH).toContain('{(flagged.length>0||setAsideFlags.length>0)&&(')
    expect(DASH).toContain('Nothing flagged this week')
  })

  it('puts the screen back if the write does not land', () => {
    expect(DASH).toContain('That flag could not be set aside: ')
  })

  it('is kept in the database, on the client, never in the browser', () => {
    expect(DASH).toContain("supabase.from('engagement_clients')")
    expect(DASH).toContain('health_flag_dismissed_at')
  })

  it('setting one aside does not also open the client', () => {
    // The whole row is a link to the client's dashboard, so the button has to
    // stop the press reaching it.
    expect(DASH).toContain('onClick={e=>{e.stopPropagation();setFlagAside(c,true)}}')
  })

  it('the column it needs is recorded as a migration', () => {
    const sql = readFileSync('supabase/migrations/2026_09_08_health_flag_dismissed_at.sql', 'utf8')
    expect(sql).toContain('add column if not exists health_flag_dismissed_at')
  })
})

describe('a Market Intelligence client appears the moment it is added', () => {
  it('the subscription branch draws the client blocks as well as the table', () => {
    // It drew the subscription table and nothing else, so a client whose own
    // record says Market Intelligence, with nothing logged under Services yet,
    // was calculated into a block that was never rendered. Habib added one and
    // it was simply not there.
    expect(DASH).toContain('subscriptionRows.length===0&&blocks.length===0?(')
    expect(DASH).toContain('):(<>{subscriptionRows.length>0&&(')
  })

  it('still says so when there is genuinely nobody', () => {
    expect(DASH).toContain('No subscribers yet.')
  })
})

// ============================================================
// THE COVER SAID "NOT SET" ABOUT THINGS THAT WERE SET
//
// Habib asked why the Lead consultant and the Dates on the Cover are not
// populated. The dates and the country were recorded on Ikore the day it was
// created, 21 September 2026 to 22 March 2027, in Nigeria. The loader's column
// list did not include them, so the card read "Not set" and "Location not set"
// about a record that held both. Nothing was missing. Nothing was fetched.
// ============================================================
describe('the Cover reads everything it shows', () => {
  const LOADER = readFileSync('src/lib/engagement-loader.ts', 'utf8')
  const COVER = readFileSync('src/components/gtcv/CoverPanel.tsx', 'utf8')

  it('fetches every column the Cover puts on screen', () => {
    for (const col of ['country', 'start_date', 'expected_close']) {
      expect(LOADER).toContain(col)
      expect(COVER).toContain(`client.${col}`)
    }
  })

  it('the column list is one string, so a card cannot outrun it silently', () => {
    expect(LOADER).toContain("'id,slug,name,status,programme_id,engagement_mode,country,start_date,expected_close'")
  })
})

describe('a read-only Cover says where each thing is edited', () => {
  const COVER = readFileSync('src/components/gtcv/CoverPanel.tsx', 'utf8')

  it('every card names its home', () => {
    expect(COVER).toContain('EDITED_AT.stands')
    expect(COVER).toContain('EDITED_AT.momentum')
    expect(COVER).toContain('EDITED_AT.people')
    expect(COVER).toContain('EDITED_AT.dates')
  })

  it('points at screens that exist, by the names on the menu', () => {
    expect(COVER).toContain('Who is on it, and settings')
    expect(COVER).toContain('under Cover, with Edit')
  })

  it('stops claiming an engagement is delivered solo', () => {
    // No co-implementer party is not the same as nobody helping, and the brief
    // on the same tab can name one this card has never read.
    expect(COVER).not.toContain('Delivered solo')
    expect(COVER).toContain('No co-implementer recorded')
  })

  it('has no inputs of its own, so nothing on it can drift from its home', () => {
    expect(COVER).not.toMatch(/<input|<textarea|<select/)
  })
})

// ============================================================
// ONE LIST OF THE PEOPLE ON AN ENGAGEMENT
//
// Habib: there is no need to have two lists of the same names with attributes
// that can be on the same line, and it clutters the whole system. He was
// right. The Cover carried "Who receives it" with a title, a name, an address,
// a role and which letter, and "Who is on this engagement" with a role, a
// name, an organisation, a title, an address and whether they sign. The same
// people, typed twice, corrected twice, and neither list knew about the other.
// ============================================================
describe('the second list of the same people is gone', () => {
  const PACK = readFileSync('src/components/gtcv/WelcomePack.tsx', 'utf8')
  const PARTIES = readFileSync('src/components/gtcv/EngagementPartiesPanel.tsx', 'utf8')
  const EMAIL_ROUTE = readFileSync('app/api/engagement-email/route.ts', 'utf8')
  const PARTY_ROUTE = readFileSync('app/api/engagement-party/route.ts', 'utf8')

  it('the welcome pack no longer keeps its own list of people', () => {
    expect(PACK).not.toContain('label="Who receives it"')
    expect(PACK).not.toContain('Save the recipients')
    expect(PACK).not.toContain('Add someone')
  })

  it('it reads the people off the engagement instead', () => {
    expect(PACK).toContain("from('engagement_parties')")
    expect(PACK).toContain("p.letter === 'payer' || p.letter === 'served'")
  })

  it('which letter somebody gets is chosen beside the person', () => {
    expect(PARTIES).toContain('Welcome letter')
    expect(PARTIES).toContain('<option value="served">Served client letter</option>')
    expect(PARTIES).toContain('<option value="payer">Paying client letter</option>')
  })

  it('and is shown on the same line as the person, with when it went', () => {
    expect(PARTIES).toContain('LETTER_LABEL[r.letter]')
    expect(PARTIES).toContain('not sent yet')
  })

  it('no letter is a real state, not a missing one', () => {
    // A field team member is on the engagement and is not written to.
    expect(PARTIES).toContain('<option value="">No letter</option>')
    expect(PARTY_ROUTE).toContain("patch.letter = l === 'payer' || l === 'served' ? l : null")
  })

  it('the send reads the same one list', () => {
    expect(EMAIL_ROUTE).toContain("from('engagement_parties')")
    expect(EMAIL_ROUTE).toContain('const saved = fromParties.length')
  })

  it('an address typed onto a person is cleaned the way a pasted one needs', () => {
    // The same treatment the recipient list had, now that there is one list.
    expect(PARTY_ROUTE).toContain('cleanEmail(body.email)')
  })

  it('the columns it needs are recorded as a migration', () => {
    const sql = readFileSync('supabase/migrations/2026_09_09_one_list_of_people.sql', 'utf8')
    expect(sql).toContain('add column if not exists letter text')
    expect(sql).toContain('letter_sent_at timestamptz')
    expect(sql).toContain("check (letter is null or letter in ('payer', 'served'))")
  })
})
