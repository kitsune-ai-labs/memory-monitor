import type { Metric, ProcessMemory, Settings, Snapshot } from '../api/protocol'
import { formatGiB } from './format'

export interface MetricView {
  metric: Metric
  name: string
  shortName: string
  color: string
  subtitle: string | null
  usedBytes: number | null
  totalBytes: number | null
  pct: number | null
  thresholdPct: number
  processes: ProcessMemory[]
  /** Why this source has no data, if it failed. */
  error: string | null
}

const SOURCE: Record<Metric, string> = { ram: 'host', vram: 'gpu' }

function sourceError(snapshot: Snapshot | null, metric: Metric): string | null {
  const prefix = `${SOURCE[metric]}: `
  const found = snapshot?.errors.find((e) => e.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

/** Everything the views need to show one metric, derived from a snapshot. */
export function metricView(metric: Metric, snapshot: Snapshot | null, settings: Settings): MetricView {
  const host = snapshot?.host ?? null
  if (metric === 'ram') {
    return {
      metric,
      name: 'System RAM',
      shortName: 'RAM',
      color: 'var(--ram)',
      subtitle: host ? `Windows host · ${formatGiB(host.memory.totalBytes)} GB usable` : null,
      usedBytes: host?.memory.usedBytes ?? null,
      totalBytes: host?.memory.totalBytes ?? null,
      pct: snapshot?.ramPct ?? null,
      thresholdPct: settings.ramAlertPct,
      processes: host?.topRam ?? [],
      error: sourceError(snapshot, metric),
    }
  }
  const gpu = snapshot?.gpu ?? null
  return {
    metric,
    name: 'GPU VRAM',
    shortName: 'VRAM',
    color: 'var(--vram)',
    subtitle: gpu ? (gpu.source === 'windows' ? `${gpu.name} · Windows counters` : gpu.name) : null,
    usedBytes: gpu?.usedBytes ?? null,
    totalBytes: gpu?.totalBytes ?? null,
    pct: snapshot?.vramPct ?? null,
    thresholdPct: settings.vramAlertPct,
    processes: host?.topVram ?? [],
    error: sourceError(snapshot, metric),
  }
}
