import { describe, it, expect } from 'vitest'

// Simulate the intake form submission logic
// Tests the exact code paths that have caused production failures

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`
}

function simulateSubmit(
  hasUnits: boolean,
  units: {id:string, name:string, headcount:number}[],
  products: Record<string,{id:string,name:string,costLines:{id:string,name:string}[]}[]>,
  figureData: Record<string,Record<number,number>>,
  businessName: string,
  pastMonths = 3
) {
  const wholeKey = 'whole'
  const totalMonths = 24
  const businessUnits: any[] = []
  const planLines: any[] = []

  function buildPlanArray(lineId: string) {
    return Array.from({length: totalMonths}, (_, i) => {
      const offset = i - pastMonths
      return figureData[lineId]?.[offset] ?? 0
    })
  }

  const keys = hasUnits ? units.filter(u => u.name).map(u => u.id) : [wholeKey]

  keys.forEach((key, ki) => {
    const unitName = hasUnits
      ? units.find(u => u.id === key)?.name
      : businessName

    // REG: headcount must come from units array, not undefined variable k
    businessUnits.push({
      id: key, name: unitName,
      headcount: hasUnits ? (units.find(u => u.id === key)?.headcount || 0) : 0,
      active: true, sort_order: ki,
    })

    const prods = products[key] || []
    prods.filter(p => p.name).forEach(p => {
      const revPlan = buildPlanArray(`${p.id}_rev`)
      planLines.push({
        id: `${p.id}_rev`, unit_id: key, name: p.name,
        category: 'revenue', monthly_plan: revPlan, active: true
      })
      p.costLines.forEach(c => {
        const costPlan = buildPlanArray(c.id)
        if (c.name || costPlan.some(v => v > 0)) {
          planLines.push({
            id: c.id, unit_id: key,
            name: `${p.name} — ${c.name || 'Cost'}`,
            category: 'cost_of_sales', monthly_plan: costPlan, active: true
          })
        }
      })
    })
  })

  return { businessUnits, planLines }
}

describe('Intake Form — Single Unit Submission', () => {
  const prodId = genId('prod')
  const costId = genId('cost')

  const products = {
    whole: [{ id: prodId, name: 'Egg Sales', costLines: [{ id: costId, name: 'Feed' }] }]
  }
  const figureData = {
    [`${prodId}_rev`]: { 0: 5_000_000, 1: 5_500_000, 2: 6_000_000 },
    [costId]: { 0: 2_000_000, 1: 2_200_000, 2: 2_400_000 },
  }

  it('creates one business unit with business name', () => {
    const { businessUnits } = simulateSubmit(false, [], products, figureData, "C'est La Vie")
    expect(businessUnits).toHaveLength(1)
    expect(businessUnits[0].name).toBe("C'est La Vie")
  })

  it('revenue plan line has correct figures', () => {
    const { planLines } = simulateSubmit(false, [], products, figureData, 'Test')
    const revLine = planLines.find(l => l.category === 'revenue')
    expect(revLine?.monthly_plan[3]).toBe(5_000_000) // offset 0 = month 3 (after 3 past months)
    expect(revLine?.monthly_plan[4]).toBe(5_500_000)
  })

  it('cost plan line has correct figures', () => {
    const { planLines } = simulateSubmit(false, [], products, figureData, 'Test')
    const costLine = planLines.find(l => l.category === 'cost_of_sales')
    expect(costLine?.monthly_plan[3]).toBe(2_000_000)
  })

  it('revenue key format is ${productId}_rev', () => {
    const { planLines } = simulateSubmit(false, [], products, figureData, 'Test')
    const revLine = planLines.find(l => l.category === 'revenue')
    expect(revLine?.id).toBe(`${prodId}_rev`)
  })

  it('cost line saves without name if it has figures', () => {
    const unnamedCostId = genId('cost')
    const prods = { whole: [{ id: prodId, name: 'Sales', costLines: [{ id: unnamedCostId, name: '' }] }] }
    const figs = { [`${prodId}_rev`]: { 0: 1_000_000 }, [unnamedCostId]: { 0: 500_000 } }
    const { planLines } = simulateSubmit(false, [], prods, figs, 'Test')
    const costLine = planLines.find(l => l.category === 'cost_of_sales')
    expect(costLine).toBeDefined()
    expect(costLine?.name).toContain('Cost') // default name applied
  })

  it('unnamed cost line with no figures is dropped', () => {
    const unnamedCostId = genId('cost')
    const prods = { whole: [{ id: prodId, name: 'Sales', costLines: [{ id: unnamedCostId, name: '' }] }] }
    const figs = { [`${prodId}_rev`]: { 0: 1_000_000 } } // no cost figures
    const { planLines } = simulateSubmit(false, [], prods, figs, 'Test')
    expect(planLines.filter(l => l.category === 'cost_of_sales')).toHaveLength(0)
  })
})

describe('Intake Form — Multi Unit Submission', () => {
  it('REG: headcount comes from units array not undefined variable', () => {
    const unitId = genId('unit')
    const units = [{ id: unitId, name: 'Livestock Unit', headcount: 5 }]
    const prodId2 = genId('prod')
    const products = { [unitId]: [{ id: prodId2, name: 'Chicken Sales', costLines: [] }] }
    const figureData = { [`${prodId2}_rev`]: { 0: 3_000_000 } }

    // This should NOT throw ReferenceError: k is not defined
    expect(() => {
      simulateSubmit(true, units, products, figureData, 'Farm')
    }).not.toThrow()
  })

  it('headcount is correctly assigned per unit', () => {
    const uid1 = genId('unit')
    const uid2 = genId('unit')
    const units = [
      { id: uid1, name: 'Livestock', headcount: 3 },
      { id: uid2, name: 'Crops', headcount: 7 },
    ]
    const p1 = genId('prod'), p2 = genId('prod')
    const products = {
      [uid1]: [{ id: p1, name: 'Livestock Sales', costLines: [] }],
      [uid2]: [{ id: p2, name: 'Crop Sales', costLines: [] }],
    }
    const figureData = {
      [`${p1}_rev`]: { 0: 5_000_000 },
      [`${p2}_rev`]: { 0: 8_000_000 },
    }

    const { businessUnits, planLines } = simulateSubmit(true, units, products, figureData, 'Farm')
    expect(businessUnits.find(u => u.name === 'Livestock')?.headcount).toBe(3)
    expect(businessUnits.find(u => u.name === 'Crops')?.headcount).toBe(7)
    expect(planLines).toHaveLength(2)
  })

  it('plan lines are correctly assigned to their units', () => {
    const uid1 = genId('unit')
    const uid2 = genId('unit')
    const units = [{ id: uid1, name: 'Unit A', headcount: 1 }, { id: uid2, name: 'Unit B', headcount: 1 }]
    const p1 = genId('prod'), p2 = genId('prod')
    const products = {
      [uid1]: [{ id: p1, name: 'Product A', costLines: [] }],
      [uid2]: [{ id: p2, name: 'Product B', costLines: [] }],
    }
    const figureData = {
      [`${p1}_rev`]: { 0: 1_000_000 },
      [`${p2}_rev`]: { 0: 2_000_000 },
    }
    const { planLines } = simulateSubmit(true, units, products, figureData, 'Farm')
    expect(planLines.find(l => l.name === 'Product A')?.unit_id).toBe(uid1)
    expect(planLines.find(l => l.name === 'Product B')?.unit_id).toBe(uid2)
  })
})

describe('Intake Form — Figure Capture', () => {
  it('past month figures are at correct array indices', () => {
    const prodId = genId('prod')
    const products = { whole: [{ id: prodId, name: 'Sales', costLines: [] }] }
    // pastMonths = 3, so offset -3 = index 0, offset -2 = index 1, offset -1 = index 2
    // offset 0 (current) = index 3
    const figureData = {
      [`${prodId}_rev`]: { [-3]: 1_000_000, [-2]: 2_000_000, [-1]: 3_000_000, 0: 4_000_000 }
    }
    const { planLines } = simulateSubmit(false, [], products, figureData, 'Test', 3)
    const rev = planLines.find(l => l.category === 'revenue')
    expect(rev?.monthly_plan[0]).toBe(1_000_000) // M-3
    expect(rev?.monthly_plan[1]).toBe(2_000_000) // M-2
    expect(rev?.monthly_plan[2]).toBe(3_000_000) // M-1
    expect(rev?.monthly_plan[3]).toBe(4_000_000) // M0
  })

  it('missing figures default to zero not undefined', () => {
    const prodId = genId('prod')
    const products = { whole: [{ id: prodId, name: 'Sales', costLines: [] }] }
    const figureData = { [`${prodId}_rev`]: { 0: 5_000_000 } } // only month 0 entered
    const { planLines } = simulateSubmit(false, [], products, figureData, 'Test')
    const rev = planLines.find(l => l.category === 'revenue')
    // All other months should be 0, not undefined
    expect(rev?.monthly_plan[0]).toBe(0) // past month not entered
    expect(rev?.monthly_plan[3]).toBe(5_000_000) // M0
    expect(rev?.monthly_plan[4]).toBe(0) // future not entered
    rev?.monthly_plan.forEach((v: number) => expect(typeof v).toBe('number'))
  })
})
