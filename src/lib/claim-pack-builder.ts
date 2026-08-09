// ============================================================
// The claim pack as a document.
//
// A funder receives a Word document, not a screen. This builds one from a
// stored pack and nothing else, which is the point: the pack was snapshotted
// when it was assembled, so the document produced today says exactly what was
// claimed then, even if the evidence has been edited since.
//
// WHAT THE DOCUMENT MUST DO. Let somebody who was not in the room check the
// claim without asking for anything else: what is being claimed, against which
// deliverable, which decision gates evidence it, what evidence sits behind
// each gate, who signed each one, and where the gaps are.
//
// THE GAPS GO IN. A pack with a gate that has no evidence or no signature says
// so, in its own section, before the evidence list. Leaving them out would
// produce a document that reads as complete and is not, and the funder finding
// that themselves is far worse than being told.
//
// It is built from the same rows the screen shows, so a coach's own view and
// what the funder receives cannot drift apart.
// ============================================================
import {
  AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell,
  TableRow, TextRun, WidthType, BorderStyle,
} from 'docx'
import { formatMoney } from '@/lib/currency'

const NAVY = '1B2A41'
const TEAL = '00767A'
const GOLD = 'B7791F'
const CRIT = 'B3392F'
const MUTED = '4C5A6B'

export interface ClaimPackRow {
  reference: string | null
  amount: number | null
  currency: string | null
  period_label: string | null
  status: string | null
  assembled_at: string | null
  sent_at: string | null
  covering_note: string | null
  gates: unknown
  evidence: unknown
  signatures: unknown
}

export interface ClaimPackContext {
  organisation: string
  programme: string | null
  deliverableTitle: string
  deliverableCode: string | null
  milestone: string | null
  torReference: string | null
}

// The code goes in front of the number rather than being turned into a symbol,
// and no currency means no currency. This used to fall back to US dollars, so a
// claim whose deliverable had no currency set reached a funder denominated in
// dollars: a figure they cannot check and cannot see is wrong.
function money(amount: number | null, currency: string | null): string {
  if (amount === null || amount === undefined) return 'Amount not stated'
  return formatMoney(amount, currency, 2)
}

function longDate(iso: string | null): string {
  if (!iso) return 'not recorded'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return 'not recorded'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const label = (text: string) => new Paragraph({
  spacing: { before: 260, after: 90 },
  children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 17, color: TEAL, characterSpacing: 30 })],
})

const body = (text: string, opts: { color?: string; bold?: boolean } = {}) => new Paragraph({
  spacing: { after: 110 },
  alignment: AlignmentType.LEFT,
  children: [new TextRun({ text, size: 21, color: opts.color || NAVY, bold: opts.bold })],
})

function cell(text: string, opts: { bold?: boolean; color?: string; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      children: [new TextRun({ text, size: 19, bold: opts.bold, color: opts.color || NAVY })],
    })],
  })
}

const THIN = { style: BorderStyle.SINGLE, size: 2, color: 'D8D2C4' }
const tableBorders = { top: THIN, bottom: THIN, left: THIN, right: THIN, insideHorizontal: THIN, insideVertical: THIN }

/**
 * Build the document. Pure apart from the docx library: it is handed the pack
 * and the context, so what comes out is decided entirely by what was stored.
 */
export async function buildClaimPack(
  pack: ClaimPackRow,
  ctx: ClaimPackContext,
): Promise<{ buffer: Buffer; fileName: string }> {
  const gates = Array.isArray(pack.gates) ? (pack.gates as any[]) : []
  const evidence = Array.isArray(pack.evidence) ? (pack.evidence as any[]) : []
  const signatures = Array.isArray(pack.signatures) ? (pack.signatures as any[]) : []
  const gaps = gates.filter((g) => g && g.gap)

  // Paragraphs and tables mix freely in a section, so this is deliberately
  // loose rather than pretending it is one or the other.
  const children: (Paragraph | Table)[] = []

  children.push(new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({
      text: 'GRANT-TO-COMMERCIAL VIABILITY CANVAS',
      bold: true, size: 16, color: GOLD, characterSpacing: 60,
    })],
  }))
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 60 },
    children: [new TextRun({ text: `Milestone claim ${pack.reference || ''}`.trim(), bold: true, size: 40, color: NAVY })],
  }))
  children.push(new Paragraph({
    spacing: { after: 240 },
    children: [new TextRun({
      text: `${ctx.organisation}${ctx.programme ? ` · ${ctx.programme}` : ''} · assembled ${longDate(pack.assembled_at)}`,
      size: 19, color: MUTED,
    })],
  }))

  // ── what is being claimed ──────────────────────────────────
  children.push(label('What is being claimed'))
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      new TableRow({ children: [cell('Deliverable', { bold: true, width: 30 }), cell(`${ctx.deliverableCode ? ctx.deliverableCode + '. ' : ''}${ctx.deliverableTitle}`, { width: 70 })] }),
      ...(ctx.milestone ? [new TableRow({ children: [cell('Milestone', { bold: true }), cell(ctx.milestone)] })] : []),
      new TableRow({ children: [cell('Amount claimed', { bold: true }), cell(money(pack.amount, pack.currency), { bold: true })] }),
      ...(pack.period_label ? [new TableRow({ children: [cell('Period', { bold: true }), cell(pack.period_label)] })] : []),
      ...(ctx.torReference ? [new TableRow({ children: [cell('Under', { bold: true }), cell(ctx.torReference)] })] : []),
      new TableRow({ children: [cell('Status', { bold: true }), cell(pack.sent_at ? `Sent ${longDate(pack.sent_at)}` : (pack.status || 'draft'))] }),
    ],
  }))

  // ── the covering note ──────────────────────────────────────
  if (pack.covering_note) {
    children.push(label('Covering note'))
    for (const para of String(pack.covering_note).split(/\n{2,}/)) {
      const t = para.trim()
      if (t) children.push(body(t))
    }
  }

  // ── the gaps, before the evidence, on purpose ──────────────
  if (gaps.length > 0) {
    children.push(label('Gaps in this claim'))
    children.push(body(
      'Stated here rather than left to be discovered. Each of these is a decision gate this claim '
      + 'rests on where something is missing.',
      { color: MUTED },
    ))
    for (const g of gaps) {
      children.push(new Paragraph({
        spacing: { after: 90 },
        bullet: { level: 0 },
        children: [
          new TextRun({ text: `${g.label || g.dp_id}: `, bold: true, size: 21, color: CRIT }),
          new TextRun({ text: String(g.gap), size: 21, color: NAVY }),
        ],
      }))
    }
  }

  // ── the gates ──────────────────────────────────────────────
  children.push(label('Decision gates evidencing this claim'))
  if (gates.length === 0) {
    children.push(body('No gates are mapped to this deliverable.', { color: CRIT }))
  } else {
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders,
      rows: [
        new TableRow({
          children: [
            cell('Gate', { bold: true, width: 26 }),
            cell('Evidence the funder needs to see', { bold: true, width: 46 }),
            cell('Evidence', { bold: true, width: 14 }),
            cell('Signed', { bold: true, width: 14 }),
          ],
        }),
        ...gates.map((g) => new TableRow({
          children: [
            cell(String(g.label || g.dp_id || '')),
            cell(String(g.required_evidence || 'Not stated')),
            cell(String(g.evidence_count ?? 0), { color: Number(g.evidence_count) > 0 ? NAVY : CRIT }),
            cell(String(g.signature_count ?? 0), { color: Number(g.signature_count) > 0 ? NAVY : CRIT }),
          ],
        })),
      ],
    }))

    // What each gate established, where the coach wrote it up.
    for (const g of gates) {
      if (!g.what_it_established) continue
      children.push(new Paragraph({
        spacing: { before: 180, after: 60 },
        children: [new TextRun({ text: String(g.label || g.dp_id), bold: true, size: 21, color: NAVY })],
      }))
      for (const para of String(g.what_it_established).split(/\n{2,}/)) {
        const t = para.trim()
        if (t) children.push(body(t, { color: MUTED }))
      }
    }
  }

  // ── the evidence itself ────────────────────────────────────
  children.push(label(`Evidence in this pack (${evidence.length})`))
  if (evidence.length === 0) {
    children.push(body('No evidence entries are recorded against the gates in this claim.', { color: CRIT }))
  } else {
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders,
      rows: [
        new TableRow({
          children: [
            cell('Reference', { bold: true, width: 14 }),
            cell('Captured', { bold: true, width: 14 }),
            cell('Type', { bold: true, width: 18 }),
            cell('What it is', { bold: true, width: 40 }),
            cell('Reliability', { bold: true, width: 14 }),
          ],
        }),
        ...evidence.map((e) => new TableRow({
          children: [
            cell(String(e.reference || '')),
            // The snapshot carries evidence_library's own column, `date`.
            cell(e.date ? longDate(e.date) : ''),
            cell(String(e.type || '')),
            cell(String(e.description || '')),
            cell(String(e.reliability || '')),
          ],
        })),
      ],
    }))
  }

  // ── who signed ─────────────────────────────────────────────
  children.push(label(`Signatures (${signatures.length})`))
  if (signatures.length === 0) {
    children.push(body('No gate in this claim has been signed.', { color: CRIT }))
  } else {
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders,
      rows: [
        new TableRow({
          children: [
            cell('Gate', { bold: true, width: 30 }),
            cell('Signed by', { bold: true, width: 30 }),
            cell('Role', { bold: true, width: 22 }),
            cell('Date', { bold: true, width: 18 }),
          ],
        }),
        ...signatures.map((s) => new TableRow({
          children: [
            cell(String(s.dp_id || '')),
            cell(String(s.signer_name || '')),
            cell(String(s.signer_role || '')),
            cell(longDate(s.signed_at || null)),
          ],
        })),
      ],
    }))
  }

  children.push(new Paragraph({
    spacing: { before: 400 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: 'Grant-to-Commercial Viability Canvas™ · The Canvas Coach · habibonifade.com',
      size: 17, color: MUTED,
    })],
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: 'This pack is a snapshot taken when the claim was assembled. Evidence edited afterwards does not change it.',
      size: 16, color: MUTED, italics: true,
    })],
  }))

  const doc = new Document({
    creator: 'The Canvas Coach',
    title: `Milestone claim ${pack.reference || ''}`.trim(),
    description: `Claim against ${ctx.deliverableTitle}`,
    sections: [{ properties: {}, children }],
  })

  const buffer = await Packer.toBuffer(doc)
  const safeRef = String(pack.reference || 'claim').replace(/[^A-Za-z0-9_-]/g, '')
  const safeOrg = ctx.organisation.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'engagement'
  return { buffer, fileName: `${safeOrg}-${safeRef}.docx` }
}
