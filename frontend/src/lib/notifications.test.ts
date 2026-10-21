import { describe, expect, it, vi } from 'vitest'
import type { Alert } from '../api/protocol'
import { FakeNotifications } from '../test/fakeNotifications'
import { browserNotifications, notifyAlert } from './notifications'

const ALERT: Alert = { metric: 'vram', pct: 95, thresholdPct: 90, tsMs: 1, message: 'GPU VRAM is at 95% (alert at 90%)' }

describe('notifyAlert', () => {
  it('shows one notification per metric when permitted', () => {
    const api = new FakeNotifications('granted')
    notifyAlert(api, ALERT)
    expect(api.shown).toEqual([{ title: 'Memory Monitor', body: 'GPU VRAM is at 95% (alert at 90%)', tag: 'memmon-vram' }])
  })

  it.each(['default', 'denied', 'unsupported'] as const)('does nothing when permission is %s', (state) => {
    const api = new FakeNotifications(state)
    notifyAlert(api, ALERT)
    expect(api.shown).toEqual([])
  })
})

describe('browserNotifications', () => {
  it('reports unsupported when the browser has no Notification API', async () => {
    const api = browserNotifications(undefined)
    expect(api.permission()).toBe('unsupported')
    await expect(api.request()).resolves.toBe('unsupported')
    expect(() => api.show('t', { body: 'b', tag: 'x' })).not.toThrow()
  })

  it('wraps the Notification API', async () => {
    const created: unknown[] = []
    const Fake = Object.assign(
      function (this: unknown, title: string, options: NotificationOptions) {
        created.push({ title, ...options })
      },
      { permission: 'default' as NotificationPermission, requestPermission: vi.fn(async () => 'granted' as NotificationPermission) },
    ) as unknown as typeof Notification
    const api = browserNotifications(Fake)
    expect(api.permission()).toBe('default')
    await expect(api.request()).resolves.toBe('granted')
    api.show('Memory Monitor', { body: 'b', tag: 'memmon-ram' })
    expect(created).toEqual([{ title: 'Memory Monitor', body: 'b', tag: 'memmon-ram' }])
  })
})
