'use client'

// ============================================================
// What comes out as a PDF.
//
// The last section of the presentation: the first page of the download at
// roughly its real size, and a list of what the whole document contains. It
// exists so a programme director can see exactly what they are subscribing to
// before they press anything.
//
// The page below is drawn from the same figures as the screen above it. It is
// a preview of the real download, not a picture of one.
// ============================================================

export interface PaperKpi { value: string; label: string; movement?: string; direction?: 'up' | 'down' | 'flat' }
export interface PaperRow { label: string; cells: string[] }

export interface DownloadSectionProps {
  scopeLabel: string
  businesses: number
  monthsCovered: string
  issued: string
  kpis: PaperKpi[]
  columns: string[]
  rows: PaperRow[]
  fileLabel: string
}

const INK = { navy: '#1B2A41', slate: '#4A5A6A', faint: '#7A8A9A', rule: '#D8E1EA', zebra: '#F1EBE0' }

const CONTENTS = [
  'Cover: what is being shown, how many businesses, the months covered',
  'Where it stands: the headline figures and their twelve month movement',
  'Every indicator, every month, with its definition',
  'What they planned against what they achieved',
  'The four stages, and movement between them',
  'How much of what they declare, the money confirms',
  'What these businesses could take on',
  'The farmers, agents and retailers behind them',
  'How each sector is performing',
  'Each business, every month',
  'Appendix: what is measured, and what is withheld and why',
]

export default function DownloadSection({
  scopeLabel, businesses, monthsCovered, issued, kpis, columns, rows, fileLabel,
}: DownloadSectionProps) {
  const h4: React.CSSProperties = {
    fontFamily: 'var(--cv-font-mono)', fontSize: 8, fontWeight: 700, letterSpacing: '0.15em',
    textTransform: 'uppercase', color: INK.slate, margin: '14px 0 6px',
  }
  const th: React.CSSProperties = {
    background: INK.navy, color: '#FFF', fontFamily: 'var(--cv-font-mono)', fontSize: 6.5,
    letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 3px', textAlign: 'right',
  }
  const td: React.CSSProperties = {
    padding: '3.5px 3px', borderBottom: `1px solid #E6ECF2`, textAlign: 'right',
    fontFamily: 'var(--cv-font-mono)', color: INK.slate,
  }
  const inkFor = (d?: string) => (d === 'up' ? '#2E7D32' : d === 'down' ? '#C62828' : INK.faint)

  return (
    <div>
      <div style={{ marginTop: '1rem', background: 'var(--cv-bg)', border: '1px solid var(--cv-border)',
                    borderRadius: 10, padding: 22, display: 'flex', justifyContent: 'center', overflowX: 'auto' }}>
        <div style={{ width: 595, minWidth: 595, background: '#FDFBF7', color: INK.navy,
                      boxShadow: '0 2px 14px rgba(16,42,67,.16)', padding: '34px 38px',
                      fontSize: 9.5, lineHeight: 1.45 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        borderBottom: `2px solid ${INK.navy}`, paddingBottom: 9, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>ClearView Portfolio Intelligence</div>
              <div style={{ fontSize: 8, color: INK.slate, marginTop: 2 }}>
                {scopeLabel} · {businesses} business{businesses === 1 ? '' : 'es'}
              </div>
            </div>
            <div style={{ fontFamily: 'var(--cv-font-mono)', fontSize: 8, color: INK.slate,
                          textAlign: 'right', lineHeight: 1.5 }}>
              Monthly record<br />{monthsCovered}<br />Issued {issued}
            </div>
          </div>

          <div style={h4}>Where it stands</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {kpis.slice(0, 4).map((k) => (
              <div key={k.label} style={{ border: `1px solid ${INK.rule}`, borderTop: '2px solid #1A9DAA', padding: '7px 8px' }}>
                <div style={{ fontFamily: 'var(--cv-font-mono)', fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>{k.value}</div>
                <div style={{ fontSize: 7.5, color: INK.slate, marginTop: 2, lineHeight: 1.3 }}>
                  {k.label}
                  {k.movement && <><br /><span style={{ color: inkFor(k.direction), fontWeight: 700 }}>{k.movement}</span> in 12 months</>}
                </div>
              </div>
            ))}
          </div>

          <div style={h4}>Every indicator, every quarter</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 7.5, marginTop: 4 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Indicator</th>
                {columns.map((c) => <th key={c} style={th}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} style={{ background: i % 2 === 1 ? INK.zebra : undefined }}>
                  <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--cv-font)', fontWeight: 600, color: INK.navy }}>{r.label}</td>
                  {r.cells.map((c, ci) => <td key={ci} style={td}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 8, color: INK.slate, marginTop: 7 }}>
            <b>Full monthly figures continue on page 2.</b> Every indicator carries its definition in the
            appendix, and the same tables come as CSV.
          </div>

          <div style={h4}>What the four stages mean</div>
          <div style={{ fontSize: 8, color: INK.slate, lineHeight: 1.5 }}>
            <b>Grant dependent</b> sales do not cover running costs. &nbsp;
            <b>Commercially aware</b> has paying customers, still needs grant money for part of core costs. &nbsp;
            <b>Market ready</b> covers operating costs from sales, records a lender would accept. &nbsp;
            <b>Commercially viable</b> profitable without grant support.
          </div>

          <div style={{ marginTop: 16, paddingTop: 8, borderTop: `1px solid ${INK.rule}`,
                        display: 'flex', justifyContent: 'space-between', fontSize: 7.5, color: INK.faint }}>
            <span>ClearView · Confidential</span><span>Page 1 of 6</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1rem', border: '1px solid var(--cv-border)', borderRadius: 10, background: 'var(--cv-card)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 10px', alignItems: 'center',
                      padding: '12px 16px', borderBottom: '1px solid var(--cv-border-soft)',
                      background: 'var(--cv-alt)', borderRadius: '10px 10px 0 0' }}>
          {['PDF', 'WORD', 'CSV'].map((p) => (
            <span key={p} style={{ fontFamily: 'var(--cv-font-mono)', fontSize: 11, fontWeight: 700,
                                   padding: '5px 11px', border: '1px solid var(--cv-border)',
                                   borderRadius: 5, color: 'var(--cv-slate)', background: 'var(--cv-card)' }}>{p}</span>
          ))}
          <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.8rem', color: 'var(--cv-slate)' }}>{fileLabel}</span>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 8 }}>
          {CONTENTS.map((text, i) => (
            <div key={text} style={{ display: 'flex', gap: 11, alignItems: 'baseline', fontSize: '0.88rem' }}>
              <span style={{ fontFamily: 'var(--cv-font-mono)', color: 'var(--cv-faint)', fontSize: '0.76rem',
                             flex: 'none', width: 22 }}>{(i + 1 < 10 ? '0' : '') + (i + 1)}</span>
              <span style={{ color: 'var(--cv-slate)' }}>
                {i === 0 || i === CONTENTS.length - 1 ? text : <b style={{ color: 'var(--cv-navy)', fontWeight: 600 }}>{text}</b>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
