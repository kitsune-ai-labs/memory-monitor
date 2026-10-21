/**
 * Build the distributable Windows app from Linux/WSL.
 *
 *   npm run package
 *     → out/MemoryMonitor-win32-x64/                  the app folder
 *     → out/MemoryMonitor-<version>-win32-x64.zip     the download (+ .sha256)
 *
 * Steps: build the web UI and the backend bundle, write config.json (port + the bundle's
 * SHA-256; nothing machine-specific), package for win32 with the bundle as a resource, set
 * Electron fuses, optionally sign, then zip.
 *
 * Signing (optional): MEMMON_SIGN_PFX=<path to .pfx> MEMMON_SIGN_PASSWORD=<password>
 * Signing runs through Windows PowerShell, so it needs WSL with Windows interop.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses'
import { packager } from '@electron/packager'
import { buildBackendBundle } from './bundle-backend.mjs'

const require = createRequire(import.meta.url)
const DESKTOP = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const REPO = path.dirname(DESKTOP)
const OUT = path.join(DESKTOP, 'out')
const STAGE = path.join(OUT, 'stage')
const ARCHIVE = 'backend.tar.gz'
const PORT = 8765

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { stdio: 'inherit', shell: false, ...options })
  if (result.status !== 0) throw new Error(`${file} ${args.join(' ')} failed (exit ${result.status})`)
  return result
}

function capture(file, args) {
  const result = spawnSync(file, args, { encoding: 'utf8', shell: false })
  if (result.status !== 0) throw new Error(`${file} failed: ${result.stderr}`)
  return result.stdout.trim()
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

function sign(exe) {
  const pfx = process.env.MEMMON_SIGN_PFX
  if (!pfx) {
    console.log('• signing skipped (set MEMMON_SIGN_PFX and MEMMON_SIGN_PASSWORD to sign)')
    return
  }
  console.log('• signing')
  const toWindows = (p) => (/^[A-Za-z]:\\/.test(p) ? p : capture('wslpath', ['-w', p]))
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', toWindows(path.join(DESKTOP, 'scripts', 'sign.ps1')),
    '-File', toWindows(exe), '-PfxPath', toWindows(pfx)]
  if (process.env.MEMMON_SIGN_TIMESTAMP !== undefined) args.push('-TimestampServer', process.env.MEMMON_SIGN_TIMESTAMP)
  // WSLENV forwards the password into the Windows process as an environment variable.
  const wslenv = [process.env.WSLENV, 'MEMMON_SIGN_PASSWORD'].filter(Boolean).join(':')
  run('powershell.exe', args, { cwd: '/mnt/c', env: { ...process.env, WSLENV: wslenv } })
}

const pkg = JSON.parse(readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'))
const { parseConfig } = require(path.join(DESKTOP, 'dist', 'config.js'))

rmSync(OUT, { recursive: true, force: true })
mkdirSync(STAGE, { recursive: true })

console.log('• building the web UI')
run('npm', ['run', 'build'], { cwd: path.join(REPO, 'frontend') })

console.log('• building the backend bundle')
const archive = path.join(OUT, ARCHIVE)
const bundle = buildBackendBundle({ repo: REPO, workDir: path.join(OUT, 'bundle-work'), outFile: archive })

console.log('• staging the app')
const config = parseConfig({ port: PORT, backend: { archive: ARCHIVE, sha256: bundle.sha256 } })
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
  extraResource: [archive],
  win32metadata: {
    CompanyName: 'kitsune-ai-labs',
    FileDescription: 'Memory Monitor',
    ProductName: 'Memory Monitor',
    InternalName: 'MemoryMonitor',
  },
})
rmSync(STAGE, { recursive: true, force: true })
rmSync(archive)

console.log('• setting Electron fuses')
const exe = path.join(appDir, 'MemoryMonitor.exe')
await flipFuses(exe, {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
})

sign(exe)

console.log('• zipping')
const zipName = `MemoryMonitor-${pkg.version}-win32-x64.zip`
run('python3', ['-I', '-m', 'zipfile', '-c', zipName, path.basename(appDir)], { cwd: OUT })
const zip = path.join(OUT, zipName)
writeFileSync(`${zip}.sha256`, `${sha256(zip)}  ${zipName}\n`)
if (!existsSync(zip)) throw new Error('zip was not created')

console.log(`✓ ${exe}`)
console.log(`✓ ${zip} (${(readFileSync(zip).length / 1024 / 1024).toFixed(0)} MB)`)
console.log(`  backend bundle sha256 ${bundle.sha256}`)
