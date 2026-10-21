import asyncio
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketDenialResponse
from starlette.websockets import WebSocketDisconnect

from memmon.alerts import AlertEngine
from memmon.history import History
from memmon.hub import Hub
from memmon.server import MAX_CLIENT_MESSAGE_BYTES, create_app
from memmon.settings import SettingsStore
from tests.factories import make_snapshot

PORT = 8765
ORIGIN = f"http://127.0.0.1:{PORT}"
HOST = f"127.0.0.1:{PORT}"


def ws_headers(origin: str | None = ORIGIN) -> dict[str, str]:
    """Handshake headers a browser would send. The test client otherwise sends Host: testserver."""
    headers = {"host": HOST}
    if origin is not None:
        headers["origin"] = origin
    return headers


@pytest.fixture
def hub(tmp_path: Path) -> Hub:
    return Hub(
        store=SettingsStore(tmp_path / "s.json"),
        history=History(window_ms=60_000, max_points=100),
        alerts=AlertEngine(cooldown_ms=0),
    )


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    root = tmp_path / "dist"
    root.mkdir()
    (root / "index.html").write_text("<!doctype html><title>Memory Monitor</title>")
    return root


@pytest.fixture
def client(hub: Hub, static_dir: Path) -> Iterator[TestClient]:
    app = create_app(hub, port=PORT, static_dir=static_dir)
    with TestClient(app, base_url=ORIGIN) as test_client:
        yield test_client


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_security_headers_on_every_response(client: TestClient) -> None:
    for path in ("/api/health", "/"):
        headers = client.get(path).headers
        csp = headers["content-security-policy"]
        assert "default-src 'self'" in csp
        assert "frame-ancestors 'none'" in csp
        assert "object-src 'none'" in csp
        assert headers["x-content-type-options"] == "nosniff"
        assert headers["referrer-policy"] == "no-referrer"
        assert headers["x-frame-options"] == "DENY"
        assert headers["cross-origin-opener-policy"] == "same-origin"
        assert headers["cache-control"] == "no-store"


def test_serves_the_built_ui(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "Memory Monitor" in response.text


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_api_docs_are_disabled(client: TestClient, path: str) -> None:
    assert client.get(path).status_code == 404


@pytest.mark.parametrize("host", ["evil.example", "192.168.1.5:8765", "127.0.0.1.nip.io"])
def test_rejects_non_loopback_host_headers(client: TestClient, host: str) -> None:
    assert client.get("/api/health", headers={"host": host}).status_code == 400


@pytest.mark.parametrize(
    "origin",
    [None, "http://evil.example", "http://127.0.0.1:9999", "null", "https://127.0.0.1:8765"],
)
def test_websocket_rejects_foreign_origins(client: TestClient, origin: str | None) -> None:
    with (
        pytest.raises(WebSocketDenialResponse) as excinfo,
        client.websocket_connect("/ws", headers=ws_headers(origin)),
    ):
        pass
    assert excinfo.value.status_code == 403


def test_websocket_rejects_non_loopback_hosts(client: TestClient) -> None:
    with (
        pytest.raises(WebSocketDenialResponse) as excinfo,
        client.websocket_connect("/ws", headers={"host": "evil.example", "origin": ORIGIN}),
    ):
        pass
    assert excinfo.value.status_code == 400


def test_websocket_accepts_localhost_origin(client: TestClient) -> None:
    with client.websocket_connect("/ws", headers=ws_headers(f"http://localhost:{PORT}")) as ws:
        assert ws.receive_json()["type"] == "hello"


def test_dev_origins_are_only_allowed_when_configured(hub: Hub, static_dir: Path) -> None:
    app = create_app(hub, port=PORT, static_dir=static_dir, dev_origins=("http://127.0.0.1:5173",))
    with (
        TestClient(app, base_url=ORIGIN) as dev_client,
        dev_client.websocket_connect("/ws", headers=ws_headers("http://127.0.0.1:5173")) as ws,
    ):
        assert ws.receive_json()["type"] == "hello"


def test_websocket_streams_snapshots(client: TestClient, hub: Hub) -> None:
    with client.websocket_connect("/ws", headers=ws_headers()) as ws:
        assert ws.receive_json()["type"] == "hello"
        client.portal.call(hub.publish, make_snapshot(ts_ms=42))  # type: ignore[union-attr]
        message = ws.receive_json()
    assert message["type"] == "snapshot"
    assert message["snapshot"]["tsMs"] == 42


def test_websocket_updates_settings(client: TestClient, hub: Hub) -> None:
    with client.websocket_connect("/ws", headers=ws_headers()) as ws:
        ws.receive_json()
        ws.send_json(
            {"type": "updateSettings", "patch": {"intervalMs": 500, "viewMode": "compact"}}
        )
        message = ws.receive_json()
    assert message["type"] == "settings"
    assert message["settings"]["intervalMs"] == 500
    assert hub.settings.view_mode == "compact"


@pytest.mark.parametrize(
    "payload",
    [
        "not json",
        "[]",
        '{"type": "shutdown"}',
        '{"type": "updateSettings"}',
        '{"type": "updateSettings", "patch": []}',
        '{"type": "updateSettings", "patch": {"intervalMs": 3}}',
        '{"type": "updateSettings", "patch": {"__class__": 1}}',
    ],
)
def test_websocket_rejects_bad_messages_without_changing_settings(
    client: TestClient, hub: Hub, payload: str
) -> None:
    before = hub.settings
    with client.websocket_connect("/ws", headers=ws_headers()) as ws:
        ws.receive_json()
        ws.send_text(payload)
        message = ws.receive_json()
    assert message["type"] == "error"
    assert hub.settings == before


def test_websocket_closes_on_oversized_messages(client: TestClient) -> None:
    with client.websocket_connect("/ws", headers=ws_headers()) as ws:
        ws.receive_json()
        ws.send_text("x" * (MAX_CLIENT_MESSAGE_BYTES + 1))
        with pytest.raises(WebSocketDisconnect) as excinfo:
            ws.receive_json()
    assert excinfo.value.code == 1009


def test_websocket_rejects_binary_frames(client: TestClient) -> None:
    with client.websocket_connect("/ws", headers=ws_headers()) as ws:
        ws.receive_json()
        ws.send_bytes(b"\x00\x01")
        assert ws.receive_json() == {"type": "error", "message": "only text messages are supported"}


def test_lifespan_starts_and_stops_the_sampler(hub: Hub) -> None:
    events: list[str] = []

    async def run_sampler(stop: asyncio.Event) -> None:
        events.append("started")
        await stop.wait()
        events.append("stopped")

    app = create_app(hub, port=PORT, run_sampler=run_sampler)
    with TestClient(app, base_url=ORIGIN) as test_client:
        assert test_client.get("/api/health").status_code == 200
        assert events == ["started"]
    assert events == ["started", "stopped"]
