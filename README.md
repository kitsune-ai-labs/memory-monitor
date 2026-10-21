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
| `desktop/` | Electron shell for Windows: tray, window modes, backend supervision |
| `.github/` | CI (lint, types, tests, audits, secret scan) and Dependabot |

## Desktop app (Windows)

```bash
cd desktop && npm ci
npm run package       # builds the UI and out/MemoryMonitor-win32-x64 (no Wine needed)
npm run install-app   # copies it to %LOCALAPPDATA%\Programs\MemoryMonitor
```

Start **Memory Monitor** from the Start Menu. It starts the backend in WSL (`wsl.exe --exec`, no
shell), opens the dashboard, and lives in the tray: closing the window hides it, **Quit** in the
tray menu stops the app and the backend. In the compact view a pin button keeps the window on top.
The app runs the backend from this checkout, so re-run `npm run package && npm run install-app`
after pulling changes.

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

uv run memmon --dev      # also accepts the Vite dev server's origin

# frontend
cd frontend
npm ci
npm run dev              # http://127.0.0.1:5173, proxies /ws and /api to the backend
npm test
npm run lint && npm run typecheck
```

Work is test-first: each change lands as a failing test, then the code that passes it. Every
feature goes through a branch and pull request, and CI must be green before merge.

See [SECURITY.md](SECURITY.md) for the security model.
