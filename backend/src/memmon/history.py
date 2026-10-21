"""A bounded, time-windowed buffer of recent usage percentages."""

from collections import deque

from memmon.models import HistoryPoint


class History:
    def __init__(self, *, window_ms: int, max_points: int) -> None:
        if window_ms <= 0 or max_points <= 0:
            raise ValueError("window_ms and max_points must be positive")
        self._window_ms = window_ms
        self._points: deque[HistoryPoint] = deque(maxlen=max_points)

    def append(self, point: HistoryPoint) -> None:
        latest = self.latest()
        if latest is not None and point.ts_ms < latest.ts_ms:
            raise ValueError("point is older than the latest point")
        self._points.append(point)
        cutoff = point.ts_ms - self._window_ms
        while self._points[0].ts_ms < cutoff:
            self._points.popleft()

    def latest(self) -> HistoryPoint | None:
        return self._points[-1] if self._points else None

    def points(self, *, since_ms: int | None = None) -> tuple[HistoryPoint, ...]:
        if since_ms is None:
            return tuple(self._points)
        return tuple(p for p in self._points if p.ts_ms > since_ms)
