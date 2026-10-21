import type { Alert } from '../api/protocol'

export type PermissionState = NotificationPermission | 'unsupported'

/** The parts of the browser Notification API the app uses; injectable for tests. */
export interface NotificationApi {
  permission(): PermissionState
  request(): Promise<PermissionState>
  show(title: string, options: { body: string; tag: string }): void
}

/**
 * Notifications from a page served on 127.0.0.1 count as a secure context, and on Windows the
 * browser shows them as native toasts.
 */
export function browserNotifications(impl: typeof Notification | undefined = globalThis.Notification): NotificationApi {
  if (!impl) {
    return {
      permission: () => 'unsupported',
      request: async () => 'unsupported',
      show: () => undefined,
    }
  }
  return {
    permission: () => impl.permission,
    request: () => impl.requestPermission(),
    show: (title, options) => {
      new impl(title, options)
    },
  }
}

/** One toast per metric: the tag makes a newer alert replace an older one instead of stacking. */
export function notifyAlert(api: NotificationApi, alert: Alert): void {
  if (api.permission() !== 'granted') return
  api.show('Memory Monitor', { body: alert.message, tag: `memmon-${alert.metric}` })
}
