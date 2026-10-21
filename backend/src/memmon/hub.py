"""Fan-out of snapshots, alerts and settings changes to connected UI clients."""

import asyncio
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from typing import Any

from pydantic import BaseModel
from pydantic.alias_generators import to_camel

from memmon.alerts import AlertEngine
from memmon.history import History
from memmon.models import Snapshot
from memmon.settings import Settings, SettingsStore

Message = dict[str, Any]


def _camelize(value: Any) -> Any:
    if isinstance(value, dict):
        return {to_camel(key): _camelize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_camelize(item) for item in value]
    return value


def to_wire(model: BaseModel) -> Message:
    """JSON-ready dict with camelCase keys, the shape the UI consumes."""
    wire: Message = _camelize(model.model_dump(mode="json"))
    return wire


class Hub:
    """Holds the current state and pushes every change to each subscriber's queue.

    Queues are bounded: a client that falls behind loses its oldest messages rather than making
    the server buffer without limit.
    """

    def __init__(
        self,
        *,
        store: SettingsStore,
        history: History,
        alerts: AlertEngine,
        queue_size: int = 32,
    ) -> None:
        self._store = store
        self.history = history
        self._alerts = alerts
        self._queue_size = queue_size
        self.settings: Settings = store.load()
        self._latest: Snapshot | None = None
        self._subscribers: set[asyncio.Queue[Message]] = set()

    def hello(self) -> Message:
        return {
            "type": "hello",
            "settings": to_wire(self.settings),
            "history": [to_wire(point) for point in self.history.points()],
            "snapshot": to_wire(self._latest) if self._latest else None,
        }

    @contextmanager
    def subscribe(self) -> Iterator[asyncio.Queue[Message]]:
        queue: asyncio.Queue[Message] = asyncio.Queue(maxsize=self._queue_size)
        self._subscribers.add(queue)
        try:
            yield queue
        finally:
            self._subscribers.discard(queue)

    @staticmethod
    def offer(queue: asyncio.Queue[Message], message: Message) -> None:
        """Enqueue without blocking, dropping the oldest message if the queue is full."""
        if queue.full():
            queue.get_nowait()
        queue.put_nowait(message)

    def _broadcast(self, message: Message) -> None:
        for queue in self._subscribers:
            self.offer(queue, message)

    async def publish(self, snapshot: Snapshot) -> None:
        self._latest = snapshot
        self._broadcast({"type": "snapshot", "snapshot": to_wire(snapshot)})
        for alert in self._alerts.evaluate(snapshot, self.settings):
            self._broadcast({"type": "alert", "alert": to_wire(alert)})

    def update_settings(self, patch: Mapping[str, object]) -> Settings:
        """Validate, persist, then broadcast. On SettingsError nothing changes."""
        updated = self.settings.updated(patch)
        self._store.save(updated)
        self.settings = updated
        self._broadcast({"type": "settings", "settings": to_wire(updated)})
        return updated
