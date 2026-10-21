from pathlib import Path

import pytest

from memmon.alerts import AlertEngine
from memmon.history import History
from memmon.hub import Hub
from memmon.settings import Settings, SettingsError, SettingsStore
from tests.factories import make_snapshot


def make_hub(tmp_path: Path, queue_size: int = 8) -> Hub:
    return Hub(
        store=SettingsStore(tmp_path / "s.json"),
        history=History(window_ms=60_000, max_points=100),
        alerts=AlertEngine(cooldown_ms=0),
        queue_size=queue_size,
    )


async def test_hello_carries_settings_history_and_latest_snapshot(tmp_path: Path) -> None:
    hub = make_hub(tmp_path)
    snap = make_snapshot(ts_ms=5)
    hub.history.append(snap.to_point())
    await hub.publish(snap)
    hello = hub.hello()
    assert hello["type"] == "hello"
    assert hello["settings"]["intervalMs"] == 1000
    assert hello["history"] == [{"tsMs": 5, "ramPct": 25.0, "vramPct": 25.0}]
    assert hello["snapshot"]["host"]["memory"]["usedBytes"] == 16 * 1024**3


async def test_publish_sends_snapshots_to_every_subscriber(tmp_path: Path) -> None:
    hub = make_hub(tmp_path)
    with hub.subscribe() as first, hub.subscribe() as second:
        await hub.publish(make_snapshot(ts_ms=7))
        for queue in (first, second):
            message = queue.get_nowait()
            assert message["type"] == "snapshot"
            assert message["snapshot"]["tsMs"] == 7
            assert message["snapshot"]["ramPct"] == 25.0


async def test_unsubscribed_queues_receive_nothing(tmp_path: Path) -> None:
    hub = make_hub(tmp_path)
    with hub.subscribe() as queue:
        pass
    await hub.publish(make_snapshot())
    assert queue.empty()


async def test_alerts_are_published_after_the_snapshot(tmp_path: Path) -> None:
    hub = make_hub(tmp_path)
    with hub.subscribe() as queue:
        await hub.publish(make_snapshot(ram_pct=95))
        assert queue.get_nowait()["type"] == "snapshot"
        alert = queue.get_nowait()
    assert alert == {
        "type": "alert",
        "alert": {
            "metric": "ram",
            "pct": 95.0,
            "thresholdPct": 85,
            "tsMs": 1000,
            "message": "System RAM is at 95% (alert at 85%)",
        },
    }


async def test_a_slow_subscriber_loses_old_messages_not_new_ones(tmp_path: Path) -> None:
    hub = make_hub(tmp_path, queue_size=2)
    with hub.subscribe() as queue:
        for ts in (1, 2, 3):
            await hub.publish(make_snapshot(ts_ms=ts))
        assert [queue.get_nowait()["snapshot"]["tsMs"] for _ in range(2)] == [2, 3]


async def test_update_settings_saves_and_broadcasts(tmp_path: Path) -> None:
    hub = make_hub(tmp_path)
    with hub.subscribe() as queue:
        hub.update_settings({"interval_ms": 250})
        assert queue.get_nowait() == {"type": "settings", "settings": hub.hello()["settings"]}
    assert hub.settings.interval_ms == 250
    assert SettingsStore(tmp_path / "s.json").load().interval_ms == 250


async def test_invalid_settings_change_nothing(tmp_path: Path) -> None:
    hub = make_hub(tmp_path)
    with pytest.raises(SettingsError):
        hub.update_settings({"interval_ms": 1})
    assert hub.settings == Settings()
    assert not (tmp_path / "s.json").exists()


async def test_settings_are_loaded_from_the_store(tmp_path: Path) -> None:
    SettingsStore(tmp_path / "s.json").save(Settings(view_mode="compact"))
    assert make_hub(tmp_path).settings.view_mode == "compact"
