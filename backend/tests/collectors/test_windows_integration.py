"""Runs the real PowerShell sampler. Only possible under WSL with Windows interop enabled."""

import shutil
from pathlib import Path

import pytest

from memmon.collectors.windows import (
    SAMPLER_SCRIPT,
    SamplerProcess,
    parse_windows_sample,
    powershell_argv,
    to_windows_path,
)

POWERSHELL = shutil.which("powershell.exe")

pytestmark = pytest.mark.skipif(POWERSHELL is None, reason="needs WSL with Windows interop")


async def test_real_sampler_reports_host_memory_and_processes() -> None:
    assert POWERSHELL is not None
    script = await to_windows_path(SAMPLER_SCRIPT)
    proc = SamplerProcess(powershell_argv(Path(POWERSHELL), script), timeout=20)
    try:
        lines = [await proc.request(), await proc.request()]
    finally:
        await proc.close()
    for line in lines:
        sample = parse_windows_sample(line, vram_total_bytes=1024**4)
        assert sample.memory.total_bytes > 1024**3
        assert 0 < sample.memory.used_bytes < sample.memory.total_bytes
        assert sample.top_ram, "expected at least one process"
        if sample.adapter is not None:
            assert sample.adapter.source == "windows"
            assert 0 < sample.adapter.used_bytes <= sample.adapter.total_bytes
