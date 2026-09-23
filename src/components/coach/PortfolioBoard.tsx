'use client'

// ============================================================
// The market intelligence board.
//
// 23 September 2026. The first version of this read portfolio_snapshots, a
// table that began filing on 20 September and therefore held one month, and
// suppressed any figure drawn from fewer than five businesses. On a coach's
// view of their own three clients that produced a page of "n<5" and dashes.
// Habib: "there are clients in the financial model that have historical data,
// but this is showing nothing".
//
// TWO THINGS CHANGED.
//
//   It reads the months that already exist. Every financial model carries its
//   own month-by-month figures and the single client Intelligence tab already
//   draws trends from them. Those months come through buildPortfolioViewData
//   now, so this board has real history for real clients today.
//
//   The five-business suppression is gone from here. It exists so a shared or
//   anonymised view cannot identify a business from a small sample. This page
//   is the coach's own view of their own clients: there is nobody to protect
//   them from, and applying it here blanked the whole page.
//
// A measure the models cannot give month by month -- readiness, verified
// share, debt cover -- shows its latest reading in the latest column and says
// so, rather than pretending to a trend or showing nothing at all.
// ============================================================

import { useMemo, useState } from 'react'
import { changeAcross, type MonthlyPoint } from '@/lib/portfolio-monthly'

const C = {
  navy: 'var(--cv-navy)', slate: 'var(--cv-slate)', faint: 'var(--cv-faint)',
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  borderSoft: 'var(--cv-border-soft)', header: 'var(--cv-header)',
  cyan: 'var(--cv-cyan)', teal: 'var(--cv-teal)', green: 'var(--cv-green)',
  amber: 'var(--cv-amber)', red: 'var(--cv-red)', purple: 'var(--cv-purple)',
}

export type BoardView = 'portfolio' | 'programme' | 'funder' | 'lender' | 'buyer'

export const BOARD_VIEWS: { id: BoardView; label: string }[] = [
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'programme', label: 'Programme' },
  { id: 'funder', label: 'Funder' },
  { id: 'lender', label: 'Lender' },
  { id: 'buyer', label: 'Buyer' },
]

type Fmt = 'money' | 'pct' | 'score' | 'count' | 'ratio'

interface Measure {
  key: string
  name: string
  fmt: Fmt
  good: 'up' | 'down'
  what: string
  how: string
  looks: string
  /** Null where the models cannot give this month by month. */
  series: (number | null)[] | null
  /** Used when there is no series: the reading as it stands now. */
  latest: number | null
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

function fmtFull(kind: Fmt, v: number | null, currency: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (kind === 'pct') return Math.round(v) + '%'
  if (kind === 'score') return String(Math.round(v))
  if (kind === 'ratio') return v.toFixed(1) + '×'
  if (kind === 'count') return Math.round(v).toLocaleString('en-GB')
  const a = Math.abs(v)
  if (a >= 1e9) return `${currency} ${(v / 1e9).toFixed(2)}bn`
  if (a >= 1e6) return `${currency} ${(v / 1e6).toFixed(1)}m`
  if (a >= 1e3) return `${currency} ${Math.round(v / 1e3)}k`
  return `${currency} ${Math.round(v)}`
}

function fmtCell(kind: Fmt, v: number | null): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (kind === 'pct') return Math.round(v) + '%'
  if (kind === 'ratio') return v.toFixed(1) + '×'
  if (kind === 'score' || kind === 'count') return Math.round(v).toLocaleString('en-GB')
  const a = Math.abs(v)
  if (a >= 1e9) return (v / 1e9).toFixed(1) + 'bn'
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'm'
  if (a >= 1e3) return Math.round(v / 1e3) + 'k'
  return String(Math.round(v))
}

function readingOf(diff: number | null, from: number | null, good: 'up' | 'down') {
  if (diff === null || from === null) return { word: 'Latest reading', colour: C.slate, dim: 'var(--cv-amber-dim)' }
  const rel = from === 0 ? (diff === 0 ? 0 : 1) : Math.abs(diff / from)
  if (rel < 0.03) return { word: 'Holding', colour: C.slate, dim: 'var(--cv-amber-dim)' }
  const better = good === 'up' ? diff > 0 : diff < 0
  return better
    ? { word: 'Improving', colour: C.green, dim: 'rgba(46,125,50,0.12)' }
    : { word: 'Falling back', colour: C.red, dim: 'var(--cv-red-dim)' }
}

function changeText(kind: Fmt, diff: number | null, currency: string): string {
  if (diff === null) return 'no earlier month'
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '▬'
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : ''
  const a = Math.abs(diff)
  if (kind === 'pct') return `${arrow} ${sign}${Math.round(a)} ${Math.round(a) === 1 ? 'pt' : 'pts'}`
  if (kind === 'ratio') return `${arrow} ${sign}${a.toFixed(1)}×`
  if (kind === 'score' || kind === 'count') return `${arrow} ${sign}${Math.round(a).toLocaleString('en-GB')}`
  return `${arrow} ${sign}${fmtFull('money', a, currency)}`
}

/** Which measures lead, per view. Every view still shows all of them. */
const ORDER: Record<BoardView, string[]> = {
  portfolio: ['revenue', 'grossMargin', 'operatingMargin', 'readiness', 'marketReady', 'verified', 'dscr', 'confidence'],
  programme: ['readiness', 'marketReady', 'confidence', 'revenue', 'grossMargin', 'operatingMargin', 'verified', 'dscr'],
  funder: ['verified', 'confidence', 'readiness', 'marketReady', 'revenue', 'grossMargin', 'operatingMargin', 'dscr'],
  lender: ['dscr', 'operatingMargin', 'grossMargin', 'revenue', 'verified', 'confidence', 'marketReady', 'readiness'],
  buyer: ['revenue', 'grossMargin', 'marketReady', 'operatingMargin', 'readiness', 'dscr', 'verified', 'confidence'],
}

const CARDS: Record<BoardView, string[]> = {
  portfolio: ['revenue', 'grossMargin', 'readiness', 'marketReady'],
  programme: ['readiness', 'marketReady', 'confidence', 'revenue'],
  funder: ['verified', 'confidence', 'readiness', 'marketReady'],
  lender: ['dscr', 'operatingMargin', 'revenue', 'grossMargin'],
  buyer: ['revenue', 'grossMargin', 'marketReady', 'operatingMargin'],
}

const ACCENT: Record<string, string> = {
  revenue: C.teal, grossMargin: C.cyan, operatingMargin: C.cyan, readiness: C.amber,
  marketReady: C.green, verified: C.green, dscr: C.teal, confidence: C.purple,
}

export interface PortfolioBoardProps {
  view: BoardView
  monthly: {
    months: string[]
    points: MonthlyPoint[]
    currency: string | null
    currencies: string[]
    businesses: number
  } | null | undefined
  /** Current readings for the measures a model cannot give month by month. */
  current: {
    readiness: number | null
    marketReady: number | null
    verified: number | null
    dscr: number | null
    confidence: number | null
  }
  businesses: number
  fallbackCurrency: string
}

export default function PortfolioBoard({ view, monthly, current, businesses, fallbackCurrency }: PortfolioBoardProps) {
  const [open, setOpen] = useState<string | null>(null)

  const points = monthly?.points || []
  const currency = monthly?.currency || fallbackCurrency
  const others = (monthly?.currencies || []).filter((c) => c !== currency)
  const monthCount = points.length

  const measures: Measure[] = useMemo(() => {
    const revenue = points.map((p) => p.revenue)
    const gross = points.map((p) => p.grossMargin)
    const ebitda = points.map((p) => p.ebitdaMargin)
    return [
      { key: 'revenue', name: 'Combined revenue', fmt: 'money', good: 'up', series: revenue, latest: null,
        what: 'What these businesses actually sold that month, added together.',
        how: 'Taken from each business’s own financial model, from the months it has recorded actual figures for. A month still in forecast is never counted as history.',
        looks: 'Rising, and rising across most businesses rather than one large one.' },
      { key: 'grossMargin', name: 'Median gross margin', fmt: 'pct', good: 'up', series: gross, latest: null,
        what: 'What is left of each sale after paying for the goods sold, as a share of the sale.',
        how: 'Gross profit divided by revenue for each business that month, reported as the middle business so one large one cannot move it.',
        looks: 'Rising, or holding while revenue grows. Flat margin with growing revenue is a pricing problem, not a sales one.' },
      { key: 'operatingMargin', name: 'Median operating margin', fmt: 'pct', good: 'up', series: ebitda, latest: null,
        what: 'Operating profit as a share of sales, before interest, tax and depreciation.',
        how: 'Operating profit divided by revenue for each business that month, reported as the middle business.',
        looks: 'Rising. A negative figure means the business loses money on its own operations.' },
      { key: 'readiness', name: 'Median investment readiness', fmt: 'score', good: 'up', series: null, latest: current.readiness,
        what: 'How ready a business is to take outside money, scored out of 30.',
        how: 'Built from whether records are complete, whether figures have been independently confirmed, whether it can name paying customers, and whether it could service debt.',
        looks: 'Rising. This is the score that moves a business between readiness stages.' },
      { key: 'marketReady', name: 'At market ready or above', fmt: 'count', good: 'up', series: null, latest: current.marketReady,
        what: 'How many businesses have reached Near Ready or Investment Ready.',
        how: 'Counted from each business’s readiness stage. Near Ready means it covers operating costs from sales and keeps records a lender would accept.',
        looks: 'Rising, both in number and as a share of the portfolio.' },
      { key: 'verified', name: 'Verified share of revenue', fmt: 'pct', good: 'up', series: null, latest: current.verified,
        what: 'Of the revenue businesses declared, the share a payment record confirms.',
        how: 'A payment must be matched to a specific recorded sale. Money received but never matched is counted separately and never added in.',
        looks: 'Rising. A business with nothing verified has never had a figure independently confirmed, which is a different conversation from one whose figures are poor.' },
      { key: 'dscr', name: 'Debt cover', fmt: 'ratio', good: 'up', series: null, latest: current.dscr,
        what: 'Whether operating cash covers the debt falling due.',
        how: 'Operating cash divided by debt due, for the median business. At 1.5 times or better most lenders are comfortable; below that they are not.',
        looks: 'At or above 1.5. Below 1, the business cannot service what it already owes.' },
      { key: 'confidence', name: 'Median data confidence', fmt: 'score', good: 'up', series: null, latest: current.confidence,
        what: 'How much of a business’s figures are verified rather than estimated, out of 100.',
        how: 'Built from whether records are complete, internally consistent, and confirmed by independent payments.',
        looks: 'Rising. It is what lets a figure from this platform be quoted rather than argued about.' },
    ]
  }, [points, current])

  const byKey = useMemo(() => Object.fromEntries(measures.map((m) => [m.key, m])), [measures])
  const ordered = ORDER[view].map((k) => byKey[k]).filter(Boolean) as Measure[]

  const headline = useMemo(() => {
    const rev = changeAcross(points.map((p) => p.revenue))
    const nice = (v: number | null, kind: Fmt) => fmtFull(kind, v, currency)
    if (view === 'funder') {
      return current.verified === null
        ? `${businesses} businesses. No revenue has been independently confirmed yet.`
        : `${Math.round(current.verified)} out of 100 on data confidence across ${businesses} businesses.`
    }
    if (view === 'lender') {
      return current.dscr === null
        ? `${businesses} businesses, none of them carrying debt to cover.`
        : `Debt cover is ${current.dscr.toFixed(1)}× for the middle business of ${businesses}.`
    }
    if (view === 'programme') {
      return `Median readiness is ${current.readiness === null ? '—' : Math.round(current.readiness)} out of 30 across ${businesses} businesses.`
    }
    if (view === 'buyer') {
      return `${businesses} businesses, ${current.marketReady === null ? '—' : Math.round(current.marketReady)} of them market ready or better.`
    }
    if (rev.to === null) return `${businesses} businesses on the platform.`
    if (rev.diff === null) return `${businesses} businesses, turning over ${nice(rev.to, 'money')} in the latest month on record.`
    const dir = rev.diff >= 0 ? 'up' : 'down'
    return `${businesses} businesses, turning over ${nice(rev.to, 'money')} a month, ${dir} from ${nice(rev.from, 'money')}.`
  }, [view, points, current, businesses, currency])

  return (
    <div style={{ marginBottom: '1.4rem' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: C.navy, letterSpacing: '-0.02em',
                    lineHeight: 1.2, maxWidth: '46ch', marginBottom: '0.45rem' }}>
        {headline}
      </div>
      <p style={{ margin: '0 0 1rem', color: C.slate, fontSize: '1.01rem', maxWidth: '100%', lineHeight: 1.6 }}>
        {monthCount === 0
          ? 'No month has an actual reading yet. Revenue and margin fill in as each business records its first month of real figures against its plan.'
          : monthCount === 1
            ? `One month has actual figures so far, ${points[0].label}. Revenue and margin carry a trend from the second month onward; the rest are the reading as it stands.`
            : `${monthCount} months of actual figures, ${points[0].label} to ${points[monthCount - 1].label}, taken from each business’s own model. Press the information mark beside any measure to read what it means.`}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
                    gap: '0.8rem', marginBottom: '1.1rem' }}>
        {CARDS[view].map((key) => {
          const m = byKey[key] as Measure
          if (!m) return null
          const ch = m.series ? changeAcross(m.series) : { from: null, to: m.latest, diff: null, pct: null, months: 0 }
          const rd = readingOf(ch.diff, ch.from, m.good)
          return (
            <div key={key} style={{ background: C.card, border: `1px solid ${C.border}`,
                                    borderTop: `3px solid ${ACCENT[key] || C.teal}`, borderRadius: 10,
                                    padding: '0.9rem 1rem', display: 'grid', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.96rem', fontWeight: 600, color: C.slate, lineHeight: 1.35 }}>{m.name}</span>
              <span style={{ fontFamily: 'var(--cv-font-mono)', fontVariantNumeric: 'tabular-nums',
                             fontSize: '1.9rem', fontWeight: 700, letterSpacing: '-0.03em',
                             lineHeight: 1.05, color: C.navy }}>
                {fmtFull(m.fmt, ch.to, currency)}
              </span>
              <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.86rem', fontWeight: 700, color: rd.colour }}>
                {ch.diff === null
                  ? <span style={{ color: C.faint, fontWeight: 400 }}>{m.series ? 'no earlier month' : 'latest reading'}</span>
                  : <>{changeText(m.fmt, ch.diff, currency)}
                      <span style={{ color: C.faint, fontWeight: 400, marginLeft: 5 }}>
                        over {ch.months} month{ch.months === 1 ? '' : 's'}
                      </span></>}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.card, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.88rem',
                        minWidth: Math.max(620, 280 + Math.max(monthCount, 1) * 70 + 200) }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', minWidth: 240, position: 'sticky', left: 0, zIndex: 2 }}>Measure</th>
              {monthCount === 0
                ? <th style={th}>Latest</th>
                : points.map((p, i) => (
                    <th key={p.month} style={{ ...th, color: i === monthCount - 1 ? '#FFF' : 'rgba(255,255,255,0.72)' }}>
                      {p.label}
                    </th>
                  ))}
              <th style={th}>Change</th>
              <th style={{ ...th, textAlign: 'left' }}>Reading</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((m, rowIndex) => {
              const ch = m.series ? changeAcross(m.series) : { from: null, to: m.latest, diff: null, pct: null, months: 0 }
              const rd = readingOf(ch.diff, ch.from, m.good)
              const zebra = rowIndex % 2 === 1 ? C.alt : C.card
              return (
                <tr key={m.key}>
                  <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--cv-font)', fontWeight: 600,
                               color: C.navy, background: zebra, position: 'sticky', left: 0, zIndex: 1,
                               borderRight: `1px solid ${C.borderSoft}`, whiteSpace: 'normal' }}>
                    <button type="button" onClick={() => setOpen(open === m.key ? null : m.key)}
                      aria-expanded={open === m.key} title={`What ${m.name} means`}
                      style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit',
                               cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span aria-hidden="true" style={{
                        flex: 'none', width: 17, height: 17, borderRadius: '50%',
                        border: `1.5px solid ${C.teal}`, color: open === m.key ? C.card : C.teal,
                        background: open === m.key ? C.teal : 'transparent',
                        fontFamily: 'var(--cv-font-mono)', fontSize: '0.7rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                      }}>i</span>
                      <span>{m.name}</span>
                    </button>
                  </td>
                  {monthCount === 0
                    ? <td style={{ ...td, background: 'var(--cv-cyan-dim)', fontWeight: 700, color: C.navy }}>
                        {fmtCell(m.fmt, m.latest)}
                      </td>
                    : points.map((p, i) => {
                        const last = i === monthCount - 1
                        const v = m.series ? m.series[i] : (last ? m.latest : null)
                        return (
                          <td key={p.month} style={{ ...td, background: last ? 'var(--cv-cyan-dim)' : zebra,
                                                     fontWeight: last ? 700 : 400, color: last ? C.navy : C.slate }}>
                            {fmtCell(m.fmt, v)}
                          </td>
                        )
                      })}
                  <td style={{ ...td, background: 'var(--cv-cyan-dim)', fontWeight: 700, color: rd.colour }}>
                    {ch.diff === null ? <span style={{ color: C.faint, fontWeight: 400 }}>
                      {m.series ? 'no earlier month' : 'latest only'}</span> : changeText(m.fmt, ch.diff, currency)}
                  </td>
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

      {open && byKey[open] && (
        <div style={{ marginTop: '0.7rem', border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.teal}`,
                      borderRadius: 10, background: C.alt, padding: '1rem 1.1rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 0.9rem', alignItems: 'baseline',
                        justifyContent: 'space-between', marginBottom: '0.8rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 700, color: C.navy }}>{byKey[open].name}</h3>
            <button type="button" onClick={() => setOpen(null)}
              style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.74rem', fontWeight: 700,
                       letterSpacing: '0.09em', textTransform: 'uppercase', background: 'none',
                       border: `1px solid ${C.border}`, borderRadius: 5, padding: '5px 10px',
                       color: C.slate, cursor: 'pointer' }}>Close</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '0.9rem 1.8rem' }}>
            {[['What it is', byKey[open].what],
              ['How it is worked out', byKey[open].how],
              ['What good looks like', byKey[open].looks],
              ['Where it comes from', byKey[open].series
                ? 'Each business’s own financial model, month by month, for the months it has recorded actual figures.'
                : 'The latest reading across the businesses in view. The models do not carry this one month by month, so it is shown as it stands rather than as a trend.']].map(([h, body]) => (
              <div key={h}>
                <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.68rem', fontWeight: 700,
                               letterSpacing: '0.13em', textTransform: 'uppercase', color: C.faint,
                               display: 'block', marginBottom: 4 }}>{h}</span>
                <p style={{ margin: 0, fontSize: '0.96rem', color: C.slate, lineHeight: 1.55 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ margin: '0.7rem 0 0', fontSize: '0.9rem', color: C.faint, lineHeight: 1.6 }}>
        Percentages are medians across the businesses in view, never averages, so one large business cannot move
        them. A dash means no actual reading was recorded for that month.
        {others.length > 0 && <> Money is shown in <b>{currency}</b> only; {others.join(' and ')} {others.length === 1 ? 'is' : 'are'} held
        in this view and left out of the totals, because a sum across currencies means nothing.</>}
      </p>
    </div>
  )
}
