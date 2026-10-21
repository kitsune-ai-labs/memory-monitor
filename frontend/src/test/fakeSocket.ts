import type { SocketLike } from '../api/useMonitor'

/** A controllable stand-in for the browser WebSocket. */
export class FakeSocket implements SocketLike {
  static instances: FakeSocket[] = []
  readyState = 0
  sent: string[] = []
  closed = false
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  readonly url: string

  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }

  static latest(): FakeSocket {
    const socket = FakeSocket.instances.at(-1)
    if (!socket) throw new Error('no socket created')
    return socket
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
    this.readyState = 3
  }

  open() {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }

  receiveBinary() {
    this.onmessage?.(new MessageEvent('message', { data: new ArrayBuffer(2) }))
  }

  receive(message: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: typeof message === 'string' ? message : JSON.stringify(message) }))
  }

  drop() {
    this.readyState = 3
    this.onclose?.(new CloseEvent('close'))
  }
}
