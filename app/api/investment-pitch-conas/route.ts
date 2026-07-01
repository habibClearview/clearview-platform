// ============================================================
// API ROUTE: /api/investment-pitch-conas
// Generates a downloadable Word investment summary for CONAS.
// Reads from the model_config table using the admin client.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, BorderStyle, WidthType,
} from 'docx'
import { runCONASModel, defaultCONASInputs } from '@/lib/conas-engine'
import { computeScores, defaultCoachAssessment } from '@/lib/scoring-engine'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase admin credentials not configured.\n\nTo fix this: go to Vercel → clearview-platform → Settings → Environment Variables and add SUPABASE_SERVICE_ROLE_KEY with the value from your Supabase project Settings → API → service_role key. Then redeploy.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const NAVY = '1B2A4A', CYAN = '00B4D8', SLATE = '4A5A6A'
const GREEN = '1A7A4A', AMBER = 'B8860B', RED = 'C0392B', BORDER = 'D8E0E8'

function fmtMoney(n: number, cc: string) {
  const v = Math.round(n || 0)
  return `${cc} ${Math.abs(v).toLocaleString('en-US')}${v < 0 ? ' (deficit)' : ''}`
}

function heading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, color: NAVY })],
    spacing: { before: 360, after: 180 },
  })
}

function body(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: 'Arial' })],
    spacing: { after: 160 },
  })
}

function row(label: string, value: string, color = NAVY) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: BORDER }
  const borders = { top: border, bottom: border, left: border, right: border }
  const margin = { top: 80, bottom: 80, left: 120, right: 120 }
  return new TableRow({ children: [
    new TableCell({ borders, width: { size: 4680, type: WidthType.DXA }, margins: margin,
      children: [new Paragraph({ children: [new TextRun({ text: label, size: 20, font: 'Arial', color: SLATE })] })] }),
    new TableCell({ borders, width: { size: 4680, type: WidthType.DXA }, margins: margin,
      children: [new Paragraph({ children: [new TextRun({ text: value, size: 22, font: 'Arial', bold: true, color })] })] }),
  ]})
}

const CONAS_CLIENT_ID = '1556298e-5fa0-4d6a-ae86-da8c708ec6ee'

export async function POST(req: NextRequest) {
  try {
    const admin = getAdminClient()

    const { data: client } = await admin
      .from('engagement_clients').select('*').eq('id', CONAS_CLIENT_ID).single()

    const { data: configRow } = await admin
      .from('model_config').select('*').eq('client_id', CONAS_CLIENT_ID).single()

    const inputs = configRow?.config
      ? { ...defaultCONASInputs(), ...configRow.config }
      : defaultCONASInputs()

    const result = runCONASModel(inputs)
    const m = result.metrics
    const cc = inputs.global?.currency || 'UGX'

    const conasDebtObligations = (inputs.debts && inputs.debts.length > 0)
      ? inputs.debts
      : (inputs.capitalStructure?.bankLoan > 0 ? [{
          drawdownMonth: 1, annualRate: inputs.capitalStructure.annualInterestRate || 0.18,
          tenorMonths: (inputs.capitalStructure.loanTenorYears || 2) * 12,
          gracePeriodMonths: 0, principal: inputs.capitalStructure.bankLoan, repaymentType: 'amortising',
        }] : [])

    const scores = computeScores({
      rev: result.con.rev, ebitda: result.con.ebitda, cogs: result.con.cogs,
      cashClose: result.cf.close,
      totalEquity: result.bs.totalEquity?.[result.bs.totalEquity.length - 1] || 0,
      totalLiabilities: result.bs.totalLiabilities?.[result.bs.totalLiabilities.length - 1] || 0,
      months: 12, debtObligations: conasDebtObligations, assess: defaultCoachAssessment(),
    })

    const { data: latestNarrative } = await admin
      .from('coach_briefings').select('*').eq('client_id', CONAS_CLIENT_ID)
      .order('generated_at', { ascending: false }).limit(1).maybeSingle()

    const { data: latestInvestment } = await admin
      .from('investment_readiness').select('*').eq('client_id', CONAS_CLIENT_ID)
      .order('generated_at', { ascending: false }).limit(1).maybeSingle()

    const tierColor = (t: string) => t === 'Investment Ready' ? GREEN : t === 'Near Ready' ? CYAN : AMBER

    const doc = new Document({
      styles: { default: { document: { run: { font: 'Arial', size: 22, color: NAVY } } } },
      sections: [{ properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
      }, children: [
        new Paragraph({ children: [new TextRun({ text: 'INVESTMENT READINESS SUMMARY', size: 18, color: CYAN, bold: true })], spacing: { after: 60 } }),
        new Paragraph({ children: [new TextRun({ text: 'CONAS Agricultural Hub', size: 40, bold: true, font: 'Georgia', color: NAVY })], spacing: { after: 40 } }),
        new Paragraph({ children: [new TextRun({ text: `Prepared by Canvas Coach · ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}`, size: 18, color: SLATE, italics: true })],
          spacing: { after: 320 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: CYAN, space: 8 } } }),

        heading('Investment Readiness Score'),
        new Paragraph({ children: [
          new TextRun({ text: `${scores.irScore} / 30 — `, size: 32, bold: true, color: tierColor(scores.irTier) }),
          new TextRun({ text: scores.irTier, size: 32, bold: true, color: tierColor(scores.irTier) }),
        ], spacing: { after: 200 } }),
        new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [4680, 4680], rows: [
          row('Credit Risk', `${scores.score}/100 — ${scores.classification}`, scores.classification === 'Stable' ? GREEN : scores.classification === 'At Risk' ? AMBER : RED),
          row('Going Concern', `${scores.gcScore}/20 — ${scores.gcRating}`, scores.gcRating === 'Strong' ? GREEN : AMBER),
          row('Debt Service Coverage (DSCR)', `${scores.dscrAvg.toFixed(2)}x`, scores.dscrAvg >= 1.5 ? GREEN : scores.dscrAvg >= 1.0 ? AMBER : RED),
        ]}),

        heading('Financial Summary'),
        new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [4680, 4680], rows: [
          row('Total Revenue (season)', fmtMoney(m.totalRevenue, cc)),
          row('Gross Profit', `${fmtMoney(m.totalGP, cc)} (${(m.grossMargin * 100).toFixed(1)}%)`),
          row('EBITDA', `${fmtMoney(m.totalEBITDA, cc)} (${m.totalRevenue > 0 ? ((m.totalEBITDA/m.totalRevenue)*100).toFixed(1) : '0'}%)`),
          row('Minimum Cash Position', fmtMoney(m.minCash, cc), m.minCash >= 0 ? GREEN : RED),
          row('DSCR (average)', `${scores.dscrAvg.toFixed(2)}x`),
          row('Total Headcount', String(result.allocUnits.reduce((s:number,u:any)=>s+(u.headcount||0),0))),
        ]}),

        heading('Business Units'),
        ...result.allocUnits.map((u: any) => {
          const pl = result.unitPL[u.id]
          return body(`${u.name}: ${pl ? `${fmtMoney(pl.annRev, cc)} revenue, ${fmtMoney(pl.annGP, cc)} gross profit` : 'no data'}`)
        }),

        ...(latestNarrative ? [heading('Business Narrative'), body(latestNarrative.briefing_text)] : []),
        ...(latestInvestment ? [heading('Investment Readiness Assessment'), body(latestInvestment.assessment_text)] : []),

        heading('Contact'),
        body(`${client?.contact_name || ''}${client?.contact_email ? ' · ' + client.contact_email : ''}${client?.contact_phone ? ' · ' + client.contact_phone : ''}`),
        new Paragraph({ children: [new TextRun({ text: 'Prepared via Canvas Coach Clearview · habibonifade.com · Confidential', size: 16, color: SLATE, italics: true })],
          spacing: { before: 320 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: BORDER, space: 8 } } }),
      ]}],
    })

    const buffer = await Packer.toBuffer(doc)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="CONAS_Investment_Summary.docx"',
      },
    })
  } catch (err: any) {
    console.error('CONAS pitch error:', err)
    return NextResponse.json({ error: err.message || 'An unexpected error occurred' }, { status: 500 })
  }
}
