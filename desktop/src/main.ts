/**
 * Electron main process: finds a WSL 2 distro, installs the bundled backend into it on first
 * run, starts it, shows the dashboard from it, and keeps a tray icon. All decisions live in
 * tested modules; this file only wires them to Electron.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session, shell, Tray, type IpcMainInvokeEvent } from 'electron'
import { BackendSupervisor } from './backend'
import { parseConfig, parseUserSettings, type AppConfig, type UserSettings } from './config'
import { installBackend, type WslRunner } from './installer'
import { CHANNELS, parseAlwaysOnTop, parseViewMode } from './ipc'
import { appOrigin, isAppUrl, isPermissionAllowed, secureWebPreferences } from './security'
import { boundsFor } from './windowModes'
import { chooseDistro, decodeWslOutput, parseDistroList } from './wsl'

const APP_ID = 'com.kitsune-ai-labs.memory-monitor'
const ROOT = path.join(__dirname, '..')

let window: BrowserWindow | null = null
let tray: Tray | null = null
let supervisor: BackendSupervisor | null = null
let quitting = false

function loadConfig(): AppConfig {
  return parseConfig(JSON.parse(readFileSync(path.join(ROOT, 'config.json'), 'utf8')))
}

/** Optional overrides in %APPDATA%\Memory Monitor\settings.json, e.g. {"distro": "Debian"}. */
function loadUserSettings(): UserSettings {
  const file = path.join(app.getPath('userData'), 'settings.json')
  return existsSync(file) ? parseUserSettings(JSON.parse(readFileSync(file, 'utf8'))) : {}
}

/** Runs wsl.exe with a fixed argument list (no shell) and collects its output. */
function runWsl(args: string[], timeoutMs = 120_000): Promise<{ code: number; stdout: Buffer }> {
  return new Promise((resolve, reject) => {
    const child = spawn('wsl.exe', args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, WSL_UTF8: '1' },
    })
    const chunks: Buffer[] = []
    let size = 0
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= 1024 * 1024) chunks.push(chunk)
    })
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout: Buffer.concat(chunks) })
    })
  })
}

const wslRunner: WslRunner = {
  run: async (args) => {
    const { code, stdout } = await runWsl(args)
    return { code, stdout: decodeWslOutput(stdout) }
  },
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}

const LOADING_PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Memory Monitor</title>
<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
background:#0f0f0e;color:#c3c2b7;font:15px system-ui,'Segoe UI',sans-serif;text-align:center}
small{display:block;margin-top:8px;color:#9a998f}</style></head>
<body><div>Starting Memory Monitor…<small>The first launch sets up the monitor service in WSL. This can take a minute.</small></div></body></html>`)}`

/** Windows only shows toasts for apps with a Start Menu shortcut carrying their AppUserModelID. */
function ensureStartMenuShortcut(): void {
  if (!app.isPackaged) return
  const link = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Memory Monitor.lnk')
  shell.writeShortcutLink(link, existsSync(link) ? 'replace' : 'create', {
    target: process.execPath,
    appUserModelId: APP_ID,
    description: 'Real-time RAM and VRAM monitor',
  })
}

function hardenSessions(port: number): void {
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(isPermissionAllowed(permission, details.requestingUrl ?? contents.getURL(), port))
  })
  session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    isPermissionAllowed(permission, requestingOrigin, port),
  )
  app.on('web-contents-created', (_event, contents) => {
    const blockForeign = (event: Electron.Event, url: string) => {
      if (!isAppUrl(url, port)) event.preventDefault()
    }
    contents.on('will-navigate', blockForeign)
    contents.on('will-redirect', blockForeign)
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })
}

function isTrustedSender(event: IpcMainInvokeEvent, port: number): boolean {
  return window !== null && event.sender === window.webContents && isAppUrl(event.senderFrame?.url ?? '', port)
}

function registerIpc(port: number): void {
  ipcMain.handle(CHANNELS.setViewMode, (event, value: unknown) => {
    const mode = parseViewMode(value)
    if (!window || !mode || !isTrustedSender(event, port)) return
    const bounds = boundsFor(mode)
    window.setMinimumSize(bounds.minWidth, bounds.minHeight)
    window.setSize(bounds.width, bounds.height, true)
  })
  ipcMain.handle(CHANNELS.setAlwaysOnTop, (event, value: unknown) => {
    const onTop = parseAlwaysOnTop(value)
    if (!window || onTop === null || !isTrustedSender(event, port)) return
    window.setAlwaysOnTop(onTop, 'floating')
  })
}

function showWindow(): void {
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

/** Opens on a local "Starting…" page; the dashboard is loaded once the backend is healthy. */
function createWindow(): void {
  const bounds = boundsFor('full')
  window = new BrowserWindow({
    ...bounds,
    show: false,
    title: 'Memory Monitor',
    backgroundColor: '#0f0f0e',
    icon: path.join(ROOT, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences(path.join(__dirname, 'preload.js')),
  })
  window.removeMenu()
  window.once('ready-to-show', () => window?.show())
  // Closing the window hides it to the tray; Quit in the tray menu exits.
  window.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    window?.hide()
  })
  void window.loadURL(LOADING_PAGE)
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(path.join(ROOT, 'assets', 'tray.png')))
  tray.setToolTip('Memory Monitor')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Memory Monitor', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  )
  tray.on('click', () => (window?.isVisible() ? window.hide() : showWindow()))
}

function fail(message: string): void {
  dialog.showErrorBox('Memory Monitor', message)
  app.exit(1)
}

async function start(): Promise<void> {
  let config: AppConfig
  let settings: UserSettings
  try {
    config = loadConfig()
    settings = loadUserSettings()
  } catch (error) {
    fail(`The app configuration is invalid: ${String(error)}`)
    return
  }
  const port = settings.port ?? config.port
  ensureStartMenuShortcut()
  hardenSessions(port)
  registerIpc(port)
  createWindow()

  try {
    const listing = await runWsl(['--list', '--verbose'], 30_000)
    if (listing.code !== 0) throw new Error('WSL is not installed or not working. Install it with: wsl --install')
    const distro = chooseDistro(parseDistroList(decodeWslOutput(listing.stdout)), settings.distro)
    const installed = await installBackend(
      distro,
      { archivePath: path.join(process.resourcesPath, config.backend.archive), sha256: config.backend.sha256 },
      wslRunner,
      sha256File,
    )
    supervisor = new BackendSupervisor(
      { distro, installDir: installed.installDir, port },
      {
        spawn: (file, args, options) => spawn(file, args, options),
        fetch: (url, init) => fetch(url, init),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      },
    )
    await supervisor.start()
  } catch (error) {
    supervisor = null
    fail(`Could not start the monitor service: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  void window?.loadURL(`${appOrigin(port)}/`)
  createTray()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId(APP_ID)
  app.enableSandbox()
  app.on('second-instance', showWindow)
  app.on('window-all-closed', () => {
    // Stay alive in the tray.
  })
  app.on('before-quit', () => {
    quitting = true
  })
  app.on('will-quit', (event) => {
    if (!supervisor) return
    event.preventDefault()
    const running = supervisor
    supervisor = null
    void running.stop().finally(() => app.quit())
  })
  void app.whenReady().then(start)
}
