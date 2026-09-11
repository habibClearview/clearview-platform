// ============================================================
// THE GUIDANCE LIBRARY: ITS SECTIONS AND WHERE ITS FILES LIVE
//
// 11 September 2026. Habib asked where a co-implementer gets the guidance
// notes and manuals, and whether she should have access to his Gmail folder
// that holds them. She should not: access to a mail folder is access to a mail
// account, and that account holds his commercial terms and every other client.
//
// No database, no browser and no network here, so all of it is tested.
// ============================================================

/**
 * The sections, in the order the work is done rather than the order things
 * were uploaded. A library that sorts by upload date becomes unreadable at
 * about twenty documents, which is one engagement's worth.
 */
export const GUIDANCE_CATEGORIES = [
  { id: 'method', label: 'The method', note: 'The canvas itself, the nine decision points and the gates.' },
  { id: 'delivery', label: 'Running a session', note: 'How each session is run, who must be in the room, and what it has to produce.' },
  { id: 'templates', label: 'Templates and forms', note: 'What is filled in during the work: tables, capture forms, checklists.' },
  { id: 'commercial', label: 'Commercial', note: 'Pricing, the fee model and the terms. The coaching team only.' },
  { id: 'reference', label: 'Reference', note: 'Background reading, worked examples and anything that does not belong above.' },
] as const

export type GuidanceCategory = typeof GUIDANCE_CATEGORIES[number]['id']

export function isGuidanceCategory(value: string): value is GuidanceCategory {
  return GUIDANCE_CATEGORIES.some((c) => c.id === value)
}

export function categoryLabel(id: string): string {
  return GUIDANCE_CATEGORIES.find((c) => c.id === id)?.label || id
}

/**
 * Where a manual is kept.
 *
 * One folder per section, then a name built from the title and the original
 * file name, so somebody looking at the bucket can tell what they are seeing
 * without opening anything.
 *
 * The same sanitising as the recordings, and for the same reason: without it
 * ".." survives and a title could climb out of its own folder.
 */
export function guidanceStoragePath(category: string, title: string, fileName: string): string {
  const safe = (s: string) => String(s)
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^[.]+/, '_')
    .slice(0, 70)

  const extension = (fileName.includes('.') ? fileName.split('.').pop() : '') || 'bin'
  // A stamp, so uploading a corrected version never silently overwrites the
  // one somebody is reading. The time alone is not enough: two uploads inside
  // the same millisecond produce the same name, and the second would replace
  // the first. Caught by its own test.
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `${safe(category)}/${safe(title)}-${stamp}.${safe(extension)}`
}

/** A size a person can read, for a shelf of manuals. */
export function readableSize(bytes: number | null | undefined): string {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024) return `${n} bytes`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
