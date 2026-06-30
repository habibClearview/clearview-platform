// ============================================================
// API ROUTE: /api/investment-pitch
// Server-side only — generates a downloadable Word document
// summarising a client's investment readiness for a lender/investor.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType,
} from 'docx'
import { runGenericModel, buildMonthLabels, type GenericModelConfig } from '@/lib/generic-engine'
import { computeScores, defaultCoachAssessment, type DebtObligation } from '@/lib/scoring-engine'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const NAVY = '1B2A4A'
const CYAN = '00B4D8'
const SLATE = '4A5A6A'
const GREEN = '1A7A4A'
const AMBER = 'B8860B'
const RED = 'C0392B'
const BORDER = 'D8E0E8'

function fmtMoney(n: number, cc: string): string {
  const v = Math.round(n || 0)
  return `${cc} ${Math.abs(v).toLocaleString('en-US')}${v < 0 ? ' (deficit)' : ''}`
}

function tierColor(tier: string): string {
  if (tier === 'Investment Ready') return GREEN
  if (tier === 'Near Ready') return CYAN
  if (tier === 'Development Stage') return AMBER
  return RED
}

function sectionHeading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, color: NAVY })],
    spacing: { before: 360, after: 180 },
  })
}

function bodyText(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: 'Arial' })],
    spacing: { after: 160 },
  })
}

function statRow(label: string, value: string, color = NAVY) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: BORDER }
  const borders = { top: border, bottom: border, left: border, right: border }
  return new TableRow({
    children: [
      new TableCell({
        borders, width: { size: 4680, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: label, size: 20, font: 'Arial', color: SLATE })] })],
      }),
      new TableCell({
        borders, width: { size: 4680, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: value, size: 22, font: 'Arial', bold: true, color })] })],
      }),
    ],
  })
}

export async function POST(req: NextRequest) {
  try {
    const { clientId } = await req.json() as { clientId: string }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()

    const { data: client, error: clientErr } = await admin
      .from('engagement_clients').select('*').eq('id', clientId).single()
    if (clientErr || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    const { data: configRow, error: configErr } = await admin
      .from('generic_model_config').select('*').eq('client_id', clientId).single()
    if (configErr || !configRow) return NextResponse.json({ error: 'No financial model found for this client' }, { status: 404 })

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

    if (config.business_units.length === 0) {
      return NextResponse.json({ error: 'No business units defined yet -- set up the financial plan first' }, { status: 400 })
    }

    const result = runGenericModel(config)
    const months = buildMonthLabels(config.start_date, config.planning_months)
    const cc = config.currency
    const m = result.metrics
    const s = result.scores

    // Latest AI investment narrative, if one exists
    const { data: latestInvestment } = await admin
      .from('investment_readiness').select('*').eq('client_id', clientId)
      .order('generated_at', { ascending: false }).limit(1).maybeSingle()

    const { data: latestNarrative } = await admin
      .from('coach_briefings').select('*').eq('client_id', clientId)
      .order('generated_at', { ascending: false }).limit(1).maybeSingle()

    const border = { style: BorderStyle.SINGLE, size: 1, color: BORDER }
    const borders = { top: border, bottom: border, left: border, right: border }

    const doc = new Document({
      styles: {
        default: { document: { run: { font: 'Arial', size: 22, color: NAVY } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 30, bold: true, font: 'Arial', color: NAVY },
            paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 0 } },
        ],
      },
      sections: [{
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
        },
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'INVESTMENT READINESS SUMMARY', size: 18, color: CYAN, bold: true, font: 'Arial' })],
            spacing: { after: 60 },
          }),
          new Paragraph({
            children: [new TextRun({ text: config.business_name, size: 40, bold: true, font: 'Georgia', color: NAVY })],
            spacing: { after: 40 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Prepared by Canvas Coach · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, size: 18, color: SLATE, italics: true })],
            spacing: { after: 320 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: CYAN, space: 8 } },
          }),

          sectionHeading('Overview'),
          bodyText(`${config.business_name} operates in ${client.country || 'its market'}${client.sector ? `, in the ${client.sector} sector` : ''}. This summary presents the business's current financial position and investment readiness, prepared for review by a potential lender or investor.`),

          sectionHeading('Investment Readiness Score'),
          new Paragraph({
            children: [
              new TextRun({ text: `${s.irScore} / 30 — `, size: 32, bold: true, color: tierColor(s.irTier) }),
              new TextRun({ text: s.irTier, size: 32, bold: true, color: tierColor(s.irTier) }),
            ],
            spacing: { after: 200 },
          }),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [4680, 4680],
            rows: [
              statRow('Credit Risk', `${s.score}/100 — ${s.classification}`, s.classification === 'Stable' ? GREEN : s.classification === 'At Risk' ? AMBER : RED),
              statRow('Going Concern', `${s.gcScore}/20 — ${s.gcRating}`, s.gcRating === 'Strong' ? GREEN : s.gcRating === 'Adequate' ? CYAN : AMBER),
              statRow('Debt Service Coverage (DSCR)', `${s.dscrAvg.toFixed(2)}x`, s.dscrAvg >= 1.5 ? GREEN : s.dscrAvg >= 1.0 ? AMBER : RED),
            ],
          }),

          sectionHeading('Financial Summary'),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [4680, 4680],
            rows: [
              statRow('Total Revenue (planning period)', fmtMoney(m.total_revenue, cc)),
              statRow('Gross Profit', `${fmtMoney(m.total_gp, cc)} (${(m.gross_margin * 100).toFixed(1)}% margin)`),
              statRow('EBITDA', `${fmtMoney(m.total_ebitda, cc)} (${(m.net_margin * 100).toFixed(1)}% margin)`),
              statRow('Break-Even Revenue (annual)', fmtMoney(m.business_breakeven, cc)),
              statRow('Minimum Cash Position', fmtMoney(m.min_cash, cc), m.min_cash >= 0 ? GREEN : RED),
              statRow('Staff Cost as % of Revenue', `${(m.staff_cost_pct * 100).toFixed(1)}%`),
              statRow('Total Headcount', String(m.total_headcount)),
            ],
          }),

          sectionHeading('Business Units'),
          ...config.business_units.filter(u => u.active).map(u => {
            const pl = result.unitPL[u.id]
            return bodyText(`${u.name}: ${pl ? `${fmtMoney(pl.ann_rev, cc)} revenue, ${fmtMoney(pl.ann_ebitda, cc)} EBITDA` : 'no data'}`)
          }),

          ...(latestNarrative ? [
            sectionHeading('Business Narrative'),
            bodyText(latestNarrative.briefing_text),
          ] : []),

          ...(latestInvestment ? [
            sectionHeading('Investment Readiness Assessment'),
            bodyText(latestInvestment.assessment_text),
          ] : []),

          sectionHeading('Contact'),
          bodyText(`${client.contact_name || ''}${client.contact_email ? ` · ${client.contact_email}` : ''}${client.contact_phone ? ` · ${client.contact_phone}` : ''}`),
          new Paragraph({
            children: [new TextRun({ text: 'Prepared via Canvas Coach Clearview · habibonifade.com · Confidential', size: 16, color: SLATE, italics: true })],
            spacing: { before: 320 },
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: BORDER, space: 8 } },
          }),
        ],
      }],
    })

    const buffer = await Packer.toBuffer(doc)
    const fileName = `${config.business_name.replace(/[^a-z0-9]+/gi, '_')}_Investment_Summary.docx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err: any) {
    console.error('Investment pitch generation error:', err)
    return NextResponse.json({ error: err.message || 'An unexpected error occurred' }, { status: 500 })
  }
}
