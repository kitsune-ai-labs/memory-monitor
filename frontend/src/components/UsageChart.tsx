import { useState, type MouseEvent } from 'react'
import { hoverIndex, polylinePoints } from '../lib/chart'
import { formatAgo } from '../lib/format'

export interface ChartSeries {
  key: string
  label: string
  color: string
  values: (number | null)[]
}

interface UsageChartProps {
  series: ChartSeries[]
  tsMs: number[]
  height: number
  label: string
  thresholdPct?: number
  fill?: boolean
}

const WIDTH = 600
const GRID = [0, 25, 50, 75, 100]

const pctOrDash = (value: number | null | undefined, digits: number) =>
  value === null || value === undefined ? '—' : `${value.toFixed(digits)}%`

/** A 0–100% history chart with a hover crosshair and tooltip. */
export function UsageChart({ series, tsMs, height, label, thresholdPct, fill = false }: UsageChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const count = tsMs.length
  const description =
    count === 0
      ? `${label}. No data yet`
      : `${label}. Latest: ${series.map((s) => `${s.label} ${pctOrDash(s.values.at(-1), 0)}`).join(', ')}`

  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setHover(hoverIndex(event.clientX - rect.left, rect.width, count))
  }

  const active = hover !== null && hover < count ? hover : null
  const fraction = active === null || count < 2 ? 0 : active / (count - 1)
  const toY = (pct: number) => height - (pct / 100) * height

  return (
    <div className="chart" style={{ height }}>
      <div className="chart__axis" aria-hidden="true">
        {[...GRID].reverse().map((g) => (
          <span key={g}>{g}</span>
        ))}
      </div>
      <div className="chart__surface" data-testid="chart-surface" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg role="img" aria-label={description} viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" width="100%" height={height}>
          {GRID.map((g) => (
            <line key={g} className="chart__grid" x1={0} x2={WIDTH} y1={toY(g)} y2={toY(g)} vectorEffect="non-scaling-stroke" />
          ))}
          {series.map((s) => {
            const points = polylinePoints(s.values, WIDTH, height)
            return (
              <g key={s.key}>
                {fill && points && <polygon points={`0,${height} ${points} ${WIDTH},${height}`} fill={s.color} fillOpacity={0.16} />}
                <polyline points={points} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </g>
            )
          })}
          {thresholdPct !== undefined && (
            <line
              data-testid="threshold"
              className="chart__threshold"
              x1={0}
              x2={WIDTH}
              y1={toY(thresholdPct)}
              y2={toY(thresholdPct)}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {active !== null && (
          <>
            <div className="chart__crosshair" style={{ left: `${fraction * 100}%` }} />
            <div
              role="tooltip"
              className="chart__tooltip"
              style={{ left: `${fraction * 100}%`, transform: fraction > 0.6 ? 'translateX(calc(-100% - 20px))' : 'none' }}
            >
              <div className="chart__tooltip-time">{formatAgo((tsMs[count - 1] ?? 0) - (tsMs[active] ?? 0))}</div>
              {series.map((s) => (
                <div key={s.key} className="chart__tooltip-row">
                  <span className="swatch swatch--line" style={{ background: s.color }} />
                  {s.label} {pctOrDash(s.values[active], 1)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
