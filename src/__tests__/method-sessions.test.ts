// ============================================================
// THE METHOD, READ BY TWO SCREENS THAT MUST NOT DISAGREE
//
// Habib, 16 September 2026: "all the planning and everything associated with
// each decision point is moved to that decision tab. The session and room
// should then draw the details of the sessions, planned or otherwise, into it
// so it works almost like a summary... and looks like a workplan that can be
// shared or downloaded."
//
// Two screens over one set of facts only works while both read the same
// facts. The catalogue used to sit inside the planner component, where the
// decision point could not reach it and nothing about it could be tested
// without a browser. These run the real functions.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  DPS, KINDS, kindDef, METHOD_SESSIONS, methodSessionsFor, dpLabel, dpHref,
  requiredRoles, excludedRoles, attendanceWarnings, workplanGroups, workplanCsv,
  durationLabel, KIND_LABEL,
} from '@/lib/method-sessions'

describe('the catalogue', () => {
  it('names a session for every decision point the method runs', () => {
    // Every decision point in DPS is a heading somebody will open, and an
    // empty one is a heading that says the method has nothing to say there.
    const missing = DPS.filter(d => methodSessionsFor(d.id).length === 0).map(d => d.id)
    expect(missing).toEqual([])
  })

  it('puts every prescribed session in a room the platform knows', () => {
    const rooms = new Set(KINDS.map(k => k.v))
    const strays: string[] = []
    Object.entries(METHOD_SESSIONS).forEach(([dp, list]) => {
      list.forEach((t: any) => { if (!rooms.has(t.kind)) strays.push(`${dp}: ${t.title}`) })
    })
    expect(strays).toEqual([])
  })

  it('never prescribes the same session twice at one decision point', () => {
    // The picker disables a session already in the plan by its title, so two
    // entries with one title would be a button that can never be pressed.
    Object.entries(METHOD_SESSIONS).forEach(([dp, list]) => {
      const titles = list.map((t: any) => t.title)
      expect(new Set(titles).size, dp).toBe(titles.length)
    })
  })

  it('says what a session is for, in every single one', () => {
    Object.values(METHOD_SESSIONS).forEach((list: any) => {
      list.forEach((t: any) => expect(t.purpose.length).toBeGreaterThan(20))
    })
  })

  it('has a label for every room, both ways round', () => {
    KINDS.forEach(k => expect(KIND_LABEL[k.v]).toBe(k.l))
    expect(kindDef('plenary')?.l).toBe('Plenary')
    expect(kindDef('not a room')).toBeNull()
  })

  it('names the decision point, and does not invent one it has never heard of', () => {
    expect(dpLabel('dp04')).toContain('Decision Point 4')
    expect(dpLabel('nonsense')).toBe('nonsense')
  })
})

describe('who the method puts in a room', () => {
  it('keeps the field team out of the cost mapping sessions', () => {
    // The privacy protocol is explicit: finance, HR and leadership only. The
    // field team validates delivery time separately and never sees the totals.
    expect(excludedRoles('finance_restricted')).toContain('lsp_field')
    expect(requiredRoles('finance_restricted')).toContain('lsp_finance')
  })

  it('keeps the funder out of a client team session', () => {
    expect(excludedRoles('client_team_only')).toContain('funder_rep')
  })

  it('adds what one session needs on top of what its room needs', () => {
    const roles = requiredRoles('joint_with_funder', ['lsp_board'])
    expect(roles).toContain('funder_rep')
    expect(roles).toContain('lsp_board')
  })

  it('asks for nobody twice', () => {
    expect(requiredRoles('plenary', ['lsp_ed'])).toEqual(
      Array.from(new Set(requiredRoles('plenary', ['lsp_ed']))),
    )
  })
})

describe('what is wrong with the room', () => {
  const namedRoles = ['lead_consultant', 'lsp_ed', 'lsp_leadership', 'lsp_field', 'funder_rep']

  it('says when somebody the method wants is not in the session', () => {
    const w = attendanceWarnings({
      kind: 'plenary', extraRequired: [],
      presentRoles: ['lead_consultant'], namedRoles,
    })
    expect(w.missing).toContain('lsp_ed')
    expect(w.missing).not.toContain('lead_consultant')
  })

  it('says when somebody the method keeps out is in it', () => {
    const w = attendanceWarnings({
      kind: 'finance_restricted', extraRequired: [],
      presentRoles: ['lsp_finance', 'lsp_leadership', 'lead_consultant', 'lsp_field'],
      namedRoles: ['lsp_finance', 'lsp_leadership', 'lead_consultant', 'lsp_field'],
    })
    expect(w.intruders).toEqual(['lsp_field'])
    expect(w.missing).toEqual([])
  })

  it('separates nobody being ticked from nobody existing to tick', () => {
    // Saying "the finance lead is not in the room" is true and useless when
    // the engagement has no finance lead on it at all.
    const w = attendanceWarnings({
      kind: 'finance_restricted', extraRequired: [],
      presentRoles: [], namedRoles: ['lead_consultant'],
    })
    expect(w.unnamed).toContain('lsp_finance')
    expect(w.unnamed).not.toContain('lead_consultant')
  })

  it('is quiet when the room is right', () => {
    const w = attendanceWarnings({
      kind: 'one_to_one', extraRequired: [],
      presentRoles: ['lead_consultant'], namedRoles: ['lead_consultant'],
    })
    expect(w).toEqual({ missing: [], intruders: [], unnamed: [] })
  })

  it('never warns about a room that was never set', () => {
    const w = attendanceWarnings({ kind: null, extraRequired: [], presentRoles: [], namedRoles: [] })
    expect(w).toEqual({ missing: [], intruders: [], unnamed: [] })
  })
})

describe('the workplan', () => {
  const sessions = [
    { id: 'c', dp_id: 'dp02', title: 'Fieldwork', planned_at: '2026-10-02T09:00:00.000Z' },
    { id: 'a', dp_id: 'phase_0', title: 'Assumption clearing, session 1', planned_at: '2026-09-20T09:00:00.000Z' },
    { id: 'b', dp_id: 'dp02', title: 'Opening plenary', planned_at: '2026-10-01T09:00:00.000Z' },
  ]

  it('runs in the order the method runs, not the order the rows came back', () => {
    const groups = workplanGroups(sessions)
    const order = groups.map(g => g.id)
    expect(order.indexOf('phase_0')).toBeLessThan(order.indexOf('dp02'))
    expect(order[0]).toBe('setup')
  })

  it('puts the sessions inside a decision point in the order they happen', () => {
    const dp02 = workplanGroups(sessions).find(g => g.id === 'dp02')
    expect(dp02?.sessions.map((s: any) => s.id)).toEqual(['b', 'c'])
  })

  it('keeps a decision point with nothing in it, so an empty one is visible', () => {
    // The point of a workplan is noticing that nothing is planned for
    // Decision Point 5.
    const groups = workplanGroups(sessions)
    expect(groups.find(g => g.id === 'dp05')?.sessions).toEqual([])
  })

  it('shows a session with no date rather than dropping it', () => {
    const groups = workplanGroups([...sessions, { id: 'd', dp_id: 'dp02', title: 'Not scheduled yet' }])
    const dp02 = groups.find(g => g.id === 'dp02')
    // Last, because it has no date, but present.
    expect(dp02?.sessions.map((s: any) => s.id)).toEqual(['b', 'c', 'd'])
  })

  it('does not lose a session whose decision point is not one we know', () => {
    // A session that exists and cannot be seen is worse than an untidy list.
    const groups = workplanGroups([{ id: 'x', dp_id: 'dp42', title: 'Stray' }])
    const loose = groups[groups.length - 1]
    expect(loose.id).toBe('__unassigned')
    expect(loose.sessions.map((s: any) => s.id)).toEqual(['x'])
  })

  it('is empty rather than broken when there is nothing at all', () => {
    expect(workplanGroups(null).every(g => g.sessions.length === 0)).toBe(true)
  })
})

describe('the spreadsheet', () => {
  it('carries one row per session, with the people spelled out', () => {
    const csv = workplanCsv(
      [{ id: 'a', dp_id: 'dp01', title: 'Service listing plenary', session_kind: 'plenary', status: 'held', duration_minutes: 180 }],
      () => ['Ada Lovelace', 'Grace Hopper'],
    )
    expect(csv).toContain('"Decision point","Session"')
    expect(csv).toContain('"Service listing plenary"')
    expect(csv).toContain('"Plenary"')
    expect(csv).toContain('"Ada Lovelace; Grace Hopper"')
  })

  it('does not let a session name run as a formula in a spreadsheet', () => {
    // A title beginning with = is executed by Excel and Sheets when the file
    // is opened. A quote in front makes it text again, and is not shown.
    const csv = workplanCsv([{ id: 'a', dp_id: 'dp01', title: '=1+1' }], () => [])
    expect(csv).toContain(`"'=1+1"`)
    expect(csv).not.toContain('"=1+1"')
  })

  it('survives a comma and a quotation mark in what somebody typed', () => {
    const csv = workplanCsv([{ id: 'a', dp_id: 'dp01', title: 'Costs, "all in"' }], () => [])
    expect(csv).toContain('"Costs, ""all in"""')
  })

  it('says planned when nothing says otherwise', () => {
    const csv = workplanCsv([{ id: 'a', dp_id: 'dp01', title: 'x' }], () => [])
    expect(csv).toContain('"planned"')
  })

  it('ends with a newline, so the last row is not lost', () => {
    expect(workplanCsv([{ id: 'a', dp_id: 'dp01', title: 'x' }], () => []).endsWith('\r\n')).toBe(true)
  })
})

describe('the way back to where a session is changed', () => {
  it('sends you to the decision point, not to the workplan', () => {
    expect(dpHref('cli_1', 'dp04')).toBe('/coach?client=cli_1&zone=dp04')
    expect(dpHref('cli_1', 'phase_0')).toBe('/coach?client=cli_1&zone=phase0')
    // The pre-engagement diagnostic is a decision point in the method and a
    // tab of its own on the screen.
    expect(dpHref('cli_1', 'setup')).toBe('/coach?client=cli_1&zone=diagnostic')
  })

  it('offers no link at all rather than a broken one', () => {
    expect(dpHref('cli_1', '__unassigned')).toBeNull()
    expect(dpHref(null, 'dp04')).toBeNull()
  })
})

describe('how long a session runs, in words', () => {
  it('reads a day as a day and an afternoon as half a day', () => {
    expect(durationLabel(480)).toBe('1 full day')
    expect(durationLabel(960)).toBe('2 full days')
    expect(durationLabel(240)).toBe('half day')
    expect(durationLabel(120)).toBe('2 hr')
    expect(durationLabel(45)).toBe('45 min')
  })

  it('says nothing when nobody said how long it runs', () => {
    expect(durationLabel(null)).toBe('')
    expect(durationLabel(undefined)).toBe('')
    expect(durationLabel(0)).toBe('')
  })
})
