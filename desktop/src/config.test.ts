import { describe, expect, it } from 'vitest'
import { ConfigError, parseConfig, parseUserSettings } from './config'

const VALID = { port: 8765, backend: { archive: 'backend.tar.gz', sha256: 'ab'.repeat(32) } }

describe('parseConfig', () => {
  it('accepts a valid config with nothing machine-specific in it', () => {
    expect(parseConfig(VALID)).toEqual(VALID)
  })

  it.each([
    ['not an object', 'x'],
    ['extra fields', { ...VALID, distro: 'Ubuntu' }],
    ['a privileged port', { ...VALID, port: 80 }],
    ['a string port', { ...VALID, port: '8765' }],
    ['an archive path', { ...VALID, backend: { ...VALID.backend, archive: '..\\..\\evil.tar.gz' } }],
    ['a short hash', { ...VALID, backend: { ...VALID.backend, sha256: 'abc' } }],
    ['an uppercase hash', { ...VALID, backend: { ...VALID.backend, sha256: 'AB'.repeat(32) } }],
    ['extra backend fields', { ...VALID, backend: { ...VALID.backend, url: 'http://x' } }],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseConfig(raw)).toThrow(ConfigError)
  })
})

describe('parseUserSettings', () => {
  it('is optional', () => {
    expect(parseUserSettings({})).toEqual({})
  })

  it('accepts a distro and port override', () => {
    expect(parseUserSettings({ distro: 'Debian', port: 8770 })).toEqual({ distro: 'Debian', port: 8770 })
  })

  it.each([
    [{ distro: 'Ubuntu; calc' }],
    [{ distro: '' }],
    [{ port: 22 }],
    [{ shell: 'cmd' }],
    [[]],
  ])('rejects %j', (raw) => {
    expect(() => parseUserSettings(raw)).toThrow(ConfigError)
  })
})
