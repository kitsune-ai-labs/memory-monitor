import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { BackendError, BackendSupervisor, backendCommand, type ChildLike } from './backend'
import type { AppConfig } from './config'

const CONFIG: AppConfig = {
  distro: 'Ubuntu-24.04',
  backendDir: '/home/ck/Dev/memory-monitor/backend',
  uvPath: '/home/ck/.local/bin/uv',
  port: 8765,
}

class FakeChild extends EventEmitter implements ChildLike {
  stdin = new PassThrough()
  exitCode: number | null = null
  killed = false
  constructor(private readonly exitOnStdinClose = true) {
    super()
    this.stdin.on('finish', () => {
      if (this.exitOnStdinClose) this.exit(0)
    })
  }
  kill() {
    this.killed = true
    this.exit(1)
    return true
  }
  exit(code: number) {
    if (this.exitCode !== null) return
    this.exitCode = code
    this.emit('exit', code)
  }
}

function healthAfter(failures: number) {
  let calls = 0
  return vi.fn(async () => {
    calls += 1
    if (calls <= failures) throw new Error('ECONNREFUSED')
    return { ok: true, json: async () => ({ status: 'ok' }) }
  })
}

const noSleep = async () => undefined

describe('backendCommand', () => {
  it('starts memmon in the configured distro with a fixed argument list', () => {
    expect(backendCommand(CONFIG)).toEqual({
      file: 'wsl.exe',
      args: [
        '--distribution',
        'Ubuntu-24.04',
        '--cd',
        '/home/ck/Dev/memory-monitor/backend',
        '--exec',
        '/home/ck/.local/bin/uv',
        'run',
        '--frozen',
        'memmon',
        '--port',
        '8765',
        '--exit-on-eof',
      ],
    })
  })
})

describe('BackendSupervisor', () => {
  it('refuses to start if something already answers on the port', async () => {
    const spawn = vi.fn()
    const supervisor = new BackendSupervisor(CONFIG, { spawn, fetch: healthAfter(0), sleep: noSleep })
    await expect(supervisor.start()).rejects.toThrow(/already in use/)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('spawns the backend without a shell and waits until it is healthy', async () => {
    const child = new FakeChild()
    const spawn = vi.fn(() => child)
    const fetch = healthAfter(4)
    const supervisor = new BackendSupervisor(CONFIG, { spawn, fetch, sleep: noSleep })
    await supervisor.start()
    expect(spawn).toHaveBeenCalledWith('wsl.exe', backendCommand(CONFIG).args, {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    })
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8765/api/health', expect.anything())
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it('fails if the backend exits during startup', async () => {
    const child = new FakeChild()
    const fetch = vi.fn(async () => {
      child.exit(2)
      throw new Error('ECONNREFUSED')
    })
    const supervisor = new BackendSupervisor(CONFIG, { spawn: () => child, fetch, sleep: noSleep })
    await expect(supervisor.start()).rejects.toThrow(/exited during startup \(code 2\)/)
  })

  it('gives up after the startup timeout and stops the process', async () => {
    const child = new FakeChild()
    const fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    const supervisor = new BackendSupervisor(CONFIG, { spawn: () => child, fetch, sleep: noSleep, startupAttempts: 3 })
    await expect(supervisor.start()).rejects.toBeInstanceOf(BackendError)
    expect(child.exitCode).not.toBeNull()
  })

  it('treats an unhealthy response as not ready', async () => {
    const child = new FakeChild()
    let calls = 0
    const fetch = vi.fn(async () => {
      calls += 1
      if (calls === 1) throw new Error('ECONNREFUSED')
      if (calls === 2) return { ok: true, json: async () => ({ status: 'starting' }) }
      return { ok: true, json: async () => ({ status: 'ok' }) }
    })
    await new BackendSupervisor(CONFIG, { spawn: () => child, fetch, sleep: noSleep }).start()
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('stops by closing stdin', async () => {
    const child = new FakeChild()
    const supervisor = new BackendSupervisor(CONFIG, { spawn: () => child, fetch: healthAfter(1), sleep: noSleep })
    await supervisor.start()
    await supervisor.stop()
    expect(child.exitCode).toBe(0)
    expect(child.killed).toBe(false)
  })

  it('kills the process if it ignores stdin closing', async () => {
    const child = new FakeChild(false)
    const supervisor = new BackendSupervisor(CONFIG, {
      spawn: () => child,
      fetch: healthAfter(1),
      sleep: noSleep,
      stopTimeoutMs: 10,
    })
    await supervisor.start()
    await supervisor.stop()
    expect(child.killed).toBe(true)
  })

  it('stop is harmless before start or twice', async () => {
    const child = new FakeChild()
    const supervisor = new BackendSupervisor(CONFIG, { spawn: () => child, fetch: healthAfter(1), sleep: noSleep })
    await supervisor.stop()
    await supervisor.start()
    await supervisor.stop()
    await supervisor.stop()
    expect(child.exitCode).toBe(0)
  })
})
