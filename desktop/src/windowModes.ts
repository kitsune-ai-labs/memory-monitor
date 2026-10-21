import type { ViewMode } from './ipc'

export interface WindowBounds {
  width: number
  height: number
  minWidth: number
  minHeight: number
}

const BOUNDS: Record<ViewMode, WindowBounds> = {
  full: { width: 1400, height: 960, minWidth: 760, minHeight: 600 },
  compact: { width: 448, height: 840, minWidth: 400, minHeight: 480 },
}

export function boundsFor(mode: ViewMode): WindowBounds {
  return { ...BOUNDS[mode] }
}
