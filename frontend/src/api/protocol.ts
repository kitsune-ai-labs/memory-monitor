/**
 * Messages exchanged with the backend over /ws, and a validator for everything it sends.
 *
 * Incoming messages are checked field by field before use, so a malformed or unexpected
 * message is dropped instead of reaching the UI.
 */

export type ViewMode = 'full' | 'compact'
export type Metric = 'ram' | 'vram'

export interface Settings {
  intervalMs: 250 | 500 | 1000 | 2000 | 5000
  rangeS: 60 | 300 | 900
  ramAlertPct: number
  vramAlertPct: number
  alertsEnabled: boolean
  viewMode: ViewMode
}

export interface GpuStats {
  name: string
  usedBytes: number
  totalBytes: number
  utilPct: number | null
  tempC: number | null
  powerW: number | null
  /** nvidia-smi gives the full set; the Windows fallback (AMD/Intel GPUs) only memory. */
  source?: 'nvidia-smi' | 'windows'
}

export interface HostMemory {
  totalBytes: number
  availableBytes: number
  committedBytes: number
  commitLimitBytes: number
  cacheBytes: number
  usedBytes: number
}

export interface ProcessMemory {
  name: string
  bytes: number
  count: number
}

export interface HostSample {
  memory: HostMemory
  topRam: ProcessMemory[]
  topVram: ProcessMemory[]
}

export interface Snapshot {
  tsMs: number
  gpu: GpuStats | null
  host: HostSample | null
  errors: string[]
  ramPct: number | null
  vramPct: number | null
}

export interface HistoryPoint {
  tsMs: number
  ramPct: number | null
  vramPct: number | null
}

export interface Alert {
  metric: Metric
  pct: number
  thresholdPct: number
  tsMs: number
  message: string
}

export type ServerMessage =
  | { type: 'hello'; settings: Settings; history: HistoryPoint[]; snapshot: Snapshot | null }
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'settings'; settings: Settings }
  | { type: 'alert'; alert: Alert }
  | { type: 'error'; message: string }

export type SettingsPatch = Partial<Settings>

export const MAX_SERVER_MESSAGE_CHARS = 2_000_000

type Guard<T> = (value: unknown) => value is T

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isNullable =
  <T>(guard: Guard<T>): Guard<T | null> =>
  (value): value is T | null =>
    value === null || guard(value)
const isArrayOf =
  <T>(guard: Guard<T>): Guard<T[]> =>
  (value): value is T[] =>
    Array.isArray(value) && value.every(guard)
const isOneOf =
  <T extends string | number>(...options: T[]): Guard<T> =>
  (value): value is T =>
    options.includes(value as T)

function hasShape<T>(value: unknown, shape: { [K in keyof T]: Guard<T[K]> }): value is T {
  if (!isRecord(value)) return false
  return Object.entries(shape).every(([key, guard]) => (guard as Guard<unknown>)(value[key]))
}

const isSettings: Guard<Settings> = (v): v is Settings =>
  hasShape<Settings>(v, {
    intervalMs: isOneOf(250, 500, 1000, 2000, 5000),
    rangeS: isOneOf(60, 300, 900),
    ramAlertPct: isNumber,
    vramAlertPct: isNumber,
    alertsEnabled: isBoolean,
    viewMode: isOneOf('full', 'compact'),
  })

const isOptional =
  <T>(guard: Guard<T>): Guard<T | undefined> =>
  (value): value is T | undefined =>
    value === undefined || guard(value)

const isGpuStats: Guard<GpuStats> = (v): v is GpuStats =>
  hasShape<GpuStats>(v, {
    source: isOptional(isOneOf('nvidia-smi', 'windows')),
    name: isString,
    usedBytes: isNumber,
    totalBytes: isNumber,
    utilPct: isNullable(isNumber),
    tempC: isNullable(isNumber),
    powerW: isNullable(isNumber),
  })

const isProcess: Guard<ProcessMemory> = (v): v is ProcessMemory =>
  hasShape<ProcessMemory>(v, { name: isString, bytes: isNumber, count: isNumber })

const isHostSample: Guard<HostSample> = (v): v is HostSample =>
  hasShape<HostSample>(v, {
    memory: (m): m is HostMemory =>
      hasShape<HostMemory>(m, {
        totalBytes: isNumber,
        availableBytes: isNumber,
        committedBytes: isNumber,
        commitLimitBytes: isNumber,
        cacheBytes: isNumber,
        usedBytes: isNumber,
      }),
    topRam: isArrayOf(isProcess),
    topVram: isArrayOf(isProcess),
  })

const isSnapshot: Guard<Snapshot> = (v): v is Snapshot =>
  hasShape<Snapshot>(v, {
    tsMs: isNumber,
    gpu: isNullable(isGpuStats),
    host: isNullable(isHostSample),
    errors: isArrayOf(isString),
    ramPct: isNullable(isNumber),
    vramPct: isNullable(isNumber),
  })

const isHistoryPoint: Guard<HistoryPoint> = (v): v is HistoryPoint =>
  hasShape<HistoryPoint>(v, { tsMs: isNumber, ramPct: isNullable(isNumber), vramPct: isNullable(isNumber) })

const isAlert: Guard<Alert> = (v): v is Alert =>
  hasShape<Alert>(v, {
    metric: isOneOf('ram', 'vram'),
    pct: isNumber,
    thresholdPct: isNumber,
    tsMs: isNumber,
    message: isString,
  })

const validators: { [K in ServerMessage['type']]: Guard<Extract<ServerMessage, { type: K }>> } = {
  hello: (v): v is Extract<ServerMessage, { type: 'hello' }> =>
    isRecord(v) && isSettings(v.settings) && isArrayOf(isHistoryPoint)(v.history) && isNullable(isSnapshot)(v.snapshot),
  snapshot: (v): v is Extract<ServerMessage, { type: 'snapshot' }> => isRecord(v) && isSnapshot(v.snapshot),
  settings: (v): v is Extract<ServerMessage, { type: 'settings' }> => isRecord(v) && isSettings(v.settings),
  alert: (v): v is Extract<ServerMessage, { type: 'alert' }> => isRecord(v) && isAlert(v.alert),
  error: (v): v is Extract<ServerMessage, { type: 'error' }> => isRecord(v) && isString(v.message),
}

/** Parse one raw WebSocket frame. Returns null for anything that is not a valid message. */
export function parseServerMessage(raw: string): ServerMessage | null {
  if (raw.length > MAX_SERVER_MESSAGE_CHARS) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(data) || !isString(data.type) || !Object.hasOwn(validators, data.type)) return null
  const validate = validators[data.type as ServerMessage['type']] as Guard<ServerMessage>
  return validate(data) ? data : null
}
