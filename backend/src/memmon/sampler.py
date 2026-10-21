"""Collects a Snapshot from every source on a schedule."""

import asyncio
import contextlib
import time
from collections.abc import Awaitable, Callable
from typing import Literal

from memmon.collectors.windows import parse_windows_sample
from memmon.errors import CollectorError
from memmon.history import History
from memmon.models import GpuStats, HostSample, Snapshot

GpuReader = Callable[[], Awaitable[GpuStats]]
HostReader = Callable[[], Awaitable[str]]
SnapshotHandler = Callable[[Snapshot], Awaitable[None]]
GpuSource = Literal["auto", "nvidia", "windows"]


def wall_clock_ms() -> int:
    return time.time_ns() // 1_000_000


class Sampler:
    """Reads the GPU and host sources concurrently.

    A ``CollectorError`` from one source is recorded in ``Snapshot.errors`` and the other source
    is still used; any other exception is a bug and propagates.

    GPU memory comes from nvidia-smi when it works. With ``gpu_source="auto"`` a machine without
    it (AMD, Intel, or no driver in WSL) falls back to the adapter totals the Windows sampler
    reports; ``"nvidia"`` and ``"windows"`` force one source.
    """

    def __init__(
        self,
        *,
        read_gpu: GpuReader,
        read_host: HostReader,
        clock_ms: Callable[[], int] = wall_clock_ms,
        top_n: int = 10,
        gpu_source: GpuSource = "auto",
    ) -> None:
        self._read_gpu = read_gpu
        self._read_host = read_host
        self._clock_ms = clock_ms
        self._top_n = top_n
        self._gpu_source = gpu_source
        self._last_ts_ms = 0

    def _timestamp(self) -> int:
        # Keep timestamps strictly increasing even if the wall clock is adjusted backwards.
        self._last_ts_ms = max(self._clock_ms(), self._last_ts_ms + 1)
        return self._last_ts_ms

    @staticmethod
    async def _skip_gpu() -> None:
        return None

    async def collect(self) -> Snapshot:
        read_gpu = self._skip_gpu() if self._gpu_source == "windows" else self._read_gpu()
        gpu_result, host_result = await asyncio.gather(
            read_gpu, self._read_host(), return_exceptions=True
        )
        for result in (gpu_result, host_result):
            if isinstance(result, BaseException) and not isinstance(result, CollectorError):
                raise result

        gpu: GpuStats | None = None
        gpu_error: str | None = None
        if isinstance(gpu_result, BaseException):
            gpu_error = f"gpu: {gpu_result}"
        else:
            gpu = gpu_result

        host_errors: list[str] = []
        host: HostSample | None = None
        if isinstance(host_result, BaseException):
            host_errors.append(f"host: {host_result}")
        else:
            try:
                host = parse_windows_sample(
                    host_result,
                    vram_total_bytes=gpu.total_bytes if gpu else None,
                    top_n=self._top_n,
                )
            except CollectorError as exc:
                host_errors.append(f"host: {exc}")

        if gpu is None and self._gpu_source != "nvidia" and host is not None:
            if host.adapter is not None:
                gpu, gpu_error = host.adapter, None
            elif self._gpu_source == "windows":
                gpu_error = "gpu: Windows reported no GPU adapter"

        errors = ([gpu_error] if gpu_error else []) + host_errors
        return Snapshot(ts_ms=self._timestamp(), gpu=gpu, host=host, errors=tuple(errors))

    async def run(
        self,
        history: History,
        on_snapshot: SnapshotHandler,
        interval_ms: Callable[[], int],
        *,
        stop: asyncio.Event,
    ) -> None:
        """Sample until ``stop`` is set. The interval is re-read every cycle so changes apply."""
        loop = asyncio.get_running_loop()
        while not stop.is_set():
            started = loop.time()
            snapshot = await self.collect()
            history.append(snapshot.to_point())
            await on_snapshot(snapshot)
            delay = interval_ms() / 1000 - (loop.time() - started)
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(stop.wait(), max(0.0, delay))
