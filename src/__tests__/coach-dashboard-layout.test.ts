// ============================================================
// THE COACH'S DASHBOARD, PRESENTED AS HE ASKED FOR IT
//
// Habib, 13 September 2026: the tabs are not well presented and are not
// reflecting the true state of things. Allow me to dismiss any flag from the
// dashboard and the flag should be in the service or client tab. The client
// tab should be in cards in a grid, with a red dot or border indicating that
// there is a flag to that client but not one at the top of the page. The
// services should be in a horizontal list and the clients vertical cards
// underneath them. Under Team, it would be good to have team member cards so
// every co-implementer has a page. And a welcome email for the GtCV
// co-implementer.
//
// These read the source, because the screen is one very large component with
// no seam to test through. Each one names what was wrong and fails if it comes
// back.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const DASH = readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')
const LETTER = readFileSync('app/api/co-implementer-welcome/route.ts', 'utf8')

describe('the flag sits on the client, not above the page', () => {
  it('the banner at the top of the Clients screen is gone', () => {
    expect(DASH).not.toContain('flagged this week')
    expect(DASH).not.toContain('Set aside until the next health check')
  })

  it('a flagged client carries a coloured edge and a dot on their own card', () => {
    expect(DASH).toContain('borderLeft:edge?`4px solid ${edge}`')
    expect(DASH).toContain("borderRadius:'50%',background:edge")
  })

  it('the card says what the health check actually found', () => {
    // A dot with no reason sends somebody into the client to find out what it
    // meant, which is the click the whole change is about removing.
    expect(DASH).toContain('why:text?(text.length>120?text.slice(0,120)+')
    expect(DASH).toContain('{live&&<div style={{fontSize:')
  })

  it('whoever needs attention is read first', () => {
    expect(DASH).toContain("const rank={'Needs attention':0,'Watch':1}")
    expect(DASH).toContain('if(ra!==rb)return ra-rb')
  })
})

describe('services across the top, clients underneath', () => {
  it('every service says how many clients are on it', () => {
    expect(DASH).toContain('const n=(rowsByService[t.key]||[]).length')
    expect(DASH).toContain('const rowsByService=Object.fromEntries(CLIENT_SERVICE_TABS.map(t=>[t.key,rowsForService(t.key)]))')
  })

  it('a service with a flagged client on it carries a dot', () => {
    expect(DASH).toContain('const liveFlagsIn=(rows)=>rows.filter(r=>{const f=flagFor(r.client);return !!f&&!f.aside}).length')
    expect(DASH).toContain('{f>0&&<span title={`${f} flagged`}')
  })

  it('the clients are one flat grid, not a box per paying client', () => {
    // Ten clients across seven funders was seven boxes to scroll past.
    expect(DASH).not.toContain('blocks=Array.from(byPayer.values())')
    expect(DASH).toContain("gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))'")
  })

  it('who is paying is still on the card, so nothing was lost', () => {
    expect(DASH).toContain('{payer&&<div style={{fontSize:')
  })
})

describe('the tabs say what is behind them', () => {
  it('each one carries its own count', () => {
    expect(DASH).toContain("['clients','Clients',clients.length,flaggedClients>0]")
    expect(DASH).toContain("['team','Team',coImplementers.length,awaitingApproval>0]")
    expect(DASH).toContain("['portfolio','Market Intelligence',subscriberCount,false]")
  })

  it('the counts come from the records, not from a guess', () => {
    expect(DASH).toContain("const openDeals=programmes.filter(p=>p.deal_stage&&p.deal_stage!=='won'&&p.deal_stage!=='lost').length")
    expect(DASH).toContain("const awaitingApproval=timesheets.filter(t=>t.status==='submitted').length")
    expect(DASH).toContain("supabase.from('service_engagements').select('id',{count:'exact',head:true})")
  })

  it('a tab with nothing honest to count shows no number rather than a wrong one', () => {
    expect(DASH).toContain("['overview','My Business',null,false]")
    expect(DASH).toContain('{count!==null&&count!==undefined&&')
  })

  it('the dot on Clients obeys the same dismissal rule as the cards', () => {
    // A dot that stays lit after the flag behind it was dismissed teaches
    // people to stop looking at the dot.
    expect(DASH).toContain('const aside=Number.isFinite(at)&&(!Number.isFinite(gen)||at>=gen)')
    expect(DASH).toContain('if(!aside)flagged[id]=true')
  })
})

describe('every co-implementer has a page', () => {
  it('the roster is cards, one per person', () => {
    expect(DASH).toContain('function CiRosterCard({ci})')
    expect(DASH).toContain('{coImplementers.map(ci=><CiRosterCard key={ci.id} ci={ci}/>)}')
  })

  it('the card says the state of that person at a glance', () => {
    expect(DASH).toContain("<Badge text={ci.active?'Active':'Inactive'}")
    expect(DASH).toContain('{pendingHours>0&&<Badge text={`${pendingHours}h awaiting approval`}')
  })

  it('opening one opens their page, and there is a way back', () => {
    expect(DASH).toContain('function CiDetail({ci})')
    expect(DASH).toContain('← All co-implementers')
  })

  it('nothing that was on the long list was dropped', () => {
    // Profile editing, assigning clients, the invite, and the timesheets all
    // moved onto the person's page rather than going away.
    for (const kept of ['Edit profile', '+ Assign client', '<InviteLoginButton', 'Save profile']) {
      expect(DASH).toContain(kept)
    }
  })
})

describe('the welcome letter to a co-implementer', () => {
  it('says what the role is, who they report to, and what the platform holds', () => {
    expect(LETTER).toContain('What the role is.')
    expect(LETTER).toContain('Who you report to.')
    expect(LETTER).toContain('What you will see when you sign in.')
    expect(LETTER).toContain('In your first week.')
  })

  it('describes the platform the co-implementer actually gets', () => {
    // Two sections, and the four parts of the pay record. A letter that
    // describes a screen they do not have is worse than no letter.
    expect(LETTER).toContain('My Timesheet and Expenses')
    expect(LETTER).toContain('Timesheets, Expenses, Advances, and Invoice')
    expect(DASH).toContain("['mypayments','My Timesheet & Expenses',null,false]")
  })

  it('carries no sign-in link of its own', () => {
    // The account is made by /api/invite-user. Two links in two letters is how
    // somebody ends up with two half-made accounts.
    expect(LETTER).not.toContain('ctaUrl')
    expect(LETTER).not.toContain('generateLink')
  })

  it('names no rate and no fee', () => {
    expect(LETTER).not.toContain('rate_per_day')
    expect(LETTER).not.toContain('currency')
  })

  it('only the coach who manages the team may send it', () => {
    expect(LETTER).toContain("profile.role !== 'super_coach'")
    expect(LETTER).toContain('checkRateLimit(admin, `co-implementer-welcome:${user.id}`')
  })

  it('reads the address from the record, never from the request', () => {
    expect(LETTER).toContain("const to = cleanEmail(ci.email || '')")
    expect(LETTER).not.toContain('body.email')
  })

  it('goes once', () => {
    expect(LETTER).toContain('alreadySent: true')
    const sql = readFileSync('supabase/migrations/2026_09_13_co_implementer_welcome_sent.sql', 'utf8')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS welcome_sent_at timestamptz')
  })

  it('works before that migration is applied, and reports the truth either way', () => {
    // The column is read off a select('*') and the write is best effort, so a
    // letter that was delivered is never reported as a failure.
    expect(LETTER).toContain("select('*')")
    expect(LETTER).toContain('.then(undefined, () => undefined)')
  })

  it('is sendable from the co-implementer’s own page', () => {
    expect(DASH).toContain('function WelcomeLetterButton({coImplementerId})')
    expect(DASH).toContain('<WelcomeLetterButton coImplementerId={ci.id}/>')
  })
})
