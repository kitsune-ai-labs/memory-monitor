import { describe, expect, it, vi } from 'vitest'
import { getDesktopBridge } from './desktop'

describe('getDesktopBridge', () => {
  it('returns the bridge exposed by the desktop app', () => {
    const bridge = { setViewMode: vi.fn(), setAlwaysOnTop: vi.fn() }
    expect(getDesktopBridge({ memmonDesktop: bridge })).toBe(bridge)
  })

  it.each([
    ['a plain browser', {}],
    ['a malformed bridge', { memmonDesktop: { setViewMode: 'x' } }],
    ['a null bridge', { memmonDesktop: null }],
  ])('returns null in %s', (_label, host) => {
    expect(getDesktopBridge(host)).toBeNull()
  })
})
