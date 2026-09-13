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
import { textToEmail } from '@/lib/letter'
import { canManageTeam } from '@/lib/coach-types'
import { GUIDANCE_CATEGORIES } from '@/lib/guidance'

const DASH = readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')
const LETTER = readFileSync('app/api/co-implementer-welcome/route.ts', 'utf8')
const TEAM = readFileSync('src/components/coach/TeamPayments.tsx', 'utf8')
const WORDS = readFileSync('src/lib/co-implementer-letter.ts', 'utf8')
const SIGNIN = readFileSync('src/lib/signin-link.ts', 'utf8')
const APPURL = readFileSync('src/lib/app-url.ts', 'utf8')
const INVITE = readFileSync('app/api/invite-user/route.ts', 'utf8')

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
    // The Pipeline count is the same split the Pipeline screen draws, so the
    // number on the tab and the list behind it can never disagree. See
    // pipeline-and-notices.test.ts.
    expect(DASH).toContain("const openDeals=splitPipeline(programmes,clients).open.length")
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

  it('the people come before the money on the Team screen', () => {
    // 13 September 2026. Habib opened Team and saw four money boxes and a six
    // month chart, with the one person on his team below all of it and off the
    // bottom of the screen. He reported the change as not having arrived.
    const roster = TEAM.indexOf('<CiRosterCard key={ci.id}')
    const money = TEAM.indexOf('{/* Summary bar -- the whole team at a glance')
    const chart = TEAM.indexOf('<CostOfDeliveryChart coImplementers=')
    expect(roster).toBeGreaterThan(0)
    expect(roster).toBeLessThan(money)
    expect(roster).toBeLessThan(chart)
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
    // 'Invite login' is deliberately not on this list any more: 14 September
    // 2026, the welcome letter carries the sign-in, so there is no second
    // invitation to send. See "one letter, not two" below.
    for (const kept of ['Edit profile', '+ Assign client', 'renderWelcome(ci)', 'Timesheets']) {
      expect(TEAM).toContain(kept)
    }
  })
})

describe('the welcome letter to a co-implementer', () => {
  it('says what the role is, who they report to, and what the platform holds', () => {
    expect(WORDS).toContain('# What your part in it is')
    expect(WORDS).toContain('# Who you report to')
    expect(WORDS).toContain('# The platform')
    expect(WORDS).toContain('# In your first week')
  })

  it('explains itself to somebody who has never heard of any of this', () => {
    // Habib: write for an audience that does not know anything about Clearview
    // or any of the service. Naming the method without saying what it is tells
    // a new person nothing at all.
    expect(WORDS).toContain('# What this practice does')
    expect(WORDS).toContain('In plain terms it is nine steps')
    expect(WORDS).toMatch(/living on grant money/)
  })

  it('describes the platform the co-implementer actually gets', () => {
    // Two sections, and the four parts of the pay record. A letter that
    // describes a screen they do not have is worse than no letter.
    expect(WORDS).toContain('My Timesheet and Expenses')
    expect(WORDS).toContain('Timesheets, Expenses, Advances and Invoice')
    expect(DASH).toContain("['mypayments','My Timesheet & Expenses',null,false]")
  })

  it('can be read, edited, saved and put back the way the other letters can', () => {
    expect(DASH).toContain('function CoImplementerLetterPanel()')
    expect(DASH).toContain('Read the letter')
    expect(DASH).toContain('Save the letter')
    expect(DASH).toContain('Start again from the generated letter')
    expect(DASH).toContain('{canManageTeam(userRole)&&<CoImplementerLetterPanel/>}')
    expect(LETTER).toContain('export async function GET(')
    expect(LETTER).toContain('export async function PATCH(')
  })

  it('the words a person types are sent as words, never as markup', () => {
    // The preview is rendered with dangerouslySetInnerHTML, so this is the one
    // that has to be proved rather than asserted about. Anything that looks
    // like markup comes back escaped, in a paragraph, a heading and a bullet.
    expect(LETTER).toContain("import { textToEmail } from '@/lib/letter'")
    expect(LETTER).toContain('...textToEmail(letter)')

    const nasty = '<script>alert(1)</script>'
    const out = textToEmail(`${nasty}\n\n# ${nasty}\n\n- ${nasty}`)
      .map((p) => String((p as { __html?: string }).__html ?? p)).join('')
    expect(out).not.toContain('<script>')
    expect(out.match(/&lt;script&gt;/g) || []).toHaveLength(3)
  })

  it('who may edit the letter and who the database lets in are the same rule', () => {
    // The AI review: the route gates on canManageTeam and the table's own
    // policy names super_coach. They agree today, and this fails the day one
    // of them moves without the other.
    const sql = readFileSync('supabase/migrations/2026_09_13_coach_letters.sql', 'utf8')
    expect(sql).toContain("my_role() = 'super_coach'")
    expect(canManageTeam('super_coach')).toBe(true)
    for (const role of ['coach', 'ceo', 'finance_manager', 'unit_head', 'accounts_assistant', 'funder']) {
      expect(canManageTeam(role)).toBe(false)
    }
  })

  it('a database that will not answer never sends the generated letter instead', () => {
    // CodeRabbit: any error at all used to select the generated letter, so a
    // timeout would post the generated words in place of the coach's own AND
    // claim the one send that is allowed. Only the table genuinely not
    // existing yet is forgiven.
    expect(LETTER).toContain('function tableNotThereYet(')
    expect(LETTER).toContain('if (!tableNotThereYet(error)) {')
    // One rule, stated once: reading and writing must not decide this two
    // different ways.
    expect(LETTER.match(/tableNotThereYet\(error\)/g) || []).toHaveLength(2)
    expect(LETTER).toContain('return { ok: false }')
    expect(LETTER).toContain('if (!read.ok) return LETTER_UNREADABLE')
    // And the refusal comes before anything is claimed or sent.
    expect(LETTER.indexOf('if (!read.ok) return LETTER_UNREADABLE'))
      .toBeLessThan(LETTER.indexOf('claimQuery.is(\'welcome_sent_at\', null)'))
  })

  it('what is typed while it saves is still there afterwards', () => {
    expect(DASH).toContain('setDraft(current=>current===text?data.text:current)')
    expect(DASH).toContain("disabled={busy==='save'}")
  })

  it('the letter box can be read out and does not shrink on a phone', () => {
    expect(DASH).toContain('aria-label="The welcome letter sent to a new co-implementer"')
    expect(DASH).toContain("fontSize:'1rem'")
  })

  it('reading and saving it are held to a sensible number of knocks', () => {
    expect(LETTER).toContain("requireSuperCoach(req, admin, 'co-implementer-letter:read')")
    expect(LETTER).toContain("requireSuperCoach(req, admin, 'co-implementer-letter:save')")
    expect(LETTER).toContain('checkRateLimit(admin, `${what}:${user.id}`')
  })

  it('reading it and saving it are for the coach who manages the team only', () => {
    expect(LETTER).toContain('async function requireSuperCoach(')
    expect(LETTER).toContain('!canManageTeam(profile.role)')
  })

  // ONE LETTER, NOT TWO. 14 September 2026. Habib: I do not want to send
  // another email to the co-implementer, they should have the link to register
  // and sign on to the platform. This used to assert the opposite, because the
  // sign-in came from a separate invite button. That button sent a second,
  // separate message, so a new person got two emails from two senders and the
  // one that explained anything could not be acted on.
  it('carries the sign-in itself, so exactly one message goes out', () => {
    expect(LETTER).toContain('ctaUrl: wayIn.url')
    expect(LETTER).toContain('signInLinkFor')
    // generateLink, which signInLinkFor uses, creates the account WITHOUT
    // Supabase sending an email of its own. That is what makes it one letter.
    expect(SIGNIN).toContain('admin.auth.admin.generateLink')
    // And the second button is gone from the screen.
    expect(DASH).not.toContain('renderInvite={ci=><InviteLoginButton')
    expect(TEAM).not.toContain('renderInvite&&renderInvite(ci)')
  })

  it('the link is wrapped so a mail scanner cannot spend it', () => {
    expect(LETTER).toContain('scannerSafeSignIn')
    expect(APPURL).toContain("/welcome#to=")
  })

  it('nothing is sent when no account came back to attach a role to', () => {
    expect(LETTER).toContain('if (!linked.userId) {')
  })

  it('the profile is inserted, never upserted, so a live account cannot be overwritten', () => {
    // CodeRabbit on #262, rated critical: the existence check and the write
    // are two steps, and an upsert between them replaces a real account's role
    // and scope with this co-implementer's.
    expect(LETTER).toContain("from('user_profiles').insert({ ...profileRow, status: 'invited' })")
    expect(LETTER).not.toContain("from('user_profiles').upsert")
    expect(LETTER).toContain("e?.code === '23505'")
  })

  it('a resend is claimed against the date it read, so two presses cannot both send', () => {
    expect(LETTER).toContain("claimQuery.eq('welcome_sent_at', alreadyAt)")
  })

  it('a link without a profile is a door into an empty room, so the profile is made too', () => {
    expect(LETTER).toContain("role: 'coach'")
    expect(LETTER).toContain('co_implementer_id: ci.id')
    // Never touched if one already exists: sending a letter cannot change what
    // somebody can reach.
    expect(LETTER).toContain('if (!already) {')
    // A failed lookup is not proof there is no profile.
    expect(LETTER).toContain('if (lookErr) {')
  })

  it('nothing is sent when the way in could not be made', () => {
    expect(LETTER).toContain('if (!wayIn.ok) {')
    expect(LETTER).toContain('Nothing was sent:')
  })

  it('one rule decides which site a link points at, shared with the invite', () => {
    // A preview or staging deploy must never email a link to the live site,
    // and a rule written twice is a rule that drifts.
    expect(APPURL).toContain('NEXT_PUBLIC_APP_URL')
    expect(INVITE).toContain("from '@/lib/app-url'")
    expect(LETTER).toContain("from '@/lib/app-url'")
  })

  it('the letter text itself never holds a link, only the button does', () => {
    expect(WORDS).not.toMatch(/https?:\/\//)
  })

  it('says how to use the platform, and where each service’s session guide is', () => {
    expect(WORDS).toContain('# How to use it, in the order you will need it')
    expect(WORDS).toContain('# Where the guide for each session is')
    expect(WORDS).toContain('Coach Quick Reference')
    for (const service of ['Grant-to-Commercial Viability Canvas', 'Clearview financial model', 'Clearview Advisory', 'Market Intelligence']) {
      expect(WORDS).toContain(service)
    }
    // The shelves named in the letter are the shelves that exist.
    for (const shelf of GUIDANCE_CATEGORIES.filter(c => c.id !== 'commercial')) {
      expect(WORDS).toContain(shelf.label)
    }
    // Commercial is the coaching team's pricing shelf and is not named to a
    // person who has just joined.
    expect(WORDS).not.toContain('# Commercial')
  })

  it('it can be sent again when a link has expired, behind its own question', () => {
    expect(LETTER).toContain('const resend = asked.resend === true')
    expect(DASH).toContain('Send again with a new link')
    expect(DASH).toContain('window.confirm(')
  })

  it('names no rate and no fee', () => {
    expect(LETTER).not.toContain('rate_per_day')
    expect(WORDS).not.toMatch(/day rate|per day|\bfee\b/i)
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
    expect(LETTER).toContain("claimQuery.is('welcome_sent_at', null)")
    expect(LETTER).toContain('if (!claim || claim.length === 0)')
    expect(LETTER).toContain('update({ welcome_sent_at: resend && typeof alreadyAt')
    expect(LETTER).toContain('alreadySent: true')
    const sql = readFileSync('supabase/migrations/2026_09_13_coach_letters.sql', 'utf8')
    expect(sql).toContain('add column if not exists welcome_sent_at timestamptz')
  })

  it('the edited letter has a home of its own, for the whole practice', () => {
    // The engagement letters are edited per client and stored on the
    // engagement. This one belongs to the practice, not to any one client.
    const sql = readFileSync('supabase/migrations/2026_09_13_coach_letters.sql', 'utf8')
    expect(sql).toContain('create table if not exists coach_letters')
    expect(sql).toContain("create policy super_coach_only on coach_letters for all")
    expect(sql).toContain("using (my_role() = 'super_coach')")
    expect(sql).toContain("with check (my_role() = 'super_coach')")
  })

  it('works before that migration is applied, and reports the truth either way', () => {
    // The column is read off a select('*'), and only its absence is forgiven:
    // a claim that fails for any other reason holds the letter back rather
    // than sending an unclaimed second copy through somebody's door.
    expect(LETTER).toContain("select('*')")
    expect(LETTER).toContain('const columnNotThereYet =')
    expect(LETTER).toContain('if (!columnNotThereYet) {')
    expect(LETTER).toContain('Nothing was sent. Please try again.')
  })

  it('names the date it already went, or says nothing rather than nonsense', () => {
    // The request that loses the claim used to answer with no date at all, and
    // the screen turned that into "Invalid Date".
    expect(LETTER).toContain("select('welcome_sent_at').eq('id', ci.id)")
    expect(DASH).toContain("setMsg(when&&!Number.isNaN(when.getTime())?('Already sent on '+when.toLocaleDateString()+'.'):'Already sent.')")
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
