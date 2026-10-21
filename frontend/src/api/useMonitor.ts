import { useCallback, useEffect, useRef, useState } from 'react'
import { parseServerMessage, type Alert, type HistoryPoint, type Settings, type SettingsPatch, type Snapshot } from './protocol'

/** The longest history range the UI offers (15 minutes). */
export const MAX_HISTORY_MS = 15 * 60 * 1000
const BASE_RECONNECT_MS = 500
const MAX_RECONNECT_MS = 30_000

export interface SocketLike {
  readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
  send(data: string): void
  close(): void
}

export type ConnectionStatus = 'connecting' | 'open' | 'closed'

export interface MonitorState {
  status: ConnectionStatus
  settings: Settings | null
  snapshot: Snapshot | null
  history: HistoryPoint[]
  lastError: string | null
}

export interface UseMonitorOptions {
  url?: string
  createSocket?: (url: string) => SocketLike
  onAlert?: (alert: Alert) => void
}

const OPEN = 1

function defaultUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}/ws`
}

const browserSocket = (url: string): SocketLike => new WebSocket(url)

function appendPoint(history: HistoryPoint[], snapshot: Snapshot): HistoryPoint[] {
  const last = history.at(-1)
  if (last && snapshot.tsMs <= last.tsMs) return history
  const cutoff = snapshot.tsMs - MAX_HISTORY_MS
  const kept = history.filter((p) => p.tsMs >= cutoff)
  kept.push({ tsMs: snapshot.tsMs, ramPct: snapshot.ramPct, vramPct: snapshot.vramPct })
  return kept
}

const INITIAL: MonitorState = { status: 'connecting', settings: null, snapshot: null, history: [], lastError: null }

/** Live connection to the backend: state from /ws, automatic reconnects, settings updates. */
export function useMonitor({ url, createSocket = browserSocket, onAlert }: UseMonitorOptions = {}) {
  const [state, setState] = useState<MonitorState>(INITIAL)
  const socketRef = useRef<SocketLike | null>(null)
  const onAlertRef = useRef(onAlert)

  useEffect(() => {
    onAlertRef.current = onAlert
  }, [onAlert])

  useEffect(() => {
    const target = url ?? defaultUrl()
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let disposed = false

    const connect = () => {
      const socket = createSocket(target)
      socketRef.current = socket
      setState((s) => ({ ...s, status: 'connecting' }))

      socket.onopen = () => {
        attempt = 0
        setState((s) => ({ ...s, status: 'open', lastError: null }))
      }
      socket.onmessage = (event: MessageEvent) => {
        const data: unknown = event.data
        if (typeof data !== 'string') return
        const message = parseServerMessage(data)
        if (!message) return
        switch (message.type) {
          case 'hello':
            setState((s) => ({ ...s, settings: message.settings, history: message.history, snapshot: message.snapshot }))
            break
          case 'snapshot':
            setState((s) => ({ ...s, snapshot: message.snapshot, history: appendPoint(s.history, message.snapshot) }))
            break
          case 'settings':
            setState((s) => ({ ...s, settings: message.settings }))
            break
          case 'alert':
            onAlertRef.current?.(message.alert)
            break
          case 'error':
            setState((s) => ({ ...s, lastError: message.message }))
            break
        }
      }
      socket.onclose = () => {
        if (disposed) return
        setState((s) => ({ ...s, status: 'closed' }))
        const delay = Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * 2 ** attempt)
        attempt += 1
        timer = setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      disposed = true
      clearTimeout(timer)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [url, createSocket])

  const updateSettings = useCallback((patch: SettingsPatch) => {
    const socket = socketRef.current
    if (socket?.readyState !== OPEN) return
    socket.send(JSON.stringify({ type: 'updateSettings', patch }))
  }, [])

  return { ...state, updateSettings }
}
