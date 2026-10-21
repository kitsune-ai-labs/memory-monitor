"""User settings: strictly validated, stored privately and written atomically."""

import logging
import os
import tempfile
from collections.abc import Mapping
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

log = logging.getLogger(__name__)

MAX_FILE_BYTES = 16 * 1024

IntervalMs = Literal[250, 500, 1000, 2000, 5000]
RangeS = Literal[60, 300, 900]
ViewMode = Literal["full", "compact"]
AlertPct = Annotated[int, Field(ge=50, le=99)]


class SettingsError(ValueError):
    """A settings update was rejected."""


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", strict=True)

    interval_ms: IntervalMs = 1000
    range_s: RangeS = 60
    ram_alert_pct: AlertPct = 85
    vram_alert_pct: AlertPct = 90
    alerts_enabled: bool = True
    view_mode: ViewMode = "full"

    def updated(self, patch: Mapping[str, object]) -> "Settings":
        """Return a copy with ``patch`` applied, validating the result as a whole."""
        try:
            return Settings.model_validate({**self.model_dump(), **patch})
        except ValidationError as exc:
            fields = ", ".join(str(err["loc"][0]) for err in exc.errors() if err["loc"])
            raise SettingsError(f"invalid settings: {fields or 'unknown field'}") from exc


def default_settings_path() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME")
    root = Path(base) if base else Path.home() / ".config"
    return root / "memmon" / "settings.json"


class SettingsStore:
    def __init__(self, path: Path) -> None:
        self._path = path

    def load(self) -> Settings:
        """Read settings, falling back to defaults if the file is missing, unsafe or invalid."""
        try:
            fd = os.open(self._path, os.O_RDONLY | os.O_NOFOLLOW)
        except FileNotFoundError:
            return Settings()
        except OSError as exc:
            log.warning("ignoring settings file %s: %s", self._path, exc.strerror)
            return Settings()
        with os.fdopen(fd, "rb") as file:
            data = file.read(MAX_FILE_BYTES + 1)
        if len(data) > MAX_FILE_BYTES:
            log.warning("ignoring oversized settings file %s", self._path)
            return Settings()
        try:
            return Settings.model_validate_json(data)
        except ValidationError:
            log.warning("ignoring invalid settings file %s", self._path)
            return Settings()

    def save(self, settings: Settings) -> None:
        """Write atomically: a crash mid-write never leaves a truncated file behind."""
        directory = self._path.parent
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=directory, prefix=".settings-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as file:
                file.write(settings.model_dump_json(indent=2))
                file.flush()
                os.fsync(file.fileno())
            os.replace(tmp, self._path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
