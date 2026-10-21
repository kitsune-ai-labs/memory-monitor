import { describe, expect, it } from 'vitest'
import { ConfigError, parseConfig } from './config'

const VALID = {
  distro: 'Ubuntu-24.04',
  backendDir: '/home/ck/Dev/memory-monitor/backend',
  uvPath: '/home/ck/.local/bin/uv',
  port: 8765,
}

describe('parseConfig', () => {
  it('accepts a valid config', () => {
    expect(parseConfig(VALID)).toEqual(VALID)
  })

  it.each([
    ['not an object', 'x'],
    ['missing fields', { distro: 'Ubuntu' }],
    ['extra fields', { ...VALID, shell: true }],
    ['a distro with spaces', { ...VALID, distro: 'Ubuntu 24' }],
    ['a distro with quotes', { ...VALID, distro: 'Ubuntu";calc' }],
    ['a relative backend dir', { ...VALID, backendDir: 'Dev/memory-monitor' }],
    ['a backend dir with ..', { ...VALID, backendDir: '/home/ck/../../etc' }],
    ['a backend dir with spaces', { ...VALID, backendDir: '/home/ck/My Dev' }],
    ['a uv path with shell characters', { ...VALID, uvPath: '/home/ck/uv;rm -rf ~' }],
    ['a privileged port', { ...VALID, port: 80 }],
    ['a fractional port', { ...VALID, port: 8765.5 }],
    ['a string port', { ...VALID, port: '8765' }],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseConfig(raw)).toThrow(ConfigError)
  })
})
