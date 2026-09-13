// ============================================================
// A WON DEAL LEAVES THE PIPELINE, AND ANY NOTICE CAN BE SET ASIDE
//
// Habib: "I should be able to dismiss or set aside any flag. When a pipeline
// client status is won, it should move straight out of the pipeline even if
// it is labelled as not set up yet and the number of client and the value in
// the my business should reflect this update."
//
// Three faults sat behind that sentence, and one test here for each:
//   1. A won deal stayed on the pipeline until somebody created the client
//      record, so closed deals sat among the ones still being chased.
//   2. The count on the Pipeline tab was taken from a different rule from
//      the list underneath it, so the two described different deals.
//   3. The notices at the top of My Business could not be put down at all.
//
// The screen tests read the source, because the screens are one very large
// component with no seam to test through. They are standing rules rather
// than a description: each names what was wrong and fails if it comes back.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { splitPipeline, clientCountForProgramme } from '@/lib/coach-business-metrics'
import {
  noticeFingerprint, noticeIsSetAside, noticeLiveIds, noticeDismissedIds, noticeWithDismissed,
  NOTICE_NEW_SUBMISSIONS, NOTICE_TIMESHEETS_AWAITING,
} from '@/lib/notice-dismissal'

const DASH = readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')
const DEALS = readFileSync('src/components/coach/DealsAndFees.tsx', 'utf8')
const MIGRATION = readFileSync('supabase/migrations/2026_09_14_coach_notice_dismissals.sql', 'utf8')
const DISMISS_SQL = readFileSync('supabase/migrations/2026_09_14_notice_dismissed_ids.sql', 'utf8')
const ASSIGN_SQL = readFileSync('supabase/migrations/2026_09_14_assignments.sql', 'utf8')

const deal = (id: string, stage: string | null) => ({ id, name: id, deal_stage: stage })

describe('splitPipeline', () => {
  it('takes a won deal off the pipeline even though no client exists yet', () => {
    const programmes = [deal('won1', 'won'), deal('live1', 'proposal')]
    const r = splitPipeline(programmes, [])
    expect(r.open.map(p => p.id)).toEqual(['live1'])
    expect(r.wonAwaitingSetup.map(p => p.id)).toEqual(['won1'])
  })

  it('keeps the won deal reachable, so the route to setting the client up is not lost', () => {
    const r = splitPipeline([deal('won1', 'won')], [])
    expect(r.wonAwaitingSetup).toHaveLength(1)
  })

  it('drops a won deal out of every list once its client exists', () => {
    const r = splitPipeline([deal('won1', 'won')], [{ programme_id: 'won1' }])
    expect(r.open).toHaveLength(0)
    expect(r.wonAwaitingSetup).toHaveLength(0)
    expect(r.notTakenForward).toHaveLength(0)
    expect(clientCountForProgramme('won1', [{ programme_id: 'won1' }])).toBe(1)
  })

  it('treats a deal with no stage recorded as open, the same as its stage selector does', () => {
    const r = splitPipeline([deal('new1', null)], [])
    expect(r.open.map(p => p.id)).toEqual(['new1'])
  })

  it('gives a lost deal a home of its own, so one marked lost by mistake can be put back', () => {
    const r = splitPipeline([deal('lost1', 'lost')], [])
    expect(r.open).toHaveLength(0)
    expect(r.notTakenForward.map(p => p.id)).toEqual(['lost1'])
  })

  it('puts every waiting deal in exactly one of the three lists', () => {
    const programmes = [deal('a', 'conversation'), deal('b', 'won'), deal('c', 'lost'), deal('d', null)]
    const r = splitPipeline(programmes, [])
    expect(r.open.length + r.wonAwaitingSetup.length + r.notTakenForward.length).toBe(4)
  })
})

describe('the Pipeline screen and the Pipeline tab count describe the same deals', () => {
  it('the screen draws its lists from splitPipeline', () => {
    expect(DEALS).toContain('splitPipeline(programmes,clients)')
    expect(DEALS).toContain('wonAwaitingSetup')
    expect(DEALS).toContain('notTakenForward')
  })

  it('the tab count is that same split, not a second rule of its own', () => {
    expect(DASH).toContain('splitPipeline(programmes,clients).open.length')
    expect(DASH).not.toContain("programmes.filter(p=>p.deal_stage&&p.deal_stage!=='won'&&p.deal_stage!=='lost')")
  })

  it('the open list no longer carries a won strip, because nothing won reaches it', () => {
    expect(DEALS).not.toContain("{p.deal_stage==='won'&&(")
  })

  it('setting the client up is still one press away from a won deal', () => {
    expect(DEALS).toContain('+ Set this client up')
  })
})

describe('noticeFingerprint', () => {
  it('does not care what order the records arrive in', () => {
    expect(noticeFingerprint(['a', 'b', 'c'])).toBe(noticeFingerprint(['c', 'a', 'b']))
  })

  it('changes when a record joins the set', () => {
    expect(noticeFingerprint(['a', 'b'])).not.toBe(noticeFingerprint(['a', 'b', 'c']))
  })

  it('changes when a record leaves the set', () => {
    expect(noticeFingerprint(['a', 'b'])).not.toBe(noticeFingerprint(['a']))
  })

  it('tells apart two different sets of the same size', () => {
    expect(noticeFingerprint(['a', 'b'])).not.toBe(noticeFingerprint(['c', 'd']))
  })

  it('carries the number of records, so a stored row can be read by eye', () => {
    expect(noticeFingerprint(['a', 'b', 'c']).startsWith('3:')).toBe(true)
  })
})

describe('noticeIsSetAside', () => {
  const ids = ['t1', 't2']

  it('is false when nothing has been set aside', () => {
    expect(noticeIsSetAside(null, ids)).toBe(false)
    expect(noticeIsSetAside({ notice_key: 'k', covers: null }, ids)).toBe(false)
  })

  it('is true while the set is exactly the one that was set aside', () => {
    const stored = { notice_key: 'k', covers: noticeFingerprint(ids) }
    expect(noticeIsSetAside(stored, ['t2', 't1'])).toBe(true)
  })

  it('brings the notice back the moment a new record arrives', () => {
    const stored = { notice_key: 'k', covers: noticeFingerprint(ids) }
    expect(noticeIsSetAside(stored, ['t1', 't2', 't3'])).toBe(false)
  })
})

describe('the notices on My Business can be set aside, and it is stored in the database', () => {
  it('both notices offer Set aside', () => {
    expect(DASH).toContain(`setNoticeAside(${'NOTICE_NEW_SUBMISSIONS'},newSubmissions.map(c=>c.id))`)
    expect(DASH).toContain(`setNoticeAside(${'NOTICE_TIMESHEETS_AWAITING'},pendingTimesheets.map(t=>t.id))`)
    expect(DASH).toContain('Set aside')
  })

  it('a notice that has been put down leaves a line saying so, and a way back', () => {
    expect(DASH).toContain('function SetAsideLine(')
    expect(DASH).toContain('Bring it back')
  })

  it('the set-aside is written to Supabase, never to the browser', () => {
    expect(DASH).toContain("supabase.from('coach_notice_dismissals')")
    const start = DASH.indexOf('async function setNoticeAside')
    const body = DASH.slice(start, start + 900)
    expect(body).not.toContain('localStorage')
    expect(body).not.toContain('sessionStorage')
  })

  it('two presses on one notice cannot race each other', () => {
    // Set aside and Bring it back wrote independently, so the two could commit
    // out of order and leave the record older than the screen. CodeRabbit
    // on #262.
    expect(DASH).toContain('if(noticeBusy[key])return')
    expect(DASH).toContain('disabled={!!noticeBusy[NOTICE_NEW_SUBMISSIONS]}')
    expect(DASH).toContain('disabled={!!noticeBusy[NOTICE_TIMESHEETS_AWAITING]}')
  })

  it('the first load never lands on top of a press made while it was loading', () => {
    expect(DASH).toContain('noticeTouched.current.add(key)')
    expect(DASH).toContain('if(!noticeTouched.current.has(r.notice_key))')
    // And a press that did not land is not treated as a press. CodeRabbit
    // on #263.
    expect(DASH).toContain('noticeTouched.current.delete(key)')
  })

  it('a failed press falls back to what the database last said, never to nothing', () => {
    // What the database said is kept separately from what the screen shows, so
    // a load that arrives while a press is in flight is remembered rather than
    // thrown away, and a press that then fails has something truthful to fall
    // back to. CodeRabbit on #264.
    expect(DASH).toContain('const noticeStored=useRef({})')
    expect(DASH).toContain('noticeStored.current[r.notice_key]=r')
    expect(DASH).toContain('const truth=key in noticeStored.current?noticeStored.current[key]:onScreenBefore')
    expect(DASH).toContain('noticeStored.current[key]=next')
  })

  it('a load that arrives after a write has landed cannot put the old row back', () => {
    // The load is a snapshot taken before the press, so once a write has
    // landed it is older than what is stored. CodeRabbit on #265.
    expect(DASH).toContain('const noticeWritten=useRef(new Set())')
    expect(DASH).toContain('if(!noticeWritten.current.has(r.notice_key))noticeStored.current[r.notice_key]=r')
    expect(DASH.match(/noticeWritten\.current\.add\(key\)/g) || []).toHaveLength(2)
  })

  it('setting aside never forgets what was dismissed', () => {
    expect(DASH).toContain("dismissed_ids:current?.dismissed_ids||[]")
  })

  it('a failed write puts the screen back rather than showing it as set aside', () => {
    const start = DASH.indexOf('async function setNoticeAside')
    const body = DASH.slice(start, start + 900)
    expect(body).toContain('if(error)')
    expect(body).toContain('setNoticeError')
  })

  it('the table it writes to exists, is locked to the super coach, and says why', () => {
    expect(MIGRATION).toContain('create table if not exists coach_notice_dismissals')
    expect(MIGRATION).toContain('enable row level security')
    expect(MIGRATION).toContain("my_role() = 'super_coach'")
    expect(MIGRATION).toContain('with check')
  })

  it('the two notice keys are named once and shared', () => {
    expect(NOTICE_NEW_SUBMISSIONS).toBe('new_intake_submissions')
    expect(NOTICE_TIMESHEETS_AWAITING).toBe('timesheets_awaiting_approval')
  })
})

// DISMISS IS NOT SET ASIDE. 14 September 2026. Habib: I need to be able to
// dismiss flags from My Business, not just set them aside. Set aside is about
// the whole notice and comes back as soon as the set changes. Dismiss is about
// the records, named one by one, and they do not come back.
describe('dismissing records, as opposed to setting the notice aside', () => {
  const stored = (ids: string[]) => ({ notice_key: 'k', covers: null, dismissed_ids: ids })

  it('a dismissed record leaves the notice', () => {
    expect(noticeLiveIds(stored(['a']), ['a', 'b'])).toEqual(['b'])
  })

  it('a record that arrives afterwards still raises the notice', () => {
    // This is what makes dismissing safe: today's dismissal cannot hide
    // tomorrow's work.
    expect(noticeLiveIds(stored(['a', 'b']), ['a', 'b', 'c'])).toEqual(['c'])
  })

  it('nothing dismissed means nothing hidden', () => {
    expect(noticeLiveIds(null, ['a', 'b'])).toEqual(['a', 'b'])
    expect(noticeDismissedIds(null, ['a', 'b'])).toEqual([])
  })

  it('the dismissed ones can still be named, so they can be offered back', () => {
    expect(noticeDismissedIds(stored(['a']), ['a', 'b'])).toEqual(['a'])
  })

  it('dismissing adds to what is already dismissed, without repeating anything', () => {
    expect(noticeWithDismissed(stored(['a']), ['a', 'b'])).toEqual(['a', 'b'])
    expect(noticeWithDismissed(null, ['b', 'a'])).toEqual(['a', 'b'])
  })

  it('both notices offer Dismiss beside Set aside, and one record at a time', () => {
    expect(DASH).toContain('Dismiss all')
    expect(DASH).toContain('dismissNoticeRecords(NOTICE_NEW_SUBMISSIONS,[c.id],false)')
    expect(DASH).toContain('dismissNoticeRecords(NOTICE_TIMESHEETS_AWAITING,pendingTimesheets.map(t=>t.id),false)')
  })

  it('nothing is hidden without a line saying so and a way back', () => {
    expect(DASH).toContain('function DismissedLine(')
    expect(DASH).toContain('Show them again')
    expect(DASH).toContain('dismissedSubmissionIds.length>0')
    expect(DASH).toContain('dismissedPendingIds.length>0')
  })

  it('a dismissed timesheet still waits for approval, and the line says so', () => {
    // Dismissing is about this notice, never about the work behind it.
    expect(DASH).toContain('still waiting for approval on Team')
  })

  it('it is stored in the database, with a column that exists', () => {
    expect(DASH).toContain("select('notice_key,covers,dismissed_ids')")
    expect(DISMISS_SQL).toContain('add column if not exists dismissed_ids text[]')
  })
})

// WHO PAYS, WHAT THEY BOUGHT, AND WHO IT IS FOR. 14 September 2026. Habib:
// "maybe we need to separate paying clients from served clients... You have
// the finance for each of this but it is not showing in the dashboard."
// The three counts used to be one, and the money hung off the served
// organisation, so an assignment serving nobody yet had nowhere to keep its
// fee. See src/lib/assignments.ts.
describe('My Business counts payers, assignments and organisations apart', () => {
  it('the three counts are side by side and named for what they are', () => {
    expect(DASH).toContain('practiceShape(assignments,servedRows)')
    expect(DASH).toContain('Paying Clients')
    expect(DASH).toContain('Assignments')
    expect(DASH).toContain('Organisations Served')
  })

  it('the money comes from the assignments, which is what was invoiced', () => {
    expect(DASH).toContain('moneyByPayer(assignments,servedRows,period,now)')
    expect(DASH).toContain('assignmentMoney(assignments,period,now)')
    expect(DASH).toContain('monthlyAssignmentRevenue(assignments,trendPeriods)')
    // And no longer from the fee on a served organisation, which is how the
    // same money used to be counted twice.
    expect(DASH).not.toContain('clientTypeBreakdown(')
    expect(DASH).not.toContain('monthlyFeeRevenue(clients')
  })

  it('an assignment serving nobody yet is counted and said out loud', () => {
    expect(DASH).toContain('shape.assignmentsWithNobodyYet')
    expect(DASH).toContain('not yet serving anybody')
  })

  it('a fee covering more than one service is never split between them', () => {
    expect(DASH).toContain('serviceSplit.combinedAssignments')
    expect(DASH).toContain('A fee covering more than one service is never divided between them')
  })

  it('a figure that could not be read says so rather than printing a confident zero', () => {
    expect(DASH).toContain('const [servicesUnread,setServicesUnread]=useState(null)')
    expect(DASH).toContain('showing nothing rather than a real number')
  })

  it('the tables it reads exist, and the fee sits with the payer', () => {
    expect(ASSIGN_SQL).toContain('create table if not exists service_engagement_clients')
    expect(ASSIGN_SQL).toContain('add column if not exists service_types text[]')
    expect(ASSIGN_SQL).toContain('add column if not exists fee_paid_at date')
    expect(ASSIGN_SQL).toContain("my_role() = 'super_coach'")
  })

  it('every fee already entered is carried onto an assignment, not retyped', () => {
    expect(ASSIGN_SQL).toContain('insert into service_engagements')
    expect(ASSIGN_SQL).toContain('from engagement_clients c')
    expect(ASSIGN_SQL).toContain('on conflict (id) do nothing')
  })
})

describe('an assignment can be written down the way Habib described it', () => {
  it('it holds several services at once, not one', () => {
    expect(DASH).toContain('function NewAssignmentForm(')
    expect(DASH).toContain('Services it includes')
    expect(DASH).toContain('service_types:next,service_type:next[0]')
  })

  it('it serves several organisations, or none yet', () => {
    expect(DASH).toContain('Organisations it serves (leave empty if nobody yet)')
    expect(DASH).toContain('async function setServes(id,clientId,on)')
    expect(DASH).toContain('nobody yet, which is fine. The fee still counts.')
  })

  it('the fee, its status and its dates are on the assignment', () => {
    expect(DASH).toContain('Fee you invoiced')
    expect(DASH).toContain("updateAssignment(r.id,{fee_status:e.target.value||null})")
    expect(DASH).toContain("updateAssignment(r.id,{fee_paid_at:e.target.value||null})")
  })

  it('an assignment always includes at least one service', () => {
    expect(DASH).toContain('An assignment has to include at least one service.')
  })

  it('removing one asks first, because the fee goes with it', () => {
    const start = DASH.indexOf('async function removeAssignment')
    expect(DASH.slice(start, start + 500)).toContain('window.confirm(')
  })

  it('it says so when the fee saved but who it serves did not', () => {
    expect(DASH).toContain('The assignment was saved, but who it serves was not')
  })
})
