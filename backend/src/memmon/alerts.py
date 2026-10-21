"""Decides when crossing a usage threshold should notify the user.

An alert fires when usage reaches its threshold, then disarms until usage falls below the
threshold minus a hysteresis band. A cooldown also limits how often one metric can alert, so a
value hovering around the threshold does not spam notifications.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from memmon.models import Snapshot
from memmon.settings import Settings

Metric = Literal["ram", "vram"]
_LABELS: dict[Metric, str] = {"ram": "System RAM", "vram": "GPU VRAM"}


class Alert(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    metric: Metric
    pct: float
    threshold_pct: int
    ts_ms: int
    message: str


class AlertEngine:
    def __init__(self, *, cooldown_ms: int = 60_000, hysteresis_pct: float = 5.0) -> None:
        self._cooldown_ms = cooldown_ms
        self._hysteresis_pct = hysteresis_pct
        self._armed: dict[Metric, bool] = {"ram": True, "vram": True}
        self._last_fired_ms: dict[Metric, int | None] = {"ram": None, "vram": None}

    def evaluate(self, snapshot: Snapshot, settings: Settings) -> list[Alert]:
        if not settings.alerts_enabled:
            return []
        readings: tuple[tuple[Metric, float | None, int], ...] = (
            ("ram", snapshot.ram_pct, settings.ram_alert_pct),
            ("vram", snapshot.vram_pct, settings.vram_alert_pct),
        )
        alerts: list[Alert] = []
        for metric, pct, threshold in readings:
            alert = self._check(metric, pct, threshold, snapshot.ts_ms)
            if alert is not None:
                alerts.append(alert)
        return alerts

    def _check(self, metric: Metric, pct: float | None, threshold: int, ts_ms: int) -> Alert | None:
        if pct is None:
            return None
        if pct < threshold - self._hysteresis_pct:
            self._armed[metric] = True
            return None
        if pct < threshold or not self._armed[metric]:
            return None
        self._armed[metric] = False
        last = self._last_fired_ms[metric]
        if last is not None and ts_ms - last < self._cooldown_ms:
            return None
        self._last_fired_ms[metric] = ts_ms
        return Alert(
            metric=metric,
            pct=round(pct, 1),
            threshold_pct=threshold,
            ts_ms=ts_ms,
            message=f"{_LABELS[metric]} is at {pct:.0f}% (alert at {threshold}%)",
        )
