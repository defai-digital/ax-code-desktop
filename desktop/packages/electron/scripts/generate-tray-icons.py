#!/usr/bin/env python3
"""Generate macOS menu-bar tray template icons for AX Code Desktop.

Outputs black-on-transparent PNGs (1x + @2x) under resources/icons/tray/.
Electron marks them as template images at runtime so macOS tints them.

Requires: Pillow (pip install Pillow / system python3 with PIL).
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "resources" / "icons" / "tray"
STATUS = OUT / "status"
BREATH_FRAMES = 16


# Monochrome geometry of the brackets and slash in build/icon-source.png, on a 22 pt canvas.
BRAND_POLYGONS = (
    ((2, 10.25), (7.15, 6.65), (7.15, 8.95), (4.05, 11.15), (7.15, 13.35), (7.15, 15.65), (2, 12.05)),
    ((11.95, 5.55), (13.85, 5.55), (10.1, 16.35), (8.2, 16.35)),
    ((20, 10.25), (14.85, 6.65), (14.85, 8.95), (17.95, 11.15), (14.85, 13.35), (14.85, 15.65), (20, 12.05)),
)


def draw_brand_mark(size: int, indicator_alpha: int = 0) -> Image.Image:
    """Keep the same AX Code mark in every frame, with room for an activity dot."""
    render_size = size * 4
    scale = render_size / 22
    img = Image.new("RGBA", (render_size, render_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for vertices in BRAND_POLYGONS:
        draw.polygon([(round(x * scale), round(y * scale)) for x, y in vertices], fill=(0, 0, 0, 255))
    if indicator_alpha:
        bounds = [round(coordinate * scale) for coordinate in (17.4, 15.9, 20, 18.5)]
        draw.ellipse(bounds, fill=(0, 0, 0, indicator_alpha))
    return img.resize((size, size), Image.Resampling.LANCZOS)


def draw_status(size: int, kind: str) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    black = (0, 0, 0, 255)
    m = 2
    if kind == "blank":
        return img
    if kind == "busy":
        d.ellipse([m, m, size - m - 1, size - m - 1], fill=black)
    elif kind == "retry":
        d.ellipse([m, m, size - m - 1, size - m - 1], outline=black, width=max(1, size // 6))
        d.pieslice([m, m, size - m - 1, size - m - 1], start=200, end=340, fill=black)
    elif kind == "error":
        d.polygon([(size // 2, m), (size - m - 1, size - m - 1), (m, size - m - 1)], fill=black)
    elif kind == "unseen":
        d.rounded_rectangle([m, m, size - m - 1, size - m - 1], radius=size // 4, fill=black)
    return img


def save_pair(name: str, maker) -> None:
    maker(22).save(OUT / f"{name}.png")
    maker(44).save(OUT / f"{name}@2x.png")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    STATUS.mkdir(parents=True, exist_ok=True)

    save_pair("trayTemplate-idle", draw_brand_mark)
    save_pair("trayTemplate-unseen", lambda size: draw_brand_mark(size, 255))

    for i in range(BREATH_FRAMES):
        t = i / (BREATH_FRAMES - 1)
        ease = t * t * (3 - 2 * t)
        stem = f"trayTemplate-breath-{i:02d}"
        save_pair(stem, lambda size, alpha=round(48 + 168 * ease): draw_brand_mark(size, alpha))

    for kind in ("busy", "retry", "error", "unseen", "blank"):
        draw_status(16, kind).save(STATUS / f"{kind}.png")
        draw_status(32, kind).save(STATUS / f"{kind}@2x.png")

    print(f"generated tray icons under {OUT}")


if __name__ == "__main__":
    main()
