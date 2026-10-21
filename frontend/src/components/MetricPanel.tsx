import { useId } from 'react'
import type { HistoryPoint, Metric, Settings, Snapshot } from '../api/protocol'
import { downsample, windowed } from '../lib/chart'
import { formatBytes, formatGiB } from '../lib/format'
import { usageLevel } from '../lib/levels'
import { metricView } from '../lib/metrics'
import { ProcessList } from './ProcessList'
import { StatusBadge } from './StatusBadge'
import { ThresholdSlider } from './ThresholdSlider'
import { UsageChart } from './UsageChart'

interface MetricPanelProps {
  metric: Metric
  snapshot: Snapshot | null
  history: HistoryPoint[]
  settings: Settings
  onThresholdChange: (pct: number) => void
}

const RANGE_LABEL: Record<Settings['rangeS'], string> = { 60: 'minute', 300: '5 minutes', 900: '15 minutes' }
const MAX_CHART_POINTS = 120

const rounded = (value: number | null | undefined, unit: string) =>
  value === null || value === undefined ? '—' : `${Math.round(value)}${unit}`

function stats(metric: Metric, snapshot: Snapshot | null): { label: string; value: string }[] {
  if (metric === 'ram') {
    const memory = snapshot?.host?.memory
    if (!memory) return []
    return [
      { label: 'Available', value: formatBytes(memory.availableBytes) },
      { label: 'Committed', value: formatBytes(memory.committedBytes) },
      { label: 'Cached', value: formatBytes(memory.cacheBytes) },
      { label: 'Commit limit', value: formatBytes(memory.commitLimitBytes) },
    ]
  }
  const gpu = snapshot?.gpu
  if (!gpu) return []
  return [
    { label: 'GPU util', value: rounded(gpu.utilPct, '%') },
    { label: 'Temperature', value: rounded(gpu.tempC, ' °C') },
    { label: 'Power', value: rounded(gpu.powerW, ' W') },
    { label: 'Available', value: formatBytes(gpu.totalBytes - gpu.usedBytes) },
  ]
}

/** One full-size panel of the dashboard: RAM or VRAM. */
export function MetricPanel({ metric, snapshot, history, settings, onThresholdChange }: MetricPanelProps) {
  const headingId = useId()
  const view = metricView(metric, snapshot, settings)
  const level = usageLevel(view.pct, view.thresholdPct)
  const points = downsample(windowed(history, settings.rangeS), MAX_CHART_POINTS)
  const values = points.map((p) => (metric === 'ram' ? p.ramPct : p.vramPct))

  return (
    <section className="panel" aria-labelledby={headingId}>
      <div className="panel__head">
        <div>
          <div className="panel__title">
            <span className="swatch" style={{ background: view.color }} />
            <h2 id={headingId}>{view.name}</h2>
          </div>
          <p className="panel__subtitle">{view.subtitle ?? (view.error ? `Unavailable: ${view.error}` : 'Waiting for data…')}</p>
        </div>
        <StatusBadge level={level} />
      </div>

      {view.usedBytes !== null && view.totalBytes !== null && view.pct !== null && (
        <>
          <div className="panel__hero">
            <div>
              <span className="hero-number">{formatGiB(view.usedBytes)}</span>
              <span className="hero-total"> / {formatGiB(view.totalBytes)} GB</span>
            </div>
            <span className="hero-pct">{view.pct.toFixed(1)}%</span>
          </div>
          <div className="meter" aria-hidden="true">
            <div className="meter__fill" style={{ width: `${view.pct}%`, background: view.color }} />
            <div className="meter__threshold" style={{ left: `${view.thresholdPct}%` }} />
          </div>
        </>
      )}

      <dl className="stats">
        {stats(metric, snapshot).map((s) => (
          <div key={s.label} className="stat">
            <dt>{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>

      <div>
        <div className="section-head">
          <h3>Usage history · last {RANGE_LABEL[settings.rangeS]}</h3>
          <span className="muted">% of total</span>
        </div>
        <UsageChart
          label={`${view.name} usage history`}
          height={160}
          fill
          thresholdPct={view.thresholdPct}
          tsMs={points.map((p) => p.tsMs)}
          series={[{ key: metric, label: view.shortName, color: view.color, values }]}
        />
      </div>

      <div>
        <h3>Top processes</h3>
        <ProcessList label={`Top processes by ${view.shortName}`} color={view.color} processes={view.processes} />
      </div>

      <ThresholdSlider value={view.thresholdPct} onCommit={onThresholdChange} />
    </section>
  )
}
