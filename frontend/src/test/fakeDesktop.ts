import { vi } from 'vitest'
import type { DesktopBridge } from '../lib/desktop'

export function fakeDesktop(): DesktopBridge & { setViewMode: ReturnType<typeof vi.fn>; setAlwaysOnTop: ReturnType<typeof vi.fn> } {
  return { setViewMode: vi.fn(async () => undefined), setAlwaysOnTop: vi.fn(async () => undefined) }
}
