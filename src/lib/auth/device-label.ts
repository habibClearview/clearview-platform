// ============================================================
// Turn a raw browser User-Agent string into a short, human label
// like "Chrome on Windows" for the active-sessions / devices list.
// Pure and dependency-free so it can be unit-tested directly.
// ============================================================

export function describeDevice(ua: string | null | undefined): string {
  if (!ua || !ua.trim()) return 'Unknown device'

  // Operating system.
  let os = ''
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iPhone/iPad'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'Mac'
  else if (/CrOS/i.test(ua)) os = 'ChromeOS'
  else if (/Linux/i.test(ua)) os = 'Linux'

  // Browser. Order matters: Edge/Opera/Chrome all carry the "Safari" token,
  // and Chrome carries an "Edg"/"OPR" token only for those forks. On iOS,
  // every browser is WebKit under the hood and reports a Safari token, so the
  // iOS-specific brand tokens (Edg[iA], CriOS, FxiOS) MUST be matched before
  // the plain Chrome/Firefox/Safari fallbacks or e.g. Chrome-on-iPhone shows
  // as Safari.
  let browser = ''
  if (/Edg\/|EdgiOS\/|EdgA\//i.test(ua)) browser = 'Edge'
  else if (/OPR\/|OPT\/|Opera/i.test(ua)) browser = 'Opera'
  else if (/CriOS\//i.test(ua)) browser = 'Chrome'   // Chrome on iOS
  else if (/FxiOS\//i.test(ua)) browser = 'Firefox'  // Firefox on iOS
  else if (/Chrome\//i.test(ua)) browser = 'Chrome'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/Version\/.*Safari/i.test(ua)) browser = 'Safari'

  const parts = [browser, os].filter(Boolean)
  if (parts.length === 2) return `${parts[0]} on ${parts[1]}`
  if (parts.length === 1) return parts[0]
  return 'Browser'
}
