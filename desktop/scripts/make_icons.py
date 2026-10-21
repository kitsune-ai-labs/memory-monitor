"""Generate the app icon (PNG + multi-size ICO) with the standard library only.

The icon is a dark rounded tile with two meter bars: blue for RAM, orange for VRAM.
Run: python3 -I scripts/make_icons.py assets
"""

import struct
import sys
import zlib
from pathlib import Path

BG = (26, 26, 25, 255)
RAM = (57, 135, 229, 255)
VRAM = (217, 89, 38, 255)
TRACK = (44, 44, 42, 255)
CLEAR = (0, 0, 0, 0)


def inside_rounded(x: float, y: float, x0: float, y0: float, x1: float, y1: float, r: float) -> bool:
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def pixel(x: float, y: float) -> tuple[int, int, int, int]:
    """Colour at a point in a 1.0 x 1.0 design space."""
    if not inside_rounded(x, y, 0.0, 0.0, 1.0, 1.0, 0.22):
        return CLEAR
    for top, fill_to, color in ((0.30, 0.78, RAM), (0.56, 0.52, VRAM)):
        if inside_rounded(x, y, 0.18, top, 0.82, top + 0.14, 0.07):
            return color if x <= fill_to else TRACK
    return BG


def render(size: int, samples: int = 4) -> bytes:
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(samples):
                for sx in range(samples):
                    c = pixel((px + (sx + 0.5) / samples) / size, (py + (sy + 0.5) / samples) / size)
                    for i in range(4):
                        acc[i] += c[i]
            row.extend(v // (samples * samples) for v in acc)
        rows.append(bytes(row))
    return b"".join(rows)


def png(size: int) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(render(size), 9))
        + chunk(b"IEND", b"")
    )


def ico(images: dict[int, bytes]) -> bytes:
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries, blobs = b"", b""
    for size, data in images.items():
        dim = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
        blobs += data
    return header + entries + blobs


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    images = {size: png(size) for size in (16, 24, 32, 48, 64, 128, 256)}
    (out / "icon.png").write_bytes(images[256])
    (out / "tray.png").write_bytes(images[32])
    (out / "icon.ico").write_bytes(ico(images))


if __name__ == "__main__":
    main()
