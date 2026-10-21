/** Backend port for the Vite dev proxy: $MEMMON_PORT (same variable the backend reads), else 8765. */
export function backendPort(env: Record<string, string | undefined>): number {
  const raw = env.MEMMON_PORT ?? '8765'
  const port = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
  if (!(port >= 1024 && port <= 65535)) {
    throw new Error(`MEMMON_PORT must be a port between 1024 and 65535, got ${JSON.stringify(raw)}`)
  }
  return port
}
