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
| `.github/` | CI (lint, types, tests, audits, secret scan) and Dependabot |

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

Work is test-first: each change lands as a failing test, then the code that passes it. Every
feature goes through a branch and pull request, and CI must be green before merge.

See [SECURITY.md](SECURITY.md) for the security model.
