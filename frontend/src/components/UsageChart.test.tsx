import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UsageChart } from './UsageChart'

const series = [
  { key: 'ram', label: 'RAM', color: 'var(--ram)', values: [10, 20, 30, 40, 50] },
  { key: 'vram', label: 'VRAM', color: 'var(--vram)', values: [5, null, 15, 20, 25] },
]
const tsMs = [0, 1000, 2000, 3000, 4000]

function renderChart(thresholdPct?: number) {
  return render(<UsageChart series={series} tsMs={tsMs} thresholdPct={thresholdPct} height={160} label="Usage history" />)
}

describe('UsageChart', () => {
  it('is an image with a description of the latest values', () => {
    renderChart()
    expect(screen.getByRole('img', { name: 'Usage history. Latest: RAM 50%, VRAM 25%' })).toBeInTheDocument()
  })

  it('draws one line per series', () => {
    const { container } = renderChart()
    expect(container.querySelectorAll('polyline')).toHaveLength(2)
  })

  it('draws the alert threshold only when given', () => {
    const { container, rerender } = renderChart(85)
    expect(container.querySelector('[data-testid="threshold"]')).not.toBeNull()
    rerender(<UsageChart series={series} tsMs={tsMs} height={160} label="Usage history" />)
    expect(container.querySelector('[data-testid="threshold"]')).toBeNull()
  })

  it('shows a tooltip for the hovered point and hides it on leave', () => {
    renderChart()
    const surface = screen.getByTestId('chart-surface')
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 400 } as DOMRect)
    fireEvent.mouseMove(surface, { clientX: 100 })
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('3s ago')
    expect(tooltip).toHaveTextContent('RAM 20.0%')
    expect(tooltip).toHaveTextContent('VRAM —')
    fireEvent.mouseLeave(surface)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('renders an empty state without data', () => {
    render(<UsageChart series={[]} tsMs={[]} height={160} label="Usage history" />)
    expect(screen.getByRole('img', { name: 'Usage history. No data yet' })).toBeInTheDocument()
  })
})
