"""アイコン PNG を外部ライブラリなしで生成する（緑地に白い名刺）。"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
BG = (0x0F, 0x6E, 0x56)
CARD = (0xFF, 0xFF, 0xFF)
LINE = (0xB4, 0xB2, 0xA9)


def png_bytes(w, h, pixel):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw.extend(pixel(x, y))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def make(size, maskable=False):
    # maskable は安全領域（中央 80%）に収める
    margin = 0.22 if maskable else 0.14
    cw = size * (1 - 2 * margin)
    ch = cw * 55 / 91
    x0, x1 = size * margin, size * margin + cw
    y0, y1 = (size - ch) / 2, (size + ch) / 2
    r = size * 0.04
    lines = [(0.16, 0.30, 0.52), (0.42, 0.30, 0.78), (0.56, 0.30, 0.70), (0.76, 0.30, 0.60)]

    def inside_card(x, y):
        if not (x0 <= x < x1 and y0 <= y < y1):
            return False
        cx = min(max(x, x0 + r), x1 - r)
        cy = min(max(y, y0 + r), y1 - r)
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

    def pixel(x, y):
        px, py = x + 0.5, y + 0.5
        if inside_card(px, py):
            u = (px - x0) / cw
            v = (py - y0) / ch
            for ly, lx0, lx1 in lines:
                if abs(v - ly) < 0.035 and lx0 <= u <= lx1:
                    return LINE
            if 0.14 <= u <= 0.24 and 0.12 <= v <= 0.30:
                return BG
            return CARD
        return BG

    return png_bytes(size, size, pixel)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    (OUT / "icon-192.png").write_bytes(make(192))
    (OUT / "icon-512.png").write_bytes(make(512))
    (OUT / "icon-512-maskable.png").write_bytes(make(512, maskable=True))
    print("icons written to", OUT)
