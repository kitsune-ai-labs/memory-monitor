import type { HistoryPoint } from '../api/protocol'

/** Points within `rangeS` seconds of the newest point. */
export function windowed(points: readonly HistoryPoint[], rangeS: number): HistoryPoint[] {
  const newest = points.at(-1)
  if (!newest) return []
  const cutoff = newest.tsMs - rangeS * 1000
  return points.filter((p) => p.tsMs >= cutoff)
}

/** Evenly thin a series to at most `max` values, always keeping the newest one. */
export function downsample<T>(values: readonly T[], max: number): T[] {
  if (values.length <= max) return [...values]
  const stride = Math.ceil(values.length / max)
  const result: T[] = []
  for (let i = values.length - 1; i >= 0; i -= stride) result.push(values[i] as T)
  return result.reverse()
}

const clampPct = (pct: number) => Math.min(100, Math.max(0, pct))

/** SVG polyline points for percentages across a width × height box; 100% is at the top. */
export function polylinePoints(values: readonly (number | null)[], width: number, height: number): string {
  if (values.length === 0) return ''
  if (values.length === 1) {
    const only = values[0]
    if (only === null || only === undefined) return ''
    const y = (height - (clampPct(only) / 100) * height).toFixed(1)
    return `0.0,${y} ${width.toFixed(1)},${y}`
  }
  const step = width / (values.length - 1)
  return values
    .flatMap((v, i) => (v === null ? [] : [`${(i * step).toFixed(1)},${(height - (clampPct(v) / 100) * height).toFixed(1)}`]))
    .join(' ')
}

/** Index of the point nearest to horizontal position `x` within a chart `width` px wide. */
export function hoverIndex(x: number, width: number, count: number): number | null {
  if (count === 0 || width <= 0) return null
  const fraction = Math.min(1, Math.max(0, x / width))
  return Math.round(fraction * (count - 1))
}
