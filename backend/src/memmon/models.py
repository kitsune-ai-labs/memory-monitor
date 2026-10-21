"""Immutable data shapes passed between collectors, the sampler and the API."""

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class GpuStats(_Frozen):
    name: str
    used_bytes: int = Field(ge=0)
    total_bytes: int = Field(gt=0)
    util_pct: float | None = Field(default=None, ge=0, le=100)
    temp_c: float | None = Field(default=None, ge=-50, le=150)
    power_w: float | None = Field(default=None, ge=0, le=5000)


class HostMemory(_Frozen):
    total_bytes: int = Field(gt=0)
    available_bytes: int = Field(ge=0)
    committed_bytes: int = Field(ge=0)
    commit_limit_bytes: int = Field(ge=0)
    cache_bytes: int = Field(ge=0)

    @model_validator(mode="after")
    def _within_total(self) -> "HostMemory":
        if self.available_bytes > self.total_bytes:
            raise ValueError("available memory exceeds total memory")
        return self

    @computed_field  # type: ignore[prop-decorator]
    @property
    def used_bytes(self) -> int:
        return self.total_bytes - self.available_bytes


class ProcessMemory(_Frozen):
    """Memory used by all processes sharing one executable name."""

    name: str = Field(min_length=1, max_length=64)
    bytes: int = Field(ge=0)
    count: int = Field(ge=1)


class HostSample(_Frozen):
    memory: HostMemory
    top_ram: tuple[ProcessMemory, ...]
    top_vram: tuple[ProcessMemory, ...]


class HistoryPoint(_Frozen):
    ts_ms: int
    ram_pct: float | None
    vram_pct: float | None


def _pct(used: int, total: int) -> float:
    return used / total * 100


class Snapshot(_Frozen):
    """Everything collected in one sampling cycle. A source that failed is ``None``."""

    ts_ms: int
    gpu: GpuStats | None
    host: HostSample | None
    errors: tuple[str, ...] = ()

    @computed_field  # type: ignore[prop-decorator]
    @property
    def ram_pct(self) -> float | None:
        if self.host is None:
            return None
        return _pct(self.host.memory.used_bytes, self.host.memory.total_bytes)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def vram_pct(self) -> float | None:
        return None if self.gpu is None else _pct(self.gpu.used_bytes, self.gpu.total_bytes)

    def to_point(self) -> HistoryPoint:
        return HistoryPoint(ts_ms=self.ts_ms, ram_pct=self.ram_pct, vram_pct=self.vram_pct)
