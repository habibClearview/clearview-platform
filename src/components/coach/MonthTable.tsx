'use client'

// ============================================================
// One measure, every month, in the idiom the rest of the page uses.
//
// Habib, looking at the live page after the sections were renamed: "these are
// not the same thing you designed in the artifact - this is the same that was
// there before". He was right. The headings changed and the content under them
// did not: a bar chart of today's readings where the presentation shows a row
// per measure and a column per month.
//
// This is that row-and-column table, shared by the sections that read from the
// recorded month-by-month history.
// ============================================================

const C = {
  navy: 'var(--cv-navy)', slate: 'var(--cv-slate)', faint: 'var(--cv-faint)',
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  borderSoft: 'var(--cv-border-soft)', header: 'var(--cv-header)',
  teal: 'var(--cv-teal)', green: 'var(--cv-green)', amber: 'var(--cv-amber)', red: 'var(--cv-red)',
}

const th: React.CSSProperties = {
  fontFamily: 'var(--cv-font-mono)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)', padding: '8px 7px', textAlign: 'right',
  background: C.header, whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '8px 7px', borderBottom: `1px solid ${C.borderSoft}`, textAlign: 'right',
  fontFamily: 'var(--cv-font-mono)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
}

export type Fmt = 'pct' | 'count' | 'money' | 'score'

export interface MonthRow {
  label: string
  fmt: Fmt
  /** One value per month, aligned with `months`. */
  values: (number | null)[]
  /** Which way is good, for the reading badge. Omit for a plain count. */
  good?: 'up' | 'down'
  /** Shown under the label in small type. */
  note?: string
}

export interface MonthTableProps {
  months: string[]
  rows: MonthRow[]
  currency?: string
  /** Shown instead of the table when there is no month on record yet. */
  empty: string
}

function fmt(kind: Fmt, v: number | null): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (kind === 'pct') return Math.round(v) + '%'
  if (kind === 'score' || kind === 'count') return Math.round(v).toLocaleString('en-GB')
  const a = Math.abs(v)
  if (a >= 1e9) return (v / 1e9).toFixed(1) + 'bn'
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'm'
  if (a >= 1e3) return Math.round(v / 1e3) + 'k'
  return String(Math.round(v))
}

function change(values: (number | null)[]) {
  const present = values.map((v, i) => ({ v, i })).filter((x) => x.v !== null && Number.isFinite(x.v as number))
  if (present.length < 2) return { diff: null as number | null, from: null as number | null }
  return { diff: (present[present.length - 1].v as number) - (present[0].v as number), from: present[0].v as number }
}

function reading(diff: number | null, from: number | null, good?: 'up' | 'down') {
  if (!good || diff === null || from === null) return { word: 'Latest reading', colour: C.slate, dim: 'var(--cv-amber-dim)' }
  const rel = from === 0 ? (diff === 0 ? 0 : 1) : Math.abs(diff / from)
  if (rel < 0.03) return { word: 'Holding', colour: C.slate, dim: 'var(--cv-amber-dim)' }
  const better = good === 'up' ? diff > 0 : diff < 0
  return better
    ? { word: 'Improving', colour: C.green, dim: 'rgba(46,125,50,0.12)' }
    : { word: 'Falling back', colour: C.red, dim: 'var(--cv-red-dim)' }
}

export default function MonthTable({ months, rows, empty }: MonthTableProps) {
  if (months.length === 0) {
    return <p style={{ margin: 0, color: C.slate, fontSize: '1.01rem', lineHeight: 1.6 }}>{empty}</p>
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.card, overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: '0.88rem',
                      minWidth: 420 + months.length * 66 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', minWidth: 230 }}>Measure</th>
            {months.map((m, i) => (
              <th key={m} style={{ ...th, color: i === months.length - 1 ? '#FFF' : 'rgba(255,255,255,0.72)' }}>{m}</th>
            ))}
            <th style={{ ...th, textAlign: 'left' }}>Reading</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const ch = change(r.values)
            const rd = reading(ch.diff, ch.from, r.good)
            const zebra = ri % 2 === 1 ? C.alt : C.card
            return (
              <tr key={r.label}>
                <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--cv-font)', fontWeight: 600,
                             color: C.navy, background: zebra, whiteSpace: 'normal' }}>
                  {r.label}
                  {r.note && <div style={{ fontSize: '0.82rem', fontWeight: 400, color: C.faint, lineHeight: 1.4 }}>{r.note}</div>}
                </td>
                {r.values.map((v, i) => {
                  const last = i === months.length - 1
                  return (
                    <td key={months[i]} style={{ ...td, background: last ? 'var(--cv-cyan-dim)' : zebra,
                                                 fontWeight: last ? 700 : 400, color: last ? C.navy : C.slate }}>
                      {fmt(r.fmt, v)}
                    </td>
                  )
                })}
                <td style={{ ...td, textAlign: 'left', background: zebra }}>
                  <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.72rem', fontWeight: 700,
                                 letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 8px',
                                 borderRadius: 4, whiteSpace: 'nowrap', color: rd.colour, background: rd.dim }}>
                    {rd.word}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
