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
const TEAM = readFileSync('src/components/coach/TeamPayments.tsx', 'utf8')

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

describe('the subscription table is usable and safe to type in', () => {
  it('the level is written once, when the person moves on', () => {
    // Every keystroke used to start its own write, so answers coming back out
    // of order could land an earlier letter on top of the finished word.
    expect(DASH).toContain('function SubscriptionLevel({se,clientName,onSave})')
    expect(DASH).toContain('const commit=()=>{setTyping(false);if(draft!==saved)onSave(draft)}')
    expect(DASH).toContain('onBlur={commit}')
  })

  it('every control in it says which client and which field it belongs to', () => {
    expect(DASH).toContain('aria-label={`Subscription level, ${clientName}`}')
    expect(DASH).toContain('aria-label={`Paid up to, ${c.name}`}')
    expect(DASH).toContain('aria-label={`Billing term, ${c.name}`}')
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

  it('the dot on Clients and the cards read one answer, not two', () => {
    // The AI review on #260: the dot and the cards were two separate fetches
    // of ai_health_checks, which is two answers to one question and a way for
    // a dot to stay lit over a flag that was dismissed. One reading now, and
    // every screen works off it.
    expect(DASH).toContain('const flaggedClients=clients.filter(c=>{const f=liveFlagFor(c);return !!f&&!f.aside}).length')
    expect(DASH).toContain('const flagFor=liveFlagFor')
    // One bulk read of the health checks for the whole client list. (The
    // Client Health tab still reads one client's own latest check, which is a
    // different question about a different client.)
    expect(DASH.match(/from\('ai_health_checks'\)\.select\('client_id/g) || []).toHaveLength(1)
  })

  it('the one dismissal rule is the one every screen uses', () => {
    expect(DASH.match(/const flagIsSetAside=\(c\)=>\{/g) || []).toHaveLength(1)
    expect(DASH).toContain('return !Number.isFinite(generated)||at>=generated')
  })
})

describe('every co-implementer has a page', () => {
  it('is built on the Team screen that is actually rendered', () => {
    // CodeRabbit on #260 caught this: the first version of these cards went
    // into TeamView, which nothing renders. The Team tab renders TeamHub,
    // which renders TeamPayments. A screen nobody can reach is not a screen.
    expect(DASH).toContain("{view==='team'&&<TeamHub/>}")
    expect(DASH).toContain('<TeamPayments')
    expect(DASH).not.toContain('function TeamView()')
  })

  it('the roster is cards, one per person', () => {
    expect(TEAM).toContain('function CiRosterCard({ci,period,entries,expenses,advances,clients,onOpen})')
    expect(TEAM).toContain('<CiRosterCard key={ci.id}')
  })

  it('the card says the state of that person at a glance', () => {
    expect(TEAM).toContain("<Badge text={active?'Active':'Inactive'}")
    expect(TEAM).toContain('{awaiting>0&&<Badge text={`${awaiting} awaiting approval`}')
  })

  it('opening one opens their page, and there is a way back', () => {
    expect(TEAM).toContain('← All co-implementers')
    expect(TEAM).toContain('const openPerson=showRoster?')
  })

  it('a co-implementer seeing only themselves lands on their own page', () => {
    // There is no roster to choose from, so a roster would be one click for
    // nothing on every visit.
    expect(TEAM).toContain('const showRoster=coImplementers.length>1||canApprove')
  })

  it('a card can be opened from the keyboard', () => {
    expect(TEAM).toContain("onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}}")
    expect(DASH).toContain("onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}}")
  })

  it('nothing that was on the long list was dropped', () => {
    for (const kept of ['Edit profile', '+ Assign client', 'renderInvite(ci)', 'Timesheets']) {
      expect(TEAM).toContain(kept)
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
    // The same rule the screen uses, read from the same place, so the two
    // cannot drift apart.
    expect(LETTER).toContain('!canManageTeam(profile.role)')
    expect(LETTER).toContain("from '@/lib/coach-types'")
    expect(LETTER).toContain('checkRateLimit(admin, `co-implementer-welcome:${user.id}`')
  })

  it('reads the address from the record, never from the request', () => {
    expect(LETTER).toContain("const to = cleanEmail(ci.email || '')")
    expect(LETTER).not.toContain('body.email')
  })

  it('goes once, and the database is what decides that', () => {
    // Reading the column and writing it back after the send are two steps, so
    // two presses landing together both read null and both sent. The claim is
    // one conditional write: only the request that turns null into a time may
    // send, and a letter that then fails to go gives its claim back.
    expect(LETTER).toContain(".is('welcome_sent_at', null)")
    expect(LETTER).toContain('if (!claim || claim.length === 0)')
    expect(LETTER).toContain("update({ welcome_sent_at: null })")
    expect(LETTER).toContain('alreadySent: true')
    const sql = readFileSync('supabase/migrations/2026_09_13_co_implementer_welcome_sent.sql', 'utf8')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS welcome_sent_at timestamptz')
  })

  it('works before that migration is applied, and reports the truth either way', () => {
    // The column is read off a select('*') and the write is best effort, so a
    // letter that was delivered is never reported as a failure.
    expect(LETTER).toContain("select('*')")
    expect(LETTER).toContain('if (!claimErr) {')
  })

  it('is sendable from the co-implementer’s own page, on the screen in use', () => {
    expect(DASH).toContain('function WelcomeLetterButton({coImplementerId})')
    expect(DASH).toContain('renderWelcome={canManageTeam(userRole)?(ci=><WelcomeLetterButton coImplementerId={ci.id}/>):null}')
    expect(TEAM).toContain('{renderWelcome&&renderWelcome(ci)}')
  })

  it('says nothing about the database when something breaks', () => {
    // An exception's own text carries configuration and column names with it.
    expect(LETTER).toContain("console.error('co-implementer-welcome failed', e)")
    expect(LETTER).not.toContain('e instanceof Error ? e.message')
  })
})
