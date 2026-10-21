import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { fakeDesktop } from './test/fakeDesktop'
import { FakeNotifications } from './test/fakeNotifications'
import { FakeSocket } from './test/fakeSocket'
import { makeHistory, makeSnapshot, SETTINGS } from './test/fixtures'

const createSocket = (url: string) => new FakeSocket(url)

function connect(settings = SETTINGS, notifications = new FakeNotifications(), desktop: ReturnType<typeof fakeDesktop> | null = null) {
  render(<App createSocket={createSocket} notifications={notifications} desktop={desktop} />)
  act(() => vi.advanceTimersByTime(0))
  const socket = FakeSocket.latest()
  act(() => {
    socket.open()
    socket.receive({ type: 'hello', settings, history: makeHistory(3), snapshot: makeSnapshot({ tsMs: 5000 }) })
  })
  return socket
}

beforeEach(() => {
  FakeSocket.instances = []
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('App', () => {
  it('shows a loading state until the server says hello', () => {
    render(<App createSocket={createSocket} notifications={new FakeNotifications()} />)
    expect(screen.getByText('Connecting to the monitor service…')).toBeInTheDocument()
  })

  it('renders the full dashboard with both panels', () => {
    connect()
    expect(screen.getByRole('region', { name: 'System RAM' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'GPU VRAM' })).toBeInTheDocument()
  })

  it('renders the compact view when the setting says so', () => {
    connect({ ...SETTINGS, viewMode: 'compact' })
    expect(screen.getByRole('complementary', { name: 'Compact view' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'System RAM' })).toBeNull()
  })

  it('sends view mode changes to the server', () => {
    const socket = connect()
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: 'updateSettings', patch: { viewMode: 'compact' } })
  })

  it('shows a critical banner when usage is over a threshold', () => {
    const socket = connect()
    act(() => socket.receive({ type: 'snapshot', snapshot: makeSnapshot({ tsMs: 6000, ramPct: 91 }) }))
    expect(screen.getByRole('status')).toHaveTextContent('System RAM at 91.0% (alert at 85%)')
  })

  it('freezes the display while paused', () => {
    const socket = connect()
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    act(() => socket.receive({ type: 'snapshot', snapshot: makeSnapshot({ tsMs: 6000, ramPct: 91 }) }))
    expect(screen.getByRole('region', { name: 'System RAM' })).toHaveTextContent('37.5%')
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(screen.getByRole('region', { name: 'System RAM' })).toHaveTextContent('91.0%')
  })

  it('turns server alerts into Windows notifications', () => {
    const notifications = new FakeNotifications('granted')
    const socket = connect(SETTINGS, notifications)
    const alert = { metric: 'ram', pct: 91, thresholdPct: 85, tsMs: 6000, message: 'System RAM is at 91% (alert at 85%)' }
    act(() => socket.receive({ type: 'alert', alert }))
    expect(notifications.shown).toEqual([{ title: 'Memory Monitor', body: alert.message, tag: 'memmon-ram' }])
  })

  it('resizes the desktop window to match the view mode', () => {
    const desktop = fakeDesktop()
    const socket = connect(SETTINGS, new FakeNotifications(), desktop)
    expect(desktop.setViewMode).toHaveBeenLastCalledWith('full')
    act(() => socket.receive({ type: 'settings', settings: { ...SETTINGS, viewMode: 'compact' } }))
    expect(desktop.setViewMode).toHaveBeenLastCalledWith('compact')
  })

  it('offers keep-on-top only in the desktop app', () => {
    connect({ ...SETTINGS, viewMode: 'compact' })
    expect(screen.queryByRole('button', { name: 'Keep on top' })).toBeNull()
  })

  it('pins the compact window on top in the desktop app', () => {
    const desktop = fakeDesktop()
    connect({ ...SETTINGS, viewMode: 'compact' }, new FakeNotifications(), desktop)
    const pin = screen.getByRole('button', { name: 'Keep on top' })
    expect(pin).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(pin)
    expect(desktop.setAlwaysOnTop).toHaveBeenLastCalledWith(true)
    expect(pin).toHaveAttribute('aria-pressed', 'true')
  })

  it('unpins when switching back to the full view', () => {
    const desktop = fakeDesktop()
    const socket = connect({ ...SETTINGS, viewMode: 'compact' }, new FakeNotifications(), desktop)
    fireEvent.click(screen.getByRole('button', { name: 'Keep on top' }))
    act(() => socket.receive({ type: 'settings', settings: { ...SETTINGS, viewMode: 'full' } }))
    expect(desktop.setAlwaysOnTop).toHaveBeenLastCalledWith(false)
  })

  it('explains what to check after repeated failed connections', () => {
    render(<App createSocket={createSocket} notifications={new FakeNotifications()} desktop={null} dev />)
    for (let i = 0; i < 3; i += 1) {
      act(() => vi.advanceTimersByTime(30_000))
      act(() => FakeSocket.latest().drop())
    }
    expect(screen.getByRole('region', { name: "Can't reach the monitor service" })).toHaveTextContent('uv run memmon --dev')
  })

  it('shows the same help when a live dashboard loses the backend', () => {
    const socket = connect()
    act(() => socket.drop())
    for (let i = 0; i < 3; i += 1) {
      act(() => vi.advanceTimersByTime(30_000))
      act(() => FakeSocket.latest().drop())
    }
    expect(screen.getByRole('region', { name: "Can't reach the monitor service" })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'System RAM' })).toBeInTheDocument()
  })

  it('tells the user when the connection drops', () => {
    const socket = connect()
    act(() => socket.drop())
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
  })
})
