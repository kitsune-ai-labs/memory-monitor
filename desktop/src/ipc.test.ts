import { describe, expect, it } from 'vitest'
import { parseAlwaysOnTop, parseViewMode } from './ipc'

describe('parseViewMode', () => {
  it('accepts the two modes', () => {
    expect(parseViewMode('full')).toBe('full')
    expect(parseViewMode('compact')).toBe('compact')
  })

  it.each(['both', '', null, undefined, 1, { mode: 'full' }])('rejects %j', (value) => {
    expect(parseViewMode(value)).toBeNull()
  })
})

describe('parseAlwaysOnTop', () => {
  it('accepts booleans only', () => {
    expect(parseAlwaysOnTop(true)).toBe(true)
    expect(parseAlwaysOnTop(false)).toBe(false)
    expect(parseAlwaysOnTop('true')).toBeNull()
    expect(parseAlwaysOnTop(1)).toBeNull()
  })
})
