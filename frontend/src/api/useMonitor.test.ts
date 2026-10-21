import { act, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeSocket } from '../test/fakeSocket'
import { makeHistory, makeSnapshot, SETTINGS } from '../test/fixtures'
import { MAX_HISTORY_MS, useMonitor } from './useMonitor'

const createSocket = (url: string) => new FakeSocket(url)

function setup(onAlert = vi.fn()) {
  const hook = renderHook(() => useMonitor({ createSocket, onAlert }))
  // The first connection is opened on the next tick (see the StrictMode test below).
  act(() => vi.advanceTimersByTime(0))
  return { ...hook, onAlert, socket: () => FakeSocket.latest() }
}

function hello(overrides: Record<string, unknown> = {}) {
  return { type: 'hello', settings: SETTINGS, history: makeHistory(3), snapshot: makeSnapshot({ tsMs: 2000 }), ...overrides }
}

beforeEach(() => {
  FakeSocket.instances = []
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useMonitor', () => {
  it('connects to /ws on the page host', () => {
    const { socket, result } = setup()
    expect(socket().url).toBe(`ws://${window.location.host}/ws`)
    expect(result.current.status).toBe('connecting')
  })

  it('becomes open and loads the hello state', () => {
    const { socket, result } = setup()
    act(() => {
      socket().open()
      socket().receive(hello())
    })
    expect(result.current.status).toBe('open')
    expect(result.current.settings).toEqual(SETTINGS)
    expect(result.current.history).toHaveLength(3)
    expect(result.current.snapshot?.tsMs).toBe(2000)
  })

  it('appends each snapshot to the history', () => {
    const { socket, result } = setup()
    act(() => {
      socket().open()
      socket().receive(hello())
      socket().receive({ type: 'snapshot', snapshot: makeSnapshot({ tsMs: 3000, ramPct: 50, vramPct: 10 }) })
    })
    expect(result.current.snapshot?.tsMs).toBe(3000)
    expect(result.current.history.at(-1)).toEqual({ tsMs: 3000, ramPct: 50, vramPct: 10 })
  })

  it('ignores snapshots that are not newer than the last point', () => {
    const { socket, result } = setup()
    act(() => {
      socket().open()
      socket().receive(hello())
      socket().receive({ type: 'snapshot', snapshot: makeSnapshot({ tsMs: 1000 }) })
    })
    expect(result.current.history).toHaveLength(3)
  })

  it('drops history older than the longest range', () => {
    const { socket, result } = setup()
    act(() => {
      socket().open()
      socket().receive(hello({ history: makeHistory(2, 0) }))
      socket().receive({ type: 'snapshot', snapshot: makeSnapshot({ tsMs: MAX_HISTORY_MS + 500 }) })
    })
    expect(result.current.history.map((p) => p.tsMs)).toEqual([1000, MAX_HISTORY_MS + 500])
  })

  it('applies settings broadcasts', () => {
    const { socket, result } = setup()
    act(() => {
      socket().open()
      socket().receive(hello())
      socket().receive({ type: 'settings', settings: { ...SETTINGS, viewMode: 'compact' } })
    })
    expect(result.current.settings?.viewMode).toBe('compact')
  })

  it('passes alerts to the callback', () => {
    const { socket, onAlert } = setup()
    const alert = { metric: 'ram', pct: 90, thresholdPct: 85, tsMs: 1, message: 'System RAM is at 90% (alert at 85%)' }
    act(() => socket().receive({ type: 'alert', alert }))
    expect(onAlert).toHaveBeenCalledWith(alert)
  })

  it('records server errors', () => {
    const { socket, result } = setup()
    act(() => socket().receive({ type: 'error', message: 'invalid settings: interval_ms' }))
    expect(result.current.lastError).toBe('invalid settings: interval_ms')
  })

  it('ignores malformed messages', () => {
    const { socket, result } = setup()
    act(() => {
      socket().open()
      socket().receive(hello())
      socket().receive('{"type":"snapshot","snapshot":{"tsMs":"x"}}')
      socket().receiveBinary()
    })
    expect(result.current.history).toHaveLength(3)
  })

  it('sends settings updates only while connected', () => {
    const { socket, result } = setup()
    act(() => result.current.updateSettings({ intervalMs: 250 }))
    expect(socket().sent).toEqual([])
    act(() => socket().open())
    act(() => result.current.updateSettings({ intervalMs: 250 }))
    expect(socket().sent.map((s) => JSON.parse(s))).toEqual([{ type: 'updateSettings', patch: { intervalMs: 250 } }])
  })

  it('reconnects with growing delays and resets after a successful connection', () => {
    const { socket, result } = setup()
    act(() => socket().drop())
    expect(result.current.status).toBe('closed')
    act(() => vi.advanceTimersByTime(499))
    expect(FakeSocket.instances).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(FakeSocket.instances).toHaveLength(2)
    act(() => socket().drop())
    act(() => vi.advanceTimersByTime(999))
    expect(FakeSocket.instances).toHaveLength(2)
    act(() => vi.advanceTimersByTime(1))
    expect(FakeSocket.instances).toHaveLength(3)
    act(() => {
      socket().open()
      socket().drop()
    })
    act(() => vi.advanceTimersByTime(500))
    expect(FakeSocket.instances).toHaveLength(4)
  })

  it('caps the reconnect delay', () => {
    const { socket } = setup()
    for (let i = 0; i < 10; i += 1) {
      act(() => socket().drop())
      act(() => vi.advanceTimersByTime(30_000))
    }
    expect(FakeSocket.instances).toHaveLength(11)
  })

  it('opens no socket for a mount that is undone immediately (React StrictMode in dev)', () => {
    const { unmount } = renderHook(() => useMonitor({ createSocket }))
    unmount()
    act(() => vi.advanceTimersByTime(1000))
    expect(FakeSocket.instances).toHaveLength(0)
  })

  it('opens exactly one socket under StrictMode', () => {
    renderHook(() => useMonitor({ createSocket }), { wrapper: StrictMode })
    act(() => vi.advanceTimersByTime(0))
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('closes the socket and stops reconnecting on unmount', () => {
    const { socket, unmount } = setup()
    const first = socket()
    unmount()
    expect(first.closed).toBe(true)
    act(() => {
      first.drop()
      vi.advanceTimersByTime(60_000)
    })
    expect(FakeSocket.instances).toHaveLength(1)
  })
})
