// ============================================================
// THE LETTER, AS TEXT A PERSON CAN EDIT
//
// A generated letter is a starting point. Habib's letters go to his clients
// over his name, so he has to be able to change every word of one before it is
// sent, and a template with one editable line is not that.
//
// So a letter is plain text with three marks, and nothing else to learn:
//
//   # A line beginning with a hash is a heading
//   - A line beginning with a dash is a bullet
//   A blank line separates paragraphs
//
// The generated letter is produced in exactly this form, so what he edits is
// what was generated, and what is sent is what he edited.
// ============================================================
import { escapeHtml, raw, type EmailText } from '@/lib/email-format'

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'ul'; items: string[] }

/** Blocks to the plain text a person edits. */
export function blocksToText(blocks: Block[]): string {
  return blocks.map((b) => {
    if (b.kind === 'h') return `# ${b.text}`
    if (b.kind === 'ul') return b.items.map((i) => `- ${i}`).join('\n')
    return b.text
  }).join('\n\n').trim()
}

/** The plain text a person edited, back to blocks. */
export function textToBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const lines = (text || '').replace(/\r/g, '').split('\n')
  let para: string[] = []
  let bullets: string[] = []

  const flushPara = () => {
    const joined = para.join(' ').trim()
    if (joined) blocks.push({ kind: 'p', text: joined })
    para = []
  }
  const flushBullets = () => {
    if (bullets.length) blocks.push({ kind: 'ul', items: bullets.slice() })
    bullets = []
  }

  for (const line of lines) {
    const t = line.trim()
    if (!t) { flushBullets(); flushPara(); continue }
    if (t.startsWith('# ')) {
      flushBullets(); flushPara()
      blocks.push({ kind: 'h', text: t.slice(2).trim() })
      continue
    }
    if (t.startsWith('- ')) {
      flushPara()
      bullets.push(t.slice(2).trim())
      continue
    }
    flushBullets()
    para.push(t)
  }
  flushBullets()
  flushPara()
  return blocks
}

/**
 * Blocks to the paragraphs the branded template renders. Everything a person
 * typed is escaped: the letter is text they wrote, and it is never markup.
 */
export function blocksToEmail(blocks: Block[]): EmailText[] {
  return blocks.map((b) => {
    if (b.kind === 'h') return raw(`<b>${escapeHtml(b.text)}</b>`)
    if (b.kind === 'ul') {
      return raw(`<ul style="margin:0 0 14px;padding-left:20px;">${
        b.items.map((i) => `<li style="margin:0 0 7px;">${escapeHtml(i)}</li>`).join('')
      }</ul>`)
    }
    return raw(escapeHtml(b.text))
  })
}

/** The edited text straight to the paragraphs the template renders. */
export function textToEmail(text: string): EmailText[] {
  return blocksToEmail(textToBlocks(text))
}
