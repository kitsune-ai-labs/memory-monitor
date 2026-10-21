"""Builders for test data."""

from memmon.models import GpuStats, HostMemory, HostSample, ProcessMemory, Snapshot

GIB = 1024**3


def make_snapshot(ts_ms: int = 1_000, ram_pct: float = 25, vram_pct: float = 25) -> Snapshot:
    total = 64 * GIB
    return Snapshot(
        ts_ms=ts_ms,
        gpu=GpuStats(
            name="GPU",
            used_bytes=int(32 * GIB * vram_pct / 100),
            total_bytes=32 * GIB,
            util_pct=10,
            temp_c=40,
            power_w=50,
        ),
        host=HostSample(
            memory=HostMemory(
                total_bytes=total,
                available_bytes=int(total * (100 - ram_pct) / 100),
                committed_bytes=20 * GIB,
                commit_limit_bytes=72 * GIB,
                cache_bytes=GIB,
            ),
            top_ram=(ProcessMemory(name="chrome", bytes=2 * GIB, count=3),),
            top_vram=(ProcessMemory(name="python", bytes=GIB, count=1),),
        ),
    )
