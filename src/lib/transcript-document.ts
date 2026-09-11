// ============================================================
// THE SIGNED TRANSCRIPT AS A DOCUMENT SOMEBODY CAN KEEP
//
// 11 September 2026. Habib: I think there is a need to make sure the evidence
// is downloadable or shareable so it can be presented without the platform.
//
// He is right, and a transcript that exists only behind a login is not
// evidence a funder, an auditor or a board can be shown. It has to stand on
// its own, and it has to be recognisable as the same family of document as the
// Charter, which is why it is built the same way and in the same shape.
//
// WHAT TRAVELS AND WHAT DOES NOT. The words travel. The audio does not: it is
// people's voices with their consent recorded in it, and a sound file that can
// be forwarded cannot be withdrawn. The document says where the audio is and
// who may hear it, which is the honest version of a recording that somebody
// agreed to.
//
// WHAT MAKES IT EVIDENCE RATHER THAN A PRINTOUT. Three things, all on its
// face: the version the signatures were given on, every signature with its
// name and the moment it was given, and the reference matching the evidence
// library entry, so anybody holding the paper can point at the entry it came
// from and anybody holding the entry can find the paper.
// ============================================================
import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, Table, TableCell,
  TableRow, TextRun, WidthType,
} from 'docx'

const NAVY = '1B2A41'
const MUTED = '6B7280'

export interface TranscriptSignature {
  signer_name: string
  signer_role?: string | null
  signature_method?: string | null
  signed_at: string
  version?: number | null
}

export interface TranscriptDocumentContext {
  organisation: string
  /** What the session was, in the words the plan uses. */
  sessionTitle: string
  /** When the recording was made, not when this was printed. */
  recordedAt: string | null
  seconds: number | null
  version: number
  status: string
  issuedAt: string | null
  body: string
  /** Everybody whose device recorded, which is who the room was. */
  wereInTheRoom: string[]
  signatures: TranscriptSignature[]
  /** The evidence library entry this is, so the paper and the entry match. */
  reference?: string | null
}

function when(iso: string | null | undefined): string {
  if (!iso) return 'not recorded'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'not recorded'
  return d.toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function howLong(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  if (!s) return ''
  if (s < 60) return `${s} seconds`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} minutes` : `${Math.floor(m / 60)} hours ${m % 60} minutes`
}

/** A heading, in the Charter's own hand so the two read as one family. */
function heading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 320, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, color: NAVY })],
  })
}

function line(text: string, opts: { italics?: boolean; size?: number; color?: string } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({
      text, size: opts.size ?? 20, color: opts.color ?? NAVY, italics: opts.italics,
    })],
  })
}

/**
 * What a signature on a transcript means, said on the document itself.
 *
 * A signature nobody can read the meaning of is a name on a page. This is the
 * same discipline the Charter follows: the words being agreed to travel with
 * the agreement rather than living in a screen somebody saw once.
 */
export const TRANSCRIPT_ATTESTATION =
  'Each person below has read this transcript of the conversation and confirmed that it is a '
  + 'record of what they said. A signature applies to the version named above. If the words are '
  + 'corrected afterwards, that correction becomes a new version and is signed again, so no '
  + 'signature is ever carried onto words its signer did not read.'

export async function buildTranscriptDocument(
  ctx: TranscriptDocumentContext,
): Promise<{ buffer: Buffer; fileName: string }> {
  const children: (Paragraph | Table)[] = []

  children.push(new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({
      text: ctx.organisation.toUpperCase(), bold: true, size: 18, color: MUTED,
    })],
  }))
  children.push(new Paragraph({
    spacing: { after: 240 },
    children: [new TextRun({
      text: ctx.status === 'signed' ? 'Signed transcript' : 'Transcript',
      bold: true, size: 36, color: NAVY,
    })],
  }))

  // The facts a reader needs before the first word: what it is of, when, how
  // long, and which version they are holding.
  const facts: [string, string][] = [
    ['Session', ctx.sessionTitle],
    ['Recorded', when(ctx.recordedAt)],
    ['Length', howLong(ctx.seconds) || 'not recorded'],
    ['Version', String(ctx.version)],
    ['In the room', ctx.wereInTheRoom.length ? ctx.wereInTheRoom.join(', ') : 'not recorded'],
  ]
  if (ctx.reference) facts.push(['Evidence reference', ctx.reference])

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: facts.map(([label, value]) => new TableRow({
      children: [
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: label, size: 18, color: MUTED })] })],
        }),
        new TableCell({
          width: { size: 70, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: value, size: 20, color: NAVY })] })],
        }),
      ],
    })),
  }))

  children.push(heading('What was said'))
  const paragraphs = String(ctx.body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  if (!paragraphs.length) {
    children.push(line('This transcript is empty.', { italics: true, color: MUTED }))
  }
  for (const p of paragraphs) children.push(line(p))

  children.push(heading('Signatures'))
  children.push(line(TRANSCRIPT_ATTESTATION, { size: 18, color: MUTED }))

  if (!ctx.signatures.length) {
    children.push(line('Nobody has signed this version yet.', { italics: true, color: MUTED }))
  } else {
    for (const sig of ctx.signatures) {
      children.push(new Paragraph({
        spacing: { before: 160, after: 20 },
        children: [new TextRun({ text: sig.signer_name, bold: true, size: 22, color: NAVY })],
      }))
      const how = sig.signature_method === 'in_room'
        ? 'signature given in the room and recorded by the lead consultant'
        : 'signed by typing their own name'
      children.push(line(
        `${sig.signer_role ? `${sig.signer_role}. ` : ''}${when(sig.signed_at)}, ${how}.`,
        { size: 18, color: MUTED },
      ))
    }
  }

  // WHERE THE AUDIO IS. The recording does not travel with this document, and
  // the document says so rather than leaving somebody to assume either way.
  children.push(heading('The recording'))
  children.push(line(
    'The audio this transcript was made from is held on the ClearView platform against this '
    + 'engagement. It is not attached to this document, because a recording of somebody\'s voice that '
    + 'can be forwarded cannot afterwards be withdrawn. Anybody on this engagement can listen to it '
    + 'there.',
    { size: 18, color: MUTED },
  ))

  children.push(new Paragraph({
    spacing: { before: 360 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: 'Grant-to-Commercial Viability Canvas™ · The Canvas Coach · habibonifade.com',
      size: 16, color: MUTED,
    })],
  }))

  const doc = new Document({
    creator: 'The Canvas Coach',
    title: `Transcript v${ctx.version}, ${ctx.organisation}`,
    description: 'A signed transcript of a recorded session',
    sections: [{ properties: {}, children }],
  })

  const buffer = await Packer.toBuffer(doc)
  const safeOrg = ctx.organisation.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'engagement'
  const safeSession = ctx.sessionTitle.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'session'
  return { buffer, fileName: `${safeOrg}-${safeSession}-transcript-v${ctx.version}.docx` }
}
