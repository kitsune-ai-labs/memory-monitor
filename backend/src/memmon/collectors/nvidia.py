"""GPU statistics from ``nvidia-smi``.

Under WSL, ``nvidia-smi`` reports the whole physical GPU, including memory used by Windows
processes, so it is the source for VRAM, utilization, temperature and power.
"""

import math

from pydantic import ValidationError

from memmon.errors import CollectorError
from memmon.models import GpuStats

NVIDIA_SMI_ARGS = (
    "--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu,power.draw",
    "--format=csv,noheader,nounits",
)
_FIELD_COUNT = 6
_MIB = 1024 * 1024
_NOT_AVAILABLE = "[N/A]"


def _number(raw: str) -> float:
    try:
        value = float(raw)
    except ValueError as exc:
        raise CollectorError(f"not a number: {raw!r}") from exc
    if not math.isfinite(value):
        raise CollectorError(f"not a finite number: {raw!r}")
    return value


def _optional_number(raw: str) -> float | None:
    return None if raw == _NOT_AVAILABLE else _number(raw)


def parse_nvidia_smi(output: str) -> GpuStats:
    """Parse the first GPU line of ``nvidia-smi`` CSV output produced with NVIDIA_SMI_ARGS."""
    lines = [line for line in output.splitlines() if line.strip()]
    if not lines:
        raise CollectorError("nvidia-smi returned no GPU lines")
    fields = [field.strip() for field in lines[0].split(",")]
    if len(fields) != _FIELD_COUNT:
        raise CollectorError(f"expected {_FIELD_COUNT} fields, got {len(fields)}")
    name, used, total, util, temp, power = fields
    used_bytes = int(_number(used) * _MIB)
    total_bytes = int(_number(total) * _MIB)
    if used_bytes > total_bytes:
        raise CollectorError("used VRAM exceeds total VRAM")
    try:
        return GpuStats(
            name=name,
            used_bytes=used_bytes,
            total_bytes=total_bytes,
            util_pct=_optional_number(util),
            temp_c=_optional_number(temp),
            power_w=_optional_number(power),
        )
    except ValidationError as exc:
        raise CollectorError(f"implausible GPU values: {exc.error_count()} errors") from exc
