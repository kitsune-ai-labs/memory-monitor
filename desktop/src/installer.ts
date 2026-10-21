/**
 * Installs the bundled backend (a standalone Linux Python with memmon and the web UI) into
 * the user's WSL distro the first time each version runs.
 *
 * The archive ships next to the app; its SHA-256 is stored in config.json inside the app's
 * integrity-checked asar, so a tampered archive is refused before anything is unpacked. Every
 * step runs through `wsl.exe --exec` with a fixed argument list: no shell on either side.
 */

export interface WslRunner {
  run(args: string[]): Promise<{ code: number; stdout: string }>
}

export interface BundleInfo {
  /** Windows path of backend.tar.gz. */
  archivePath: string
  sha256: string
}

export interface InstalledBackend {
  installDir: string
  python: string
  staticDir: string
}

export class InstallError extends Error {}

const LINUX_PATH = /^\/[^\0\n\r]{0,1023}$/
const VERSION_DIR = /^backend-[0-9a-f]{16}(\.partial)?$/

function checkedPath(value: string, what: string): string {
  const path = value.trim()
  if (!LINUX_PATH.test(path) || path.split('/').includes('..')) {
    throw new InstallError(`unexpected ${what} reported by WSL: ${JSON.stringify(path)}`)
  }
  return path
}

export async function installBackend(
  distro: string,
  bundle: BundleInfo,
  runner: WslRunner,
  hashFile: (path: string) => Promise<string>,
): Promise<InstalledBackend> {
  const exec = (cwd: string, ...command: string[]) => runner.run(['--distribution', distro, '--cd', cwd, '--exec', ...command])
  const step = async (name: string, ...command: string[]) => {
    const result = await exec('~', ...command)
    if (result.code !== 0) throw new InstallError(`could not ${name} the monitor service (exit code ${result.code})`)
    return result.stdout
  }

  const home = checkedPath(await step('find the home directory for', 'pwd'), 'home directory')
  const base = `${home}/.local/share/memory-monitor`
  const installDir = `${base}/backend-${bundle.sha256.slice(0, 16)}`
  const installed: InstalledBackend = {
    installDir,
    python: `${installDir}/python/bin/python3`,
    staticDir: `${installDir}/ui`,
  }

  if ((await exec('~', 'test', '-x', installed.python)).code === 0) return installed

  if ((await hashFile(bundle.archivePath)) !== bundle.sha256) {
    throw new InstallError('the bundled monitor service failed its integrity check; reinstall Memory Monitor')
  }
  const archive = checkedPath(await step('locate', 'wslpath', '-u', bundle.archivePath), 'archive path')
  const partial = `${installDir}.partial`
  await step('prepare', 'rm', '-rf', '--', partial, installDir)
  await step('prepare', 'mkdir', '-p', '--', partial)
  await step('unpack', 'tar', '-xzf', archive, '--no-same-owner', '-C', partial)
  await step('install', 'mv', '-T', '--', partial, installDir)

  // Best effort: remove versions left behind by earlier releases.
  const listing = await exec('~', 'ls', '-1', '--', base)
  if (listing.code === 0) {
    for (const name of listing.stdout.split('\n').map((n) => n.trim())) {
      if (VERSION_DIR.test(name) && `${base}/${name}` !== installDir) await exec('~', 'rm', '-rf', '--', `${base}/${name}`)
    }
  }
  return installed
}
