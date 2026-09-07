// ============================================================
// The escaping primitives, on their own.
//
// They live here rather than in email.ts so that letter.ts can use them
// without importing the module that imports letter.ts. Two files that need
// each other is one cycle too many for something this small.
// ============================================================

export type EmailText = string | { __html: string }

/**
 * Everything a person typed goes through this. An ampersand in an organisation
 * name breaks the markup and a stray angle bracket does worse, so text is
 * escaped rather than trusted. Callers that genuinely need markup pass it
 * through `raw`.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Mark a string as already-safe markup, so the template leaves it alone. */
export function raw(markup: string): { __html: string } {
  return { __html: markup }
}

export function render(value: EmailText | undefined): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'object' && '__html' in value) return value.__html
  return escapeHtml(value)
}
