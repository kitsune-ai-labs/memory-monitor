import { describe, expect, it } from 'vitest'
import { backendPort } from './devProxy'

describe('backendPort', () => {
  it('defaults to 8765', () => {
    expect(backendPort({})).toBe(8765)
  })

  it('follows MEMMON_PORT so the dev UI can run next to the desktop app', () => {
    expect(backendPort({ MEMMON_PORT: '8766' })).toBe(8766)
  })

  it.each(['80', '70000', 'abc', '8765.5', ''])('rejects MEMMON_PORT=%j', (value) => {
    expect(() => backendPort({ MEMMON_PORT: value })).toThrow(/MEMMON_PORT/)
  })
})
