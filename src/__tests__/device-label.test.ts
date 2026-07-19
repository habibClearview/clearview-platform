import { describe, it, expect } from 'vitest'
import { describeDevice } from '../lib/auth/device-label'

describe('describeDevice', () => {
  it('names Chrome on Windows', () => {
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'))
      .toBe('Chrome on Windows')
  })

  it('names Safari on iPhone/iPad', () => {
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'))
      .toBe('Safari on iPhone/iPad')
  })

  it('names Safari on Mac', () => {
    expect(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15'))
      .toBe('Safari on Mac')
  })

  it('distinguishes Edge from Chrome (Edge carries the Chrome token)', () => {
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'))
      .toBe('Edge on Windows')
  })

  it('names Chrome on Android', () => {
    expect(describeDevice('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'))
      .toBe('Chrome on Android')
  })

  it('names Firefox on Linux', () => {
    expect(describeDevice('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'))
      .toBe('Firefox on Linux')
  })

  it('recognises iOS browsers by their brand token, not the Safari fallback', () => {
    // Chrome on iOS (CriOS) — carries a Safari token but is NOT Safari.
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'))
      .toBe('Chrome on iPhone/iPad')
    // Firefox on iOS (FxiOS)
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/121.0 Mobile/15E148 Safari/605.1.15'))
      .toBe('Firefox on iPhone/iPad')
    // Edge on iOS (EdgiOS)
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/120.0 Mobile/15E148 Safari/604.1'))
      .toBe('Edge on iPhone/iPad')
  })

  it('falls back gracefully for empty / unknown agents', () => {
    expect(describeDevice('')).toBe('Unknown device')
    expect(describeDevice(null)).toBe('Unknown device')
    expect(describeDevice(undefined)).toBe('Unknown device')
    expect(describeDevice('some-random-crawler/1.0')).toBe('Browser')
  })
})
