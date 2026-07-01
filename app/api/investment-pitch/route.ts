// ============================================================
// API ROUTE: /api/investment-pitch
// Generates an AI-written investment readiness memo as a Word
// document. Claude writes the narrative; docx formats it.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, BorderStyle, WidthType, AlignmentType,
} from 'docx'
import { runGenericModel, buildMonthLabels, type GenericModelConfig } from '@/lib/generic-engine'
import { computeScores, defaultCoachAssessment } from '@/lib/scoring-engine'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase admin credentials not configured. Go to Vercel → Settings → Environment Variables and add SUPABASE_SERVICE_ROLE_KEY.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const NAVY = '1B2A4A', CYAN = '00B4D8', SLATE = '4A5A6A'
const GREEN = '1A7A4A', AMBER = 'B8860B', RED = 'C0392B', BORDER = 'D8E0E8'

function fmt(n: number, cc: string) {
  return `${cc} ${Math.abs(Math.round(n || 0)).toLocaleString('en-US')}${n < 0 ? ' (deficit)' : ''}`
}
function pct(n: number) { return `${(n * 100).toFixed(1)}%` }

function h1(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, bold: true, color: NAVY, font: 'Georgia', size: 28 })],
    spacing: { before: 400, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: CYAN, space: 6 } },
  })
}
function h2(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: CYAN, font: 'Arial', size: 22 })],
    spacing: { before: 280, after: 100 },
  })
}
function p(text: string, color = NAVY) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: 'Arial', color })],
    spacing: { after: 160 },
    alignment: AlignmentType.JUSTIFIED,
  })
}
function scoreRow(label: string, score: string, rating: string, color: string) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: BORDER }
  const borders = { top: border, bottom: border, left: border, right: border }
  const m = { top: 80, bottom: 80, left: 120, right: 120 }
  return new TableRow({ children: [
    new TableCell({ borders, width: { size: 3000, type: WidthType.DXA }, margins: m,
      children: [new Paragraph({ children: [new TextRun({ text: label, size: 20, font: 'Arial', color: SLATE })] })] }),
    new TableCell({ borders, width: { size: 1500, type: WidthType.DXA }, margins: m,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: score, size: 22, bold: true, color })] })] }),
    new TableCell({ borders, width: { size: 4860, type: WidthType.DXA }, margins: m,
      children: [new Paragraph({ children: [new TextRun({ text: rating, size: 20, font: 'Arial', color })] })] }),
  ]})
}

async function generateNarrative(prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await response.json()
  return data.content?.[0]?.text || ''
}

export async function POST(req: NextRequest) {
  try {
    const { clientId } = await req.json() as { clientId: string }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()

    const [{ data: client }, { data: configRow }, { data: latestNarrative }, { data: coachBriefing }] = await Promise.all([
      admin.from('engagement_clients').select('*').eq('id', clientId).single(),
      admin.from('generic_model_config').select('*').eq('client_id', clientId).single(),
      admin.from('investment_readiness').select('*').eq('client_id', clientId).order('generated_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('coach_briefings').select('*').eq('client_id', clientId).order('generated_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    if (!configRow) return NextResponse.json({ error: 'No financial model found for this client. Set up the financial plan first.' }, { status: 404 })

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
    const unitSummaries = result.allocUnits.map((u: any) => {
      const pl = result.unitPL[u.id]
      return pl ? `${u.name}: revenue ${fmt(pl.ann_rev, cc)}, gross profit ${fmt(pl.ann_gp, cc)} (${pct(pl.gp_margin)} margin), EBITDA ${fmt(pl.ann_ebitda, cc)}` : `${u.name}: no data`
    }).join('\n')

    // Build the AI prompt with all the data an investor would want addressed
    const aiPrompt = `You are writing a professional investment readiness memo for ${config.business_name}, an African agribusiness in the ${client?.sector || 'agricultural'} sector in ${client?.country || 'Uganda'}.

This memo will be presented to a potential lender or investor. Write it as a professional document that a development finance institution or commercial bank would read. It should be honest, analytical, and make a clear case for (or identify conditions on) investment readiness.

FINANCIAL DATA:
- Business structure: ${config.business_units.filter((u: any) => u.active).length} business unit(s): ${config.business_units.filter((u: any) => u.active).map((u: any) => u.name).join(', ')}
- Planning period: ${configRow.planning_months} months from ${configRow.start_date}
- Currency: ${cc}

Revenue and profitability:
- Total planned revenue: ${fmt(m.total_revenue, cc)}
- Gross profit: ${fmt(m.total_gp, cc)} (${pct(m.gross_margin)} gross margin)
- EBITDA: ${fmt(m.total_ebitda, cc)} (${pct(m.net_margin)} EBITDA margin)
- Break-even revenue: ${fmt(m.business_breakeven, cc)}
- Revenue headroom above break-even: ${fmt(m.total_revenue - m.business_breakeven, cc)}

By business unit:
${unitSummaries}

Liquidity:
- Minimum cash position: ${fmt(m.min_cash, cc)} in month ${m.min_cash_month}
- Cash-negative months: ${cashWarnings} of ${configRow.planning_months}
- Staff cost as % of revenue: ${pct(m.staff_cost_pct)}

INVESTMENT READINESS SCORES:
- Overall Investment Readiness: ${s.irScore}/30 — ${s.irTier}
- Credit Risk: ${s.score}/100 — ${s.classification}
- Going Concern: ${s.gcScore}/20 — ${s.gcRating}
- Debt Service Coverage (DSCR): ${s.dscrAvg.toFixed(2)}x average
- Revenue trend: ${s.revTrend}

COACH ASSESSMENT (qualitative scores set by the engagement coach):
- Commercial model clarity: ${assess.commercialModel || 2}/5
- Management capability: ${assess.managementCapability || 2}/4
- Market evidence: ${assess.marketEvidence || 2}/5
- Governance and record-keeping: ${assess.governance || 2}/5
${assess.coachNotes ? `\nCoach notes: ${assess.coachNotes}` : ''}

${coachBriefing?.briefing_text ? `RECENT BUSINESS NARRATIVE:\n${coachBriefing.briefing_text}` : ''}
${latestNarrative?.assessment_text ? `PREVIOUS INVESTMENT ASSESSMENT NOTES:\n${latestNarrative.assessment_text}` : ''}

Write a professional investment readiness memo with the following sections. Each section should be a substantive paragraph or two — not bullet points, not a data table. Write as if you are a senior analyst presenting this business to an investment committee.

1. EXECUTIVE SUMMARY — One paragraph. What is this business, what does it do, and what is the headline investment case? State the investment readiness rating clearly.

2. BUSINESS MODEL AND COMMERCIAL VIABILITY — Explain how the business makes money, which revenue streams are strongest, and whether the commercial model is proven. Reference the margin data.

3. FINANCIAL PERFORMANCE AND PROJECTIONS — Analyse the revenue, margin, and profitability picture. Is the business profitable? Is it above break-even? What does the EBITDA margin say about operational efficiency?

4. LIQUIDITY AND CASH FLOW — Address cash flow health. Are there months at risk? What does the minimum cash position indicate? Is the business able to service debt obligations?

5. MANAGEMENT AND GOVERNANCE — Based on the coach assessment scores, what is the quality of management and governance? This is a key investor concern for early-stage African agribusinesses.

6. RISK FACTORS — What are the two or three most significant risks an investor should be aware of? Be honest.

7. INVESTMENT RECOMMENDATION — Given all of the above, what is your recommendation? Is the business investment-ready now, near-ready with specific conditions, or at an earlier stage? Be specific about what conditions or improvements would change the rating.

Write in plain, direct English. Avoid jargon. Maximum 1200 words across all sections.`

    const narrative = await generateNarrative(aiPrompt)

    // Parse the narrative into sections for structured Word formatting
    const sections = narrative.split(/\n\n(?=\d+\.|[A-Z]{2,})/g).filter(Boolean)

    const docChildren: any[] = [
      // Cover
      new Paragraph({ children: [new TextRun({ text: 'INVESTMENT READINESS MEMO', size: 18, color: CYAN, bold: true, font: 'Arial' })], spacing: { after: 60 } }),
      new Paragraph({ children: [new TextRun({ text: config.business_name, size: 44, bold: true, font: 'Georgia', color: NAVY })], spacing: { after: 40 } }),
      new Paragraph({ children: [new TextRun({ text: `${client?.sector || 'Agriculture'} · ${client?.country || 'Uganda'} · Prepared by Canvas Coach`, size: 18, color: SLATE, italics: true }) ], spacing: { after: 20 } }),
      new Paragraph({ children: [new TextRun({ text: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), size: 18, color: SLATE })],
        spacing: { after: 360 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: CYAN, space: 8 } } }),

      // Scorecard
      h1('Investment Readiness Scorecard'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 1500, 4860],
        rows: [
          new TableRow({ tableHeader: true, children: [
            new TableCell({ shading: { fill: NAVY }, width: { size: 3000, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: 'Indicator', color: 'FFFFFF', bold: true, size: 18 })] })] }),
            new TableCell({ shading: { fill: NAVY }, width: { size: 1500, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Score', color: 'FFFFFF', bold: true, size: 18 })] })] }),
            new TableCell({ shading: { fill: NAVY }, width: { size: 4860, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: 'Rating', color: 'FFFFFF', bold: true, size: 18 })] })] }),
          ]}),
          scoreRow('Investment Readiness', `${s.irScore}/30`, s.irTier, s.irScore >= 24 ? GREEN : s.irScore >= 17 ? CYAN : AMBER),
          scoreRow('Credit Risk', `${s.score}/100`, s.classification, s.classification === 'Stable' ? GREEN : s.classification === 'At Risk' ? AMBER : RED),
          scoreRow('Going Concern', `${s.gcScore}/20`, s.gcRating, s.gcRating === 'Strong' ? GREEN : s.gcRating === 'Adequate' ? CYAN : AMBER),
          scoreRow('Debt Service Coverage', `${s.dscrAvg.toFixed(2)}x`, s.dscrAvg >= 1.5 ? 'Strong — well above 1.0x minimum' : s.dscrAvg >= 1.0 ? 'Adequate — meets minimum threshold' : 'Below threshold — debt serviceability concern', s.dscrAvg >= 1.5 ? GREEN : s.dscrAvg >= 1.0 ? AMBER : RED),
          scoreRow('Revenue Trend', s.revTrend, s.revTrend === 'Growing' ? 'Revenue increasing over the period' : s.revTrend === 'Stable' ? 'Revenue consistent, limited growth' : 'Revenue declining — requires attention', s.revTrend === 'Growing' ? GREEN : s.revTrend === 'Stable' ? AMBER : RED),
          scoreRow('Cash Position', cashWarnings === 0 ? 'Positive' : `${cashWarnings} month(s) at risk`, cashWarnings === 0 ? 'No cash shortfall projected' : `Cash goes negative in ${cashWarnings} month(s)`, cashWarnings === 0 ? GREEN : RED),
        ],
      }),
      new Paragraph({ spacing: { after: 200 } }),

      // AI narrative sections
      h1('Analyst Assessment'),
    ]

    // Add the AI narrative — split into paragraphs
    const narrativeParagraphs = narrative.split('\n').filter(line => line.trim())
    for (const para of narrativeParagraphs) {
      const clean = para.trim()
      // Detect section headings (numbered or ALL CAPS)
      if (/^\d+\.\s+[A-Z]/.test(clean) || /^[A-Z][A-Z\s&]{10,}$/.test(clean)) {
        docChildren.push(h2(clean.replace(/^\d+\.\s+/, '')))
      } else if (clean) {
        docChildren.push(p(clean))
      }
    }

    // Footer
    docChildren.push(
      new Paragraph({ spacing: { before: 400 } }),
      new Paragraph({
        children: [new TextRun({ text: `This memo was prepared by Canvas Coach using Clearview financial planning software. All financial projections are based on plans submitted by the business and have not been independently audited. · habibonifade.com · Confidential`, size: 16, color: SLATE, italics: true })],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 8 } },
        alignment: AlignmentType.CENTER,
      })
    )

    const doc = new Document({
      styles: { default: { document: { run: { font: 'Arial', size: 22, color: NAVY } } } },
      sections: [{
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
        children: docChildren,
      }],
    })

    const buffer = await Packer.toBuffer(doc)
    const fileName = `${config.business_name.replace(/[^a-z0-9]+/gi, '_')}_Investment_Memo.docx`

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
