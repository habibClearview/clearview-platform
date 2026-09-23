'use client'

// ============================================================
// The four stages, in words a reader who has never seen this platform can use.
//
// The presentation Habib approved does not show a stage as a coloured tile
// with a count on it. It shows what each stage MEANS, because a programme
// director reading "Near Ready" has no way to know what a business had to do
// to get there, and that is the whole product.
//
// The wording is the artifact's, unchanged.
// ============================================================

export interface Stage {
  step: string
  name: string
  meaning: string
  colour: string
  count: number | null
  pct: number | null
}

const C = {
  navy: 'var(--cv-navy)', slate: 'var(--cv-slate)', faint: 'var(--cv-faint)',
  card: 'var(--cv-card)', border: 'var(--cv-border)',
}

export default function StageLadder({ stages }: { stages: Stage[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '0.8rem' }}>
      {stages.map((s) => (
        <div key={s.name} style={{ background: C.card, border: `1px solid ${C.border}`,
                                   borderTop: `3px solid ${s.colour}`, borderRadius: 10,
                                   padding: '0.9rem 1rem', display: 'grid', gap: '0.35rem',
                                   alignContent: 'start' }}>
          <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.68rem', fontWeight: 700,
                         letterSpacing: '0.13em', textTransform: 'uppercase', color: C.faint }}>{s.step}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--cv-font-mono)', fontVariantNumeric: 'tabular-nums',
                           fontSize: '1.8rem', fontWeight: 700, lineHeight: 1, color: s.colour }}>
              {s.count === null ? '—' : s.count}
            </span>
            {s.pct !== null && (
              <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.86rem', color: C.faint }}>
                {Math.round(s.pct)}%
              </span>
            )}
          </div>
          <h4 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: C.navy }}>{s.name}</h4>
          <p style={{ margin: 0, fontSize: '0.94rem', color: C.slate, lineHeight: 1.5 }}>{s.meaning}</p>
        </div>
      ))}
    </div>
  )
}
