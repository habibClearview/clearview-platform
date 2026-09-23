'use client'

// ============================================================
// The market intelligence board: what every indicator was, in every month.
//
// 23 September 2026. Habib, on the page this replaces: "the information reads
// like jargon that was put together for nobody sane", "there is no trend", and
// "any one that looks at this information would not be able to tell you what
// the actual changes in the measures are from one month to the next".
//
// So: every indicator carries the reading for every month, its own definition,
// and a plain word for whether it is improving. Nothing is explained in a
// glossary at the bottom, because a glossary at the bottom is a glossary
// nobody reads.
//
// The view tabs change what leads and in what order. They never change a
// figure, never hide an indicator, and never address the reader: this page
// belongs to no programme and no funder.
//
// A SHORT RECORD IS SHOWN AS A SHORT RECORD. The monthly job began in
// September 2026. Until months accumulate this board has one or two columns,
// and it says so rather than drawing an empty chart.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  navy: 'var(--cv-navy)', slate: 'var(--cv-slate)', faint: 'var(--cv-faint)',
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  borderSoft: 'var(--cv-border-soft)', header: 'var(--cv-header)', nav: 'var(--cv-nav)',
  cyan: 'var(--cv-cyan)', teal: 'var(--cv-teal)', green: 'var(--cv-green)',
  amber: 'var(--cv-amber)', red: 'var(--cv-red)', purple: 'var(--cv-purple)',
  onAccent: 'var(--cv-on-accent)',
}

export type BoardView = 'portfolio' | 'programme' | 'funder' | 'lender' | 'buyer'

export const BOARD_VIEWS: { id: BoardView; label: string }[] = [
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'programme', label: 'Programme' },
  { id: 'funder', label: 'Funder' },
  { id: 'lender', label: 'Lender' },
  { id: 'buyer', label: 'Buyer' },
]

interface Point { month: string; label: string; value: number | null; n: number; withheld?: boolean }

type Fmt = 'money' | 'pct' | 'score' | 'count'

interface Indicator {
  key: string
  name: string
  fmt: Fmt
  good: 'up' | 'down'
  what: string
  how: string
  looks: string
}

// Every figure on the board, with what it means. Written for somebody who has
// never seen the platform before, because that is who reads it.
const INDICATORS: Indicator[] = [
  { key: 'revenue', name: 'Combined revenue', fmt: 'money', good: 'up',
    what: 'Every business’s declared sales for that month, added together.',
    how: 'Taken from each business’s own financial model. Sales only, before any costs.',
    looks: 'Rising, and rising across most businesses rather than one large one.' },
  { key: 'verified', name: 'Verified share of revenue', fmt: 'pct', good: 'up',
    what: 'Of the revenue businesses declared, the share a payment record confirms.',
    how: 'A payment must be matched to a specific recorded sale. Money received but never matched is counted separately and never added in.',
    looks: 'Rising. A flat line means nobody has ever independently confirmed those figures.' },
  { key: 'unattributed', name: 'Received but not matched', fmt: 'money', good: 'down',
    what: 'Money that arrived but has not been paired with a sale.',
    how: 'Payments recorded against a business with no matching entry. It counts as neither declared nor verified until somebody pairs it.',
    looks: 'Low or falling. A large figure means the pairing work is behind, not that the business is doing badly.' },
  { key: 'readiness', name: 'Median investment readiness', fmt: 'score', good: 'up',
    what: 'How ready a business is to take outside money, scored out of 30.',
    how: 'Built from whether records are complete, whether figures have been independently confirmed, whether it can name paying customers, and whether it could service debt. The middle business is shown.',
    looks: 'Rising. This is the score that moves a business between readiness stages.' },
  { key: 'marketReady', name: 'At market ready or above', fmt: 'count', good: 'up',
    what: 'How many businesses have reached Near Ready or Investment Ready.',
    how: 'Counted from each business’s readiness stage in that month. Near Ready means it covers operating costs from sales and keeps records a lender would accept.',
    looks: 'Rising, both in number and as a share of the population.' },
  { key: 'slipped', name: 'Slipped back a stage', fmt: 'count', good: 'down',
    what: 'How many businesses now sit at a lower readiness stage than the highest they have reached.',
    how: 'Each business is judged against its own best month, not against the others. One that climbs back stops being counted.',
    looks: 'Low, or falling. It is the figure a narrative report never contains, because nobody writes down that they went backwards.' },
  { key: 'aboveComfort', name: 'Above the lender comfort line', fmt: 'count', good: 'up',
    what: 'How many businesses could service a loan comfortably that month.',
    how: 'Operating cash divided by the debt falling due. At 1.5 times or better most lenders are comfortable; below that they are not.',
    looks: 'Rising as a share of the population.' },
  { key: 'grossMargin', name: 'Median gross margin', fmt: 'pct', good: 'up',
    what: 'What is left of each sale after paying for the goods sold, as a share of the sale.',
    how: 'Sales minus the direct cost of what was sold, divided by sales. The median is the middle business, so one outlier cannot move it.',
    looks: 'Rising, or holding while revenue grows. Flat margin with growing revenue is a pricing problem, not a sales one.' },
  { key: 'ebitdaMargin', name: 'Median operating margin', fmt: 'pct', good: 'up',
    what: 'Operating profit as a share of sales, before interest, tax and depreciation.',
    how: 'Operating profit divided by revenue, taken per business and reported as the middle one.',
    looks: 'Rising. A negative figure means the business loses money on its own operations.' },
  { key: 'revenueGrowth', name: 'Median revenue growth', fmt: 'pct', good: 'up',
    what: 'How much each business’s revenue has grown, year on year.',
    how: 'This period’s revenue against the same period a year earlier, per business, reported as the middle one.',
    looks: 'Positive and steady. Very high growth on a thin margin is usually a pricing problem waiting to happen.' },
  { key: 'absorbable', name: 'Capital they could absorb', fmt: 'money', good: 'up',
    what: 'The most these businesses could take on today and still service.',
    how: 'Worked out per business from its own cash position and existing obligations, then added up. Capacity, never a claim that anyone has lent.',
    looks: 'Rising. It is the size of the opportunity, not of anything that has happened.' },
  { key: 'confidence', name: 'Median data confidence', fmt: 'score', good: 'up',
    what: 'How much of a business’s figures are verified rather than estimated, scored out of 100.',
    how: 'Built from whether records are complete, internally consistent, and confirmed by independent payments.',
    looks: 'Rising. It is what lets a figure from this platform be quoted rather than argued about.' },
  { key: 'decisionsSigned', name: 'Decisions signed', fmt: 'count', good: 'up',
    what: 'How many decision points the businesses have formally signed off.',
    how: 'Counted across the coaching record. A decision only counts once it is signed, not once it is discussed.',
    looks: 'Rising. It is the clearest sign that coaching is turning into action.' },
]

const thStyle: React.CSSProperties = {
  fontFamily: 'var(--cv-font-mono)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)', padding: '8px 6px', textAlign: 'right',
  background: C.header, whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '7px 6px', borderBottom: '1px solid var(--cv-border-soft)', textAlign: 'right',
  fontFamily: 'var(--cv-font-mono)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
}

const BY_KEY: Record<string, Indicator> = Object.fromEntries(INDICATORS.map((i) => [i.key, i]))

/** Which indicators lead, per view. Every view still shows all of them. */
const VIEW_ORDER: Record<BoardView, string[]> = {
  portfolio: INDICATORS.map((i) => i.key),
  programme: ['readiness', 'marketReady', 'slipped', 'decisionsSigned', 'revenue', 'grossMargin',
    'verified', 'revenueGrowth', 'ebitdaMargin', 'aboveComfort', 'absorbable', 'confidence', 'unattributed'],
  funder: ['verified', 'confidence', 'unattributed', 'marketReady', 'slipped', 'readiness',
    'decisionsSigned', 'revenue', 'grossMargin', 'revenueGrowth', 'ebitdaMargin', 'aboveComfort', 'absorbable'],
  lender: ['aboveComfort', 'absorbable', 'verified', 'revenue', 'grossMargin', 'ebitdaMargin',
    'revenueGrowth', 'confidence', 'slipped', 'marketReady', 'readiness', 'decisionsSigned', 'unattributed'],
  buyer: ['revenue', 'revenueGrowth', 'grossMargin', 'marketReady', 'absorbable', 'aboveComfort',
    'verified', 'readiness', 'slipped', 'ebitdaMargin', 'confidence', 'decisionsSigned', 'unattributed'],
}

/** The four figures that lead as cards, per view. */
const VIEW_CARDS: Record<BoardView, string[]> = {
  portfolio: ['revenue', 'verified', 'marketReady', 'slipped'],
  programme: ['readiness', 'marketReady', 'slipped', 'decisionsSigned'],
  funder: ['verified', 'confidence', 'marketReady', 'unattributed'],
  lender: ['aboveComfort', 'absorbable', 'verified', 'grossMargin'],
  buyer: ['revenue', 'revenueGrowth', 'grossMargin', 'absorbable'],
}

const CARD_ACCENT: Record<string, string> = {
  revenue: C.teal, verified: C.green, marketReady: C.cyan, slipped: C.red,
  readiness: C.amber, decisionsSigned: C.purple, confidence: C.cyan,
  unattributed: C.amber, aboveComfort: C.teal, absorbable: C.purple,
  grossMargin: C.cyan, revenueGrowth: C.teal, ebitdaMargin: C.cyan,
}

function fmtValue(fmt: Fmt, v: number | null, currency: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (fmt === 'pct') return Math.round(v) + '%'
  if (fmt === 'score') return String(Math.round(v))
  if (fmt === 'count') return Math.round(v).toLocaleString('en-GB')
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return `${currency} ${(v / 1_000_000_000).toFixed(2)}bn`
  if (abs >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(1)}m`
  if (abs >= 1_000) return `${currency} ${Math.round(v / 1_000)}k`
  return `${currency} ${Math.round(v)}`
}

/** Short enough for a table cell eighteen columns wide. */
function fmtCell(fmt: Fmt, v: number | null): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (fmt === 'pct') return Math.round(v) + '%'
  if (fmt === 'score' || fmt === 'count') return Math.round(v).toLocaleString('en-GB')
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'bn'
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'm'
  if (abs >= 1_000) return Math.round(v / 1_000) + 'k'
  return String(Math.round(v))
}

interface Move { from: number | null; to: number | null; diff: number | null; pct: number | null; months: number }

function movementOf(points: Point[]): Move {
  const withValue = points.map((p, i) => ({ p, i })).filter((x) => x.p.value !== null)
  if (withValue.length < 2) {
    return { from: null, to: withValue[0] ? withValue[0].p.value : null, diff: null, pct: null, months: 0 }
  }
  const a = withValue[0], b = withValue[withValue.length - 1]
  const from = a.p.value as number, to = b.p.value as number
  return { from, to, diff: to - from, pct: from === 0 ? null : ((to - from) / from) * 100, months: b.i - a.i }
}

function readingOf(m: Move, good: 'up' | 'down'): { cls: string; word: string; colour: string } {
  if (m.diff === null || m.from === null) return { cls: 'flat', word: 'One reading', colour: C.faint }
  const rel = m.from === 0 ? (m.diff === 0 ? 0 : 1) : Math.abs(m.diff / m.from)
  if (rel < 0.03) return { cls: 'flat', word: 'Holding', colour: C.slate }
  const better = good === 'up' ? m.diff > 0 : m.diff < 0
  return better ? { cls: 'up', word: 'Improving', colour: C.green }
                : { cls: 'down', word: 'Falling back', colour: C.red }
}

function moveLabel(ind: Indicator, m: Move, currency: string): string {
  if (m.diff === null) return 'no earlier reading'
  const sign = m.diff > 0 ? '+' : m.diff < 0 ? '−' : ''
  const arrow = m.diff > 0 ? '▲' : m.diff < 0 ? '▼' : '▬'
  if (ind.fmt === 'pct') {
    const n = Math.abs(Math.round(m.diff))
    return `${arrow} ${sign}${n} ${n === 1 ? 'pt' : 'pts'}`
  }
  if (ind.fmt === 'count' || ind.fmt === 'score') {
    return `${arrow} ${sign}${Math.abs(Math.round(m.diff)).toLocaleString('en-GB')}`
  }
  return `${arrow} ${sign}${fmtValue('money', Math.abs(m.diff), currency)}`
}

export interface PortfolioBoardProps {
  view: BoardView
  filter: Record<string, string>
  /** Used only until the record answers with the currency it actually holds. */
  currency: string
  /** How many businesses the current (single-reading) view covers. */
  snapshotCount: number
}

export default function PortfolioBoard({ view, filter, currency: fallbackCurrency, snapshotCount }: PortfolioBoardProps) {
  const [history, setHistory] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const filterKey = JSON.stringify(filter)

  useEffect(() => {
    let live = true
    setLoading(true); setError('')
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch('/api/portfolio-history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterToken: session?.access_token, filter }),
      })
        .then((r) => r.json())
        .then((json) => {
          if (!live) return
          if (json.error) { setError(json.error); setLoading(false); return }
          setHistory(json); setLoading(false)
        })
        .catch(() => { if (live) { setError('Could not load the monthly record.'); setLoading(false) } })
    })
    return () => { live = false }
  }, [filterKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const months: Point[] = useMemo(() => {
    if (!history) return []
    const first = history.series?.engagements as Point[] | undefined
    return first || []
  }, [history])

  const ordered = VIEW_ORDER[view].map((k) => BY_KEY[k]).filter(Boolean)
  // Money is reported in the currency most of these businesses keep their
  // books in, never added across currencies.
  const currency: string = history?.currency || fallbackCurrency
  const otherCurrencies: string[] = ((history?.currencies as string[]) || []).filter((c) => c !== currency)

  function pointsFor(key: string): Point[] {
    return (history?.series?.[key] as Point[]) || []
  }

  const headline = useMemo(() => {
    if (!history || months.length === 0) return ''
    const latest = (k: string) => {
      const pts = pointsFor(k)
      for (let i = pts.length - 1; i >= 0; i--) if (pts[i].value !== null) return pts[i].value as number
      return null
    }
    // ?? not ||: zero engagements read in the latest month is a real answer,
    // and substituting a different population count would misstate it.
    const n = history.engagementsLatest ?? snapshotCount
    const ready = latest('marketReady'), slip = latest('slipped')
    const ver = latest('verified'), comfort = latest('aboveComfort'), rdy = latest('readiness')
    const nice = (v: number | null) => v === null ? '—' : Math.round(v).toLocaleString('en-GB')
    if (view === 'funder') {
      return ver === null
        ? `${n} businesses on the record. No verified share yet for this view.`
        : `${Math.round(ver)}% of what these ${n} businesses declare, the money confirms.`
    }
    if (view === 'lender') {
      return `${nice(comfort)} of ${n} could service new debt at the latest reading.`
    }
    if (view === 'buyer') {
      return `${n} businesses on the record, ${nice(ready)} of them market ready or better.`
    }
    if (view === 'programme') {
      return `Median readiness is ${nice(rdy)} out of 30. ${nice(ready)} are market ready or better, ${nice(slip)} have slipped back.`
    }
    return `${n} businesses on the monthly record. ${nice(ready)} are market ready or better, ${nice(slip)} have slipped back.`
  }, [history, view, months, snapshotCount]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <div style={{ padding: '1.4rem', color: C.slate }}>Reading the monthly record…</div>
  }
  if (error) {
    return (
      <div style={{ border: `1px solid ${C.red}`, borderRadius: 8, padding: '1rem', color: C.navy, marginBottom: '1.2rem' }}>
        <b style={{ color: C.red }}>The monthly record could not be read.</b> {error}
      </div>
    )
  }
  if (!history || months.length === 0) {
    return (
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, padding: '1.1rem', marginBottom: '1.2rem' }}>
        <div style={{ fontWeight: 700, color: C.navy, marginBottom: '0.35rem' }}>The monthly record has not started yet</div>
        <p style={{ margin: 0, color: C.slate, fontSize: '1.01rem', lineHeight: 1.6 }}>
          Every figure below is the latest reading only. The platform began filing one reading per business per
          month in September 2026; once two months are on file, this board shows what each measure was in every
          month and whether it is improving.
        </p>
      </div>
    )
  }

  const monthCount = months.length
  const cards = VIEW_CARDS[view]

  return (
    <div style={{ marginBottom: '1.4rem' }}>
      <div style={{ fontSize: '1.45rem', fontWeight: 700, color: C.navy, letterSpacing: '-0.02em',
                    lineHeight: 1.18, maxWidth: '30ch', marginBottom: '0.5rem' }}>
        {headline}
      </div>
      <p style={{ margin: '0 0 1rem', color: C.slate, fontSize: '1.01rem', maxWidth: '72ch', lineHeight: 1.6 }}>
        {monthCount === 1
          ? `One month is on the record so far, ${months[0].label}. A second month is filed at the start of next month, and from then on every measure below carries its own trend.`
          : `${monthCount} months on the record, ${months[0].label} to ${months[monthCount - 1].label}. Every column is the reading for that month. Press the information mark beside any measure to read what it means.`}
      </p>

      {/* headline figures */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(196px,1fr))',
                    gap: '0.8rem', marginBottom: '1.1rem' }}>
        {cards.map((key) => {
          const ind = BY_KEY[key]
          if (!ind) return null
          const pts = pointsFor(key)
          const mv = movementOf(pts)
          const rd = readingOf(mv, ind.good)
          return (
            <div key={key} style={{ background: C.card, border: `1px solid ${C.border}`,
                                    borderTop: `3px solid ${CARD_ACCENT[key] || C.teal}`, borderRadius: 10,
                                    padding: '0.9rem 1rem', display: 'grid', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.96rem', fontWeight: 600, color: C.slate, lineHeight: 1.35 }}>{ind.name}</span>
              <span style={{ fontFamily: 'var(--cv-font-mono)', fontVariantNumeric: 'tabular-nums',
                             fontSize: '1.9rem', fontWeight: 700, letterSpacing: '-0.03em',
                             lineHeight: 1.05, color: C.navy }}>
                {fmtValue(ind.fmt, mv.to, currency)}
              </span>
              <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.86rem', fontWeight: 700, color: rd.colour }}>
                {moveLabel(ind, mv, currency)}
                <span style={{ color: C.faint, fontWeight: 400, marginLeft: 5 }}>
                  {mv.diff === null ? '' : `over ${mv.months} month${mv.months === 1 ? '' : 's'}`}
                </span>
              </span>
            </div>
          )
        })}
      </div>

      {/* every indicator, every month */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.card, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.86rem',
                        minWidth: Math.max(640, 300 + monthCount * 62 + 190) }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left', minWidth: 230, position: 'sticky', left: 0, zIndex: 2 }}>
                Measure
              </th>
              {months.map((m, i) => (
                <th key={m.month} style={{ ...thStyle, color: i === monthCount - 1 ? '#FFF' : 'rgba(255,255,255,0.72)' }}>
                  {m.label}
                </th>
              ))}
              <th style={thStyle}>Change</th>
              <th style={{ ...thStyle, textAlign: 'left' }}>Reading</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((ind, rowIndex) => {
              const pts = pointsFor(ind.key)
              const mv = movementOf(pts)
              const rd = readingOf(mv, ind.good)
              const zebra = rowIndex % 2 === 1 ? C.alt : C.card
              return (
                <tr key={ind.key}>
                  <td style={{ ...tdStyle, textAlign: 'left', fontFamily: 'var(--cv-font)', fontWeight: 600,
                               color: C.navy, background: zebra, position: 'sticky', left: 0, zIndex: 1,
                               borderRight: `1px solid ${C.borderSoft}`, whiteSpace: 'normal' }}>
                    <button
                      type="button"
                      onClick={() => setOpen(open === ind.key ? null : ind.key)}
                      aria-expanded={open === ind.key}
                      title={`What ${ind.name} means`}
                      style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit',
                               cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <span aria-hidden="true" style={{
                        flex: 'none', width: 17, height: 17, borderRadius: '50%',
                        border: `1.5px solid ${C.teal}`, color: open === ind.key ? C.card : C.teal,
                        background: open === ind.key ? C.teal : 'transparent',
                        fontFamily: 'var(--cv-font-mono)', fontSize: '0.7rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                      }}>i</span>
                      <span>{ind.name}</span>
                    </button>
                  </td>
                  {months.map((m, i) => {
                    const p = pts[i]
                    const latest = i === monthCount - 1
                    return (
                      <td key={m.month} title={p && p.withheld ? `Withheld: only ${p.n} businesses that month` : undefined}
                          style={{ ...tdStyle, background: latest ? 'var(--cv-cyan-dim)' : zebra,
                                   fontWeight: latest ? 700 : 400, color: latest ? C.navy : C.slate }}>
                        {p && p.withheld ? 'n<5' : fmtCell(ind.fmt, p ? p.value : null)}
                      </td>
                    )
                  })}
                  <td style={{ ...tdStyle, background: 'var(--cv-cyan-dim)', fontWeight: 700, color: rd.colour }}>
                    {moveLabel(ind, mv, currency)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left', background: zebra }}>
                    <span style={{
                      fontFamily: 'var(--cv-font-mono)', fontSize: '0.72rem', fontWeight: 700,
                      letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4,
                      whiteSpace: 'nowrap', color: rd.colour,
                      background: rd.cls === 'up' ? 'var(--cv-green-dim, rgba(46,125,50,0.12))'
                                : rd.cls === 'down' ? 'var(--cv-red-dim)' : 'var(--cv-amber-dim)',
                    }}>{rd.word}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {open && BY_KEY[open] && (
        <div style={{ marginTop: '0.7rem', border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.teal}`,
                      borderRadius: 10, background: C.alt, padding: '1rem 1.1rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 0.9rem', alignItems: 'baseline',
                        justifyContent: 'space-between', marginBottom: '0.8rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 700, color: C.navy }}>{BY_KEY[open].name}</h3>
            <button type="button" onClick={() => setOpen(null)}
                    style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.74rem', fontWeight: 700,
                             letterSpacing: '0.09em', textTransform: 'uppercase', background: 'none',
                             border: `1px solid ${C.border}`, borderRadius: 5, padding: '5px 10px',
                             color: C.slate, cursor: 'pointer' }}>Close</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(232px,1fr))', gap: '0.9rem 1.6rem' }}>
            {[['What it is', BY_KEY[open].what],
              ['How it is worked out', BY_KEY[open].how],
              ['What good looks like', BY_KEY[open].looks]].map(([h, body]) => (
              <div key={h}>
                <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.68rem', fontWeight: 700,
                               letterSpacing: '0.13em', textTransform: 'uppercase', color: C.faint,
                               display: 'block', marginBottom: 4 }}>{h}</span>
                <p style={{ margin: 0, fontSize: '0.96rem', color: C.slate, lineHeight: 1.55 }}>{body}</p>
              </div>
            ))}
            <div>
              <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.68rem', fontWeight: 700,
                             letterSpacing: '0.13em', textTransform: 'uppercase', color: C.faint,
                             display: 'block', marginBottom: 4 }}>On this record</span>
              <p style={{ margin: 0, fontSize: '0.96rem', color: C.slate, lineHeight: 1.55 }}>
                {(() => {
                  const ind = BY_KEY[open]
                  const mv = movementOf(pointsFor(open))
                  if (mv.to === null) return 'No reading on file for this view yet.'
                  if (mv.diff === null) return `${fmtValue(ind.fmt, mv.to, currency)} at the latest reading. A second month is needed before a change can be shown.`
                  return `${fmtValue(ind.fmt, mv.from, currency)} at the first reading, ${fmtValue(ind.fmt, mv.to, currency)} at the latest, ${moveLabel(ind, mv, currency)} over ${mv.months} month${mv.months === 1 ? '' : 's'}.`
                })()}
              </p>
            </div>
          </div>
        </div>
      )}

      <p style={{ margin: '0.7rem 0 0', fontSize: '0.88rem', color: C.faint, maxWidth: '78ch', lineHeight: 1.6 }}>
        Percentages are medians across the businesses in view, never averages, so one large business cannot move
        them. <b>n&lt;5</b> marks a month withheld because fewer than five businesses were read that month and a
        reader could otherwise work out who they are. A dash means no reading was filed.
        {otherCurrencies.length > 0 && (
          <> Money is shown in <b>{currency}</b> only. {otherCurrencies.length === 1 ? 'One other currency is' : `${otherCurrencies.length} other currencies are`} held
          in this view ({otherCurrencies.join(', ')}) and {otherCurrencies.length === 1 ? 'it is' : 'they are'} left out of
          the money figures rather than added to them, because a total across currencies means nothing.</>
        )}
        {' '}Businesses that slipped back are counted across every readiness stage, so a stage filter narrows who
        is counted but never hides a fall.
      </p>
    </div>
  )
}
