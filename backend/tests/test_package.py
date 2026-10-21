import memmon


def test_version_is_exposed() -> None:
    assert memmon.__version__ == "0.1.0"
