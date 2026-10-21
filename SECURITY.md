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

## Reporting a vulnerability

Please open a private security advisory on this repository rather than a public issue.
