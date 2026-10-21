import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeHistory, makeSnapshot, SETTINGS } from '../test/fixtures'
import { MetricPanel } from './MetricPanel'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function renderPanel(metric: 'ram' | 'vram', snapshot = makeSnapshot(), onThresholdChange = vi.fn()) {
  render(
    <MetricPanel metric={metric} snapshot={snapshot} history={makeHistory(5)} settings={SETTINGS} onThresholdChange={onThresholdChange} />,
  )
  return onThresholdChange
}

describe('MetricPanel', () => {
  it('shows system RAM usage', () => {
    renderPanel('ram')
    const panel = screen.getByRole('region', { name: 'System RAM' })
    expect(panel).toHaveTextContent('Windows host · 64 GB installed')
    expect(panel).toHaveTextContent('24.0')
    expect(panel).toHaveTextContent('/ 64.0 GB')
    expect(panel).toHaveTextContent('37.5%')
    expect(panel).toHaveTextContent('Available40.0 GB')
    expect(panel).toHaveTextContent('Normal')
    expect(screen.getByRole('list', { name: 'Top processes by RAM' })).toHaveTextContent('chrome')
  })

  it('shows GPU VRAM with utilization, temperature and power', () => {
    renderPanel('vram')
    const panel = screen.getByRole('region', { name: 'GPU VRAM' })
    expect(panel).toHaveTextContent('NVIDIA GeForce RTX 5090')
    expect(panel).toHaveTextContent('8.0')
    expect(panel).toHaveTextContent('GPU util12%')
    expect(panel).toHaveTextContent('Temperature41 °C')
    expect(panel).toHaveTextContent('Power97 W')
    expect(screen.getByRole('list', { name: 'Top processes by VRAM' })).toHaveTextContent('python')
  })

  it('flags usage over the threshold', () => {
    renderPanel('ram', makeSnapshot({ ramPct: 90 }))
    expect(screen.getByRole('region', { name: 'System RAM' })).toHaveTextContent('Over threshold')
  })

  it('explains when a source is unavailable', () => {
    renderPanel('vram', makeSnapshot({ gpu: null, vramPct: null, errors: ['gpu: nvidia-smi timed out'] }))
    expect(screen.getByRole('region', { name: 'GPU VRAM' })).toHaveTextContent('Unavailable: nvidia-smi timed out')
  })

  it('sends a threshold change once the slider settles', () => {
    const onChange = renderPanel('ram')
    const slider = screen.getByRole('slider', { name: 'Alert threshold' })
    fireEvent.change(slider, { target: { value: '70' } })
    fireEvent.change(slider, { target: { value: '72' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('72%')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(300))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(72)
  })
})
