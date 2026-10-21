"""Exception types shared across the backend."""


class CollectorError(Exception):
    """A collector produced output that could not be read or trusted."""
