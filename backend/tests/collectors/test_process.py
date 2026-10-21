import os
import stat
import sys
from pathlib import Path

import pytest

from memmon.collectors.nvidia import read_nvidia_smi
from memmon.collectors.windows import (
    SAMPLER_SCRIPT,
    SamplerProcess,
    powershell_argv,
    to_windows_path,
)
from memmon.errors import CollectorError

FAKE_SAMPLER = Path(__file__).with_name("fake_sampler.py")


def fake_binary(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "fake-nvidia-smi"
    path.write_text(f"#!/bin/sh\n{body}\n")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


async def test_read_nvidia_smi_runs_the_binary_and_parses_its_output(tmp_path: Path) -> None:
    binary = fake_binary(tmp_path, 'echo "GPU A, 10, 100, 5, 40, 60"')
    stats = await read_nvidia_smi(binary)
    assert stats.name == "GPU A"


async def test_read_nvidia_smi_passes_fixed_arguments(tmp_path: Path) -> None:
    binary = fake_binary(
        tmp_path, 'printf "%s\\n" "$@" > "$(dirname "$0")/args"; echo "G, 1, 2, 3, 4, 5"'
    )
    await read_nvidia_smi(binary)
    assert (tmp_path / "args").read_text().splitlines() == [
        "--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu,power.draw",
        "--format=csv,noheader,nounits",
    ]


async def test_read_nvidia_smi_fails_on_nonzero_exit(tmp_path: Path) -> None:
    binary = fake_binary(tmp_path, "exit 9")
    with pytest.raises(CollectorError, match="exit"):
        await read_nvidia_smi(binary)


async def test_read_nvidia_smi_times_out(tmp_path: Path) -> None:
    binary = fake_binary(tmp_path, "exec sleep 30")
    with pytest.raises(CollectorError, match="timed out"):
        await read_nvidia_smi(binary, time_limit=0.2)


async def test_read_nvidia_smi_reports_a_missing_binary(tmp_path: Path) -> None:
    with pytest.raises(CollectorError, match="not found"):
        await read_nvidia_smi(tmp_path / "missing")


def test_powershell_argv_is_fixed_and_runs_without_profile() -> None:
    assert powershell_argv(Path("/mnt/c/Windows/powershell.exe"), r"\\wsl.localhost\x\s.ps1") == (
        "/mnt/c/Windows/powershell.exe",
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        r"\\wsl.localhost\x\s.ps1",
    )


def fake_argv(mode: str) -> tuple[str, ...]:
    return (sys.executable, "-I", str(FAKE_SAMPLER), mode)


async def test_sampler_process_returns_one_line_per_request() -> None:
    proc = SamplerProcess(fake_argv("ok"))
    try:
        first = await proc.request()
        second = await proc.request()
    finally:
        await proc.close()
    assert first == second == '{"v": 1, "fake": true}'


async def test_sampler_process_times_out_and_recovers_on_next_request() -> None:
    proc = SamplerProcess(fake_argv("hang"), timeout=0.3)
    try:
        with pytest.raises(CollectorError, match="timed out"):
            await proc.request()
        assert proc.pid is None
    finally:
        await proc.close()


async def test_sampler_process_reports_a_dead_sampler_then_restarts() -> None:
    proc = SamplerProcess(fake_argv("die"))
    try:
        with pytest.raises(CollectorError, match="exited"):
            await proc.request()
        with pytest.raises(CollectorError, match="exited"):
            await proc.request()
    finally:
        await proc.close()


async def test_close_stops_the_sampler() -> None:
    proc = SamplerProcess(fake_argv("ok"))
    await proc.request()
    pid = proc.pid
    assert pid is not None
    await proc.close()
    assert proc.pid is None
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)


async def test_close_without_start_is_harmless() -> None:
    await SamplerProcess(fake_argv("ok")).close()


async def test_read_nvidia_smi_rejects_oversized_output(tmp_path: Path) -> None:
    binary = fake_binary(tmp_path, "head -c 100000 /dev/zero | tr '\\0' 'x'")
    with pytest.raises(CollectorError, match="too large"):
        await read_nvidia_smi(binary)


async def test_sampler_process_rejects_oversized_lines() -> None:
    proc = SamplerProcess(fake_argv("huge"))
    try:
        with pytest.raises(CollectorError, match="too long"):
            await proc.request()
        assert proc.pid is None
    finally:
        await proc.close()


async def test_sampler_process_reports_a_missing_executable(tmp_path: Path) -> None:
    proc = SamplerProcess((str(tmp_path / "missing.exe"),))
    with pytest.raises(CollectorError, match="could not start"):
        await proc.request()


async def test_close_kills_a_sampler_that_ignores_quit() -> None:
    proc = SamplerProcess(fake_argv("stubborn"))
    await proc.request()
    await proc.close()
    assert proc.pid is None


async def test_to_windows_path_reports_a_missing_wslpath(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PATH", "")
    with pytest.raises(CollectorError, match="wslpath"):
        await to_windows_path(Path("/tmp/x.ps1"))


def test_sampler_script_ships_with_the_package() -> None:
    assert SAMPLER_SCRIPT.is_file()
    assert SAMPLER_SCRIPT.suffix == ".ps1"
