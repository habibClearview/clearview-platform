// Escape a value for safe interpolation into HTML (e.g. email bodies), so
// user-supplied text can't inject markup/script. Pure and dependency-free.
export function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
