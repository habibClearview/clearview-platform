// ============================================================
// BUILD STAMP
// A small, always-visible marker in the bottom corner of the app
// so anyone can confirm, with their own eyes, exactly which build
// their live site is serving. When a deploy reaches the browser,
// this code changes. If it does not change after a deploy, the
// deploy did not reach this browser (stale cache, or the domain is
// not pointed at the latest production deployment).
//
// Bump BUILD_STAMP on every change you want to be able to verify
// landed. Keep it short and unmistakable.
// ============================================================
export const BUILD_STAMP = 'BUILD 2026-07-19 · CODE R158'

export default function BuildStamp() {
  return (
    <div
      title="Deployment marker. If this code matches what was just shipped, your live site is up to date."
      style={{
        position: 'fixed',
        bottom: 8,
        right: 10,
        zIndex: 9999,
        fontFamily: 'monospace',
        fontSize: '0.6rem',
        letterSpacing: '0.05em',
        color: '#0B1F33',
        background: 'rgba(255,255,255,0.82)',
        border: '1px solid rgba(11,31,51,0.25)',
        borderRadius: 5,
        padding: '2px 7px',
        pointerEvents: 'none',
        userSelect: 'text',
      }}
    >
      {BUILD_STAMP}
    </div>
  )
}
