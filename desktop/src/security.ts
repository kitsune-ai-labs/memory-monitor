/** The only origin the app window may load or grant permissions to. */
export function appOrigin(port: number): string {
  return `http://127.0.0.1:${port}`
}

export function isAppUrl(url: string, port: number): boolean {
  try {
    return new URL(url).origin === appOrigin(port)
  } catch {
    return false
  }
}

const ALLOWED_PERMISSIONS = new Set(['notifications'])

export function isPermissionAllowed(permission: string, requestingUrl: string, port: number): boolean {
  return ALLOWED_PERMISSIONS.has(permission) && isAppUrl(requestingUrl, port)
}

/** Renderer settings from Electron's security checklist: no Node, isolated, sandboxed. */
export function secureWebPreferences(preload: string) {
  return {
    preload,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    spellcheck: false,
  } as const
}
