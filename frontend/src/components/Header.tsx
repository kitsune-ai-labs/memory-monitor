import type { Settings, SettingsPatch } from '../api/protocol'
import type { ConnectionStatus } from '../api/useMonitor'
import { statusText, statusTone } from '../lib/status'
import { IntervalSelect } from './controls'
import { ChipIcon, CompactIcon, FullIcon } from './icons'

export interface ControlsProps {
  status: ConnectionStatus
  settings: Settings
  paused: boolean
  onPauseToggle: () => void
  onUpdate: (patch: SettingsPatch) => void
}

const RANGES: { value: Settings['rangeS']; label: string }[] = [
  { value: 60, label: '1m' },
  { value: 300, label: '5m' },
  { value: 900, label: '15m' },
]

export function Header({ status, settings, paused, onPauseToggle, onUpdate }: ControlsProps) {
  return (
    <header className="header">
      <div className="header__brand">
        <div className="header__logo">
          <ChipIcon />
        </div>
        <div>
          <h1>Memory Monitor</h1>
          <p className="header__status">
            <span className={`dot dot--${statusTone(status, paused)}`} />
            {statusText(status, paused, settings.intervalMs)}
            <span className="muted">· Windows host</span>
          </p>
        </div>
      </div>
      <div className="header__controls">
        <div className="segmented" role="group" aria-label="View mode">
          <button type="button" aria-pressed={settings.viewMode === 'full'} onClick={() => onUpdate({ viewMode: 'full' })}>
            <FullIcon />
            Full
          </button>
          <button type="button" aria-pressed={settings.viewMode === 'compact'} onClick={() => onUpdate({ viewMode: 'compact' })}>
            <CompactIcon />
            Compact
          </button>
        </div>
        <div className="segmented" role="group" aria-label="History range">
          {RANGES.map((r) => (
            <button key={r.value} type="button" aria-pressed={settings.rangeS === r.value} onClick={() => onUpdate({ rangeS: r.value })}>
              {r.label}
            </button>
          ))}
        </div>
        <IntervalSelect label="Refresh" value={settings.intervalMs} onUpdate={onUpdate} />
        <button type="button" className="button" onClick={onPauseToggle}>
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </header>
  )
}
