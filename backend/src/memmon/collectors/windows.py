"""Host RAM and per-process memory from the Windows sampler.

The sampler (``windows_sampler.ps1``) runs under ``powershell.exe`` on the Windows host and writes
one JSON object per line. Everything it sends is treated as untrusted: lines are size-limited,
validated against a strict schema, and process names are sanitized before they reach the UI.
"""

import json
import unicodedata
from collections import defaultdict
from collections.abc import Iterable
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pydantic.alias_generators import to_camel

from memmon.errors import CollectorError
from memmon.models import HostMemory, HostSample, ProcessMemory

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
