/**
 * config.json is generated at package time and shipped inside the app's asar. It holds nothing
 * machine-specific: the distro and paths are detected on the user's PC at startup.
 * settings.json in the app's user-data folder may override the distro or port.
 */
import { DISTRO_NAME } from './wsl'

export interface AppConfig {
  port: number
  backend: { archive: string; sha256: string }
}

export interface UserSettings {
  distro?: string
  port?: number
}

export class ConfigError extends Error {}

const SHA256 = /^[0-9a-f]{64}$/
const ARCHIVE = /^[A-Za-z0-9._-]{1,64}\.tar\.gz$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function onlyKeys(record: Record<string, unknown>, allowed: string[], what: string): void {
  const extra = Object.keys(record).filter((k) => !allowed.includes(k))
  if (extra.length > 0) throw new ConfigError(`${what} has unknown fields: ${extra.join(', ')}`)
}

function port(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new ConfigError('port must be an integer between 1024 and 65535')
  }
  return value
}

export function parseConfig(raw: unknown): AppConfig {
  if (!isRecord(raw)) throw new ConfigError('config must be an object')
  onlyKeys(raw, ['port', 'backend'], 'config')
  const backend = raw.backend
  if (!isRecord(backend)) throw new ConfigError('config.backend must be an object')
  onlyKeys(backend, ['archive', 'sha256'], 'config.backend')
  if (typeof backend.archive !== 'string' || !ARCHIVE.test(backend.archive)) throw new ConfigError('invalid backend archive name')
  if (typeof backend.sha256 !== 'string' || !SHA256.test(backend.sha256)) throw new ConfigError('invalid backend sha256')
  return { port: port(raw.port), backend: { archive: backend.archive, sha256: backend.sha256 } }
}

export function parseUserSettings(raw: unknown): UserSettings {
  if (!isRecord(raw)) throw new ConfigError('settings must be an object')
  onlyKeys(raw, ['distro', 'port'], 'settings')
  const settings: UserSettings = {}
  if (raw.distro !== undefined) {
    if (typeof raw.distro !== 'string' || !DISTRO_NAME.test(raw.distro)) throw new ConfigError('invalid distro name')
    settings.distro = raw.distro
  }
  if (raw.port !== undefined) settings.port = port(raw.port)
  return settings
}
