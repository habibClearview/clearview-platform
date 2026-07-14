// ============================================================
// Portfolio Intelligence Brief builder -- a downloadable Word document
// summarising the whole portfolio, or one filtered segment of it.
// Companion to investment-brief-builder.ts (which does the same job for
// a single client): same visual language, same "no second copy of the
// numbers" principle -- this takes an already-computed PortfolioViewData
// (see portfolio-snapshot-loader.ts) rather than loading anything itself,
// so both the coach's own dashboard (/api/portfolio-brief) and the
// token-based external access route (/api/access-grant/[token]) produce
// byte-identical documents from byte-identical numbers.
// ============================================================
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  BorderStyle, WidthType, ShadingType,
} from 'docx'
import type { PortfolioViewData } from './portfolio-snapshot-loader'
import type { SegmentFilter, FundAbsorptionSummary } from './portfolio-intelligence'
import { READINESS_STAGE_LABELS } from './portfolio-intelligence'

// Same brand colours as investment-brief-builder.ts, for the same
// contrast reasons -- see that file's comment for the WCAG numbers.
const NAVY = '1B2A41'
const CYAN = '00CCCC'
const CYAN_TEXT = '008383'
const CREAM = 'F5F0E8'
const WHITE = 'FFFFFF'
const SLATE = '4A5A6A'
const GREEN = '2E7D32'
const AMBER = '9E6B10'
const RED = 'C62828'
const BORDER = 'D8E0E8'

const DIM_LABELS: Record<string, string> = {
  marketOpportunity: 'Market Opportunity', visibility: 'Visibility', trust: 'Trust',
  profitability: 'Profitability', capacity: 'Capacity', resilience: 'Resilience', compliance: 'Compliance',
}
const FAC_LABELS: Record<string, string> = {
  credit: 'Credit', grant: 'Grant', equity: 'Equity', consignment: 'Consignment', recoverableGrant: 'Recoverable Grant',
}
const READINESS_PIPELINE_ORDER = ['investment_ready', 'near_ready', 'development_stage', 'pre_investment'] as const
const READINESS_PIPELINE_COLOR: Record<string, string> = {
  investment_ready: GREEN, near_ready: CYAN_TEXT, development_stage: AMBER, pre_investment: RED,
}

function fmtMoney(n: number | null, cc: string) {
  if (n === null || n === undefined) return 'n/a'
  const v = Math.round(Math.abs(n))
  const s = v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()
  return `${cc} ${s}`
}

function spacer(before = 0, after = 0) {
  return new Paragraph({ children: [new TextRun('')], spacing: { before, after } })
}

function sectionHeader(text: string) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [new TableCell({
      shading: { fill: NAVY, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: CYAN, size: 22, font: 'Arial', allCaps: true })] })],
    })] })],
  })
}

function metricBox(label: string, value: string, sub: string, color: string, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      left: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, right: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
    },
    margins: { top: 140, bottom: 140, left: 160, right: 160 },
    children: [
      new Paragraph({ children: [new TextRun({ text: label, size: 15, color: SLATE, font: 'Arial', allCaps: true })] }),
      new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: value, bold: true, size: 28, color, font: 'Arial' })] }),
      new Paragraph({ children: [new TextRun({ text: sub, size: 16, color: SLATE, font: 'Arial' })] }),
    ],
  })
}

function metricRow(metrics: { label: string; value: string; sub: string; color: string }[]) {
  const width = Math.floor(9360 / metrics.length)
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: metrics.map(() => width),
    rows: [new TableRow({ children: metrics.map(m => metricBox(m.label, m.value, m.sub, m.color, width)) })],
  })
}

// A dimension/pipeline "bar" faked with a shaded table row -- docx has no
// native chart primitive worth the complexity here, but a proportionally
// shaded cell reads as a bar at a glance, matching the app's own bar-style
// dimension rows closely enough to be recognisable as the same report.
function barRow(label: string, valuePct: number, valueText: string, color: string) {
  const fillWidth = Math.max(300, Math.round((Math.max(2, Math.min(100, valuePct)) / 100) * 5200))
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2200, 5200, 1960],
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 2200, type: WidthType.DXA }, margins: { top: 40, bottom: 40 }, children: [new Paragraph({ children: [new TextRun({ text: label, size: 18, color: NAVY, font: 'Arial' })] })] }),
      new TableCell({
        width: { size: 5200, type: WidthType.DXA }, shading: { fill: 'EBF8FF', type: ShadingType.CLEAR }, margins: { top: 40, bottom: 40 },
        children: [new Table({
          width: { size: fillWidth, type: WidthType.DXA }, columnWidths: [fillWidth],
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          rows: [new TableRow({ children: [new TableCell({ shading: { fill: color, type: ShadingType.CLEAR }, children: [new Paragraph('')] })] })],
        })],
      }),
      new TableCell({ width: { size: 1960, type: WidthType.DXA }, margins: { top: 40, bottom: 40 }, children: [new Paragraph({ children: [new TextRun({ text: valueText, bold: true, size: 18, color: NAVY, font: 'Arial' })] })] }),
    ] })],
  })
}

export async function buildPortfolioBrief(
  data: PortfolioViewData, scopeType: 'portfolio' | 'segment', scopeFilter: SegmentFilter | null,
): Promise<{ buffer: Buffer; fileName: string }> {
  const view = data.segment ? data.segment.segment : data.portfolio
  const currencies = Object.keys(view.currentFundAbsorption)
  const scopeParts = scopeFilter ? [scopeFilter.sector, scopeFilter.country, scopeFilter.readinessStage && READINESS_STAGE_LABELS[scopeFilter.readinessStage]].filter(Boolean) : []
  const scopeLabel = scopeType === 'segment' ? (scopeParts.length > 0 ? `Segment: ${scopeParts.join(' · ')}` : 'Filtered segment') : 'Whole portfolio'

  const children: any[] = [
    new Paragraph({ children: [new TextRun({ text: 'CANVAS COACH — CLEARVIEW', bold: true, size: 18, color: CYAN_TEXT, font: 'Arial' })] }),
    new Paragraph({ children: [new TextRun({ text: 'Portfolio Intelligence', bold: true, size: 40, color: NAVY, font: 'Georgia' })], spacing: { after: 40 } }),
    new Paragraph({ children: [new TextRun({ text: `${scopeLabel} · ${view.totalBusinesses} business${view.totalBusinesses === 1 ? '' : 'es'} · generated ${new Date().toISOString().slice(0, 10)}`, size: 20, color: SLATE, font: 'Arial' })], spacing: { after: 200 } }),

    sectionHeader('Overview'),
    spacer(120, 120),
    metricRow([
      { label: 'Businesses', value: String(view.totalBusinesses), sub: scopeType === 'segment' ? `of ${data.portfolio.totalBusinesses} portfolio-wide` : 'on platform', color: NAVY },
      { label: 'Avg Investment Readiness', value: `${Math.round(view.avgIRScore)}/30`, sub: 'current scores', color: CYAN_TEXT },
      { label: 'Avg Verification Confidence', value: `${Math.round(view.avgConfidenceScore)}/100`, sub: 'current period', color: CYAN_TEXT },
      { label: 'Avg Liquidity Readiness', value: `${Math.round(view.avgLRSScore)}/100`, sub: 'seven dimensions', color: NAVY },
    ]),
    spacer(220, 120),

    sectionHeader('Readiness Pipeline'),
    spacer(120, 100),
    ...READINESS_PIPELINE_ORDER.map(stage => barRow(
      READINESS_STAGE_LABELS[stage], view.readinessPipelinePct[stage],
      `${view.readinessPipeline[stage]} · ${Math.round(view.readinessPipelinePct[stage])}%`, READINESS_PIPELINE_COLOR[stage],
    )),
    spacer(200, 120),

    sectionHeader('Seven-Dimension Average'),
    spacer(120, 100),
    ...Object.entries(view.dimensionAverages).map(([dim, avg]) => barRow(DIM_LABELS[dim] || dim, avg as number, String(Math.round(avg as number)), CYAN_TEXT)),
    spacer(200, 120),
  ]

  if (currencies.length > 0) {
    children.push(sectionHeader('Current Fund Absorption Capacity'), spacer(120, 80))
    children.push(new Paragraph({ children: [new TextRun({ text: 'What businesses in view could absorb today, by type -- not a hypothetical ceiling.', size: 17, color: SLATE, font: 'Arial' })], spacing: { after: 100 } }))
    currencies.forEach(cc => {
      const summary: FundAbsorptionSummary = view.currentFundAbsorption[cc]
      children.push(new Paragraph({ children: [new TextRun({ text: cc, bold: true, size: 18, color: NAVY, font: 'Arial' })], spacing: { before: 60, after: 60 } }))
      const entries = Object.entries(summary)
      children.push(metricRow(entries.map(([type, val]) => ({ label: FAC_LABELS[type] || type, value: val === null ? 'n/a' : fmtMoney(val, cc), sub: '', color: NAVY }))))
      children.push(spacer(80, 80))
    })
    children.push(spacer(120, 120))
  }

  if (data.profiles && data.profiles.length > 0) {
    children.push(sectionHeader('Businesses In This View'), spacer(120, 80))
    children.push(new Paragraph({ children: [new TextRun({ text: 'Anonymised unless the business owner has consented to be named.', size: 17, color: SLATE, font: 'Arial' })], spacing: { after: 120 } }))
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2600, 2200, 2200, 2360],
      rows: [
        new TableRow({ children: ['Business', 'Sector', 'Size', 'Readiness'].map(h => new TableCell({
          shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 16, color: WHITE, font: 'Arial' })] })],
        })) }),
        ...data.profiles.map((p: any) => new TableRow({ children: [
          new TableCell({ margins: { top: 60, bottom: 60, left: 120, right: 120 }, borders: { top: { style: BorderStyle.SINGLE, size: 2, color: BORDER }, bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDER }, left: { style: BorderStyle.SINGLE, size: 2, color: BORDER }, right: { style: BorderStyle.SINGLE, size: 2, color: BORDER } }, children: [new Paragraph({ children: [new TextRun({ text: p.displayName, size: 17, color: NAVY, font: p.isNamed ? 'Arial' : 'Courier New' })] })] }),
          new TableCell({ margins: { top: 60, bottom: 60, left: 120, right: 120 }, borders: { top: { style: BorderStyle.SINGLE, size: 2, color: BORDER }, bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDER }, left: { style: BorderStyle.SINGLE, size: 2, color: BORDER }, right: { style: BorderStyle.SINGLE, size: 2, color: BORDER } }, children: [new Paragraph({ children: [new TextRun({ text: p.sector || 'n/a', size: 17, color: SLATE, font: 'Arial' })] })] }),
          new TableCell({ margins: { top: 60, bottom: 60, left: 120, right: 120 }, borders: { top: { style: BorderStyle.SINGLE, size: 2, color: BORDER }, bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDER }, left: { style: BorderStyle.SINGLE, size: 2, color: BORDER }, right: { style: BorderStyle.SINGLE, size: 2, color: BORDER } }, children: [new Paragraph({ children: [new TextRun({ text: p.sizeBracket, size: 17, color: SLATE, font: 'Arial' })] })] }),
          new TableCell({ margins: { top: 60, bottom: 60, left: 120, right: 120 }, borders: { top: { style: BorderStyle.SINGLE, size: 2, color: BORDER }, bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDER }, left: { style: BorderStyle.SINGLE, size: 2, color: BORDER }, right: { style: BorderStyle.SINGLE, size: 2, color: BORDER } }, children: [new Paragraph({ children: [new TextRun({ text: `${p.irTier} · ${Math.round(p.irScore)}/30`, size: 17, color: NAVY, font: 'Arial' })] })] }),
        ] })),
      ],
    }))
  }

  children.push(spacer(200, 0), new Paragraph({ children: [new TextRun({ text: 'Powered by Canvas Coach ClearView · Confidential', size: 15, color: SLATE, font: 'Arial' })] }))

  const doc = new Document({
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children }],
  })

  const buffer = await Packer.toBuffer(doc)
  const scopeSlug = scopeType === 'segment' ? 'Segment' : 'Portfolio'
  const fileName = `Clearview_${scopeSlug}_Intelligence_${new Date().toISOString().slice(0, 10)}.docx`
  return { buffer, fileName }
}
