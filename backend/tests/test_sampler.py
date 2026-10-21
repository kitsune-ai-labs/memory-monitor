import asyncio
import json

import pytest

from memmon.errors import CollectorError
from memmon.history import History
from memmon.models import GpuStats, Snapshot
from memmon.sampler import Sampler

GIB = 1024**3

GPU = GpuStats(
    name="GPU", used_bytes=8 * GIB, total_bytes=32 * GIB, util_pct=50, temp_c=60, power_w=200
)
HOST_LINE = json.dumps(
    {
        "v": 1,
        "mem": {
            "totalBytes": 64 * GIB,
            "availableBytes": 48 * GIB,
            "committedBytes": 20 * GIB,
            "commitLimitBytes": 72 * GIB,
            "cacheBytes": 1 * GIB,
        },
        "procs": [{"pid": 1, "name": "chrome", "bytes": 2 * GIB}],
        "gpuProcs": [
            {"pid": 2, "name": "python", "bytes": 6 * GIB},
            {"pid": 3, "name": "ghost", "bytes": 40 * GIB},
        ],
    }
)


class FakeClock:
    def __init__(self, start_ms: int = 1_000) -> None:
        self.now = start_ms

    def __call__(self) -> int:
        self.now += 1_000
        return self.now


def make_sampler(gpu: object = GPU, host: object = HOST_LINE) -> Sampler:
    async def read_gpu() -> GpuStats:
        if isinstance(gpu, Exception):
            raise gpu
        assert isinstance(gpu, GpuStats)
        return gpu

    async def read_host() -> str:
        if isinstance(host, Exception):
            raise host
        assert isinstance(host, str)
        return host

    return Sampler(read_gpu=read_gpu, read_host=read_host, clock_ms=FakeClock())


async def test_collect_combines_both_sources() -> None:
    snap = await make_sampler().collect()
    assert snap.ts_ms == 2_000
    assert snap.gpu == GPU
    assert snap.host is not None
    assert snap.host.memory.used_bytes == 16 * GIB
    assert snap.errors == ()


async def test_gpu_total_is_used_to_drop_bogus_process_readings() -> None:
    snap = await make_sampler().collect()
    assert snap.host is not None
    assert [p.name for p in snap.host.top_vram] == ["python"]


async def test_percentages_are_derived_for_history() -> None:
    snap = await make_sampler().collect()
    assert snap.ram_pct == pytest.approx(25.0)
    assert snap.vram_pct == pytest.approx(25.0)


async def test_a_failing_source_is_reported_without_losing_the_other() -> None:
    snap = await make_sampler(gpu=CollectorError("nvidia-smi timed out")).collect()
    assert snap.gpu is None
    assert snap.vram_pct is None
    assert snap.host is not None
    assert snap.errors == ("gpu: nvidia-smi timed out",)


async def test_bad_host_lines_are_reported_as_errors() -> None:
    snap = await make_sampler(host="garbage").collect()
    assert snap.host is None
    assert snap.ram_pct is None
    assert snap.errors == ("host: sampler line is not JSON",)


async def test_unexpected_exceptions_are_not_swallowed() -> None:
    with pytest.raises(RuntimeError):
        await make_sampler(gpu=RuntimeError("bug")).collect()


async def test_run_samples_until_stopped_and_records_history() -> None:
    sampler = make_sampler()
    history = History(window_ms=60_000, max_points=100)
    seen: list[Snapshot] = []
    stop = asyncio.Event()

    async def on_snapshot(snap: Snapshot) -> None:
        seen.append(snap)
        if len(seen) == 3:
            stop.set()

    await asyncio.wait_for(
        sampler.run(history, on_snapshot, interval_ms=lambda: 10, stop=stop), timeout=2
    )
    assert len(seen) == 3
    assert [p.ts_ms for p in history.points()] == [s.ts_ms for s in seen]


async def test_run_rereads_the_interval_every_cycle() -> None:
    sampler = make_sampler()
    calls = 0
    stop = asyncio.Event()

    def interval() -> int:
        nonlocal calls
        calls += 1
        if calls == 2:
            stop.set()
        return 10

    async def ignore(_: Snapshot) -> None:
        return None

    await asyncio.wait_for(
        sampler.run(History(window_ms=1000, max_points=10), ignore, interval, stop=stop), timeout=2
    )
    assert calls == 2
