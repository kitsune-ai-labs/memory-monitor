from pathlib import Path
from typing import Any

import pytest

from memmon import __main__ as cli


def test_defaults_bind_to_loopback_only() -> None:
    args = cli.parse_args([])
    assert args.port == 8765
    assert args.dev is False


@pytest.mark.parametrize("port", ["80", "70000", "abc"])
def test_rejects_unsafe_or_invalid_ports(port: str) -> None:
    with pytest.raises(SystemExit):
        cli.parse_args(["--port", port])


def test_main_serves_on_127_0_0_1_without_proxy_headers(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    captured: dict[str, Any] = {}

    def fake_run(app: object, **kwargs: Any) -> None:
        captured.update(kwargs, app=app)

    monkeypatch.setattr("memmon.__main__.uvicorn.run", fake_run)
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    cli.main(["--port", "9000"])
    assert captured["host"] == "127.0.0.1"
    assert captured["port"] == 9000
    assert captured["proxy_headers"] is False
    assert captured["server_header"] is False
    assert captured["ws_max_size"] <= 64 * 1024


def test_dev_mode_allows_the_vite_origin(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr("memmon.__main__.uvicorn.run", lambda app, **_: None)
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    assert cli.dev_origins(dev=True) == ("http://127.0.0.1:5173", "http://localhost:5173")
    assert cli.dev_origins(dev=False) == ()
