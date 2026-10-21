import { appOrigin } from './security'

/** Where and how to run the installed backend. */
export interface LaunchSpec {
  distro: string
  installDir: string
  port: number
}

/** The subset of ChildProcess the supervisor uses; injectable for tests. */
export interface ChildLike {
  stdin: NodeJS.WritableStream | null
  exitCode: number | null
  kill(): boolean
  once(event: 'exit', listener: (code: number | null) => void): unknown
}

export interface SpawnOptions {
  shell: false
  windowsHide: true
  stdio: ['pipe', 'ignore', 'ignore']
}

interface HealthResponse {
  ok: boolean
  json(): Promise<unknown>
}

export interface SupervisorDeps {
  spawn: (file: string, args: string[], options: SpawnOptions) => ChildLike
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<HealthResponse>
  sleep: (ms: number) => Promise<void>
  startupAttempts?: number
  pollIntervalMs?: number
  stopTimeoutMs?: number
}

export class BackendError extends Error {}

/**
 * The backend command: wsl.exe runs the bundled Python directly (--exec, so no Linux shell parses
 * anything) in isolated mode (-I: no user site-packages, PYTHON* variables ignored).
 */
export function backendCommand(spec: LaunchSpec): { file: string; args: string[] } {
  const dir = spec.installDir
  return {
    file: 'wsl.exe',
    args: [
      '--distribution',
      spec.distro,
      '--cd',
      dir,
      '--exec',
      `${dir}/python/bin/python3`,
      '-I',
      '-m',
      'memmon',
      '--port',
      String(spec.port),
      '--static-dir',
      `${dir}/ui`,
      '--exit-on-eof',
    ],
  }
}

/** Starts the backend, waits for it to become healthy, and stops it by closing stdin. */
export class BackendSupervisor {
  private child: ChildLike | null = null
  private readonly healthUrl: string

  constructor(
    private readonly config: LaunchSpec,
    private readonly deps: SupervisorDeps,
  ) {
    this.healthUrl = `${appOrigin(config.port)}/api/health`
  }

  private async healthy(): Promise<boolean> {
    try {
      const response = await this.deps.fetch(this.healthUrl, { signal: AbortSignal.timeout(1000) })
      if (!response.ok) return false
      const body = await response.json()
      return typeof body === 'object' && body !== null && (body as { status?: unknown }).status === 'ok'
    } catch {
      return false
    }
  }

  async start(): Promise<void> {
    // Never attach to a server we did not start: it could be anything listening on the port.
    if (await this.healthy()) {
      throw new BackendError(
        `port ${this.config.port} is already in use (another Memory Monitor, or a backend started with uv run memmon); stop it first`,
      )
    }
    const { file, args } = backendCommand(this.config)
    const child = this.deps.spawn(file, args, { shell: false, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] })
    this.child = child

    const attempts = this.deps.startupAttempts ?? 60
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (await this.healthy()) return
      if (child.exitCode !== null) {
        this.child = null
        throw new BackendError(`the backend exited during startup (code ${child.exitCode})`)
      }
      await this.deps.sleep(this.deps.pollIntervalMs ?? 500)
    }
    await this.stop()
    throw new BackendError('the backend did not become ready in time')
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = null
    if (!child || child.exitCode !== null) return
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    child.stdin?.end()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.deps.stopTimeoutMs ?? 5000)
    })
    const outcome = await Promise.race([exited, timeout])
    clearTimeout(timer)
    if (outcome === 'timeout') {
      child.kill()
      await exited
    }
  }
}
