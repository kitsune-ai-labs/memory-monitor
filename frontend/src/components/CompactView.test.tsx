import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeHistory, makeSnapshot, SETTINGS } from '../test/fixtures'
import { CompactView } from './CompactView'

function renderCompact(snapshot = makeSnapshot()) {
  const props = {
    status: 'open' as const,
    snapshot,
    history: makeHistory(5),
    settings: { ...SETTINGS, viewMode: 'compact' as const },
    paused: false,
    onPauseToggle: vi.fn(),
    onUpdate: vi.fn(),
  }
  render(<CompactView {...props} />)
  return props
}

describe('CompactView', () => {
  it('shows both usage tiles', () => {
    renderCompact()
    expect(screen.getByRole('group', { name: 'RAM' })).toHaveTextContent('38%')
    expect(screen.getByRole('group', { name: 'RAM' })).toHaveTextContent('24.0 / 64.0 GB')
    expect(screen.getByRole('group', { name: 'VRAM' })).toHaveTextContent('25%')
  })

  it('shows GPU readouts', () => {
    renderCompact()
    expect(screen.getByText('GPU util').parentElement).toHaveTextContent('12%')
    expect(screen.getByText('GPU temp').parentElement).toHaveTextContent('41°C')
  })

  it('switches the process list between RAM and VRAM', () => {
    renderCompact()
    expect(screen.getByRole('tab', { name: 'Top by RAM' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('chrome')
    fireEvent.click(screen.getByRole('tab', { name: 'Top by VRAM' }))
    expect(screen.getByRole('tab', { name: 'Top by VRAM' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('python')
  })

  it('switches back to the full view', () => {
    const { onUpdate } = renderCompact()
    fireEvent.click(screen.getByRole('button', { name: 'Full dashboard' }))
    expect(onUpdate).toHaveBeenCalledWith({ viewMode: 'full' })
  })

  it('marks a metric over its threshold', () => {
    renderCompact(makeSnapshot({ vramPct: 95 }))
    expect(screen.getByRole('group', { name: 'VRAM' })).toHaveTextContent('Over 90%')
  })
})
