const GIB = 1024 ** 3
const MIB = 1024 ** 2

/** Bytes as GiB with one decimal, without a unit: "24.0". */
export function formatGiB(bytes: number): string {
  return (bytes / GIB).toFixed(1)
}

/** Bytes as "3.0 GB" from one GiB up, otherwise whole "512 MB". */
export function formatBytes(bytes: number): string {
  return bytes >= GIB ? `${formatGiB(bytes)} GB` : `${Math.round(bytes / MIB)} MB`
}

/** How long ago, in whole seconds: "now", "12s ago", "1m 15s ago". */
export function formatAgo(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 1) return 'now'
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`
}

export function formatInterval(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${ms / 1000} s`
}
