// ============================================================
// Which service does this line belong to?
//
// The cases that matter are the awkward ones: a row with no name yet, a cost
// that is genuinely shared, and a line still pointing at a service that has
// been removed. The last one is the reason serviceLabelFor does not simply
// fall back to "shared": a costing attached to something that no longer exists
// is a finding, not a tidy default.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  serviceName, serviceOptions, serviceLabelFor, groupByService, SHARED_SERVICE_LABEL,
  servicesFromInventory, servicesFromPropositions,
} from '@/lib/gtcv-services'

const props = [
  { id: 'p1', service_name: 'District health offices', what_it_delivers: 'Training' },
  { id: 'p2', service_name: '', what_it_delivers: 'Cold chain maintenance for rural clinics' },
  { id: 'p3', service_name: null, what_it_delivers: null },
]

describe('naming a service', () => {
  it('uses the name the organisation gave it', () => {
    expect(serviceName(props[0], 0)).toBe('District health offices')
  })

  it('falls back to what it delivers when it has no name yet', () => {
    expect(serviceName(props[1], 1)).toBe('Cold chain maintenance for rural clinics')
  })

  it('falls back to position when the row is still empty', () => {
    expect(serviceName(props[2], 2)).toBe('Service 3')
  })

  it('shortens a long name at a word boundary', () => {
    const long = { id: 'x', service_name: 'Ministries of agriculture and their district extension offices across the northern corridor' }
    const name = serviceName(long, 0)
    expect(name.endsWith('...')).toBe(true)
    expect(name.length).toBeLessThanOrEqual(64)
    // Cut between words, so it does not end mid-word.
    expect(name).toBe('Ministries of agriculture and their district extension...')
  })

  it('collapses stray whitespace so the same service reads the same everywhere', () => {
    expect(serviceName({ id: 'x', service_name: '  District   health  offices ' }, 0))
      .toBe('District health offices')
  })

  // ─── C80. THE CUT LANDS ON A CHARACTER, NEVER INSIDE ONE ───
  // Each of these names is longer than sixty characters and is written in a
  // script where one visible character is more than one UTF-16 code unit. The
  // old cut counted units, so it could take half a character and leave a broken
  // glyph on screen. What is asserted is not the exact wording of the result
  // but the thing C80 is about: nothing half-removed survives the cut.

  /** A lone surrogate is half of a character, and is what a bad cut leaves. */
  const hasBrokenCharacter = (s: string) => /[\uD800-\uDFFF]/.test(
    s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''),
  )

  it('does not split an emoji in half', () => {
    // One letter first, so the sixtieth code unit falls in the MIDDLE of an
    // emoji rather than neatly between two. That offset is the whole point:
    // the old cut left a lone surrogate here, which renders as a broken box.
    const name = serviceName({ id: 'x', service_name: `A${'\u{1F33E}'.repeat(80)}` }, 0)
    expect(hasBrokenCharacter(name)).toBe(false)
    expect(name).toBe(`A${'\u{1F33E}'.repeat(59)}...`)
  })

  it('does not strand a combining mark from the letter it belongs to', () => {
    // Devanagari: the vowel sign is its own code point but not its own
    // character. One letter first again, so the cut falls BETWEEN the letter
    // and its vowel sign — the old cut ended on a bare consonant and put the
    // floating mark's letter on screen without it.
    const KI = '\u0915\u093F'
    const name = serviceName({ id: 'x', service_name: `A${KI.repeat(70)}` }, 0)
    expect(name).toBe(`A${KI.repeat(59)}...`)
  })

  it('counts sixty characters, not sixty code units', () => {
    // Fifty e-acutes written as a letter plus a combining mark: fifty
    // characters, but a hundred code units. Counting units would cut a name
    // that is comfortably inside the limit, so it comes back whole.
    const decomposed = 'e\u0301'.repeat(50)
    expect(decomposed.length).toBe(100)
    expect(serviceName({ id: 'x', service_name: decomposed }, 0)).toBe(decomposed)
  })

  it('still cuts an ASCII name exactly where it always did', () => {
    const long = { id: 'x', service_name: 'Ministries of agriculture and their district extension offices across the northern corridor' }
    expect(serviceName(long, 0)).toBe('Ministries of agriculture and their district extension...')
  })
})

describe('offering the services', () => {
  it('offers every service, in the order they are held', () => {
    expect(serviceOptions(props)).toEqual([
      { id: 'p1', label: 'District health offices' },
      { id: 'p2', label: 'Cold chain maintenance for rural clinics' },
      { id: 'p3', label: 'Service 3' },
    ])
  })

  it('offers nothing before any service has been named', () => {
    expect(serviceOptions([])).toEqual([])
  })
})

describe('labelling a stored reference', () => {
  it('names the service it points at', () => {
    expect(serviceLabelFor(props, 'p2')).toBe('Cold chain maintenance for rural clinics')
  })

  it('calls an unset reference shared, because that is what it means', () => {
    expect(serviceLabelFor(props, null)).toBe(SHARED_SERVICE_LABEL)
    expect(serviceLabelFor(props, undefined)).toBe(SHARED_SERVICE_LABEL)
    expect(serviceLabelFor(props, '')).toBe(SHARED_SERVICE_LABEL)
  })

  it('says so when the service has gone, rather than calling it shared', () => {
    // Removing a service nulls the reference on the costing, by design. A line
    // left pointing nowhere has to be visible, not absorbed into "shared".
    expect(serviceLabelFor(props, 'deleted')).toBe('Service no longer listed')
  })
})

describe('grouping work by service', () => {
  const rows = [
    { id: 'c1', service_id: 'p1' },
    { id: 'c2', service_id: null },
    { id: 'c3', service_id: 'p1' },
    { id: 'c4', service_id: 'gone' },
  ]

  it('keeps a service that has no lines yet, because that is the finding', () => {
    const groups = groupByService(rows, props)
    const p2 = groups.find((g) => g.id === 'p2')!
    expect(p2.rows).toEqual([])
  })

  it('puts each line under its own service', () => {
    const groups = groupByService(rows, props)
    expect(groups.find((g) => g.id === 'p1')!.rows.map((r) => r.id)).toEqual(['c1', 'c3'])
  })

  it('gathers shared work at the end rather than hiding it', () => {
    const groups = groupByService(rows, props)
    const shared = groups.find((g) => g.label === SHARED_SERVICE_LABEL)!
    expect(shared.rows.map((r) => r.id)).toEqual(['c2'])
    expect(groups[groups.length - 1]).toBe(shared)
  })

  it('surfaces lines whose service has been removed', () => {
    const groups = groupByService(rows, props)
    const orphans = groups.find((g) => g.label === 'Service no longer listed')!
    expect(orphans.rows.map((r) => r.id)).toEqual(['c4'])
  })

  it('loses nothing: every row lands in exactly one group', () => {
    const groups = groupByService(rows, props)
    const placed = groups.flatMap((g) => g.rows.map((r) => r.id))
    expect(placed.sort()).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('shows the services even when no work has been recorded at all', () => {
    const groups = groupByService([], props)
    expect(groups.map((g) => g.id)).toEqual(['p1', 'p2', 'p3'])
    expect(groups.every((g) => g.rows.length === 0)).toBe(true)
  })
})

describe('the two lists of services', () => {
  // The inventory is what is delivered today; the propositions are the new
  // services DP04 costs. Both feed the same picker, so both have to normalise
  // to the same shape and be named by the same rule.
  it('normalises an inventory row', () => {
    const [s] = servicesFromInventory([
      { id: 'i1', service_name: 'Gender advisory', what_it_delivers: 'Advice to programmes' },
    ])
    expect(serviceName(s, 0)).toBe('Gender advisory')
  })

  it('normalises a proposition, naming it by the segment it is aimed at', () => {
    const [s] = servicesFromPropositions([
      { id: 'v1', segment_label: 'Commercial seed companies', capability: 'Agronomy training' },
    ])
    expect(serviceName(s, 0)).toBe('Commercial seed companies')
  })

  it('falls back through capability, then the assembled statement', () => {
    const [a, b] = servicesFromPropositions([
      { id: 'v1', segment_label: '', capability: 'Agronomy training' },
      { id: 'v2', segment_label: '', capability: '', assembled_statement: 'We help seed companies reach smallholders' },
    ])
    expect(serviceName(a, 0)).toBe('Agronomy training')
    expect(serviceName(b, 1)).toBe('We help seed companies reach smallholders')
  })

  it('groups DP04 rows by proposition, not by inventory service', () => {
    const services = servicesFromPropositions([{ id: 'v1', segment_label: 'Seed companies' }])
    const costs = [{ id: 'c1', proposition_id: 'v1' }, { id: 'c2', proposition_id: null }]
    const groups = groupByService(costs, services, 'proposition_id')
    expect(groups[0].rows.map((r) => r.id)).toEqual(['c1'])
    expect(groups[groups.length - 1].label).toBe(SHARED_SERVICE_LABEL)
  })
})
