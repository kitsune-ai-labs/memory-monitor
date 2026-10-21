"""Start the Memory Monitor server: ``uv run memmon [--port N] [--dev]``."""

import argparse
import asyncio
import functools
import logging
import shutil
from collections.abc import Sequence
from pathlib import Path

import uvicorn

from memmon.alerts import AlertEngine
from memmon.collectors.nvidia import read_nvidia_smi
from memmon.collectors.windows import WindowsHostReader
from memmon.history import History
from memmon.hub import Hub
from memmon.sampler import Sampler
from memmon.server import MAX_CLIENT_MESSAGE_BYTES, create_app
from memmon.settings import SettingsStore, default_settings_path

DEFAULT_PORT = 8765
VITE_PORT = 5173
HISTORY_WINDOW_MS = 15 * 60 * 1000
HISTORY_MAX_POINTS = HISTORY_WINDOW_MS // 250
WSL_NVIDIA_SMI = Path("/usr/lib/wsl/lib/nvidia-smi")
DEFAULT_STATIC_DIR = Path(__file__).resolve().parents[3] / "frontend" / "dist"


def _port(value: str) -> int:
    try:
        port = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("port must be a number") from exc
    if not 1024 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be between 1024 and 65535")
    return port


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="memmon", description=__doc__)
    parser.add_argument("--port", type=_port, default=DEFAULT_PORT)
    parser.add_argument("--dev", action="store_true", help="allow the Vite dev server's origin")
    parser.add_argument("--static-dir", type=Path, default=DEFAULT_STATIC_DIR)
    return parser.parse_args(argv)


def dev_origins(*, dev: bool) -> tuple[str, ...]:
    if not dev:
        return ()
    return (f"http://127.0.0.1:{VITE_PORT}", f"http://localhost:{VITE_PORT}")


def _find_nvidia_smi() -> Path:
    if WSL_NVIDIA_SMI.is_file():
        return WSL_NVIDIA_SMI
    found = shutil.which("nvidia-smi")
    return Path(found) if found else WSL_NVIDIA_SMI


def _find_powershell() -> Path | None:
    found = shutil.which("powershell.exe")
    return Path(found) if found else None


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    hub = Hub(
        store=SettingsStore(default_settings_path()),
        history=History(window_ms=HISTORY_WINDOW_MS, max_points=HISTORY_MAX_POINTS),
        alerts=AlertEngine(),
    )
    host_reader = WindowsHostReader(_find_powershell())
    sampler = Sampler(
        read_gpu=functools.partial(read_nvidia_smi, _find_nvidia_smi()), read_host=host_reader
    )

    async def run_sampler(stop: asyncio.Event) -> None:
        try:
            await sampler.run(hub.history, hub.publish, lambda: hub.settings.interval_ms, stop=stop)
        finally:
            await host_reader.close()

    app = create_app(
        hub,
        port=args.port,
        static_dir=args.static_dir,
        dev_origins=dev_origins(dev=args.dev),
        run_sampler=run_sampler,
    )
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=args.port,
        proxy_headers=False,
        server_header=False,
        ws_max_size=MAX_CLIENT_MESSAGE_BYTES,
    )


if __name__ == "__main__":  # pragma: no cover
    main()
