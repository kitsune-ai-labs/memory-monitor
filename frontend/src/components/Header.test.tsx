import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SETTINGS } from '../test/fixtures'
import { Header } from './Header'

function renderHeader(overrides: Partial<Parameters<typeof Header>[0]> = {}) {
  const props = { status: 'open' as const, settings: SETTINGS, paused: false, onPauseToggle: vi.fn(), onUpdate: vi.fn(), ...overrides }
  render(<Header {...props} />)
  return props
}

describe('Header', () => {
  it('shows the live status with the refresh interval', () => {
    renderHeader()
    expect(screen.getByRole('heading', { level: 1, name: 'Memory Monitor' })).toBeInTheDocument()
    expect(screen.getByText('Live · every 1 s')).toBeInTheDocument()
  })

  it.each([
    ['closed', false, 'Reconnecting…'],
    ['connecting', false, 'Connecting…'],
    ['open', true, 'Paused'],
  ] as const)('shows %s (paused %s) as "%s"', (status, paused, text) => {
    renderHeader({ status, paused })
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('switches to compact mode', () => {
    const { onUpdate } = renderHeader()
    expect(screen.getByRole('button', { name: 'Full' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    expect(onUpdate).toHaveBeenCalledWith({ viewMode: 'compact' })
  })

  it('changes the history range', () => {
    const { onUpdate } = renderHeader()
    fireEvent.click(screen.getByRole('button', { name: '5m' }))
    expect(onUpdate).toHaveBeenCalledWith({ rangeS: 300 })
  })

  it('changes the refresh interval', () => {
    const { onUpdate } = renderHeader()
    fireEvent.change(screen.getByRole('combobox', { name: 'Refresh' }), { target: { value: '250' } })
    expect(onUpdate).toHaveBeenCalledWith({ intervalMs: 250 })
  })

  it('toggles pause', () => {
    const { onPauseToggle } = renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(onPauseToggle).toHaveBeenCalledOnce()
  })
})
