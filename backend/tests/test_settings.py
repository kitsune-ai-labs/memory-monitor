import json
import os
import stat
from pathlib import Path

import pytest

from memmon.settings import Settings, SettingsError, SettingsStore, default_settings_path


def test_defaults() -> None:
    assert Settings() == Settings(
        interval_ms=1000,
        range_s=60,
        ram_alert_pct=85,
        vram_alert_pct=90,
        alerts_enabled=True,
        view_mode="full",
    )


@pytest.mark.parametrize(
    "patch",
    [
        {"interval_ms": 100},
        {"interval_ms": "1000"},
        {"range_s": 30},
        {"ram_alert_pct": 49},
        {"vram_alert_pct": 100},
        {"ram_alert_pct": 85.5},
        {"alerts_enabled": "yes"},
        {"view_mode": "both"},
        {"unknown": 1},
    ],
)
def test_updates_are_strictly_validated(patch: dict[str, object]) -> None:
    with pytest.raises(SettingsError):
        Settings().updated(patch)


def test_update_changes_only_given_fields() -> None:
    updated = Settings().updated({"interval_ms": 250, "view_mode": "compact"})
    assert updated.interval_ms == 250
    assert updated.view_mode == "compact"
    assert updated.ram_alert_pct == 85


def test_default_path_follows_xdg_config_home(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("XDG_CONFIG_HOME", "/cfg")
    assert default_settings_path() == Path("/cfg/memmon/settings.json")
    monkeypatch.delenv("XDG_CONFIG_HOME")
    assert default_settings_path() == Path.home() / ".config/memmon/settings.json"


def test_missing_file_loads_defaults(tmp_path: Path) -> None:
    assert SettingsStore(tmp_path / "s.json").load() == Settings()


def test_round_trip(tmp_path: Path) -> None:
    store = SettingsStore(tmp_path / "memmon" / "s.json")
    saved = Settings(interval_ms=500, ram_alert_pct=70)
    store.save(saved)
    assert store.load() == saved


def test_saved_file_and_directory_are_private(tmp_path: Path) -> None:
    path = tmp_path / "memmon" / "s.json"
    SettingsStore(path).save(Settings())
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700


def test_save_leaves_no_temporary_files(tmp_path: Path) -> None:
    path = tmp_path / "s.json"
    SettingsStore(path).save(Settings())
    SettingsStore(path).save(Settings(interval_ms=250))
    assert os.listdir(tmp_path) == ["s.json"]


@pytest.mark.parametrize("content", ["not json", "[]", json.dumps({"interval_ms": 7})])
def test_corrupt_or_invalid_file_falls_back_to_defaults(tmp_path: Path, content: str) -> None:
    path = tmp_path / "s.json"
    path.write_text(content)
    assert SettingsStore(path).load() == Settings()


def test_refuses_to_read_through_a_symlink(tmp_path: Path) -> None:
    target = tmp_path / "elsewhere.json"
    target.write_text(Settings(interval_ms=250).model_dump_json())
    link = tmp_path / "s.json"
    link.symlink_to(target)
    assert SettingsStore(link).load() == Settings()


def test_refuses_oversized_files(tmp_path: Path) -> None:
    path = tmp_path / "s.json"
    path.write_text(" " * 100_000)
    assert SettingsStore(path).load() == Settings()
