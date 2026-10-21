import type { Settings } from '../api/protocol'
import type { ConnectionStatus } from '../api/useMonitor'
import { formatInterval } from './format'

export const INTERVALS: Settings['intervalMs'][] = [250, 500, 1000, 2000, 5000]

export const isInterval = (value: number): value is Settings['intervalMs'] => (INTERVALS as number[]).includes(value)

export function statusText(status: ConnectionStatus, paused: boolean, intervalMs: number): string {
  if (status === 'closed') return 'Reconnecting…'
  if (status === 'connecting') return 'Connecting…'
  return paused ? 'Paused' : `Live · every ${formatInterval(intervalMs)}`
}

export type StatusTone = 'live' | 'paused' | 'offline'

export const statusTone = (status: ConnectionStatus, paused: boolean): StatusTone =>
  status !== 'open' ? 'offline' : paused ? 'paused' : 'live'
