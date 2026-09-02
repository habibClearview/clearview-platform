// ============================================================
// BUILD STAMP
//
// A small, always-visible marker in the bottom corner so anyone can confirm,
// with their own eyes, which build their browser is actually serving. If it
// does not change after a deploy, the deploy did not reach this browser: a
// stale cache, or the domain is pointed at an older deployment.
//
// IT READS THE COMMIT, NOT A NOTE. This used to be a string somebody edited by
// hand on the way past, which meant it drifted: on 10 August it was still
// announcing a build from 2 August, on a site running code from the day
// before. A marker that exists to tell you which build you are on is worse
// than useless once it is out of date, because it is believed.
//
// Vercel puts the commit in NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA at build time,
// which is the same commit /api/build-info reports from the server. The two
// agree because they come from the same place. Off Vercel there is no commit
// to read, so it says so.
// ============================================================
const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || ''
const branch = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF || ''

export const BUILD_STAMP = sha
  ? `BUILD ${sha.slice(0, 7)}${branch ? ` · ${branch}` : ''}`
  : 'BUILD local (not deployed)'

export default function BuildStamp() {
  return (
    <div
      title="Deployment marker. This is the commit your browser is serving. It matches /api/build-info when the page is current."
      style={{
        position: 'fixed',
        bottom: 8,
        right: 10,
        zIndex: 9999,
        fontFamily: 'var(--cv-font-mono)',
        fontSize: '0.78rem',
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
