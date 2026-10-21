import { describe, expect, it } from 'vitest'
import { usageLevel } from './levels'

describe('usageLevel', () => {
  it.each([
    [50, 85, 'good'],
    [74.9, 85, 'good'],
    [75, 85, 'warning'],
    [84.9, 85, 'warning'],
    [85, 85, 'critical'],
    [99, 85, 'critical'],
    [null, 85, 'unknown'],
  ] as const)('%s%% with alert at %i%% is %s', (pct, threshold, expected) => {
    expect(usageLevel(pct, threshold)).toBe(expected)
  })
})
