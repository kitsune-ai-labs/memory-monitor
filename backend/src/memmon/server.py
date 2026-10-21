"""HTTP and WebSocket API, bound to loopback and locked to the app's own origin."""

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator, Awaitable, Callable, Coroutine, Iterable
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic.alias_generators import to_camel
from starlette.middleware.trustedhost import TrustedHostMiddleware

from memmon.hub import Hub, Message
from memmon.settings import Settings, SettingsError

MAX_CLIENT_MESSAGE_BYTES = 4096
LOOPBACK_HOSTS = ("127.0.0.1", "localhost")

CONTENT_SECURITY_POLICY = "; ".join(
    (
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
    )
)
SECURITY_HEADERS = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "Cache-Control": "no-store",
}

# Client settings keys arrive in camelCase; anything not in this map is passed through
# unchanged so that validation rejects it.
_SETTINGS_KEYS = {to_camel(name): name for name in Settings.model_fields}

SamplerTask = Callable[[asyncio.Event], Coroutine[Any, Any, None]]


def _error(message: str) -> Message:
    return {"type": "error", "message": message}


def handle_client_message(hub: Hub, text: str) -> Message | None:
    """Apply one client message. Returns an error message to send back, or None on success."""
    try:
        data: Any = json.loads(text)
    except json.JSONDecodeError:
        return _error("message is not valid JSON")
    if not isinstance(data, dict) or data.get("type") != "updateSettings":
        return _error("unsupported message type")
    patch = data.get("patch")
    if not isinstance(patch, dict):
        return _error("updateSettings needs a patch object")
    renamed: dict[str, object] = {
        _SETTINGS_KEYS.get(str(key), str(key)): value for key, value in patch.items()
    }
    try:
        hub.update_settings(renamed)
    except SettingsError as exc:
        return _error(str(exc))
    return None


def create_app(
    hub: Hub,
    *,
    port: int,
    static_dir: Path | None = None,
    dev_origins: Iterable[str] = (),
    run_sampler: SamplerTask | None = None,
) -> FastAPI:
    allowed_origins = {f"http://{host}:{port}" for host in LOOPBACK_HOSTS} | set(dev_origins)

    @contextlib.asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if run_sampler is None:
            yield
            return
        stop = asyncio.Event()
        task = asyncio.create_task(run_sampler(stop))
        try:
            yield
        finally:
            stop.set()
            await task

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(LOOPBACK_HOSTS))

    @app.middleware("http")
    async def security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        response.headers.update(SECURITY_HEADERS)
        return response

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.websocket("/ws")
    async def stream(ws: WebSocket) -> None:
        # Browsers always send Origin on WebSocket handshakes; refusing anything else stops other
        # websites (and DNS-rebinding pages) from reading this machine's process list.
        if ws.headers.get("origin") not in allowed_origins:
            await ws.send_denial_response(PlainTextResponse("Forbidden origin", status_code=403))
            return
        await ws.accept()
        with hub.subscribe() as queue:
            await ws.send_json(hub.hello())
            sender = asyncio.create_task(_pump(queue, ws))
            try:
                await _receive_loop(hub, queue, ws)
            finally:
                sender.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await sender

    if static_dir is not None and static_dir.is_dir():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="ui")
    return app


async def _pump(queue: asyncio.Queue[Message], ws: WebSocket) -> None:
    while True:
        await ws.send_json(await queue.get())


async def _receive_loop(hub: Hub, queue: asyncio.Queue[Message], ws: WebSocket) -> None:
    while True:
        try:
            event = await ws.receive()
        except WebSocketDisconnect:
            return
        if event["type"] == "websocket.disconnect":
            return
        text = event.get("text")
        if text is None:
            Hub.offer(queue, _error("only text messages are supported"))
            continue
        if len(text.encode("utf-8")) > MAX_CLIENT_MESSAGE_BYTES:
            await ws.close(code=1009)
            return
        reply = handle_client_message(hub, text)
        if reply is not None:
            Hub.offer(queue, reply)
