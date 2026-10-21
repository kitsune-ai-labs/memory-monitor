import { describe, expect, it } from 'vitest'
import { formatAgo, formatBytes, formatGiB, formatInterval } from './format'

const GIB = 1024 ** 3

describe('formatGiB', () => {
  it('shows one decimal', () => {
    expect(formatGiB(24 * GIB)).toBe('24.0')
    expect(formatGiB(1.25 * GIB)).toBe('1.3')
  })
})

describe('formatBytes', () => {
  it('uses GB at or above one GiB and MB below', () => {
    expect(formatBytes(3 * GIB)).toBe('3.0 GB')
    expect(formatBytes(512 * 1024 ** 2)).toBe('512 MB')
    expect(formatBytes(0)).toBe('0 MB')
  })
})

describe('formatAgo', () => {
  it.each([
    [0, 'now'],
    [400, 'now'],
    [12_000, '12s ago'],
    [59_400, '59s ago'],
    [75_000, '1m 15s ago'],
    [600_000, '10m 0s ago'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatAgo(ms)).toBe(expected)
  })
})

describe('formatInterval', () => {
  it('uses ms below a second', () => {
    expect(formatInterval(250)).toBe('250 ms')
    expect(formatInterval(1000)).toBe('1 s')
    expect(formatInterval(5000)).toBe('5 s')
  })
})
