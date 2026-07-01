// ============================================================
// API ROUTE: /api/investment-pitch-conas
// AI-written investment readiness memo for CONAS Agricultural Hub
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, BorderStyle, WidthType, AlignmentType,
} from 'docx'
import { runCONASModel, defaultCONASInputs } from '@/lib/conas-engine'
import { computeScores, defaultCoachAssessment } from '@/lib/scoring-engine'

const CONAS_CLIENT_ID = '1556298e-5fa0-4d6a-ae86-da8c708ec6ee'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase admin credentials not configured. Go to Vercel → Settings → Environment Variables and add SUPABASE_SERVICE_ROLE_KEY.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const NAVY = '1B2A4A', CYAN = '00B4D8', SLATE = '4A5A6A'
const GREEN = '1A7A4A', AMBER = 'B8860B', RED = 'C0392B', BORDER = 'D8E0E8'

function fmt(n: number, cc: string) { return `${cc} ${Math.abs(Math.round(n||0)).toLocaleString('en-US')}${n<0?' (deficit)':''}` }
function pct(n: number) { return `${(n*100).toFixed(1)}%` }

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
function p(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: 'Arial', color: NAVY })],
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

export async function POST(req: NextRequest) {
  try {
    const admin = getAdminClient()

    const [{ data: client }, { data: configRow }, { data: coachBriefing }, { data: investmentNarrative }] = await Promise.all([
      admin.from('engagement_clients').select('*').eq('id', CONAS_CLIENT_ID).single(),
      admin.from('model_config').select('*').eq('client_id', CONAS_CLIENT_ID).single(),
      admin.from('coach_briefings').select('*').eq('client_id', CONAS_CLIENT_ID).order('generated_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('investment_readiness').select('*').eq('client_id', CONAS_CLIENT_ID).order('generated_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    const inputs = configRow?.config ? { ...defaultCONASInputs(), ...configRow.config } : defaultCONASInputs()
    const result = runCONASModel(inputs)
    const cc = inputs.global?.currency || 'UGX'
    const m = result.metrics

    const debtObligations = (inputs.debts && inputs.debts.length > 0) ? inputs.debts
      : (inputs.capitalStructure?.bankLoan > 0 ? [{
          drawdownMonth: 1, annualRate: inputs.capitalStructure.annualInterestRate ?? 0.18,
          tenorMonths: (inputs.capitalStructure.loanTenorYears ?? 2) * 12,
          gracePeriodMonths: 0, principal: inputs.capitalStructure.bankLoan, repaymentType: 'amortising',
        }] : [])

    const scores = computeScores({
      rev: result.con.rev, ebitda: result.con.ebitda, cogs: result.con.cogs,
      cashClose: result.cf.close,
      totalEquity: result.bs.totalEquity?.[11] || 0,
      totalLiabilities: result.bs.totalLiabilities?.[11] || 0,
      months: 12, debtObligations, assess: defaultCoachAssessment(),
    })

    const cashWarnings = result.cf.close.filter((v: number) => v < 0).length
    const ebitdaMargin = m.totalRevenue > 0 ? m.totalEBITDA / m.totalRevenue : 0
    const unitSummaries = result.allocUnits.map((u: any) => {
      const pl = result.unitPL[u.id]
      return pl ? `${u.name}: revenue ${fmt(pl.annRev, cc)}, gross profit ${fmt(pl.annGP, cc)} (${pct(pl.gpMargin)} margin)` : ''
    }).filter(Boolean).join('\n')

    const aiPrompt = `You are writing a professional investment readiness memo for CONAS Agricultural Hub, a crop aggregator with five Input Profit Centres operating in Northern Uganda. This memo will be presented to a potential lender or development finance institution.

FINANCIAL DATA (planning season):
- Total revenue: ${fmt(m.totalRevenue, cc)}
- Total gross profit: ${fmt(m.totalGP, cc)} (${pct(m.totalRevenue > 0 ? m.totalGP/m.totalRevenue : 0)} gross margin)
- EBITDA: ${fmt(m.totalEBITDA, cc)} (${pct(ebitdaMargin)} EBITDA margin)
- Net profit after tax: ${fmt(m.totalNPAT, cc)}
- Minimum cash position: ${fmt(m.minCash, cc)} in month ${m.minCashMonth}
- Cash-negative months: ${cashWarnings} of 12
- Number of FGEs: ${m.fgeCount}
- Irrigation kits: deployed across Input Profit Centres

By business unit:
${unitSummaries}

Capital structure:
- Shareholder contribution: ${fmt(inputs.capitalStructure?.shareholderContribution || 0, cc)}
- Grant (non-repayable): ${fmt(inputs.capitalStructure?.grantNonRepayable || 0, cc)}
- Grant (recoverable): ${fmt(inputs.capitalStructure?.grantRecoverable || 0, cc)}
- Bank loan: ${fmt(inputs.capitalStructure?.bankLoan || 0, cc)}

INVESTMENT READINESS SCORES:
- Investment Readiness: ${scores.irScore}/30 — ${scores.irTier}
- Credit Risk: ${scores.score}/100 — ${scores.classification}
- Going Concern: ${scores.gcScore}/20 — ${scores.gcRating}
- DSCR average: ${scores.dscrAvg.toFixed(2)}x
- Revenue trend: ${scores.revTrend}

${coachBriefing?.briefing_text ? `RECENT BUSINESS NARRATIVE FROM COACH:\n${coachBriefing.briefing_text}` : ''}
${investmentNarrative?.assessment_text ? `PREVIOUS INVESTMENT ASSESSMENT:\n${investmentNarrative.assessment_text}` : ''}

Write a professional investment readiness memo with the following sections. Each section should be a substantive paragraph or two — no bullet points. Write as a senior analyst presenting to an investment committee. Be specific about CONAS's business model (crop aggregation, FGE network, irrigation kit deployment, input credit).

1. EXECUTIVE SUMMARY — What is CONAS Agricultural Hub, what is the headline investment case, and what is the investment readiness rating?

2. BUSINESS MODEL AND COMMERCIAL VIABILITY — Explain how CONAS makes money through its Input Profit Centres, FGE network, and aggregation model. Which revenue streams are strongest and why?

3. FINANCIAL PERFORMANCE — Analyse revenue, margin, and profitability. Is CONAS profitable at the EBITDA level? Is it above break-even? What do the margins say about the model's efficiency?

4. LIQUIDITY AND DEBT SERVICE — Address cash flow health. Can CONAS service its existing obligations? Are there cash pressure months and why? What does the DSCR indicate?

5. OPERATIONAL SCALE AND IMPACT — What does the FGE count and irrigation deployment tell an investor about reach and operational maturity?

6. RISK FACTORS — Name two or three specific, honest risks. These could include seasonal concentration, input credit recovery risk, or dependence on external grant financing.

7. INVESTMENT RECOMMENDATION — Is CONAS investment-ready now, near-ready with specific conditions, or at an earlier stage? What specific actions or milestones would strengthen the case?

Plain, direct English. No jargon. Maximum 1200 words across all sections.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: aiPrompt }] }),
    })
    const aiData = await response.json()
    const narrative = aiData.content?.[0]?.text || 'Narrative generation failed.'

    const docChildren: any[] = [
      new Paragraph({ children: [new TextRun({ text: 'INVESTMENT READINESS MEMO', size: 18, color: CYAN, bold: true, font: 'Arial' })], spacing: { after: 60 } }),
      new Paragraph({ children: [new TextRun({ text: 'CONAS Agricultural Hub', size: 44, bold: true, font: 'Georgia', color: NAVY })], spacing: { after: 40 } }),
      new Paragraph({ children: [new TextRun({ text: `Crop Aggregation · Northern Uganda · Prepared by Canvas Coach`, size: 18, color: SLATE, italics: true })], spacing: { after: 20 } }),
      new Paragraph({ children: [new TextRun({ text: new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }), size: 18, color: SLATE })],
        spacing: { after: 360 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: CYAN, space: 8 } } }),

      h1('Investment Readiness Scorecard'),
      new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [3000, 1500, 4860], rows: [
        new TableRow({ tableHeader: true, children: [
          new TableCell({ shading: { fill: NAVY }, width: { size: 3000, type: WidthType.DXA }, margins: { top:80,bottom:80,left:120,right:120 },
            children: [new Paragraph({ children: [new TextRun({ text: 'Indicator', color:'FFFFFF', bold:true, size:18 })] })] }),
          new TableCell({ shading: { fill: NAVY }, width: { size: 1500, type: WidthType.DXA }, margins: { top:80,bottom:80,left:120,right:120 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Score', color:'FFFFFF', bold:true, size:18 })] })] }),
          new TableCell({ shading: { fill: NAVY }, width: { size: 4860, type: WidthType.DXA }, margins: { top:80,bottom:80,left:120,right:120 },
            children: [new Paragraph({ children: [new TextRun({ text: 'Rating', color:'FFFFFF', bold:true, size:18 })] })] }),
        ]}),
        scoreRow('Investment Readiness', `${scores.irScore}/30`, scores.irTier, scores.irScore>=24?GREEN:scores.irScore>=17?CYAN:AMBER),
        scoreRow('Credit Risk', `${scores.score}/100`, scores.classification, scores.classification==='Stable'?GREEN:scores.classification==='At Risk'?AMBER:RED),
        scoreRow('Going Concern', `${scores.gcScore}/20`, scores.gcRating, scores.gcRating==='Strong'?GREEN:scores.gcRating==='Adequate'?CYAN:AMBER),
        scoreRow('Debt Service Coverage', `${scores.dscrAvg.toFixed(2)}x`, scores.dscrAvg>=1.5?'Strong':'Adequate', scores.dscrAvg>=1.5?GREEN:AMBER),
        scoreRow('Revenue Trend', scores.revTrend, scores.revTrend==='Growing'?'Revenue increasing':'Revenue consistent or declining', scores.revTrend==='Growing'?GREEN:scores.revTrend==='Stable'?AMBER:RED),
        scoreRow('Cash Position', cashWarnings===0?'Positive':cashWarnings+' month(s) at risk', cashWarnings===0?'No shortfall projected':`Cash negative in ${cashWarnings} month(s)`, cashWarnings===0?GREEN:RED),
      ]}),
      new Paragraph({ spacing: { after: 200 } }),

      h1('Analyst Assessment'),
      ...narrative.split('\n').filter((l: string) => l.trim()).map((para: string) => {
        const clean = para.trim()
        if (/^\d+\.\s+[A-Z]/.test(clean) || /^[A-Z][A-Z\s&]{10,}$/.test(clean)) return h2(clean.replace(/^\d+\.\s+/, ''))
        return p(clean)
      }),

      new Paragraph({ spacing: { before: 400 } }),
      new Paragraph({
        children: [new TextRun({ text: 'Prepared by Canvas Coach using Clearview financial planning software. Projections are based on business-submitted plans and have not been independently audited. · habibonifade.com · Confidential', size: 16, color: SLATE, italics: true })],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 8 } },
        alignment: AlignmentType.CENTER,
      }),
    ]

    const doc = new Document({
      styles: { default: { document: { run: { font: 'Arial', size: 22, color: NAVY } } } },
      sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } }, children: docChildren }],
    })

    const buffer = await Packer.toBuffer(doc)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="CONAS_Investment_Memo.docx"',
      },
    })
  } catch (err: any) {
    console.error('CONAS pitch error:', err)
    return NextResponse.json({ error: err.message || 'An unexpected error occurred' }, { status: 500 })
  }
}
