import { describe, expect, it } from 'vitest'
import { InstallError, installBackend, type WslRunner } from './installer'

const SHA = 'a'.repeat(64)
const ID = 'a'.repeat(16)
const HOME = '/home/someone'
const BASE = `${HOME}/.local/share/memory-monitor`
const DIR = `${BASE}/backend-${ID}`

type Script = (args: string[]) => { code: number; stdout?: string } | undefined

function fakeRunner(script: Script = () => undefined) {
  const calls: string[][] = []
  const runner: WslRunner = {
    async run(args) {
      calls.push(args)
      const exec = args.slice(args.indexOf('--exec') + 1)
      const custom = script(exec)
      if (custom) return { code: custom.code, stdout: custom.stdout ?? '' }
      if (exec[0] === 'pwd') return { code: 0, stdout: `${HOME}\n` }
      if (exec[0] === 'test') return { code: 1, stdout: '' }
      if (exec[0] === 'wslpath') return { code: 0, stdout: '/mnt/c/Program Files/MemoryMonitor/resources/backend.tar.gz\n' }
      if (exec[0] === 'ls') return { code: 0, stdout: `backend-${'b'.repeat(16)}\nbackend-${ID}\nnotes.txt\n` }
      return { code: 0, stdout: '' }
    },
  }
  return { runner, calls, execs: () => calls.map((c) => c.slice(c.indexOf('--exec') + 1)) }
}

const bundle = { archivePath: 'C:\\Program Files\\MemoryMonitor\\resources\\backend.tar.gz', sha256: SHA }
const goodHash = async () => SHA

describe('installBackend', () => {
  it('runs every command in the chosen distro without a shell', async () => {
    const { runner, calls } = fakeRunner()
    await installBackend('Debian', bundle, runner, goodHash)
    for (const args of calls) {
      expect(args.slice(0, 2)).toEqual(['--distribution', 'Debian'])
      expect(args).toContain('--exec')
      expect(args).not.toContain('sh')
      expect(args).not.toContain('bash')
    }
  })

  it('extracts the verified archive into a versioned directory atomically', async () => {
    const { runner, execs } = fakeRunner()
    const installed = await installBackend('Debian', bundle, runner, goodHash)
    expect(installed).toEqual({ installDir: DIR, python: `${DIR}/python/bin/python3`, staticDir: `${DIR}/ui` })
    expect(execs()).toEqual([
      ['pwd'],
      ['test', '-x', `${DIR}/python/bin/python3`],
      ['wslpath', '-u', bundle.archivePath],
      ['rm', '-rf', '--', `${DIR}.partial`, DIR],
      ['mkdir', '-p', '--', `${DIR}.partial`],
      ['tar', '-xzf', '/mnt/c/Program Files/MemoryMonitor/resources/backend.tar.gz', '--no-same-owner', '-C', `${DIR}.partial`],
      ['mv', '-T', '--', `${DIR}.partial`, DIR],
      ['ls', '-1', '--', BASE],
      ['rm', '-rf', '--', `${BASE}/backend-${'b'.repeat(16)}`],
    ])
  })

  it('skips extraction when this version is already installed', async () => {
    const { runner, execs } = fakeRunner((exec) => (exec[0] === 'test' ? { code: 0 } : undefined))
    let hashed = false
    await installBackend('Debian', bundle, runner, async () => {
      hashed = true
      return SHA
    })
    expect(execs()).toEqual([['pwd'], ['test', '-x', `${DIR}/python/bin/python3`]])
    expect(hashed).toBe(false)
  })

  it('refuses an archive that fails its integrity check', async () => {
    const { runner, execs } = fakeRunner()
    await expect(installBackend('Debian', bundle, runner, async () => 'f'.repeat(64))).rejects.toThrow(/integrity/)
    expect(execs().some((e) => e[0] === 'tar')).toBe(false)
  })

  it.each([['relative'], ['/home/../etc'], [''], ['/home/a\nb']])('rejects an unexpected home directory %j', async (home) => {
    const { runner } = fakeRunner((exec) => (exec[0] === 'pwd' ? { code: 0, stdout: home } : undefined))
    await expect(installBackend('Debian', bundle, runner, goodHash)).rejects.toThrow(InstallError)
  })

  it('reports which step failed', async () => {
    const { runner } = fakeRunner((exec) => (exec[0] === 'tar' ? { code: 2 } : undefined))
    await expect(installBackend('Debian', bundle, runner, goodHash)).rejects.toThrow(/unpack.*exit code 2/)
  })

  it('does not fail when old versions cannot be listed', async () => {
    const { runner } = fakeRunner((exec) => (exec[0] === 'ls' ? { code: 2 } : undefined))
    await expect(installBackend('Debian', bundle, runner, goodHash)).resolves.toMatchObject({ installDir: DIR })
  })
})
