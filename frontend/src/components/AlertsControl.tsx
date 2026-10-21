import { useState } from 'react'
import type { Settings, SettingsPatch } from '../api/protocol'
import type { NotificationApi } from '../lib/notifications'

interface AlertsControlProps {
  settings: Settings
  onUpdate: (patch: SettingsPatch) => void
  notifications: NotificationApi
}

/** Alerts on/off, plus the one-time browser permission for Windows notifications. */
export function AlertsControl({ settings, onUpdate, notifications }: AlertsControlProps) {
  const [permission, setPermission] = useState(() => notifications.permission())

  return (
    <div className="alerts-control">
      <button
        type="button"
        className="button"
        aria-pressed={settings.alertsEnabled}
        onClick={() => onUpdate({ alertsEnabled: !settings.alertsEnabled })}
      >
        Alerts
      </button>
      {settings.alertsEnabled && permission === 'default' && (
        <button
          type="button"
          className="button button--accent"
          onClick={() => {
            // Browsers only allow the permission prompt in response to a click.
            void notifications.request().then(setPermission)
          }}
        >
          Enable Windows notifications
        </button>
      )}
      {settings.alertsEnabled && permission === 'granted' && <span className="muted">Notifications on</span>}
      {settings.alertsEnabled && permission === 'denied' && <span className="muted">Notifications blocked in browser settings</span>}
    </div>
  )
}
