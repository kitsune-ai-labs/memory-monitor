/**
 * Copy the packaged app to %LOCALAPPDATA%\Programs\MemoryMonitor on the Windows side.
 * The Start Menu shortcut (needed for Windows notifications) is created on first launch.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DESKTOP = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const BUILD = path.join(DESKTOP, 'out', 'MemoryMonitor-win32-x64')

function capture(file, args) {
  const result = spawnSync(file, args, { encoding: 'utf8', shell: false, cwd: '/mnt/c' })
  if (result.status !== 0) throw new Error(`${file} failed: ${result.stderr}`)
  return result.stdout.trim()
}

if (!existsSync(path.join(BUILD, 'MemoryMonitor.exe'))) throw new Error('run `npm run package` first')

const running = capture('tasklist.exe', ['/FI', 'IMAGENAME eq MemoryMonitor.exe', '/NH'])
if (running.includes('MemoryMonitor.exe')) throw new Error('quit Memory Monitor (tray icon → Quit) before installing')

const localAppData = capture('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Environment]::GetFolderPath("LocalApplicationData")'])
const target = capture('wslpath', ['-u', path.win32.join(localAppData, 'Programs', 'MemoryMonitor')])

// Only ever replace a directory that holds our app.
if (existsSync(target)) {
  if (!existsSync(path.join(target, 'MemoryMonitor.exe'))) throw new Error(`${target} exists but is not a Memory Monitor install`)
  rmSync(target, { recursive: true })
}
cpSync(BUILD, target, { recursive: true })
console.log(`✓ installed to ${path.win32.join(localAppData, 'Programs', 'MemoryMonitor')}`)
