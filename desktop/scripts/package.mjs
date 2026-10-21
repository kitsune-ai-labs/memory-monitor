/**
 * Build the Windows desktop app from WSL.
 *
 *   npm run package        → out/MemoryMonitor-win32-x64/MemoryMonitor.exe
 *
 * Steps: build the web UI, compile the main process, write config.json pointing at this
 * checkout's backend, package for win32 (Electron's download is checksum-verified), then set
 * Electron fuses to disable features the app does not need.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses'
import { packager } from '@electron/packager'

const require = createRequire(import.meta.url)
const DESKTOP = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const REPO = path.dirname(DESKTOP)
const STAGE = path.join(DESKTOP, 'out', 'stage')
const OUT = path.join(DESKTOP, 'out')
const PORT = 8765

function run(file, args, cwd) {
  const result = spawnSync(file, args, { cwd, stdio: 'inherit', shell: false })
  if (result.status !== 0) throw new Error(`${file} ${args.join(' ')} failed`)
}

function which(name) {
  const result = spawnSync('which', [name], { encoding: 'utf8', shell: false })
  if (result.status !== 0) throw new Error(`${name} not found on PATH`)
  return result.stdout.trim()
}

const pkg = JSON.parse(readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'))
const { parseConfig } = require(path.join(DESKTOP, 'dist', 'config.js'))

console.log('• building the web UI')
run('npm', ['run', 'build'], path.join(REPO, 'frontend'))

console.log('• writing config')
const distro = process.env.WSL_DISTRO_NAME
if (!distro) throw new Error('run this from WSL (WSL_DISTRO_NAME is not set)')
const config = parseConfig({ distro, backendDir: path.join(REPO, 'backend'), uvPath: which('uv'), port: PORT })

console.log('• staging the app')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(STAGE, { recursive: true })
cpSync(path.join(DESKTOP, 'dist'), path.join(STAGE, 'dist'), { recursive: true })
cpSync(path.join(DESKTOP, 'assets'), path.join(STAGE, 'assets'), { recursive: true })
writeFileSync(path.join(STAGE, 'config.json'), JSON.stringify(config, null, 2))
writeFileSync(
  path.join(STAGE, 'package.json'),
  JSON.stringify({ name: 'memory-monitor', productName: 'Memory Monitor', version: pkg.version, main: 'dist/main.js', private: true }, null, 2),
)

console.log('• packaging for Windows')
const [appDir] = await packager({
  dir: STAGE,
  out: OUT,
  name: 'MemoryMonitor',
  executableName: 'MemoryMonitor',
  platform: 'win32',
  arch: 'x64',
  electronVersion: pkg.devDependencies.electron,
  appVersion: pkg.version,
  icon: path.join(DESKTOP, 'assets', 'icon.ico'),
  asar: true,
  prune: false,
  overwrite: true,
  win32metadata: {
    CompanyName: 'kitsune-ai-labs',
    FileDescription: 'Memory Monitor',
    ProductName: 'Memory Monitor',
    InternalName: 'MemoryMonitor',
  },
})
rmSync(STAGE, { recursive: true, force: true })

console.log('• setting Electron fuses')
await flipFuses(path.join(appDir, 'MemoryMonitor.exe'), {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
})

console.log(`✓ ${path.join(appDir, 'MemoryMonitor.exe')}`)
