import { useId } from 'react'

/** How many failed attempts in a row before the help is shown. */
export const HELP_AFTER_ATTEMPTS = 3

/**
 * Browsers hide why a WebSocket was refused, so this lists the likely causes instead.
 * The dev-server causes only apply when the page comes from Vite.
 */
export function ConnectionHelp({ dev }: { dev: boolean }) {
  const headingId = useId()
  return (
    <section className="help" aria-labelledby={headingId}>
      <h2 id={headingId}>Can't reach the monitor service</h2>
      <ul>
        <li>
          Make sure the backend is running: <code>cd backend && uv run memmon{dev ? ' --dev' : ''}</code>
        </li>
        {dev && (
          <>
            <li>
              This page is served by the Vite dev server, so the backend must be started with <code>--dev</code> or it will
              refuse the connection.
            </li>
            <li>
              If the Memory Monitor desktop app is running, it holds port 8765. Quit it from the tray icon, or use another
              port for both: <code>MEMMON_PORT=8766 uv run memmon --dev</code> and <code>MEMMON_PORT=8766 npm run dev</code>.
            </li>
          </>
        )}
      </ul>
      <p className="muted">Still retrying in the background.</p>
    </section>
  )
}
