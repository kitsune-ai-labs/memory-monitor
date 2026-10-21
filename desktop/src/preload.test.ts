import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHANNELS } from './ipc'

const source = readFileSync(path.join(__dirname, 'preload.ts'), 'utf8')

describe('preload', () => {
  it('imports nothing but electron (sandboxed preloads cannot load local modules)', () => {
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    expect(imports).toEqual(['electron'])
  })

  it('uses the same channel names as the main process', () => {
    for (const channel of Object.values(CHANNELS)) expect(source).toContain(`'${channel}'`)
  })

  it('exposes only the two window controls', () => {
    expect(source).toMatch(/exposeInMainWorld\('memmonDesktop'/)
    expect([...source.matchAll(/ipcRenderer\.(\w+)/g)].map((m) => m[1])).toEqual(['invoke', 'invoke'])
  })
})
