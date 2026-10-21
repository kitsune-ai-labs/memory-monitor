import type { NotificationApi, PermissionState } from '../lib/notifications'

export class FakeNotifications implements NotificationApi {
  shown: { title: string; body: string; tag: string }[] = []
  requests = 0
  private state: PermissionState
  private readonly answer: PermissionState

  constructor(state: PermissionState = 'granted', answer: PermissionState = 'granted') {
    this.state = state
    this.answer = answer
  }

  permission() {
    return this.state
  }

  async request() {
    this.requests += 1
    this.state = this.answer
    return this.state
  }

  show(title: string, options: { body: string; tag: string }) {
    this.shown.push({ title, ...options })
  }
}
