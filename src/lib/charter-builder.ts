// ============================================================
// The Engagement Charter as a document.
//
// WHY THIS EXISTS. Three parties sign this agreement and, until now, none of
// them could keep a copy. Everything was on a screen behind a login, which
// means the Executive Director who signed had nothing to file, the funder had
// nothing to attach, and nobody outside the platform could read what had been
// agreed. An agreement people sign and cannot hold is not finished.
//
// WHAT THE DOCUMENT MUST DO. Let somebody who was not in the room read the
// whole agreement and see exactly who signed it, how, and when. That includes
// the signatures that have not happened yet: a Charter with two of three
// signatures is a real state of affairs, and the document says so rather than
// looking complete.
//
// HOW A SIGNATURE WAS GIVEN IS PART OF THE RECORD. Somebody who signed on
// paper in a session did not click anything, and the lead consultant entered it
// afterwards. Saying so is the difference between an honest record and one that
// implies everybody was sitting at a computer. Where a signature was recorded
// by somebody else, the document names them.
//
// THE VERSION IS ON EVERY PAGE, because signatures apply to the version signed
// and a Charter edited afterwards reopens signing for everyone. A copy that
// does not say which version it is could be quietly the wrong one.
//
// The standing method text comes from src/lib/charter-copy.ts, the same place
// the screen reads it, so the copy somebody files cannot drift from the screen
// they signed.
// ============================================================
import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, Table, TableCell,
  TableRow, TextRun, WidthType,
} from 'docx'
import {
  COMMITMENT, EVIDENCE_CHAIN, EVIDENCE_PRINCIPLE, GROUND_RULES,
  OWNERSHIP, SIGNATURE_MEANING,
} from '@/lib/charter-copy'

const NAVY = '1B2A41'
const TEAL = '00767A'
const GOLD = 'B7791F'
const MUTED = '4C5A6B'

export interface CharterParty {
  id: string
  party_role: string
  name: string | null
  organisation: string | null
  title: string | null
  is_signatory: boolean | null
}

export interface CharterSignatureRow {
  party_id: string | null
  signer_role: string
  signer_name: string | null
  signature_method: string | null
  signed_at: string | null
  recorded_by_user_id: string | null
}

export interface CharterRow {
  version: number | null
  title: string | null
  status: string | null
  issued_at: string | null
  content: Record<string, unknown> | null
}

export interface CharterContext {
  organisation: string
  programme: string | null
  torReference: string | null
  /** Names of people who recorded a signature on somebody's behalf, by user id. */
  recordedByName: Record<string, string>
}

function longDate(iso: string | null): string {
  if (!iso) return 'not recorded'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return 'not recorded'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Roles as the method names them, so the document reads like the method. */
const ROLE_LABELS: Record<string, string> = {
  lsp_ed: 'Executive Director',
  lsp_leadership: 'Leadership team',
  lsp_finance: 'Finance lead',
  lsp_field: 'Field and delivery team',
  lsp_board: 'Board',
  funder: 'Funder',
  funder_rep: 'Funder representative',
  client: 'Client',
  co_implementer: 'Co-implementer',
  lead_consultant: 'Lead consultant',
}
const roleLabel = (r: string) => ROLE_LABELS[r] || r.replace(/_/g, ' ')

/** How the signature actually reached the record, in words a reader can use. */
function methodInWords(method: string | null, recordedBy: string | null, ctx: CharterContext): string {
  if (method === 'in_room') {
    const who = recordedBy ? ctx.recordedByName[recordedBy] : null
    return who
      ? `Signed on paper in the room, recorded by ${who}`
      : 'Signed on paper in the room, recorded by the lead consultant'
  }
  if (method === 'typed') return 'Signed by typing their name'
  if (method === 'click') return 'Signed in the platform'
  return 'Signed'
}

const heading = (text: string) => new Paragraph({
  spacing: { before: 320, after: 120 },
  children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 17, color: TEAL, characterSpacing: 30 })],
})

const body = (text: string, opts: { color?: string; bold?: boolean; italics?: boolean } = {}) => new Paragraph({
  spacing: { after: 120 },
  children: [new TextRun({ text, size: 21, color: opts.color || NAVY, bold: opts.bold, italics: opts.italics })],
})

const bullet = (text: string) => new Paragraph({
  spacing: { after: 90 },
  bullet: { level: 0 },
  children: [new TextRun({ text, size: 21, color: NAVY })],
})

function cell(text: string, opts: { bold?: boolean; color?: string; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
    children: [new Paragraph({
      children: [new TextRun({ text, size: 19, bold: opts.bold, color: opts.color || NAVY })],
    })],
  })
}

const THIN = { style: BorderStyle.SINGLE, size: 2, color: 'D8D2C4' }
const borders = { top: THIN, bottom: THIN, left: THIN, right: THIN, insideHorizontal: THIN, insideVertical: THIN }

function twoColumnTable(rows: { left: string; right: string }[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: rows.map((r) => new TableRow({
      children: [cell(r.left, { bold: true, width: 28 }), cell(r.right, { width: 72 })],
    })),
  })
}

export async function buildCharter(
  charter: CharterRow,
  parties: CharterParty[],
  signatures: CharterSignatureRow[],
  ctx: CharterContext,
): Promise<{ buffer: Buffer; fileName: string }> {
  const children: (Paragraph | Table)[] = []
  const version = charter.version ?? 1

  // ── who and what ──
  children.push(new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: 'ENGAGEMENT CHARTER', bold: true, size: 30, color: NAVY, characterSpacing: 20 })],
  }))
  children.push(new Paragraph({
    spacing: { after: 240 },
    children: [new TextRun({
      text: charter.title || `How we work together and what commercial viability will ask of ${ctx.organisation}`,
      size: 23, color: MUTED,
    })],
  }))

  children.push(twoColumnTable([
    { left: 'Organisation', right: ctx.organisation },
    ...(ctx.programme ? [{ left: 'Programme', right: ctx.programme }] : []),
    ...(ctx.torReference ? [{ left: 'Under', right: ctx.torReference }] : []),
    { left: 'Version', right: `Version ${version}` },
    { left: 'Status', right: charter.status === 'issued' ? 'Issued for signature' : charter.status === 'signed' ? 'Signed' : 'Draft, not yet issued' },
    { left: 'Issued', right: longDate(charter.issued_at) },
  ]))

  // A draft says so, loudly, because a draft that reads like an agreement is
  // the one that gets forwarded to a funder by mistake.
  if (charter.status !== 'issued' && charter.status !== 'signed') {
    children.push(new Paragraph({
      spacing: { before: 200, after: 60 },
      children: [new TextRun({
        text: 'This Charter is still a draft. It has not been issued and it cannot be signed until it is.',
        size: 21, bold: true, color: GOLD,
      })],
    }))
  }

  children.push(body(
    `This Charter is the working agreement for ${ctx.organisation}'s transition from grant funded delivery to a commercially viable business. It sets out what each party is responsible for, the standard of evidence every decision must meet, and the real commitment the work asks of ${ctx.organisation}'s people. Every party signs it before the work begins.`,
  ))

  // ── the principle ──
  children.push(heading('The principle everything rests on: evidence'))
  for (const line of EVIDENCE_PRINCIPLE) children.push(body(line))

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      new TableRow({ children: [
        cell('Step', { bold: true, color: TEAL, width: 24 }),
        cell('Who does what', { bold: true, color: TEAL, width: 26 }),
        cell('What that means', { bold: true, color: TEAL, width: 50 }),
      ] }),
      ...EVIDENCE_CHAIN.map((c) => new TableRow({
        children: [cell(c.step, { bold: true }), cell(c.does), cell(c.detail)],
      })),
    ],
  }))

  // ── what it asks ──
  children.push(heading(`What this asks of ${ctx.organisation}`))
  children.push(body(
    `This is not a workshop the team attends. ${ctx.organisation}'s own people do the work, in the room and in the field. Senior time is required and cannot be delegated away. Read this section as a resourcing decision before signing.`,
  ))
  children.push(twoColumnTable(COMMITMENT.map((c) => ({ left: c.role, right: c.asks }))))
  children.push(body(
    'Every specific here, the rhythm, the hours, the session counts, the conversation minimums and the scope, is set per engagement and can be adjusted before signing.',
    { italics: true, color: MUTED },
  ))

  // ── who is on it ──
  children.push(heading('Who is on this engagement'))
  if (parties.length === 0) {
    children.push(body('No parties have been named yet.', { color: GOLD }))
  } else {
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders,
      rows: [
        new TableRow({ children: [
          cell('Role', { bold: true, color: TEAL, width: 26 }),
          cell('Name', { bold: true, color: TEAL, width: 26 }),
          cell('Organisation', { bold: true, color: TEAL, width: 26 }),
          cell('Signs', { bold: true, color: TEAL, width: 22 }),
        ] }),
        ...parties.map((p) => new TableRow({
          children: [
            cell(roleLabel(p.party_role), { bold: true }),
            cell(p.title ? `${p.name || 'Not named'} (${p.title})` : (p.name || 'Not named')),
            cell(p.organisation || '—'),
            cell(p.is_signatory ? 'Signs the Charter' : 'Does not sign'),
          ],
        })),
      ],
    }))
  }

  // ── how we decide ──
  children.push(heading('How we decide: the ground rules'))
  for (const rule of GROUND_RULES) children.push(bullet(rule))

  children.push(heading('Who owns what'))
  for (const line of OWNERSHIP) children.push(bullet(line))

  // ── signatures ──
  children.push(heading('Signatures'))
  children.push(body(SIGNATURE_MEANING))

  const signatories = parties.filter((p) => p.is_signatory)
  const signedFor = new Set(signatures.map((s) => s.party_id).filter(Boolean) as string[])
  const outstanding = signatories.filter((p) => !signedFor.has(p.id))

  if (signatures.length === 0) {
    children.push(body('Nobody has signed this Charter yet.', { color: GOLD, bold: true }))
  } else {
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders,
      rows: [
        new TableRow({ children: [
          cell('Who', { bold: true, color: TEAL, width: 26 }),
          cell('Role', { bold: true, color: TEAL, width: 22 }),
          cell('How', { bold: true, color: TEAL, width: 32 }),
          cell('When', { bold: true, color: TEAL, width: 20 }),
        ] }),
        ...signatures.map((s) => new TableRow({
          children: [
            cell(s.signer_name || 'Not named', { bold: true }),
            cell(roleLabel(s.signer_role)),
            cell(methodInWords(s.signature_method, s.recorded_by_user_id, ctx)),
            cell(longDate(s.signed_at)),
          ],
        })),
      ],
    }))
  }

  // Naming who has not signed is the point. A document that lists only the
  // signatures it has reads as complete whatever is missing.
  if (outstanding.length > 0) {
    children.push(body(
      `Still to sign: ${outstanding.map((p) => `${p.name || 'not named'} (${roleLabel(p.party_role)})`).join(', ')}.`,
      { color: GOLD, bold: true },
    ))
    children.push(body(
      'This Charter is not fully executed until every signatory above has signed it.',
      { color: MUTED, italics: true },
    ))
  } else if (signatories.length > 0) {
    children.push(body('Every named signatory has signed this Charter.', { color: NAVY, bold: true }))
  }

  // ── footer ──
  children.push(new Paragraph({
    spacing: { before: 400, after: 40 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: 'Grant-to-Commercial Viability Canvas™ · The Canvas Coach · habibonifade.com',
      size: 17, color: MUTED,
    })],
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: `Version ${version}. Signatures apply to this version. If the Charter is edited, signing reopens for everyone.`,
      size: 16, color: MUTED, italics: true,
    })],
  }))

  const doc = new Document({
    creator: 'The Canvas Coach',
    title: `Engagement Charter v${version}, ${ctx.organisation}`,
    description: 'The working agreement for this engagement',
    sections: [{ properties: {}, children: children as (Paragraph | Table)[] }],
  })

  const buffer = await Packer.toBuffer(doc)
  const safeOrg = ctx.organisation.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'engagement'
  return { buffer, fileName: `${safeOrg}-engagement-charter-v${version}.docx` }
}
