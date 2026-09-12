// ============================================================
// WHAT A CATALOGUE ITEM SAYS ABOUT ITSELF
//
// 12 September 2026. Habib: a name for the product and price for the product
// and a description like size, colour, or any custom attributes would be
// useful, especially on the field operation app.
//
// WHY PAIRS AND NOT ONE DESCRIPTION BOX. A box holding "90kg white grade A"
// can be shown and nothing else. Pairs of label and value can be shown under
// the name on a phone as "90kg, White", searched later for every white maize,
// and counted. The cost is that two people can type Colour and colour and mean
// the same thing, which is why the labels already used on a business are
// offered back as suggestions.
//
// NOTHING HERE TRUSTS THE BROWSER. Everything that reaches the database goes
// through cleanAttributes first: the shape, the count, the lengths and the
// characters. A catalogue row is read straight onto a field operator's phone,
// so a value nobody bounded is a value somebody else has to render.
// ============================================================

export interface CatalogueAttribute {
  label: string
  value: string
}

/** As many details as one item may carry. Past this it is a spreadsheet. */
export const MAX_ATTRIBUTES = 12
export const MAX_ATTRIBUTE_LABEL = 40
export const MAX_ATTRIBUTE_VALUE = 60

/** The labels offered before a business has invented any of its own. */
export const SUGGESTED_LABELS = [
  'Size', 'Colour', 'Brand', 'Pack size', 'Variety', 'Grade', 'Weight', 'Material',
]

// A control character in a label is invisible on screen and is not something
// anybody typed on purpose, so it goes before anything is stored.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g

function tidy(s: unknown, max: number): string {
  return String(s ?? '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/**
 * Take whatever arrived and return something safe to store.
 *
 * A detail with no label or no value is dropped rather than stored half
 * finished, because half a pair cannot be shown as a pair. Two details with
 * the same label keep the first, so an item cannot claim two colours.
 */
export function cleanAttributes(input: unknown): CatalogueAttribute[] {
  if (!Array.isArray(input)) return []
  const out: CatalogueAttribute[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const label = tidy((raw as Record<string, unknown>).label, MAX_ATTRIBUTE_LABEL)
    const value = tidy((raw as Record<string, unknown>).value, MAX_ATTRIBUTE_VALUE)
    if (!label || !value) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label, value })
    if (out.length >= MAX_ATTRIBUTES) break
  }
  return out
}

/** The one line shown under an item's name on a phone. */
export function attributeLine(attrs: unknown): string {
  return cleanAttributes(attrs).map((a) => a.value).join(' · ')
}

/** Every label a business has used already, so the next person reuses one. */
export function labelsInUse(items: Array<{ attributes?: unknown }>): string[] {
  const counts = new Map<string, number>()
  for (const item of items || []) {
    for (const a of cleanAttributes(item?.attributes)) {
      counts.set(a.label, (counts.get(a.label) || 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label)
}

/** The labels to offer: what this business uses, then the common ones. */
export function suggestedLabels(items: Array<{ attributes?: unknown }>): string[] {
  const used = labelsInUse(items)
  const lower = new Set(used.map((l) => l.toLowerCase()))
  return used.concat(SUGGESTED_LABELS.filter((l) => !lower.has(l.toLowerCase()))).slice(0, 10)
}

/**
 * Where an item's picture lives.
 *
 * The same shape as every other private store on the platform: the business
 * first, so one business's folder can never be reached from another's, and a
 * stamp on the end so two pictures uploaded in the same millisecond cannot
 * land on the same name.
 */
export function catalogueImagePath(clientId: string, itemId: string, ext: string): string {
  const safe = (s: string) => String(s).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const e = ['jpg', 'jpeg', 'png', 'webp'].includes(String(ext).toLowerCase()) ? String(ext).toLowerCase() : 'jpg'
  return `${safe(clientId)}/${safe(itemId)}/${stamp}.${e}`
}

/** The picture formats a phone camera actually produces that we will take. */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** 5MB, after the browser has shrunk it. A raw phone photo is far larger. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function extensionForImage(mime: string): string {
  const m = String(mime || '').toLowerCase()
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  return 'jpg'
}

/** What the catalogue shows in place of a price on an item nobody has priced. */
export const NEEDS_PRICE_LABEL = 'Needs a price'
