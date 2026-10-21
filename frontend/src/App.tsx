import { useCallback, useEffect, useState } from 'react'
import type { Alert, HistoryPoint, Snapshot } from './api/protocol'
import { useMonitor, type SocketLike } from './api/useMonitor'
import { CompactView } from './components/CompactView'
import { ConnectionHelp, HELP_AFTER_ATTEMPTS } from './components/ConnectionHelp'
import { Header } from './components/Header'
import { CriticalIcon } from './components/icons'
import { MetricPanel } from './components/MetricPanel'
import { usageLevel } from './lib/levels'
import { getDesktopBridge, type DesktopBridge } from './lib/desktop'
import { metricView } from './lib/metrics'
import { browserNotifications, notifyAlert, type NotificationApi } from './lib/notifications'

interface AppProps {
  createSocket?: (url: string) => SocketLike
  notifications?: NotificationApi
  /** Desktop window controls; detected from the preload bridge when not given. */
  desktop?: DesktopBridge | null
  /** Whether the page is served by the Vite dev server (shows dev-specific help). */
  dev?: boolean
}

interface Frozen {
  snapshot: Snapshot | null
  history: HistoryPoint[]
}

export default function App({ createSocket, notifications: injected, desktop: injectedDesktop, dev = import.meta.env.DEV }: AppProps) {
  const [notifications] = useState(() => injected ?? browserNotifications())
  const [desktop] = useState(() => (injectedDesktop === undefined ? getDesktopBridge() : injectedDesktop))
  const [pinned, setPinned] = useState(false)
  const onAlert = useCallback((alert: Alert) => notifyAlert(notifications, alert), [notifications])
  const monitor = useMonitor({ createSocket, onAlert })
  const [frozen, setFrozen] = useState<Frozen | null>(null)
  const { settings, status, updateSettings } = monitor
  const help = status !== 'open' && monitor.failedAttempts >= HELP_AFTER_ATTEMPTS ? <ConnectionHelp dev={dev} /> : null
  const viewMode = settings?.viewMode
  // Keep-on-top only makes sense for the compact window.
  const onTop = pinned && viewMode === 'compact'

  useEffect(() => {
    if (desktop && viewMode) void desktop.setViewMode(viewMode)
  }, [desktop, viewMode])

  useEffect(() => {
    if (desktop) void desktop.setAlwaysOnTop(onTop)
  }, [desktop, onTop])

  if (!settings) {
    return (
      <main className="app app--loading">{help ?? <p>Connecting to the monitor service…</p>}</main>
    )
  }

  const paused = frozen !== null
  const snapshot = frozen ? frozen.snapshot : monitor.snapshot
  const history = frozen ? frozen.history : monitor.history
  const togglePause = () => setFrozen(paused ? null : { snapshot: monitor.snapshot, history: monitor.history })
  const controls = { status, settings, paused, onPauseToggle: togglePause, onUpdate: updateSettings }

  if (settings.viewMode === 'compact') {
    return (
      <main className="app app--compact">
        {help}
        <CompactView
          {...controls}
          snapshot={snapshot}
          history={history}
          pinned={onTop}
          onPinToggle={desktop ? () => setPinned(!onTop) : undefined}
        />
      </main>
    )
  }

  const critical = (['ram', 'vram'] as const)
    .map((metric) => metricView(metric, snapshot, settings))
    .filter((view) => usageLevel(view.pct, view.thresholdPct) === 'critical')

  return (
    <main className="app">
      <Header {...controls} notifications={notifications} />
      {help}
      {critical.length > 0 && (
        <div role="status" className="banner">
          <CriticalIcon />
          <strong>Critical:</strong>
          <span>{critical.map((v) => `${v.name} at ${v.pct?.toFixed(1)}% (alert at ${v.thresholdPct}%)`).join(' · ')}</span>
        </div>
      )}
      <div className="panels">
        <MetricPanel
          metric="ram"
          snapshot={snapshot}
          history={history}
          settings={settings}
          onThresholdChange={(pct) => updateSettings({ ramAlertPct: pct })}
        />
        <MetricPanel
          metric="vram"
          snapshot={snapshot}
          history={history}
          settings={settings}
          onThresholdChange={(pct) => updateSettings({ vramAlertPct: pct })}
        />
      </div>
    </main>
  )
}
