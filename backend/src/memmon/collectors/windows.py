"""Host RAM and per-process memory from the Windows sampler.

The sampler (``windows_sampler.ps1``) runs under ``powershell.exe`` on the Windows host and writes
one JSON object per line. Everything it sends is treated as untrusted: lines are size-limited,
validated against a strict schema, and process names are sanitized before they reach the UI.
"""

import asyncio
import json
import shutil
import unicodedata
from collections import defaultdict
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pydantic.alias_generators import to_camel

from memmon.errors import CollectorError
from memmon.models import HostMemory, HostSample, ProcessMemory

SAMPLER_SCRIPT = Path(__file__).with_name("windows_sampler.ps1")
MAX_LINE_CHARS = 1_048_576
MAX_PROCESSES = 4096
MAX_NAME_CHARS = 64
_MAX_ERROR_CHARS = 200

_NonNegative = Annotated[int, Field(ge=0)]


class _Wire(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, alias_generator=to_camel)


class _WireMemory(_Wire):
    total_bytes: _NonNegative
    available_bytes: _NonNegative
    committed_bytes: _NonNegative
    commit_limit_bytes: _NonNegative
    cache_bytes: _NonNegative


class _WireProcess(_Wire):
    pid: _NonNegative
    name: Annotated[str, Field(max_length=1024)]
    bytes: _NonNegative


class _WireSample(_Wire):
    v: Literal[1]
    mem: _WireMemory
    procs: Annotated[list[_WireProcess], Field(max_length=MAX_PROCESSES)]
    gpu_procs: Annotated[list[_WireProcess], Field(max_length=MAX_PROCESSES)]


def sanitize_name(raw: str) -> str:
    """Drop control and formatting characters (including bidi overrides) and cap the length."""
    cleaned = "".join(ch for ch in raw if not unicodedata.category(ch).startswith("C"))
    return cleaned.strip()[:MAX_NAME_CHARS] or "unknown"


def _top_by_name(
    procs: Iterable[_WireProcess], *, top_n: int, max_bytes: int | None = None
) -> tuple[ProcessMemory, ...]:
    totals: dict[str, int] = defaultdict(int)
    pids: dict[str, set[int]] = defaultdict(set)
    for proc in procs:
        if proc.bytes == 0 or (max_bytes is not None and proc.bytes > max_bytes):
            continue
        name = sanitize_name(proc.name)
        totals[name] += proc.bytes
        pids[name].add(proc.pid)
    ranked = sorted(totals.items(), key=lambda item: item[1], reverse=True)[:top_n]
    return tuple(
        ProcessMemory(name=name, bytes=total, count=len(pids[name])) for name, total in ranked
    )


def parse_windows_sample(line: str, *, vram_total_bytes: int, top_n: int = 10) -> HostSample:
    """Parse and validate one line of sampler output.

    GPU readings larger than the card's total VRAM are dropped: the Windows
    "GPU Process Memory" counter occasionally reports nonsense values for some processes.
    """
    if len(line) > MAX_LINE_CHARS:
        raise CollectorError("sampler line too long")
    try:
        raw = json.loads(line)
    except json.JSONDecodeError as exc:
        raise CollectorError("sampler line is not JSON") from exc
    if isinstance(raw, dict) and set(raw) == {"v", "error"}:
        raise CollectorError(f"sampler error: {str(raw['error'])[:_MAX_ERROR_CHARS]}")
    try:
        wire = _WireSample.model_validate(raw)
        memory = HostMemory(
            total_bytes=wire.mem.total_bytes,
            available_bytes=wire.mem.available_bytes,
            committed_bytes=wire.mem.committed_bytes,
            commit_limit_bytes=wire.mem.commit_limit_bytes,
            cache_bytes=wire.mem.cache_bytes,
        )
    except ValidationError as exc:
        raise CollectorError(f"invalid sampler line: {exc.error_count()} errors") from exc
    return HostSample(
        memory=memory,
        top_ram=_top_by_name(wire.procs, top_n=top_n),
        top_vram=_top_by_name(wire.gpu_procs, top_n=top_n, max_bytes=vram_total_bytes),
    )


async def to_windows_path(path: Path) -> str:
    """Translate a WSL path to the Windows path powershell.exe needs, using ``wslpath -w``."""
    wslpath = shutil.which("wslpath")
    if wslpath is None:
        raise CollectorError("wslpath not found; is this running under WSL?")
    proc = await asyncio.create_subprocess_exec(
        wslpath,
        "-w",
        str(path),
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    out, _ = await proc.communicate()
    if proc.returncode != 0 or not out.strip():
        raise CollectorError(f"wslpath could not translate {path}")
    return out.decode("utf-8").strip()


def powershell_argv(powershell: Path, script_windows_path: str) -> tuple[str, ...]:
    """The fixed command line that starts the sampler.

    ``-ExecutionPolicy Bypass`` applies to this one process only; it does not change the
    machine's policy.
    """
    return (
        str(powershell),
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script_windows_path,
    )


class SamplerProcess:
    """A long-lived sampler driven over stdin: send ``s`` for a sample line, ``q`` to quit.

    Starting PowerShell takes about a second, so the process is kept alive between samples.
    If it hangs or exits, it is killed and started again on the next request.
    """

    def __init__(self, argv: Sequence[str], *, timeout: float = 5.0) -> None:
        self._argv = tuple(argv)
        self._timeout = timeout
        self._proc: asyncio.subprocess.Process | None = None
        self._lock = asyncio.Lock()

    @property
    def pid(self) -> int | None:
        return self._proc.pid if self._proc else None

    async def _ensure_started(self) -> asyncio.subprocess.Process:
        if self._proc is None or self._proc.returncode is not None:
            try:
                self._proc = await asyncio.create_subprocess_exec(
                    *self._argv,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                    limit=MAX_LINE_CHARS + 1,
                )
            except OSError as exc:
                raise CollectorError(f"could not start sampler: {self._argv[0]}") from exc
        return self._proc

    async def _kill(self) -> None:
        proc, self._proc = self._proc, None
        if proc is not None and proc.returncode is None:
            proc.kill()
            await proc.wait()

    async def request(self) -> str:
        async with self._lock:
            proc = await self._ensure_started()
            if proc.stdin is None or proc.stdout is None:
                raise CollectorError("sampler pipes are not open")
            try:
                proc.stdin.write(b"s\n")
                await proc.stdin.drain()
                raw = await asyncio.wait_for(proc.stdout.readline(), self._timeout)
            except TimeoutError as exc:
                await self._kill()
                raise CollectorError("sampler timed out") from exc
            except (BrokenPipeError, ConnectionResetError) as exc:
                await self._kill()
                raise CollectorError("sampler exited") from exc
            except ValueError as exc:
                await self._kill()
                raise CollectorError("sampler line too long") from exc
            if not raw:
                await self._kill()
                raise CollectorError("sampler exited")
            return raw.decode("utf-8", errors="replace").rstrip("\r\n")

    async def close(self) -> None:
        async with self._lock:
            proc = self._proc
            if proc is not None and proc.returncode is None and proc.stdin is not None:
                try:
                    proc.stdin.write(b"q\n")
                    await proc.stdin.drain()
                    await asyncio.wait_for(proc.wait(), 1.0)
                except (TimeoutError, BrokenPipeError, ConnectionResetError):
                    pass
            await self._kill()


class WindowsHostReader:
    """Starts the sampler on first use and returns one raw sample line per call."""

    def __init__(self, powershell: Path | None, *, timeout: float = 10.0) -> None:
        self._powershell = powershell
        self._timeout = timeout
        self._process: SamplerProcess | None = None

    async def __call__(self) -> str:
        if self._powershell is None:
            raise CollectorError("powershell.exe not found; is WSL Windows interop enabled?")
        if self._process is None:
            script = await to_windows_path(SAMPLER_SCRIPT)
            argv = powershell_argv(self._powershell, script)
            self._process = SamplerProcess(argv, timeout=self._timeout)
        return await self._process.request()

    async def close(self) -> None:
        if self._process is not None:
            await self._process.close()
