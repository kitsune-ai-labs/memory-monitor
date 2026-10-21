import type { ViewMode } from '../api/protocol'

/** What the desktop app's preload script exposes on `window.memmonDesktop`. */
export interface DesktopBridge {
  setViewMode(mode: ViewMode): Promise<void>
  setAlwaysOnTop(on: boolean): Promise<void>
}

/** The bridge when running inside the desktop app, otherwise null (a normal browser tab). */
export function getDesktopBridge(host: { memmonDesktop?: unknown } = window as { memmonDesktop?: unknown }): DesktopBridge | null {
  const candidate = host.memmonDesktop
  if (typeof candidate !== 'object' || candidate === null) return null
  const { setViewMode, setAlwaysOnTop } = candidate as Record<string, unknown>
  if (typeof setViewMode !== 'function' || typeof setAlwaysOnTop !== 'function') return null
  return candidate as DesktopBridge
}
