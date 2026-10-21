import json
from typing import Any

import pytest

from memmon.collectors.windows import MAX_LINE_CHARS, parse_windows_sample
from memmon.errors import CollectorError
from memmon.models import GpuStats, HostMemory, ProcessMemory

GIB = 1024**3
VRAM_TOTAL = 32 * GIB


def sample(**overrides: Any) -> str:
    body: dict[str, Any] = {
        "v": 1,
        "mem": {
            "totalBytes": 64 * GIB,
            "availableBytes": 40 * GIB,
            "committedBytes": 30 * GIB,
            "commitLimitBytes": 72 * GIB,
            "cacheBytes": 2 * GIB,
        },
        "procs": [],
        "gpuProcs": [],
    }
    body.update(overrides)
    return json.dumps(body)


def test_parses_host_memory() -> None:
    result = parse_windows_sample(sample(), vram_total_bytes=VRAM_TOTAL)
    assert result.memory == HostMemory(
        total_bytes=64 * GIB,
        available_bytes=40 * GIB,
        committed_bytes=30 * GIB,
        commit_limit_bytes=72 * GIB,
        cache_bytes=2 * GIB,
    )
    assert result.memory.used_bytes == 24 * GIB


def test_groups_ram_processes_by_name_largest_first() -> None:
    procs = [
        {"pid": 1, "name": "chrome.exe", "bytes": 1 * GIB},
        {"pid": 2, "name": "Code.exe", "bytes": 3 * GIB},
        {"pid": 3, "name": "chrome.exe", "bytes": 4 * GIB},
    ]
    result = parse_windows_sample(sample(procs=procs), vram_total_bytes=VRAM_TOTAL)
    assert result.top_ram == (
        ProcessMemory(name="chrome.exe", bytes=5 * GIB, count=2),
        ProcessMemory(name="Code.exe", bytes=3 * GIB, count=1),
    )


def test_limits_each_list_to_top_n() -> None:
    procs = [{"pid": i, "name": f"p{i}.exe", "bytes": i * 1000} for i in range(1, 20)]
    result = parse_windows_sample(sample(procs=procs), vram_total_bytes=VRAM_TOTAL, top_n=3)
    assert [p.name for p in result.top_ram] == ["p19.exe", "p18.exe", "p17.exe"]


def test_gpu_processes_are_summed_per_name_and_bogus_readings_dropped() -> None:
    gpu = [
        {"pid": 10, "name": "python.exe", "bytes": 2 * GIB},
        {"pid": 10, "name": "python.exe", "bytes": 1 * GIB},
        {"pid": 11, "name": "dwm.exe", "bytes": 200 * 1024**2},
        {"pid": 12, "name": "ghost.exe", "bytes": 1_787_531_845_632},
        {"pid": 13, "name": "idle.exe", "bytes": 0},
    ]
    result = parse_windows_sample(sample(gpuProcs=gpu), vram_total_bytes=VRAM_TOTAL)
    assert result.top_vram == (
        ProcessMemory(name="python.exe", bytes=3 * GIB, count=1),
        ProcessMemory(name="dwm.exe", bytes=200 * 1024**2, count=1),
    )


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("evil\x1b[31m.exe", "evil[31m.exe"),
        ("rtl‮txt.exe", "rtltxt.exe"),
        ("x" * 200, "x" * 64),
        ("   ", "unknown"),
    ],
)
def test_process_names_are_sanitized(raw: str, expected: str) -> None:
    procs = [{"pid": 1, "name": raw, "bytes": 1}]
    result = parse_windows_sample(sample(procs=procs), vram_total_bytes=VRAM_TOTAL)
    assert result.top_ram[0].name == expected


def test_sampler_error_lines_raise_with_the_reported_message() -> None:
    with pytest.raises(CollectorError, match="counter unavailable"):
        parse_windows_sample(
            json.dumps({"v": 1, "error": "counter unavailable"}), vram_total_bytes=VRAM_TOTAL
        )


@pytest.mark.parametrize(
    "line",
    [
        "",
        "not json",
        "[]",
        sample(v=2),
        sample(extra="field"),
        sample(procs=[{"pid": 1, "name": "a", "bytes": -5}]),
        sample(procs=[{"pid": "1", "name": "a", "bytes": 5}]),
        sample(mem={"totalBytes": 1}),
        sample(
            mem={
                "totalBytes": 10,
                "availableBytes": 20,
                "committedBytes": 1,
                "commitLimitBytes": 1,
                "cacheBytes": 1,
            }
        ),
    ],
)
def test_rejects_malformed_samples(line: str) -> None:
    with pytest.raises(CollectorError):
        parse_windows_sample(line, vram_total_bytes=VRAM_TOTAL)


def test_rejects_oversized_lines_before_parsing() -> None:
    with pytest.raises(CollectorError, match="too long"):
        parse_windows_sample(" " * (MAX_LINE_CHARS + 1), vram_total_bytes=VRAM_TOTAL)


def test_rejects_too_many_processes() -> None:
    procs = [{"pid": i, "name": "p", "bytes": 1} for i in range(5001)]
    with pytest.raises(CollectorError):
        parse_windows_sample(sample(procs=procs), vram_total_bytes=VRAM_TOTAL)


ADAPTER = {
    "name": "AMD Radeon RX 7900 XTX",
    "dedicatedUsedBytes": 6 * GIB,
    "dedicatedTotalBytes": 24 * GIB,
}


def test_reports_the_windows_gpu_adapter_when_present() -> None:
    result = parse_windows_sample(sample(gpu=ADAPTER), vram_total_bytes=VRAM_TOTAL)
    assert result.adapter == GpuStats(
        name="AMD Radeon RX 7900 XTX",
        used_bytes=6 * GIB,
        total_bytes=24 * GIB,
        source="windows",
    )


def test_adapter_is_optional() -> None:
    assert parse_windows_sample(sample(), vram_total_bytes=VRAM_TOTAL).adapter is None
    assert parse_windows_sample(sample(gpu=None), vram_total_bytes=VRAM_TOTAL).adapter is None


def test_without_nvidia_the_adapter_total_bounds_process_readings() -> None:
    gpu = [
        {"pid": 1, "name": "game", "bytes": 20 * GIB},
        {"pid": 2, "name": "ghost", "bytes": 30 * GIB},
    ]
    result = parse_windows_sample(sample(gpu=ADAPTER, gpuProcs=gpu), vram_total_bytes=None)
    assert [p.name for p in result.top_vram] == ["game"]


def test_adapter_names_are_sanitized() -> None:
    adapter = {**ADAPTER, "name": "GPU\x1b[2J\u202e"}
    result = parse_windows_sample(sample(gpu=adapter), vram_total_bytes=VRAM_TOTAL)
    assert result.adapter is not None
    assert result.adapter.name == "GPU[2J"


@pytest.mark.parametrize(
    "adapter",
    [
        {**ADAPTER, "dedicatedUsedBytes": 30 * GIB},
        {**ADAPTER, "dedicatedTotalBytes": 0},
        {**ADAPTER, "extra": 1},
        {**ADAPTER, "dedicatedUsedBytes": "6"},
    ],
)
def test_rejects_implausible_adapters(adapter: dict[str, Any]) -> None:
    with pytest.raises(CollectorError):
        parse_windows_sample(sample(gpu=adapter), vram_total_bytes=VRAM_TOTAL)
