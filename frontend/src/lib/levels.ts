export type UsageLevel = 'good' | 'warning' | 'critical' | 'unknown'

/** Within this many points below the alert threshold, usage is shown as a warning. */
export const WARNING_BAND_PCT = 10

export function usageLevel(pct: number | null, thresholdPct: number): UsageLevel {
  if (pct === null) return 'unknown'
  if (pct >= thresholdPct) return 'critical'
  if (pct >= thresholdPct - WARNING_BAND_PCT) return 'warning'
  return 'good'
}
