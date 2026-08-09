// @ts-nocheck
'use client'
// ============================================================
// The bar that says whose eyes you are looking through.
//
// It is deliberately hard to miss. A coach who forgets they are previewing and
// concludes that a screen is broken, or that a party cannot see something, has
// been misled by the tool that was meant to inform them. So while a preview is
// on, there is a coloured band across the top of the client, it names the role,
// and getting back to your own view is one click that is always visible.
//
// It says two things beside the choice, and both matter.
//
//   WHAT THEY CAN DO       answered by the same functions the application uses
//                          to decide, not a second list written here that could
//                          drift away from the first.
//
//   WHAT THIS IS NOT       the data on screen was fetched with your access, so
//                          this shows the interface they get, not proof of what
//                          the database would hand them. Saying so is the whole
//                          difference between a useful preview and a misleading
//                          one.
//
// Previewing never changes who is writing. The routes resolve the writer from
// the session whatever the screen is showing, which is why this is safe to
// leave switched on while you work.
// ============================================================
import { PREVIEW_ROLES, capabilitiesFor, previewRole } from '@/lib/role-preview'

const C = {
  card: 'var(--cv-card)', border: 'var(--cv-border)', navy: 'var(--cv-navy)',
  slate: 'var(--cv-slate)', teal: 'var(--cv-teal)', amber: 'var(--cv-amber)',
  green: 'var(--cv-green)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'monospace' }
const hint = { fontSize: '0.88rem', color: C.slate, lineHeight: 1.5 }

export default function ViewAsBar({ realRole, viewingAs, onChange }) {
  const previewing = viewingAs && viewingAs !== realRole
  const role = previewRole(viewingAs || realRole)
  const caps = capabilitiesFor(viewingAs || realRole)

  return (
    <div style={{
      border: `1px solid ${previewing ? C.amber : C.border}`,
      borderLeft: `4px solid ${previewing ? C.amber : C.border}`,
      borderRadius: 12, background: C.card, padding: '0.85rem 1.05rem', marginBottom: '1.1rem',
    }}>
      <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{
          ...mono, fontSize: '0.7rem', letterSpacing: '.12em', textTransform: 'uppercase',
          color: previewing ? C.amber : C.slate,
        }}>{previewing ? 'You are looking through someone else’s eyes' : 'Looking through'}</span>

        <label htmlFor="view-as" style={{ ...mono, fontSize: '0.7rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
          View as
        </label>
        <select
          id="view-as"
          value={viewingAs || realRole}
          onChange={(e) => onChange(e.target.value)}
          style={{
            padding: '0.35rem 0.55rem', border: `1px solid ${C.border}`, borderRadius: 7,
            background: 'var(--cv-bg-2)', color: C.navy, fontSize: '0.95rem', minWidth: 240,
          }}
        >
          {PREVIEW_ROLES.map((r) => (
            <option key={r.id} value={r.id}>{r.label}{r.unreachable ? ' (no login exists)' : ''}</option>
          ))}
        </select>

        {previewing ? (
          <button
            type="button"
            onClick={() => onChange(realRole)}
            style={{
              ...mono, fontSize: '0.85rem', fontWeight: 700, padding: '0.35rem 0.9rem', border: 'none',
              borderRadius: 7, background: C.amber, color: 'var(--cv-on-accent)', cursor: 'pointer',
            }}
          >Back to your own view</button>
        ) : null}
      </div>

      {role ? (
        <p style={{ ...hint, margin: '0.6rem 0 0', maxWidth: '76ch' }}>
          <strong style={{ color: C.navy }}>{role.who}</strong> {role.reach}
        </p>
      ) : null}

      {role?.unreachable ? (
        <p style={{ ...hint, margin: '0.45rem 0 0', color: C.amber, maxWidth: '76ch' }}>
          Nobody can hold this role today, so switching to it shows you what the screen would give
          them if they could log in. What a funder actually gets is the showcase link, on the
          Engagement Setup screen.
        </p>
      ) : null}

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))',
        gap: '0.35rem 1.1rem', marginTop: '0.7rem',
      }}>
        {caps.map((c) => (
          <div key={c.what} style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', fontSize: '0.9rem' }}>
            <span style={{ color: c.allowed ? C.green : C.red, fontWeight: 700 }}>{c.allowed ? 'Yes' : 'No'}</span>
            <span style={{ color: C.slate }}>{c.what}</span>
          </div>
        ))}
      </div>

      {previewing ? (
        <p style={{ ...hint, margin: '0.7rem 0 0', maxWidth: '76ch' }}>
          This is the screen they get. It is not proof of what the database would hand them, because
          what is on this page was loaded with your access. Anything you save while previewing is
          still saved as you.
        </p>
      ) : null}
    </div>
  )
}
