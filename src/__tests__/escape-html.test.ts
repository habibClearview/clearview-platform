import { describe, it, expect } from 'vitest'
import { escapeHtml } from '../lib/escape-html'

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(escapeHtml(`"q" & 'a' < >`)).toBe('&quot;q&quot; &amp; &#39;a&#39; &lt; &gt;')
  })
  it('neutralises an attribute-breakout attempt', () => {
    expect(escapeHtml('" onmouseover="evil()')).toBe('&quot; onmouseover=&quot;evil()')
  })
  it('handles null / undefined / numbers', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(42)).toBe('42')
  })
})
