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
- The backend ships as `backend.tar.gz` next to the app. Its SHA-256 is stored in `config.json`
  inside the integrity-checked asar, and the archive is verified before it is unpacked into WSL;
  a mismatch is refused. Dependencies inside it are installed from the lockfile with
  `--require-hashes`.
- Every WSL command (`pwd`, `tar`, `mv`, …) and the backend itself run via `wsl.exe --exec` with
  fixed argument lists: no shell on Windows or Linux. The bundled Python runs in isolated mode
  (`-I`). Distro names and paths reported by WSL are validated before use, and the app refuses to
  start if another server already answers on its port.
- Release builds can be Authenticode-signed and timestamped; the signing password is passed via
  an environment variable only.
- Electron fuses: `RunAsNode`, `NODE_OPTIONS` and `--inspect` are disabled; the app only loads
  from its asar archive, whose integrity is validated; cookies are encrypted.
- Electron is pinned to an exact version and tracked by Dependabot.

## Reporting a vulnerability

Please open a private security advisory on this repository rather than a public issue.
