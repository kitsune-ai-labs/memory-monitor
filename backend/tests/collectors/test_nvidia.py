import pytest

from memmon.collectors.nvidia import NVIDIA_SMI_ARGS, parse_nvidia_smi
from memmon.errors import CollectorError
from memmon.models import GpuStats

MIB = 1024 * 1024


def test_query_asks_for_the_fields_the_parser_expects() -> None:
    assert NVIDIA_SMI_ARGS == (
        "--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu,power.draw",
        "--format=csv,noheader,nounits",
    )


def test_parses_a_typical_line() -> None:
    stats = parse_nvidia_smi("NVIDIA GeForce RTX 5090, 1942, 32607, 1, 39, 50.36\n")
    assert stats == GpuStats(
        name="NVIDIA GeForce RTX 5090",
        used_bytes=1942 * MIB,
        total_bytes=32607 * MIB,
        util_pct=1.0,
        temp_c=39.0,
        power_w=50.36,
    )


def test_not_available_fields_become_none() -> None:
    stats = parse_nvidia_smi("Some GPU, 100, 8192, [N/A], [N/A], [N/A]")
    assert stats.util_pct is None
    assert stats.temp_c is None
    assert stats.power_w is None


def test_uses_the_first_gpu_when_several_are_listed() -> None:
    out = "GPU A, 10, 100, 5, 40, 60\nGPU B, 20, 200, 6, 41, 61\n"
    assert parse_nvidia_smi(out).name == "GPU A"


def test_handles_windows_line_endings() -> None:
    assert parse_nvidia_smi("GPU A, 10, 100, 5, 40, 60\r\n").power_w == 60.0


@pytest.mark.parametrize(
    "output",
    [
        "",
        "   \n",
        "GPU A, 10, 100, 5, 40",
        "GPU A, ten, 100, 5, 40, 60",
        "GPU A, 10, [N/A], 5, 40, 60",
        "GPU A, 200, 100, 5, 40, 60",
        "GPU A, -1, 100, 5, 40, 60",
        "GPU A, 10, 100, 500, 40, 60",
        "GPU A, 10, 100, 5, 40, nan",
    ],
)
def test_rejects_malformed_or_implausible_output(output: str) -> None:
    with pytest.raises(CollectorError):
        parse_nvidia_smi(output)
