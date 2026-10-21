import { useId, useState } from 'react'
import type { HistoryPoint, Metric, Snapshot } from '../api/protocol'
import { downsample, windowed } from '../lib/chart'
import { formatGiB } from '../lib/format'
import { usageLevel, type UsageLevel } from '../lib/levels'
import { metricView, type MetricView } from '../lib/metrics'
import { IntervalSelect } from './controls'
import { statusTone } from '../lib/status'
import type { ControlsProps } from './Header'
import { CompactIcon, CriticalIcon, FullIcon, PauseIcon, PinIcon, PlayIcon } from './icons'
import { ProcessList } from './ProcessList'
import { UsageChart } from './UsageChart'

interface CompactViewProps extends ControlsProps {
  snapshot: Snapshot | null
  history: HistoryPoint[]
  pinned?: boolean
  /** Only provided in the desktop app, where the window can stay on top. */
  onPinToggle?: () => void
}

const MAX_CHART_POINTS = 90

function tileStatus(level: UsageLevel, thresholdPct: number): string {
  switch (level) {
    case 'critical':
      return `Over ${thresholdPct}%`
    case 'warning':
      return 'Near limit'
    case 'good':
      return 'Normal'
    case 'unknown':
      return 'No data'
  }
}

function Tile({ view }: { view: MetricView }) {
  const level = usageLevel(view.pct, view.thresholdPct)
  return (
    <div className="tile" role="group" aria-label={view.shortName}>
      <div className="tile__head">
        <span className="tile__name">
          <span className="swatch" style={{ background: view.color }} />
          {view.shortName}
        </span>
        <span className="tile__status">
          {level === 'critical' && <CriticalIcon />}
          {tileStatus(level, view.thresholdPct)}
        </span>
      </div>
      <div className="tile__pct">
        {view.pct === null ? '—' : Math.round(view.pct)}
        <span className="tile__unit">%</span>
      </div>
      <div className="tile__bytes">
        {view.usedBytes !== null && view.totalBytes !== null ? `${formatGiB(view.usedBytes)} / ${formatGiB(view.totalBytes)} GB` : view.error ?? '—'}
      </div>
      <div className="meter meter--small" aria-hidden="true">
        <div className="meter__fill" style={{ width: `${view.pct ?? 0}%`, background: view.color }} />
        <div className="meter__threshold" style={{ left: `${view.thresholdPct}%` }} />
      </div>
    </div>
  )
}

const rounded = (value: number | null | undefined, unit: string) =>
  value === null || value === undefined ? '—' : `${Math.round(value)}${unit}`

/** The small always-on-top style view: both metrics, one chart, one process list. */
export function CompactView({
  status,
  settings,
  paused,
  onPauseToggle,
  onUpdate,
  snapshot,
  history,
  pinned = false,
  onPinToggle,
}: CompactViewProps) {
  const [tab, setTab] = useState<Metric>('ram')
  const panelId = useId()
  const ram = metricView('ram', snapshot, settings)
  const vram = metricView('vram', snapshot, settings)
  const points = downsample(windowed(history, settings.rangeS), MAX_CHART_POINTS)
  const gpu = snapshot?.gpu
  const tabs = [ram, vram]
  const selected = tab === 'ram' ? ram : vram
  const title = status !== 'open' ? 'Memory · reconnecting' : paused ? 'Memory · paused' : 'Memory · live'

  return (
    <aside className="compact" aria-label="Compact view">
      <div className="compact__bar">
        <span className="compact__title">
          <span className={`dot dot--${statusTone(status, paused)}`} />
          {title}
        </span>
        <div className="compact__actions">
          <div className="segmented segmented--icons" role="group" aria-label="View mode">
            <button type="button" aria-label="Full dashboard" aria-pressed={false} onClick={() => onUpdate({ viewMode: 'full' })}>
              <FullIcon />
            </button>
            <button type="button" aria-label="Compact widget" aria-pressed onClick={() => onUpdate({ viewMode: 'compact' })}>
              <CompactIcon />
            </button>
          </div>
          {onPinToggle && (
            <button type="button" className="icon-button" aria-label="Keep on top" aria-pressed={pinned} onClick={onPinToggle}>
              <PinIcon />
            </button>
          )}
          <button type="button" className="icon-button" aria-label={paused ? 'Resume' : 'Pause'} onClick={onPauseToggle}>
            {paused ? <PlayIcon /> : <PauseIcon />}
          </button>
        </div>
      </div>

      <div className="compact__tiles">
        <Tile view={ram} />
        <Tile view={vram} />
      </div>

      <div className="compact__section">
        <div className="section-head">
          <h2>% used</h2>
          <div className="legend">
            <span>
              <span className="swatch swatch--line" style={{ background: ram.color }} />
              RAM
            </span>
            <span>
              <span className="swatch swatch--line" style={{ background: vram.color }} />
              VRAM
            </span>
          </div>
        </div>
        <UsageChart
          label="RAM and VRAM usage history"
          height={130}
          tsMs={points.map((p) => p.tsMs)}
          series={[
            { key: 'ram', label: 'RAM', color: ram.color, values: points.map((p) => p.ramPct) },
            { key: 'vram', label: 'VRAM', color: vram.color, values: points.map((p) => p.vramPct) },
          ]}
        />
      </div>

      <dl className="chips">
        <div className="chip">
          <dt>GPU util</dt>
          <dd>{rounded(gpu?.utilPct, '%')}</dd>
        </div>
        <div className="chip">
          <dt>GPU temp</dt>
          <dd>{rounded(gpu?.tempC, '°C')}</dd>
        </div>
        <div className="chip">
          <dt>Power</dt>
          <dd>{rounded(gpu?.powerW, ' W')}</dd>
        </div>
      </dl>

      <div className="compact__section">
        <div className="tabs" role="tablist" aria-label="Process list">
          {tabs.map((t) => (
            <button
              key={t.metric}
              type="button"
              role="tab"
              aria-selected={tab === t.metric}
              aria-controls={panelId}
              style={tab === t.metric ? { borderBottomColor: t.color } : undefined}
              onClick={() => setTab(t.metric)}
            >
              Top by {t.shortName}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={panelId} className="compact__procs">
          <ProcessList label={`Top processes by ${selected.shortName}`} color={selected.color} processes={selected.processes.slice(0, 5)} />
        </div>
      </div>

      <div className="compact__footer">
        <IntervalSelect label="Every" value={settings.intervalMs} onUpdate={onUpdate} />
      </div>
    </aside>
  )
}
