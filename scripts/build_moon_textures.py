#!/usr/bin/env python3
"""
Web textures for the full-Moon 3D globe.

Inputs (NASA SVS CGI Moon Kit, https://svs.gsfc.nasa.gov/4720/, and LOLA PDS), in data/moonkit/:
  lroc_color_poles_16k.tif   LRO WAC colour mosaic, 16384 x 8192, poles filled
  ldem_64_uint.tif           LOLA elevation, 64 px/deg, uint16 half-metres, +20000 offset, ref 1737.4 km
  ldem_16_uint.tif           LOLA elevation, 16 px/deg, same encoding
  ldem_80s_80m.img           LOLA south polar stereographic elevation, 80 m/px, int16 half-metres

Outputs in public/moon/:
  color_2k.jpg, color_8k.jpg        albedo (equirectangular, lon 0 at the centre, like the source)
  normal_2k.jpg, normal_8k.jpg      tangent-space relief normals (x = east, y = north, z = up)
  height_4k.png                     equirect heights, 16-bit packed in R,G, 4 m steps, for cast shadows
  south_height.png + .json          south polar cap (80S..90S) heights, polar stereographic

Height PNGs: metres above 1737.4 km = hMinM + (R*256 + G) * quantumM
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data/moonkit"
OUT = ROOT / "public/moon"
R = 1737400.0


def block_mean(a, f):
    h, w = a.shape[0] // f * f, a.shape[1] // f * f
    return a[:h, :w].reshape(h // f, f, w // f, f).mean(axis=(1, 3))


def normals_equirect(z, ppd):
    """Tangent-space normals for an equirect height grid (metres). Row 0 = 90N."""
    h, w = z.shape
    lat = np.radians(90 - (np.arange(h) + 0.5) / ppd)
    dy = R * np.radians(1 / ppd)
    dx = np.maximum(np.cos(lat), 1e-3)[:, None] * dy
    gx = (np.roll(z, -1, 1) - np.roll(z, 1, 1)) / (2 * dx)          # east
    gn = np.empty_like(z)
    gn[1:-1] = (z[:-2] - z[2:]) / (2 * dy)                           # north (row-1 is north)
    gn[0], gn[-1] = gn[1], gn[-2]
    n = np.dstack([-gx, -gn, np.ones_like(z)]).astype(np.float32)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return (n * 127.5 + 127.5).clip(0, 255).astype(np.uint8)


def pack16(z, quantum):
    zmin = float(np.floor(z.min()))
    q = np.round((z - zmin) / quantum).astype(np.int64)
    assert q.max() <= 65535, q.max()
    rgb = np.zeros(z.shape + (3,), np.uint8)
    rgb[..., 0] = (q >> 8).astype(np.uint8)
    rgb[..., 1] = (q & 255).astype(np.uint8)
    return rgb, zmin


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    print("colour…", flush=True)
    col = Image.open(SRC / "lroc_color_poles_16k.tif").convert("RGB")
    col.resize((8192, 4096), Image.LANCZOS).save(OUT / "color_8k.jpg", quality=90, optimize=True, progressive=True)
    col.resize((2048, 1024), Image.LANCZOS).save(OUT / "color_2k.jpg", quality=88, optimize=True, progressive=True)
    del col

    print("normals from LDEM_64 (in strips)…", flush=True)
    raw = np.asarray(Image.open(SRC / "ldem_64_uint.tif"))  # 11520 x 23040 uint16
    # 3x3 block mean -> 7680 x 3840 (21.3 px/deg, ~1.4 km/px), done in strips to limit memory
    rows = []
    for r0 in range(0, raw.shape[0], 1536):
        rows.append(block_mean((raw[r0:r0 + 1536].astype(np.float32) - 20000) * 0.5, 3))
    z8 = np.vstack(rows)
    del raw, rows
    n8 = normals_equirect(z8, 7680 / 360)
    Image.fromarray(n8).save(OUT / "normal_8k.jpg", quality=92, optimize=True)
    Image.fromarray(n8).resize((2048, 1024), Image.LANCZOS).save(OUT / "normal_2k.jpg", quality=90, optimize=True)
    del n8, z8

    print("height 4k from LDEM_16…", flush=True)
    z16 = (np.asarray(Image.open(SRC / "ldem_16_uint.tif")).astype(np.float32) - 20000) * 0.5
    z4 = np.asarray(Image.fromarray(z16, "F").resize((4096, 2048), Image.BOX))
    rgb, zmin = pack16(z4, 4.0)
    Image.fromarray(rgb).save(OUT / "height_4k.png", optimize=True)
    meta = {"height_4k": {"w": 4096, "h": 2048, "hMinM": zmin, "quantumM": 4.0}}

    print("south polar cap from LDEM_80S_80M…", flush=True)
    sp = np.fromfile(SRC / "ldem_80s_80m.img", dtype="<i2").reshape(7600, 7600).astype(np.float32) * 0.5
    sp[sp < -16000] = np.nan
    sp = np.where(np.isnan(sp), np.nanmedian(sp), sp)
    n = 4096
    spr = np.asarray(Image.fromarray(sp, "F").resize((n, n), Image.BOX))
    res = 80.0 * 7600 / n  # metres per pixel in the output grid
    rgb, zmin = pack16(spr, 1.0)
    Image.fromarray(rgb).save(OUT / "south_height.png", optimize=True)
    # cap normals are derived in the shader from these heights, so no separate normal map is written
    # half-width of the grid in metres (centre at the pole)
    meta["south"] = {"n": n, "resM": res, "halfM": res * n / 2, "hMinM": zmin, "quantumM": 1.0,
                     "note": "polar stereographic, x = r sin(lon), y = r cos(lon), r = 2R tan((90+lat)/2); row 0 = +y"}
    (OUT / "textures.json").write_text(json.dumps(meta, indent=1))
    for f in sorted(OUT.iterdir()):
        print(f"  {f.name:20s} {f.stat().st_size / 1e6:6.1f} MB")


if __name__ == "__main__":
    main()

# SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
