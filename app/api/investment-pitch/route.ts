// ============================================================
// API ROUTE: /api/investment-pitch
// AI-written investment brief, infographic/box style,
// Clearview branding, concise not text-heavy
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, BorderStyle, WidthType, AlignmentType, ShadingType,
} from 'docx'
import { runGenericModel, buildMonthLabels, type GenericModelConfig } from '@/lib/generic-engine'
import { computeScores, defaultCoachAssessment, computeTradeCredit, dscrLabel, dscrColor, dscrRating } from '@/lib/scoring-engine'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel environment variables.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ── Clearview brand colours ──
const NAVY   = '1B2A4A'
const CYAN   = '00B4D8'
const CREAM  = 'F8F4EE'
const WHITE  = 'FFFFFF'
const SLATE  = '4A5A6A'
const GREEN  = '1A7A4A'
const AMBER  = 'B8860B'
const RED    = 'C0392B'
const BORDER = 'D8E0E8'
const LBBLUE = 'EBF8FF'

function fmt(n: number, cc: string) {
  if (!n || isNaN(n)) return `${cc} 0`
  const v = Math.round(Math.abs(n))
  const s = v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v.toString()
  return `${cc} ${s}${n < 0 ? ' (deficit)' : ''}`
}
function pct(n: number) { return `${((n||0)*100).toFixed(1)}%` }

// ── Layout helpers ──
function spacer(before = 0, after = 0) {
  return new Paragraph({ children: [new TextRun('')], spacing: { before, after } })
}

// Full-width navy section header
function sectionHeader(text: string) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [new TableCell({
      shading: { fill: NAVY, type: ShadingType.SOLID },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: CYAN, size: 22, font: 'Arial', allCaps: true })] })],
    })] })],
  })
}

// Metric box: used in rows of 3-4
function metricBox(label: string, value: string, sub: string, color: string, width: number) {
  const b = { style: BorderStyle.SINGLE, size: 4, color: CYAN }
  const borders = { top: b, bottom: b, left: b, right: b }
  return new TableCell({
    borders,
    shading: { fill: LBBLUE, type: ShadingType.SOLID },
    width: { size: width, type: WidthType.DXA },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: value, bold: true, color, size: 36, font: 'Georgia' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: label, color: NAVY, size: 16, font: 'Arial', bold: true })] }),
      ...(sub ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: sub, color: SLATE, size: 14, font: 'Arial', italics: true })] })] : []),
    ],
  })
}

function metricRow(metrics: { label: string; value: string; sub: string; color: string }[]) {
  const cellWidth = Math.floor(9360 / metrics.length)
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: metrics.map(() => cellWidth),
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: metrics.map(m => metricBox(m.label, m.value, m.sub, m.color, cellWidth)) })],
  })
}

// Two-column info box
function infoBox(left: string[], right: string[], leftWidth = 4500, rightWidth = 4860) {
  const b = { style: BorderStyle.SINGLE, size: 2, color: BORDER }
  const borders = { top: b, bottom: b, left: b, right: b }
  const noBorder = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [leftWidth, rightWidth],
    borders: noBorder,
    rows: [new TableRow({ children: [
      new TableCell({ borders, shading: { fill: CREAM, type: ShadingType.SOLID }, width: { size: leftWidth, type: WidthType.DXA }, margins: { top: 120, bottom: 120, left: 160, right: 160 },
        children: left.map(t => new Paragraph({ children: [new TextRun({ text: t, size: 20, font: 'Arial', color: NAVY })] })) }),
      new TableCell({ borders, shading: { fill: WHITE, type: ShadingType.SOLID }, width: { size: rightWidth, type: WidthType.DXA }, margins: { top: 120, bottom: 120, left: 160, right: 160 },
        children: right.map(t => new Paragraph({ children: [new TextRun({ text: t, size: 20, font: 'Arial', color: NAVY })] })) }),
    ]})],
  })
}

// Short bullet-style paragraph
function bullet(text: string, color = NAVY) {
  return new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun({ text, size: 20, font: 'Arial', color })],
    spacing: { after: 60 },
  })
}

function note(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 18, font: 'Arial', color: SLATE, italics: true })],
    spacing: { after: 80 },
  })
}

// Score badge row
function scoreBadge(label: string, score: string, rating: string, color: string, width: number) {
  const b = { style: BorderStyle.SINGLE, size: 2, color: BORDER }
  const borders = { top: b, bottom: b, left: b, right: b }
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: score, bold: true, color, size: 28, font: 'Georgia' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: label, color: NAVY, size: 16, bold: true, font: 'Arial' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: rating, color, size: 15, font: 'Arial', italics: true })] }),
    ],
  })
}

async function callClaude(prompt: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return ''
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await response.json()
  return data.content?.[0]?.text || ''
}

function shortPara(text: string) {
  return new Paragraph({
    children: [new TextRun({ text: text.trim(), size: 20, font: 'Arial', color: NAVY })],
    spacing: { after: 120 },
    alignment: AlignmentType.JUSTIFIED,
  })
}

export async function POST(req: NextRequest) {
  try {
    const { clientId } = await req.json() as { clientId: string }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()

    const [
      { data: client },
      { data: configRow },
      { data: coachBriefing },
      { data: events },
    ] = await Promise.all([
      admin.from('engagement_clients').select('*').eq('id', clientId).single(),
      admin.from('generic_model_config').select('*').eq('client_id', clientId).single(),
      admin.from('coach_briefings').select('*').eq('client_id', clientId).order('generated_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('management_events').select('*').eq('client_id', clientId).order('date', { ascending: false }),
    ])

    if (!configRow) return NextResponse.json({ error: 'No financial model found. Set up the financial plan first.' }, { status: 404 })

    const config: GenericModelConfig = {
      client_id: configRow.client_id,
      business_name: configRow.business_name,
      currency: configRow.currency,
      start_date: configRow.start_date,
      planning_months: configRow.planning_months,
      business_units: configRow.business_units || [],
      plan_lines: configRow.plan_lines || [],
      shared_lines: configRow.shared_lines || [],
      settings: configRow.settings || {},
    }

    const result = runGenericModel(config)
    const cc = config.currency
    const m = result.metrics
    const s = result.scores
    const assess = config.settings.coach_assessment || defaultCoachAssessment()
    const cashWarnings = result.cf.close.filter((v: number) => v < 0).length
    const hasTradeCredit = (config.settings.trade_credit_lines || []).length > 0
    const hasMarketing = (events?.length || 0) > 0
    const hasDebt = (config.settings.debts || []).length > 0 || (config.settings.capital_structure?.bank_loan || 0) > 0

    // CAC by channel if marketing events exist
    const channelMap: Record<string, { cost: number; customers: number }> = {}
    ;(events || []).forEach((e: any) => {
      const ch = e.channel || 'Unspecified'
      if (!channelMap[ch]) channelMap[ch] = { cost: 0, customers: 0 }
      channelMap[ch].cost += e.cost || 0
      channelMap[ch].customers += e.customers_acquired || 0
    })
    const channels = Object.entries(channelMap).map(([ch, v]) => ({
      channel: ch, cac: v.customers > 0 ? v.cost / v.customers : null, ...v,
    })).sort((a, b) => (a.cac || 999999) - (b.cac || 999999))

    // Trade credit DSO/DPO
    const tc = s.tradeCredit
    const hasTCData = tc.dso > 0 || tc.dpo > 0

    // Unit summaries
    const unitLines = result.allocUnits.map((u: any) => {
      const pl = result.unitPL[u.id]
      if (!pl || pl.ann_rev === 0) return null
      return `${u.name}: ${fmt(pl.ann_rev, cc)} revenue · ${pct(pl.gp_margin)} gross margin`
    }).filter(Boolean)

    // ── AI narrative sections ──
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY

    let valueProposition = '', businessModel = '', scaleGrowth = '', riskMitigation = '', recommendation = ''

    if (hasApiKey) {
      const context = `
Business: ${config.business_name}, ${client?.sector || 'agribusiness'} sector, ${client?.country || 'Uganda'}
Revenue: ${fmt(m.total_revenue, cc)} | Gross Margin: ${pct(m.gross_margin)} | EBITDA: ${fmt(m.total_ebitda, cc)} (${pct(m.net_margin)})
Break-even: ${fmt(m.business_breakeven, cc)} | Headroom: ${fmt(m.total_revenue - m.business_breakeven, cc)}
Investment Readiness: ${s.irScore}/30 (${s.irTier}) | Credit Risk: ${s.score}/100 (${s.classification}) | DSCR: ${dscrLabel(s)}
Units: ${unitLines.join('; ')}
${hasMarketing ? `Top marketing channel by CAC: ${channels[0]?.channel} at ${channels[0]?.cac ? fmt(channels[0].cac, cc) : 'unquantified'} per customer` : ''}
${hasTCData ? `DSO: ${tc.dso.toFixed(0)} days | DPO: ${tc.dpo.toFixed(0)} days | Cash conversion gap: ${tc.cashConversionGap.toFixed(0)} days` : ''}
Coach assessment: Commercial model ${assess.commercialModel}/5 | Management ${assess.managementCapability}/4 | Market evidence ${assess.marketEvidence}/5 | Governance ${assess.governance}/5
${coachBriefing?.briefing_text ? `Coach narrative: ${coachBriefing.briefing_text.slice(0, 500)}` : ''}
`
      const [vp, bm, sg, rm, rec] = await Promise.all([
        callClaude(`Write 2 punchy sentences on the value proposition of ${config.business_name} for an investment brief. Who does it serve, what problem does it solve, and what makes it distinctive? No jargon. Data:\n${context}`),
        callClaude(`Write 2-3 sentences on how ${config.business_name} makes money — its revenue model, key customers, and channels. Mention the gross margin and what it says about the model. Data:\n${context}`),
        callClaude(`Write 2 sentences on the scale potential of ${config.business_name}. What is the current reach and what enables it to grow without rebuilding from scratch? Data:\n${context}`),
        callClaude(`Name 2 specific risks for ${config.business_name} and one mitigation for each. Be honest and concrete. Format as: Risk 1: [name] — [one sentence description]. Mitigation: [one sentence]. Risk 2: same. Data:\n${context}`),
        callClaude(`Write 3 sentences giving an investment recommendation for ${config.business_name}. State clearly: is it investment-ready now, near-ready with conditions, or at an earlier stage? What is the single most important thing that would improve the case? Data:\n${context}`),
      ])
      valueProposition = vp
      businessModel = bm
      scaleGrowth = sg
      riskMitigation = rm
      recommendation = rec
    }

    // ── Build document ──
    const children: any[] = []

    // ── COVER BAND ──
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [9360],
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      rows: [new TableRow({ children: [new TableCell({
        shading: { fill: NAVY, type: ShadingType.SOLID },
        margins: { top: 200, bottom: 200, left: 280, right: 280 },
        children: [
          new Paragraph({ children: [new TextRun({ text: config.business_name, bold: true, color: WHITE, size: 48, font: 'Georgia' })] }),
          new Paragraph({ children: [new TextRun({ text: `${client?.sector || 'Agribusiness'} · ${client?.country || 'Uganda'}`, color: CYAN, size: 22, font: 'Arial' })] }),
          new Paragraph({ children: [new TextRun({ text: `Investment Readiness Brief · ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`, color: 'AAAAAA', size: 18, font: 'Arial', italics: true })] }),
        ],
      })] })],
    }))
    children.push(spacer(0, 200))

    // ── INVESTMENT READINESS SCORECARD ──
    children.push(sectionHeader('Investment Readiness Scorecard'))
    children.push(spacer(0, 80))
    const w4 = Math.floor(9360 / 4)
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [w4, w4, w4, w4],
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      rows: [new TableRow({ children: [
        scoreBadge('Investment Readiness', `${s.irScore}/30`, s.irTier, s.irScore >= 24 ? GREEN : s.irScore >= 17 ? CYAN : AMBER, w4),
        scoreBadge('Credit Risk Score', `${s.score}/100`, s.classification, s.classification === 'Stable' ? GREEN : s.classification === 'At Risk' ? AMBER : RED, w4),
        scoreBadge('Going Concern', `${s.gcScore}/20`, s.gcRating, s.gcRating === 'Strong' ? GREEN : s.gcRating === 'Adequate' ? CYAN : AMBER, w4),
        scoreBadge('Debt Service (DSCR)', dscrLabel(s), dscrRating(s), dscrColor(s,{green:GREEN,amber:AMBER,red:RED,slate:SLATE}), w4),
      ]})],
    }))
    children.push(spacer(0, 200))

    // ── FINANCIAL SNAPSHOT ──
    children.push(sectionHeader('Financial Snapshot'))
    children.push(spacer(0, 80))
    children.push(metricRow([
      { label: 'Revenue', value: fmt(m.total_revenue, cc), sub: 'planned period', color: NAVY },
      { label: 'Gross Margin', value: pct(m.gross_margin), sub: 'after direct costs', color: m.gross_margin > 0.3 ? GREEN : AMBER },
      { label: 'EBITDA', value: fmt(m.total_ebitda, cc), sub: pct(m.net_margin) + ' margin', color: m.total_ebitda >= 0 ? GREEN : RED },
      { label: 'Break-Even', value: fmt(m.business_breakeven, cc), sub: m.total_revenue >= m.business_breakeven ? `${fmt(m.total_revenue - m.business_breakeven, cc)} headroom` : 'not yet reached', color: m.total_revenue >= m.business_breakeven ? GREEN : RED },
    ]))
    children.push(spacer(0, 80))
    children.push(metricRow([
      { label: 'Cash Position', value: cashWarnings === 0 ? 'Positive' : `${cashWarnings} months at risk`, sub: cashWarnings === 0 ? 'no shortfall projected' : `lowest: ${fmt(m.min_cash, cc)}`, color: cashWarnings === 0 ? GREEN : RED },
      { label: 'Revenue Trend', value: s.revTrend, sub: 'across planning period', color: s.revTrend === 'Growing' ? GREEN : s.revTrend === 'Stable' ? AMBER : RED },
      { label: 'Staff Cost', value: pct(m.staff_cost_pct), sub: `${m.total_headcount} staff · ${fmt(m.revenue_per_head, cc)}/head`, color: m.staff_cost_pct < 0.35 ? GREEN : AMBER },
      { label: 'Business Units', value: String(config.business_units.filter((u: any) => u.active).length), sub: config.business_units.filter((u: any) => u.active).map((u: any) => u.short || u.name.slice(0,8)).join(' · '), color: NAVY },
    ]))
    children.push(spacer(0, 200))

    // ── VALUE PROPOSITION & BUSINESS MODEL ──
    if (valueProposition || businessModel) {
      children.push(sectionHeader('Value Proposition & Business Model'))
      children.push(spacer(0, 80))
      children.push(infoBox(
        ['VALUE PROPOSITION', '', ...(valueProposition ? valueProposition.split('\n').filter(Boolean) : ['—'])],
        ['HOW IT MAKES MONEY', '', ...(businessModel ? businessModel.split('\n').filter(Boolean) : ['—'])],
      ))
      children.push(spacer(0, 200))
    }

    // ── UNIT PERFORMANCE ──
    if (unitLines.length > 0) {
      children.push(sectionHeader('Business Unit Performance'))
      children.push(spacer(0, 80))
      const unitMetrics = result.allocUnits
        .filter((u: any) => { const pl = result.unitPL[u.id]; return pl && pl.ann_rev > 0 })
        .slice(0, 4)
        .map((u: any) => {
          const pl = result.unitPL[u.id]
          return { label: u.name, value: fmt(pl.ann_rev, cc), sub: `GP: ${pct(pl.gp_margin)}`, color: pl.gp_margin > 0.3 ? GREEN : AMBER }
        })
      if (unitMetrics.length > 0) children.push(metricRow(unitMetrics))
      children.push(spacer(0, 200))
    }

    // ── MARKETING & CUSTOMER ACQUISITION ──
    if (hasMarketing) {
      children.push(sectionHeader('Marketing Channels & Customer Acquisition'))
      children.push(spacer(0, 80))
      const cacMetrics = channels.slice(0, 4).map(ch => ({
        label: ch.channel,
        value: ch.cac ? fmt(ch.cac, cc) : 'No count',
        sub: `${ch.customers} customers · ${fmt(ch.cost, cc)} spend`,
        color: ch.cac && ch.cac < m.total_revenue / Math.max(1, m.total_headcount) ? GREEN : AMBER,
      }))
      if (cacMetrics.length > 0) children.push(metricRow(cacMetrics))
      children.push(spacer(0, 200))
    }

    // ── TRADE CREDIT ──
    if (hasTCData) {
      children.push(sectionHeader('Working Capital & Trade Credit'))
      children.push(spacer(0, 80))
      children.push(metricRow([
        { label: 'Days to Collect (DSO)', value: `${tc.dso.toFixed(0)}d`, sub: 'average receivable days', color: tc.dso < 30 ? GREEN : tc.dso < 60 ? AMBER : RED },
        { label: 'Days to Pay (DPO)', value: `${tc.dpo.toFixed(0)}d`, sub: 'average payable days', color: NAVY },
        { label: 'Cash Conversion Gap', value: `${Math.abs(tc.cashConversionGap).toFixed(0)}d`, sub: tc.cashConversionGap <= 0 ? 'supplier-financed (healthy)' : 'cash tied up', color: tc.cashConversionGap <= 0 ? GREEN : tc.cashConversionGap > 30 ? RED : AMBER },
        { label: 'Peak Receivable', value: fmt(tc.peakReceivable, cc), sub: 'highest outstanding', color: NAVY },
      ]))
      children.push(spacer(0, 200))
    }

    // ── SCALE & GROWTH ──
    if (scaleGrowth) {
      children.push(sectionHeader('Scale Potential & Growth Levers'))
      children.push(spacer(0, 80))
      scaleGrowth.split('\n').filter(Boolean).forEach(t => children.push(shortPara(t)))
      children.push(spacer(0, 200))
    }

    // ── GOVERNANCE & FOUNDATIONS ──
    const govScore = (Number(assess.commercialModel || 0) + Number(assess.managementCapability || 0) + Number(assess.marketEvidence || 0) + Number(assess.governance || 0))
    const govMax = 19
    children.push(sectionHeader('Governance & Business Foundations'))
    children.push(spacer(0, 80))
    children.push(metricRow([
      { label: 'Commercial Model', value: `${assess.commercialModel || '—'}/5`, sub: 'clarity & viability', color: Number(assess.commercialModel) >= 4 ? GREEN : AMBER },
      { label: 'Management', value: `${assess.managementCapability || '—'}/4`, sub: 'capability assessed', color: Number(assess.managementCapability) >= 3 ? GREEN : AMBER },
      { label: 'Market Evidence', value: `${assess.marketEvidence || '—'}/5`, sub: 'demand & traction', color: Number(assess.marketEvidence) >= 4 ? GREEN : AMBER },
      { label: 'Governance & Records', value: `${assess.governance || '—'}/5`, sub: 'systems & compliance', color: Number(assess.governance) >= 4 ? GREEN : AMBER },
    ]))
    children.push(spacer(0, 200))

    // ── RISK ──
    if (riskMitigation) {
      children.push(sectionHeader('Key Risks & Mitigations'))
      children.push(spacer(0, 80))
      riskMitigation.split('\n').filter(Boolean).forEach(t => children.push(shortPara(t)))
      children.push(spacer(0, 200))
    }

    // ── RECOMMENDATION ──
    children.push(sectionHeader('Investment Recommendation'))
    children.push(spacer(0, 80))
    if (recommendation) {
      recommendation.split('\n').filter(Boolean).forEach(t => children.push(shortPara(t)))
    } else {
      children.push(shortPara(`Investment Readiness: ${s.irTier} (${s.irScore}/30). Credit Risk: ${s.classification} (${s.score}/100). ${s.irScore >= 17 ? 'The business demonstrates sufficient financial foundations for investment consideration.' : 'Further development is required before investment readiness can be confirmed.'}`))
    }
    if (!hasApiKey) {
      children.push(spacer(0, 80))
      children.push(note('Note: AI narrative sections require ANTHROPIC_API_KEY to be set in Vercel environment variables.'))
    }
    children.push(spacer(0, 200))

    // ── FOOTER ──
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [9360],
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      rows: [new TableRow({ children: [new TableCell({
        shading: { fill: NAVY, type: ShadingType.SOLID },
        margins: { top: 100, bottom: 100, left: 200, right: 200 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: 'Powered by ', color: 'AAAAAA', size: 16, font: 'Arial' }),
          new TextRun({ text: 'Canvas Coach Clearview', color: CYAN, size: 16, font: 'Arial', bold: true }),
          new TextRun({ text: '  ·  habibonifade.com  ·  Confidential — not for circulation without permission', color: 'AAAAAA', size: 16, font: 'Arial' }),
        ] })],
      })] })],
    }))

    const doc = new Document({
      styles: { default: { document: { run: { font: 'Arial', size: 20, color: NAVY } } } },
      sections: [{
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
        children,
      }],
    })

    const buffer = await Packer.toBuffer(doc)
    const fileName = `${config.business_name.replace(/[^a-z0-9]+/gi, '_')}_Investment_Brief.docx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err: any) {
    console.error('Investment pitch error:', err)
    return NextResponse.json({ error: err.message || 'An unexpected error occurred' }, { status: 500 })
  }
}
