# Security

Memory Monitor is a single-user desktop tool. Its security model:

- **Local only.** The server binds to `127.0.0.1` and refuses requests whose `Host` is not a
  loopback name, which blocks DNS-rebinding attacks.
- **Origin-checked WebSocket.** Connections from any page other than the app itself are rejected,
  so other websites open in your browser cannot read your process list.
- **Read-only collection.** Collectors only read system counters. They are started with fixed
  argument lists (never a shell) and take no input from the network.
- **Validated input.** Every message from the UI and every line from a collector is parsed against a
  strict schema; anything else is dropped.
- **Strict browser policy.** Pages are served with a restrictive Content-Security-Policy and no
  third-party scripts, fonts or trackers.
- **Supply chain.** Dependencies are locked (with hashes for Python), audited in CI, and updated by
  Dependabot. CI actions are pinned to commit SHAs.

## Desktop app

- Renderer: `contextIsolation`, `sandbox`, no Node integration anywhere, no `<webview>`, and
  navigation, redirects and new windows are blocked except to the app's own `127.0.0.1` origin.
- Only the notification permission is ever granted, and only to the app origin.
- The preload exposes two functions; the main process validates every IPC payload and checks
  that it came from the app's own window and origin.
- The backend is started with `wsl.exe --exec` from a fixed argument list built from a strictly
  validated config. The app refuses to start if another server already answers on its port.
- Electron fuses: `RunAsNode`, `NODE_OPTIONS` and `--inspect` are disabled; the app only loads
  from its asar archive, whose integrity is validated; cookies are encrypted.
- Electron is pinned to an exact version and tracked by Dependabot.

## Reporting a vulnerability

Please open a private security advisory on this repository rather than a public issue.
