/**
 * Where the backend lives. The file is generated at package time and shipped with the app;
 * it is still validated strictly, because its values end up on the wsl.exe command line.
 */
export interface AppConfig {
  distro: string
  backendDir: string
  uvPath: string
  port: number
}

export class ConfigError extends Error {}

const KEYS = ['distro', 'backendDir', 'uvPath', 'port'] as const
const DISTRO = /^[A-Za-z0-9._-]{1,64}$/
const POSIX_PATH = /^\/[A-Za-z0-9._/-]{1,255}$/

function absolutePath(value: unknown, field: string): string {
  if (typeof value !== 'string' || !POSIX_PATH.test(value) || value.split('/').includes('..')) {
    throw new ConfigError(`${field} must be an absolute path of letters, digits, . _ - and /`)
  }
  return value
}

export function parseConfig(raw: unknown): AppConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ConfigError('config must be an object')
  const record = raw as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.join() !== [...KEYS].sort().join()) throw new ConfigError(`config must have exactly: ${KEYS.join(', ')}`)
  if (typeof record.distro !== 'string' || !DISTRO.test(record.distro)) throw new ConfigError('invalid distro name')
  const port = record.port
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new ConfigError('port must be an integer between 1024 and 65535')
  }
  return {
    distro: record.distro,
    backendDir: absolutePath(record.backendDir, 'backendDir'),
    uvPath: absolutePath(record.uvPath, 'uvPath'),
    port,
  }
}
