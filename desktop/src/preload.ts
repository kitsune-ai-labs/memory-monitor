/**
 * The only bridge between the page and Electron. It exposes two functions and passes their
 * arguments to the main process, which validates them; the page gets no direct IPC access.
 * Channel names are repeated here because a sandboxed preload cannot import local modules
 * (preload.test.ts keeps them in sync with ipc.ts).
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('memmonDesktop', {
  setViewMode: (mode: unknown): Promise<void> => ipcRenderer.invoke('memmon:set-view-mode', mode),
  setAlwaysOnTop: (on: unknown): Promise<void> => ipcRenderer.invoke('memmon:set-always-on-top', on),
})
