from memmon.alerts import AlertEngine
from memmon.models import GpuStats, HostMemory, HostSample, Snapshot
from memmon.settings import Settings

GIB = 1024**3


def snap(ts_ms: int, ram_pct: float | None = 10, vram_pct: float | None = 10) -> Snapshot:
    host = None
    if ram_pct is not None:
        total = 100 * GIB
        host = HostSample(
            memory=HostMemory(
                total_bytes=total,
                available_bytes=int(total * (100 - ram_pct) / 100),
                committed_bytes=0,
                commit_limit_bytes=0,
                cache_bytes=0,
            ),
            top_ram=(),
            top_vram=(),
        )
    gpu = None
    if vram_pct is not None:
        gpu = GpuStats(name="G", used_bytes=int(vram_pct * GIB), total_bytes=100 * GIB)
    return Snapshot(ts_ms=ts_ms, gpu=gpu, host=host)


SETTINGS = Settings(ram_alert_pct=80, vram_alert_pct=90)


def test_no_alert_below_threshold() -> None:
    assert AlertEngine().evaluate(snap(0, ram_pct=79), SETTINGS) == []


def test_alerts_when_crossing_a_threshold() -> None:
    alerts = AlertEngine().evaluate(snap(0, ram_pct=81, vram_pct=95), SETTINGS)
    assert [(a.metric, a.threshold_pct) for a in alerts] == [("ram", 80), ("vram", 90)]
    assert alerts[0].pct == 81.0
    assert alerts[0].ts_ms == 0
    assert alerts[0].message == "System RAM is at 81% (alert at 80%)"
    assert alerts[1].message == "GPU VRAM is at 95% (alert at 90%)"


def test_does_not_repeat_while_usage_stays_high() -> None:
    engine = AlertEngine(cooldown_ms=60_000)
    assert engine.evaluate(snap(0, ram_pct=85), SETTINGS)
    assert engine.evaluate(snap(1_000, ram_pct=90), SETTINGS) == []
    assert engine.evaluate(snap(120_000, ram_pct=90), SETTINGS) == []


def test_rearms_only_after_dropping_below_the_hysteresis_band() -> None:
    engine = AlertEngine(cooldown_ms=0, hysteresis_pct=5)
    assert engine.evaluate(snap(0, ram_pct=85), SETTINGS)
    assert engine.evaluate(snap(1, ram_pct=77), SETTINGS) == []
    assert engine.evaluate(snap(2, ram_pct=85), SETTINGS) == []
    assert engine.evaluate(snap(3, ram_pct=74), SETTINGS) == []
    assert engine.evaluate(snap(4, ram_pct=85), SETTINGS)


def test_cooldown_suppresses_flapping() -> None:
    engine = AlertEngine(cooldown_ms=60_000, hysteresis_pct=5)
    assert engine.evaluate(snap(0, ram_pct=85), SETTINGS)
    assert engine.evaluate(snap(1_000, ram_pct=50), SETTINGS) == []
    assert engine.evaluate(snap(2_000, ram_pct=85), SETTINGS) == []
    engine.evaluate(snap(30_000, ram_pct=50), SETTINGS)
    assert engine.evaluate(snap(61_000, ram_pct=85), SETTINGS)


def test_metrics_are_independent() -> None:
    engine = AlertEngine(cooldown_ms=60_000)
    assert [a.metric for a in engine.evaluate(snap(0, ram_pct=85), SETTINGS)] == ["ram"]
    assert [a.metric for a in engine.evaluate(snap(1, ram_pct=85, vram_pct=95), SETTINGS)] == [
        "vram"
    ]


def test_missing_readings_change_nothing() -> None:
    engine = AlertEngine(cooldown_ms=0)
    assert engine.evaluate(snap(0, ram_pct=85), SETTINGS)
    assert engine.evaluate(snap(1, ram_pct=None, vram_pct=None), SETTINGS) == []
    assert engine.evaluate(snap(2, ram_pct=85), SETTINGS) == []


def test_disabled_alerts_never_fire() -> None:
    off = SETTINGS.updated({"alerts_enabled": False})
    assert AlertEngine().evaluate(snap(0, ram_pct=99, vram_pct=99), off) == []


def test_raising_the_threshold_above_current_usage_rearms() -> None:
    engine = AlertEngine(cooldown_ms=0, hysteresis_pct=5)
    assert engine.evaluate(snap(0, ram_pct=85), SETTINGS)
    higher = SETTINGS.updated({"ram_alert_pct": 95})
    assert engine.evaluate(snap(1, ram_pct=85), higher) == []
    assert engine.evaluate(snap(2, ram_pct=96), higher)
