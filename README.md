# Memory Monitor

A real-time dashboard for a Windows PC's **system RAM** and **GPU VRAM**, with usage history, top
processes, GPU utilization/temperature/power, and Windows notifications when usage crosses a
threshold. It has a full dashboard view and a compact always-on-top view.

## How it works

```
Windows host                               WSL (Ubuntu)
┌────────────────────────────┐   stdout    ┌──────────────────────────────────────┐
│ powershell.exe sampler     │ ──JSON────▶ │ memmon backend (FastAPI, 127.0.0.1)  │
│ (RAM, per-process RAM/VRAM)│ ◀─"s"/"q"── │  • nvidia-smi (VRAM, util, temp, W)  │
└────────────────────────────┘   stdin     │  • history buffer, alerts, settings  │
                                           │  • WebSocket /ws  ──▶ React UI        │
                                           └──────────────────────────────────────┘
```

The backend runs in WSL. Host RAM and per-process numbers come from a small read-only PowerShell
sampler that the backend starts once and drives over stdin. WSL's `nvidia-smi` already reports the
whole GPU, so VRAM needs no Windows code.

## Layout

| Path | What |
|---|---|
| `backend/` | Python package `memmon` (uv-managed): collectors, sampler, API |
| `frontend/` | React + TypeScript UI (Vite), tested with Vitest + Testing Library |
| `desktop/` | Electron shell for Windows: WSL detection, bundled-backend install, tray, window modes |
| `.github/` | CI (lint, types, tests, audits, secret scan) and Dependabot |

## Desktop app (Windows)

### Installing (any Windows PC)

Requirements: Windows 10/11 with **WSL 2 and a Linux distribution** (`wsl --install`). Nothing
else: the download bundles its own Linux Python, the backend and the UI.

1. Download `MemoryMonitor-<version>-win32-x64.zip` (check it against the `.sha256` file).
2. Extract it anywhere, for example `%LOCALAPPDATA%\Programs\MemoryMonitor`, and run `MemoryMonitor.exe`.

On first launch the app finds your default WSL 2 distro, verifies the bundled backend against
the SHA-256 stored inside the app, and unpacks it to `~/.local/share/memory-monitor/` in that
distro (a few seconds; later launches reuse it). It also adds a Start Menu entry, which Windows
needs before it will show the app's notifications.

- **GPU:** NVIDIA cards report VRAM, utilization, temperature and power via `nvidia-smi`. Other
  GPUs (AMD, Intel) report VRAM and per-process VRAM from Windows counters.
- **Overrides:** `%APPDATA%\Memory Monitor\settings.json`, e.g. `{"distro": "Debian", "port": 8770}`.
- **Tray:** closing the window hides it; **Quit** in the tray menu stops the app and its backend.
- **Not supported:** WSL 1, musl-based distros (Alpine), ARM64 Windows.

### Building the download

```bash
cd backend && uv sync          # uses uv's standalone CPython, which gets bundled
cd ../frontend && npm ci
cd ../desktop && npm ci
npm run package                # → desktop/out/MemoryMonitor-<version>-win32-x64.zip (+ .sha256)
npm run install-app            # optional: install that build for yourself
```

The **Package** GitHub workflow builds the same zip (manually, or on a `v*` tag, where it is
attached to the release).

**Code signing.** `MEMMON_SIGN_PFX=<cert.pfx> MEMMON_SIGN_PASSWORD=<password> npm run package`
signs `MemoryMonitor.exe` (SHA-256, RFC 3161 timestamp) through Windows PowerShell; the password
is passed by environment variable, never on a command line. SmartScreen only trusts a
certificate from a public CA (OV/EV) or Azure Trusted Signing; with a self-signed certificate
the file is signed but Windows will still warn.

## Running in a browser

```bash
cd frontend && npm ci && npm run build && cd ..
cd backend && uv run memmon          # http://127.0.0.1:8765
```

Open http://127.0.0.1:8765 in Edge or Chrome on Windows (WSL forwards localhost). Settings are
stored in `~/.config/memmon/settings.json` (private to your user).

**Alerts.** When RAM or VRAM crosses its threshold, the backend sends an alert and the page shows
it as a Windows notification. Click **Enable Windows notifications** once to grant the browser
permission. Alerts re-arm after usage drops 5 points below the threshold, with a 60-second
cooldown per metric. Notifications appear while the dashboard is open (a background tab is fine).

**Per-process VRAM** comes from the Windows "GPU Process Memory" counter (the one Task Manager
uses). It can include shared allocations, so a process such as `dwm` may show more than the
card-wide total reported by `nvidia-smi`.

## Development

Requirements: [uv](https://docs.astral.sh/uv/) and Node 24 (via [fnm](https://github.com/Schniz/fnm)).

```bash
# backend
cd backend
uv sync
uv run pytest            # tests + coverage gate
uv run ruff check . && uv run mypy

# frontend
cd frontend
npm ci
npm test
npm run lint && npm run typecheck
```

**Live development** (two terminals):

```bash
cd backend  && uv run memmon --dev   # --dev lets the Vite page connect
cd frontend && npm run dev           # http://localhost:5173, proxies /ws and /api
```

The desktop app runs its own backend on port 8765. To develop while it is running, give both
commands another port: `MEMMON_PORT=8766 uv run memmon --dev` and `MEMMON_PORT=8766 npm run dev`.
If the page says it can't reach the service, the backend log names the cause (port in use, or
a connection refused because `--dev` is missing).

Work is test-first: each change lands as a failing test, then the code that passes it. Every
feature goes through a branch and pull request, and CI must be green before merge.

See [SECURITY.md](SECURITY.md) for the security model.
