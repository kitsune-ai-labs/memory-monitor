import pytest

from memmon.history import History
from memmon.models import HistoryPoint


def point(ts_ms: int, ram: float = 10.0, vram: float = 5.0) -> HistoryPoint:
    return HistoryPoint(ts_ms=ts_ms, ram_pct=ram, vram_pct=vram)


def test_starts_empty() -> None:
    history = History(window_ms=60_000, max_points=100)
    assert history.points() == ()
    assert history.latest() is None


def test_keeps_points_in_order() -> None:
    history = History(window_ms=60_000, max_points=100)
    for ts in (1_000, 2_000, 3_000):
        history.append(point(ts))
    assert [p.ts_ms for p in history.points()] == [1_000, 2_000, 3_000]
    assert history.latest() == point(3_000)


def test_drops_points_older_than_the_window() -> None:
    history = History(window_ms=10_000, max_points=100)
    for ts in (0, 5_000, 10_000, 15_000):
        history.append(point(ts))
    assert [p.ts_ms for p in history.points()] == [5_000, 10_000, 15_000]


def test_never_holds_more_than_max_points() -> None:
    history = History(window_ms=10**9, max_points=3)
    for ts in range(10):
        history.append(point(ts))
    assert [p.ts_ms for p in history.points()] == [7, 8, 9]


def test_points_since_returns_only_newer_points() -> None:
    history = History(window_ms=60_000, max_points=100)
    for ts in (1_000, 2_000, 3_000):
        history.append(point(ts))
    assert [p.ts_ms for p in history.points(since_ms=1_000)] == [2_000, 3_000]


def test_rejects_points_that_go_back_in_time() -> None:
    history = History(window_ms=60_000, max_points=100)
    history.append(point(2_000))
    with pytest.raises(ValueError, match="older"):
        history.append(point(1_000))


@pytest.mark.parametrize(("window_ms", "max_points"), [(0, 10), (10, 0), (-1, 10)])
def test_rejects_invalid_limits(window_ms: int, max_points: int) -> None:
    with pytest.raises(ValueError, match="positive"):
        History(window_ms=window_ms, max_points=max_points)
