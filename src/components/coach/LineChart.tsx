'use client'

// ============================================================
// The chart from the agreed presentation, drawn from real figures.
//
// Habib sent the artifact back: "this is what I am expecting to see". Three of
// its sections lead with a line chart and the live page had none, so this is
// that chart, built to the same geometry: a 680 by 250 drawing area, the plot
// running from x 62 to x 648, four grid lines, a month label every third month
// and always on the last, and the latest reading called out with a dot and its
// value.
//
// Months with no reading break the line rather than being drawn as zero.
// ============================================================

export interface ChartSeries {
  values: (number | null)[]
  colour: string
  width?: number
  dashed?: boolean
  /** A dot on every month, not only the last. */
  dots?: boolean
  /** Fill from the line down to the baseline. */
  area?: boolean
  /** Print each month's value above its dot. */
  labelEvery?: boolean
  name?: string
}

export interface LineChartProps {
  months: string[]
  series: ChartSeries[]
  /** Small label above the y axis, e.g. "UGX MILLIONS PER MONTH". */
  axisLabel?: string
  /** Appended to each grid label, e.g. "%". */
  suffix?: string
  /** Shades the area between these two series, for a plan against an actual. */
  shadeBetween?: [number, number]
  shadeColour?: string
  /** Turns a value into the text printed beside the last point. */
  format?: (v: number) => string
  height?: number
  title: string
}

function niceCeiling(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(max)))
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
  for (const s of steps) if (max <= s * mag) return s * mag
  return 10 * mag
}

export default function LineChart({
  months, series, axisLabel, suffix, shadeBetween, shadeColour = 'var(--cv-red)',
  format, height = 250, title,
}: LineChartProps) {
  const n = months.length
  const present = series.flatMap((s) => s.values).filter((v): v is number => v !== null && Number.isFinite(v))
  if (n === 0 || present.length === 0) return null

  const x0 = 62, x1 = 648, top = 30, base = height - 54
  const ceil = niceCeiling(Math.max(...present))
  const x = (i: number) => (n === 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (n - 1))
  const y = (v: number) => base - (v / ceil) * (base - top)

  const pathOf = (values: (number | null)[]) => {
    let d = ''
    let pen = false
    values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) { pen = false; return }
      d += (pen ? ' L' : (d ? ' M' : 'M')) + x(i).toFixed(1) + ',' + y(v).toFixed(1)
      pen = true
    })
    return d
  }

  const gridLines = []
  for (let i = 0; i <= 2; i++) {
    const t = (ceil / 2) * i
    gridLines.push(
      <g key={`g${i}`}>
        <line x1={x0} y1={y(t)} x2={x1} y2={y(t)} stroke="var(--cv-border-soft)" strokeWidth={1} />
        <text x={x0 - 7} y={y(t) + 3.5} textAnchor="end" fontFamily="var(--cv-font-mono)"
              fontSize={10} fontWeight={600} fill="var(--cv-faint)">
          {/* The same short form as the values, so an axis never reads
              6,666,667 where the line beside it reads 6.7m. */}
          {(format ? format(t) : Math.round(t).toLocaleString('en-GB')) + (suffix || '')}
        </text>
      </g>,
    )
  }

  // A label every third month, and always the last one, so they never collide.
  const labelStep = Math.max(1, Math.ceil(n / 7))
  const axis = months.map((m, i) => {
    if (i % labelStep !== 0 && i !== n - 1) return null
    return (
      <text key={m + i} x={x(i)} y={base + 22}
            textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}
            fontFamily="var(--cv-font-mono)" fontSize={10} fontWeight={600} fill="var(--cv-faint)">
        {m.toUpperCase()}
      </text>
    )
  })

  let shade: string | null = null
  if (shadeBetween) {
    const [ai, bi] = shadeBetween
    const a = series[ai]?.values, b = series[bi]?.values
    if (a && b) {
      const usable = months.map((_, i) => i).filter((i) =>
        a[i] !== null && b[i] !== null && Number.isFinite(a[i] as number) && Number.isFinite(b[i] as number))
      if (usable.length > 1) {
        let d = ''
        usable.forEach((i, k) => { d += (k ? ' L' : 'M') + x(i).toFixed(1) + ',' + y(a[i] as number).toFixed(1) })
        for (let k = usable.length - 1; k >= 0; k--) {
          const i = usable[k]
          d += ' L' + x(i).toFixed(1) + ',' + y(b[i] as number).toFixed(1)
        }
        shade = d + ' Z'
      }
    }
  }

  const lastOf = (values: (number | null)[]) => {
    for (let i = values.length - 1; i >= 0; i--) {
      const v = values[i]
      if (v !== null && Number.isFinite(v)) return { i, v }
    }
    return null
  }

  return (
    <div style={{ border: '1px solid var(--cv-border)', borderRadius: 10, background: 'var(--cv-card)',
                  padding: '16px 14px' }}>
      <svg viewBox={`-6 -8 680 ${height}`} role="img" aria-label={title}
           style={{ display: 'block', width: '100%', height: 'auto' }}>
        {gridLines}
        {axisLabel && (
          <text x={x0} y={14} fontFamily="var(--cv-font-mono)" fontSize={10} fontWeight={600}
                fill="var(--cv-faint)">{axisLabel}</text>
        )}
        {shade && <path d={shade} fill={shadeColour} opacity={0.13} />}
        {series.map((s, si) => s.area ? (
          <path key={`a${si}`} d={`${pathOf(s.values)} L${x1},${base} L${x0},${base} Z`}
                fill={s.colour} opacity={0.12} />
        ) : null)}
        {series.map((s, si) => (
          <path key={`p${si}`} d={pathOf(s.values)} fill="none" stroke={s.colour}
                strokeWidth={s.width || 2.6} strokeLinejoin="round" strokeLinecap="round"
                strokeDasharray={s.dashed ? '6 4' : undefined} />
        ))}
        {series.map((s, si) => s.dots ? months.map((_, i) => {
          const v = s.values[i]
          if (v === null || !Number.isFinite(v)) return null
          return <circle key={`d${si}-${i}`} cx={x(i)} cy={y(v)} r={2.3} fill={s.colour} />
        }) : null)}
        {series.map((s, si) => s.labelEvery ? months.map((_, i) => {
          const v = s.values[i]
          if (v === null || !Number.isFinite(v)) return null
          return (
            <text key={`l${si}-${i}`} x={x(i)} y={y(v) - 9} textAnchor="middle"
                  fontFamily="var(--cv-font-mono)" fontSize={10.5} fontWeight={700} fill="var(--cv-slate)">
              {format ? format(v) : Math.round(v)}
            </text>
          )
        }) : null)}
        {series.map((s, si) => {
          const last = lastOf(s.values)
          if (!last) return null
          return (
            <g key={`z${si}`}>
              <circle cx={x(last.i)} cy={y(last.v)} r={4.4} fill={s.colour} />
              {!s.labelEvery && (
                <text x={x(last.i)} y={y(last.v) - 10} textAnchor="end" fontFamily="var(--cv-font-mono)"
                      fontSize={10.5} fontWeight={700} fill={s.colour}>
                  {format ? format(last.v) : Math.round(last.v).toLocaleString('en-GB')}
                </text>
              )}
            </g>
          )
        })}
        {axis}
      </svg>
      {series.some((s) => s.name) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginTop: 12,
                      fontSize: '0.82rem', color: 'var(--cv-slate)' }}>
          {series.filter((s) => s.name).map((s) => (
            <span key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <i style={{ width: 18, height: 3, borderRadius: 2, display: 'block', flex: 'none',
                          background: s.colour }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
