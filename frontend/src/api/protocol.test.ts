import { describe, expect, it } from 'vitest'
import { makeHistory, makeSnapshot, SETTINGS } from '../test/fixtures'
import { MAX_SERVER_MESSAGE_CHARS, parseServerMessage } from './protocol'

const json = (value: unknown) => JSON.stringify(value)

describe('parseServerMessage', () => {
  it('accepts a hello message', () => {
    const hello = { type: 'hello', settings: SETTINGS, history: makeHistory(2), snapshot: makeSnapshot() }
    expect(parseServerMessage(json(hello))).toEqual(hello)
  })

  it('accepts a hello before any snapshot exists', () => {
    const hello = { type: 'hello', settings: SETTINGS, history: [], snapshot: null }
    expect(parseServerMessage(json(hello))).toEqual(hello)
  })

  it('accepts snapshots with a failed source', () => {
    const snapshot = makeSnapshot({ gpu: null, vramPct: null, errors: ['gpu: timed out'] })
    expect(parseServerMessage(json({ type: 'snapshot', snapshot }))).toEqual({ type: 'snapshot', snapshot })
  })

  it('accepts settings, alert and error messages', () => {
    const alert = { metric: 'vram', pct: 95, thresholdPct: 90, tsMs: 5, message: 'GPU VRAM is at 95% (alert at 90%)' }
    expect(parseServerMessage(json({ type: 'settings', settings: SETTINGS }))?.type).toBe('settings')
    expect(parseServerMessage(json({ type: 'alert', alert }))).toEqual({ type: 'alert', alert })
    expect(parseServerMessage(json({ type: 'error', message: 'nope' }))).toEqual({ type: 'error', message: 'nope' })
  })

  it.each([
    ['not json', 'not json'],
    ['an array', '[]'],
    ['an unknown type', json({ type: 'eval', code: 'alert(1)' })],
    ['a snapshot with a string percentage', json({ type: 'snapshot', snapshot: makeSnapshot({ ramPct: '37' as unknown as number }) })],
    ['a snapshot missing host', json({ type: 'snapshot', snapshot: { ...makeSnapshot(), host: undefined } })],
    ['non-finite numbers', json({ type: 'snapshot', snapshot: makeSnapshot({ tsMs: 'Infinity' as unknown as number }) })],
    ['a process without a name', json({ type: 'snapshot', snapshot: makeSnapshot({ host: { ...makeSnapshot().host!, topRam: [{ bytes: 1, count: 1 }] } as never }) })],
    ['an unknown view mode', json({ type: 'settings', settings: { ...SETTINGS, viewMode: 'both' } })],
    ['an alert for an unknown metric', json({ type: 'alert', alert: { metric: 'disk', pct: 1, thresholdPct: 1, tsMs: 1, message: '' } })],
  ])('rejects %s', (_label, raw) => {
    expect(parseServerMessage(raw)).toBeNull()
  })

  it('rejects oversized messages without parsing them', () => {
    expect(parseServerMessage(' '.repeat(MAX_SERVER_MESSAGE_CHARS + 1))).toBeNull()
  })
})
