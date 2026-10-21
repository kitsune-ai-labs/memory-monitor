import { describe, expect, it } from 'vitest'
import { downsample, hoverIndex, polylinePoints, windowed } from './chart'

describe('windowed', () => {
  it('keeps points within the range ending at the newest point', () => {
    const points = [0, 30_000, 60_000, 90_000].map((tsMs) => ({ tsMs, ramPct: 1, vramPct: 1 }))
    expect(windowed(points, 60).map((p) => p.tsMs)).toEqual([30_000, 60_000, 90_000])
  })

  it('handles an empty list', () => {
    expect(windowed([], 60)).toEqual([])
  })
})

describe('downsample', () => {
  it('returns short lists unchanged', () => {
    expect(downsample([1, 2, 3], 10)).toEqual([1, 2, 3])
  })

  it('keeps the newest value and never exceeds the limit', () => {
    const values = Array.from({ length: 1000 }, (_, i) => i)
    const result = downsample(values, 120)
    expect(result.length).toBeLessThanOrEqual(120)
    expect(result.at(-1)).toBe(999)
  })
})

describe('polylinePoints', () => {
  it('maps 0-100% onto the box with 100% at the top', () => {
    expect(polylinePoints([0, 50, 100], 200, 100)).toBe('0.0,100.0 100.0,50.0 200.0,0.0')
  })

  it('skips missing readings', () => {
    expect(polylinePoints([0, null, 100], 200, 100)).toBe('0.0,100.0 200.0,0.0')
  })

  it('clamps out-of-range values', () => {
    expect(polylinePoints([-5, 150], 100, 100)).toBe('0.0,100.0 100.0,0.0')
  })

  it('draws a single reading as a flat line', () => {
    expect(polylinePoints([25], 100, 100)).toBe('0.0,75.0 100.0,75.0')
  })

  it('returns nothing for no readings', () => {
    expect(polylinePoints([], 100, 100)).toBe('')
  })
})

describe('hoverIndex', () => {
  it('maps a horizontal position to the nearest point', () => {
    expect(hoverIndex(0, 100, 5)).toBe(0)
    expect(hoverIndex(49, 100, 5)).toBe(2)
    expect(hoverIndex(100, 100, 5)).toBe(4)
    expect(hoverIndex(150, 100, 5)).toBe(4)
    expect(hoverIndex(-10, 100, 5)).toBe(0)
  })

  it('returns null without points or width', () => {
    expect(hoverIndex(10, 100, 0)).toBeNull()
    expect(hoverIndex(10, 0, 5)).toBeNull()
  })
})
