import io
import signal
import socket
from pathlib import Path
from typing import Any

import pytest

from memmon import __main__ as cli


@pytest.fixture(autouse=True)
def _assume_port_free(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep these tests independent of whatever is running on this machine."""
    if "already_in_use" not in request.node.name:
        monkeypatch.setattr("memmon.__main__.port_available", lambda port: True)


def test_defaults_bind_to_loopback_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MEMMON_PORT", raising=False)
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


def test_watch_stdin_calls_back_once_input_closes() -> None:
    calls: list[str] = []
    cli.watch_stdin(io.BytesIO(b"ignored\nlines\n"), lambda: calls.append("eof"))
    assert calls == ["eof"]


def test_exit_on_eof_starts_the_watcher(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    started: list[bool] = []
    monkeypatch.setattr("memmon.__main__.uvicorn.run", lambda app, **_: None)
    monkeypatch.setattr(cli, "start_eof_watch", lambda: started.append(True))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    cli.main(["--exit-on-eof"])
    assert started == [True]


def test_no_watcher_by_default(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    started: list[bool] = []
    monkeypatch.setattr("memmon.__main__.uvicorn.run", lambda app, **_: None)
    monkeypatch.setattr(cli, "start_eof_watch", lambda: started.append(True))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    cli.main([])
    assert started == []


def test_eof_requests_a_graceful_shutdown(monkeypatch: pytest.MonkeyPatch) -> None:
    signals: list[int] = []
    monkeypatch.setattr("memmon.__main__.os.kill", lambda pid, sig: signals.append(sig))
    cli.request_shutdown()
    assert signals == [signal.SIGINT]


def test_port_can_come_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEMMON_PORT", "8766")
    assert cli.parse_args([]).port == 8766
    assert cli.parse_args(["--port", "9000"]).port == 9000


def test_invalid_port_in_the_environment_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEMMON_PORT", "80")
    with pytest.raises(SystemExit):
        cli.parse_args([])


def test_explains_a_port_that_is_already_in_use(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr("memmon.__main__.uvicorn.run", lambda app, **_: None)
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    with socket.socket() as busy:
        busy.bind(("127.0.0.1", 0))
        busy.listen()
        port = busy.getsockname()[1]
        if port < 1024:
            pytest.skip("ephemeral port below 1024")
        with pytest.raises(SystemExit) as excinfo:
            cli.main(["--port", str(port)])
    assert excinfo.value.code == 2
    err = capsys.readouterr().err
    assert f"port {port} is already in use" in err
    assert "desktop app" in err
    assert "MEMMON_PORT" in err
