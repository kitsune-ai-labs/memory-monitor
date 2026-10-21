import { describe, expect, it } from 'vitest'
import { appOrigin, isAppUrl, isPermissionAllowed, secureWebPreferences } from './security'

describe('appOrigin', () => {
  it('is the loopback http origin for the port', () => {
    expect(appOrigin(8765)).toBe('http://127.0.0.1:8765')
  })
})

describe('isAppUrl', () => {
  it.each([
    ['http://127.0.0.1:8765/', true],
    ['http://127.0.0.1:8765/assets/index.js', true],
    ['http://127.0.0.1:8766/', false],
    ['http://localhost:8765/', false],
    ['https://127.0.0.1:8765/', false],
    ['http://127.0.0.1.evil.example:8765/', false],
    ['http://evil.example/?u=http://127.0.0.1:8765/', false],
    ['file:///C:/Windows/system32/calc.exe', false],
    ['javascript:alert(1)', false],
    ['not a url', false],
  ])('%s → %s', (url, expected) => {
    expect(isAppUrl(url, 8765)).toBe(expected)
  })
})

describe('isPermissionAllowed', () => {
  it('allows notifications for the app only', () => {
    expect(isPermissionAllowed('notifications', 'http://127.0.0.1:8765/', 8765)).toBe(true)
    expect(isPermissionAllowed('notifications', 'http://evil.example/', 8765)).toBe(false)
  })

  it.each(['media', 'geolocation', 'clipboard-read', 'openExternal', 'fullscreen', 'midi'])('denies %s', (permission) => {
    expect(isPermissionAllowed(permission, 'http://127.0.0.1:8765/', 8765)).toBe(false)
  })
})

describe('secureWebPreferences', () => {
  it('isolates and sandboxes the renderer', () => {
    const prefs = secureWebPreferences('/app/dist/preload.js')
    expect(prefs).toEqual({
      preload: '/app/dist/preload.js',
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
    })
  })
})
