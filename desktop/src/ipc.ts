/** IPC channels between the preload bridge and the main process, and their payload checks. */
export const CHANNELS = {
  setViewMode: 'memmon:set-view-mode',
  setAlwaysOnTop: 'memmon:set-always-on-top',
} as const

export type ViewMode = 'full' | 'compact'

export function parseViewMode(value: unknown): ViewMode | null {
  return value === 'full' || value === 'compact' ? value : null
}

export function parseAlwaysOnTop(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}
