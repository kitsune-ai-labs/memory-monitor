import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { FakeSocket } from './test/fakeSocket'
import { makeHistory, makeSnapshot, SETTINGS } from './test/fixtures'

const createSocket = (url: string) => new FakeSocket(url)

function connect(settings = SETTINGS) {
  render(<App createSocket={createSocket} />)
  const socket = FakeSocket.latest()
  act(() => {
    socket.open()
    socket.receive({ type: 'hello', settings, history: makeHistory(3), snapshot: makeSnapshot({ tsMs: 5000 }) })
  })
  return socket
}

beforeEach(() => {
  FakeSocket.instances = []
})

describe('App', () => {
  it('shows a loading state until the server says hello', () => {
    render(<App createSocket={createSocket} />)
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

  it('tells the user when the connection drops', () => {
    const socket = connect()
    act(() => socket.drop())
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
  })
})
