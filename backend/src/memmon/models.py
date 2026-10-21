"""Immutable data shapes passed between collectors, the sampler and the API."""

from pydantic import BaseModel, ConfigDict, Field


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class GpuStats(_Frozen):
    name: str
    used_bytes: int = Field(ge=0)
    total_bytes: int = Field(gt=0)
    util_pct: float | None = Field(default=None, ge=0, le=100)
    temp_c: float | None = Field(default=None, ge=-50, le=150)
    power_w: float | None = Field(default=None, ge=0, le=5000)
