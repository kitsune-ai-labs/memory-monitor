import { describe, expect, it } from 'vitest'
import { chooseDistro, decodeWslOutput, parseDistroList, WslError } from './wsl'

const LIST = `  NAME              STATE           VERSION
* Ubuntu-24.04      Running         2
  docker-desktop    Stopped         2
  Legacy            Stopped         1
  Debian            Stopped         2
`

describe('decodeWslOutput', () => {
  it('reads UTF-16LE output (wsl.exe default) including a BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('* Ubuntu\r\n', 'utf16le')])
    expect(decodeWslOutput(buf)).toBe('* Ubuntu\n')
  })

  it('reads UTF-8 output (WSL_UTF8=1)', () => {
    expect(decodeWslOutput(Buffer.from('* Ubuntu\r\n', 'utf8'))).toBe('* Ubuntu\n')
  })
})

describe('parseDistroList', () => {
  it('parses names, versions and the default marker', () => {
    expect(parseDistroList(LIST)).toEqual([
      { name: 'Ubuntu-24.04', isDefault: true, version: 2 },
      { name: 'docker-desktop', isDefault: false, version: 2 },
      { name: 'Legacy', isDefault: false, version: 1 },
      { name: 'Debian', isDefault: false, version: 2 },
    ])
  })

  it('skips lines that are not valid distro rows', () => {
    expect(parseDistroList('  NAME STATE VERSION\n* bad;name Running 2\n  ok Stopped 2\n')).toEqual([
      { name: 'ok', isDefault: false, version: 2 },
    ])
  })
})

describe('chooseDistro', () => {
  const distros = parseDistroList(LIST)

  it('uses the default WSL 2 distro', () => {
    expect(chooseDistro(distros)).toBe('Ubuntu-24.04')
  })

  it('honours a preferred distro when it exists and is WSL 2', () => {
    expect(chooseDistro(distros, 'Debian')).toBe('Debian')
  })

  it('rejects a preferred distro that is missing or WSL 1', () => {
    expect(() => chooseDistro(distros, 'Fedora')).toThrow(/not installed/)
    expect(() => chooseDistro(distros, 'Legacy')).toThrow(/WSL 2/)
  })

  it('skips a WSL 1 or Docker default for the first real WSL 2 distro', () => {
    const list = parseDistroList('* Legacy Stopped 1\n  docker-desktop Running 2\n  Debian Stopped 2\n')
    expect(chooseDistro(list)).toBe('Debian')
  })

  it('explains how to install WSL when there is nothing usable', () => {
    expect(() => chooseDistro(parseDistroList('* docker-desktop Running 2\n'))).toThrow(WslError)
    expect(() => chooseDistro([])).toThrow(/wsl --install/)
  })
})
