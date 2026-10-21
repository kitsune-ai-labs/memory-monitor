/**
 * Electron main process: starts the WSL backend, shows the dashboard from it, and keeps a tray
 * icon. All decisions live in tested modules; this file only wires them to Electron.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session, shell, Tray, type IpcMainInvokeEvent } from 'electron'
import { BackendSupervisor } from './backend'
import { parseConfig, type AppConfig } from './config'
import { CHANNELS, parseAlwaysOnTop, parseViewMode } from './ipc'
import { appOrigin, isAppUrl, isPermissionAllowed, secureWebPreferences } from './security'
import { boundsFor } from './windowModes'

const APP_ID = 'com.kitsune-ai-labs.memory-monitor'
const ROOT = path.join(__dirname, '..')

let window: BrowserWindow | null = null
let tray: Tray | null = null
let supervisor: BackendSupervisor | null = null
let quitting = false

function loadConfig(): AppConfig {
  return parseConfig(JSON.parse(readFileSync(path.join(ROOT, 'config.json'), 'utf8')))
}

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

function createWindow(config: AppConfig): void {
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
  void window.loadURL(`${appOrigin(config.port)}/`)
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

async function start(): Promise<void> {
  let config: AppConfig
  try {
    config = loadConfig()
  } catch (error) {
    dialog.showErrorBox('Memory Monitor', `The app configuration is invalid: ${String(error)}`)
    app.exit(1)
    return
  }
  ensureStartMenuShortcut()
  hardenSessions(config.port)
  registerIpc(config.port)

  supervisor = new BackendSupervisor(config, {
    spawn: (file, args, options) => spawn(file, args, options),
    fetch: (url, init) => fetch(url, init),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  })
  try {
    await supervisor.start()
  } catch (error) {
    supervisor = null
    dialog.showErrorBox('Memory Monitor', `Could not start the monitor service: ${error instanceof Error ? error.message : String(error)}`)
    app.exit(1)
    return
  }
  createWindow(config)
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
