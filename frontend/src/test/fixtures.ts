import type { HistoryPoint, Settings, Snapshot } from '../api/protocol'

const GIB = 1024 ** 3

export const SETTINGS: Settings = {
  intervalMs: 1000,
  rangeS: 60,
  ramAlertPct: 85,
  vramAlertPct: 90,
  alertsEnabled: true,
  viewMode: 'full',
}

export function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    tsMs: 1_000,
    gpu: {
      name: 'NVIDIA GeForce RTX 5090',
      usedBytes: 8 * GIB,
      totalBytes: 32 * GIB,
      utilPct: 12,
      tempC: 41,
      powerW: 96.5,
    },
    host: {
      memory: {
        totalBytes: 64 * GIB,
        availableBytes: 40 * GIB,
        committedBytes: 30 * GIB,
        commitLimitBytes: 72 * GIB,
        cacheBytes: 2 * GIB,
        usedBytes: 24 * GIB,
      },
      topRam: [
        { name: 'chrome', bytes: 3 * GIB, count: 23 },
        { name: 'Code', bytes: 512 * 1024 ** 2, count: 1 },
      ],
      topVram: [{ name: 'python', bytes: 6 * GIB, count: 1 }],
    },
    errors: [],
    ramPct: 37.5,
    vramPct: 25,
    ...overrides,
  }
}

export function makeHistory(count: number, startMs = 0, stepMs = 1000): HistoryPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    tsMs: startMs + i * stepMs,
    ramPct: 30 + (i % 5),
    vramPct: 20 + (i % 3),
  }))
}
