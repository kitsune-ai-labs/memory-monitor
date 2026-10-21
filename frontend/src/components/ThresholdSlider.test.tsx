import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThresholdSlider } from './ThresholdSlider'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('ThresholdSlider', () => {
  it('commits even when the parent re-renders with a new callback mid-debounce', () => {
    const commits: number[] = []
    const { rerender } = render(<ThresholdSlider value={85} onCommit={(v) => commits.push(v)} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Alert threshold' }), { target: { value: '70' } })
    for (let i = 0; i < 4; i += 1) {
      act(() => vi.advanceTimersByTime(250))
      rerender(<ThresholdSlider value={85} onCommit={(v) => commits.push(v)} />)
    }
    expect(commits).toEqual([70])
  })

  it('shows the confirmed value once the server applies it', () => {
    const { rerender } = render(<ThresholdSlider value={85} onCommit={() => undefined} />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '70' } })
    rerender(<ThresholdSlider value={75} onCommit={() => undefined} />)
    expect(screen.getByRole('slider')).toHaveValue('75')
  })
})
