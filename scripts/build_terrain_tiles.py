#!/usr/bin/env python3
"""
Real-terrain tiles for the 3D Moon, cut from the NASA SVS CGI Moon Kit (https://svs.gsfc.nasa.gov/4720/).

Inputs in data/moonkit/ (download from the Moon Kit page):
  ldem_64_uint.tif           LOLA elevation, 64 px/deg (~474 m at the equator), uint16 half-metres, +20000 offset
  lroc_color_poles_16k.tif   LRO WAC colour mosaic, 16384 x 8192

Outputs in public/tiles/ (gitignored, about 400 MB; run this before deploying):
  h/<row>_<col>.png   heights for one 5 x 5 degree tile, 321 x 321 corner-registered samples, so neighbouring tiles
                      share their edge samples exactly. 16-bit packed: metres = hMin + (R*256 + G) * 0.5
  c/<row>_<col>.jpg   colour for the same tile, 256 x 256
  index.json          tile layout and the hMin of every tile

Row 0 starts at 90N, column 0 at 180W, matching the equirect maps the globe uses. Tiles stop at 80S: the
south polar cap (LOLA 80 m polar product) and the 5 to 20 m site windows cover the rest at higher resolution.
Heights are the LOLA values themselves (corner registration averages the four surrounding 64 px/deg samples);
nothing is smoothed, exaggerated or invented.

Usage: python3 scripts/build_terrain_tiles.py [--only ROW_COL] [--workers N]
"""
import argparse
import json
import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data/moonkit"
OUT = ROOT / "public/tiles"
DEG = 5
PPD = 64
N = DEG * PPD            # samples per tile edge (corner grid has N + 1)
ROWS = (90 + 80) // DEG  # 90N .. 80S
COLS = 360 // DEG
CPX = 256                # colour tile size
QUANTUM = 0.5

_raw = None
_col = None


def _init():
    global _raw, _col
    _raw = np.asarray(Image.open(SRC / "ldem_64_uint.tif"))           # 11520 x 23040 uint16, row 0 = 90N
    _col = Image.open(SRC / "lroc_color_poles_16k.tif").convert("RGB")  # 16384 x 8192


def corner_heights(r, c):
    """(N+1)^2 heights (m) at the tile's corner grid: mean of the four 64 px/deg samples around each corner."""
    rows = np.arange(r * N - 1, r * N + N + 1)                  # N + 2 sample rows
    cols = np.arange(c * N - 1, c * N + N + 1) % _raw.shape[1]  # wraps at the antimeridian
    rows_c = np.clip(rows, 0, _raw.shape[0] - 1)
    s = (_raw[np.ix_(rows_c, cols)].astype(np.float32) - 20000.0) * 0.5
    return 0.25 * (s[:-1, :-1] + s[:-1, 1:] + s[1:, :-1] + s[1:, 1:])


def build(rc):
    r, c = rc
    z = corner_heights(r, c)
    hmin = float(np.floor(z.min() / QUANTUM) * QUANTUM)
    q = np.round((z - hmin) / QUANTUM).astype(np.int64)
    assert q.max() <= 65535, (r, c, q.max())
    rgb = np.zeros(z.shape + (3,), np.uint8)
    rgb[..., 0] = q >> 8
    rgb[..., 1] = q & 255
    Image.fromarray(rgb).save(OUT / "h" / f"{r}_{c}.png", compress_level=9)
    # colour: the tile's exact lat/lon box in the 16k mosaic (45.5 px/deg)
    W, H = _col.size
    box = (c * DEG / 360 * W, r * DEG / 180 * H, (c + 1) * DEG / 360 * W, (r + 1) * DEG / 180 * H)
    _col.resize((CPX, CPX), Image.LANCZOS, box=box).save(OUT / "c" / f"{r}_{c}.jpg", quality=88, optimize=True)
    return r, c, hmin


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--workers", type=int, default=max(1, min(4, (os.cpu_count() or 2) - 2)))
    a = ap.parse_args()
    (OUT / "h").mkdir(parents=True, exist_ok=True)
    (OUT / "c").mkdir(parents=True, exist_ok=True)
    jobs = [tuple(int(v) for v in a.only.split("_"))] if a.only else [(r, c) for r in range(ROWS) for c in range(COLS)]
    hmin = [[0.0] * COLS for _ in range(ROWS)]
    if a.only:
        _init()
        print(build(jobs[0]))
        return
    with ProcessPoolExecutor(a.workers, initializer=_init) as ex:
        for i, (r, c, h) in enumerate(ex.map(build, jobs, chunksize=8)):
            hmin[r][c] = h
            if i % 144 == 0:
                print(f"{i}/{len(jobs)}", flush=True)
    meta = {"deg": DEG, "n": N, "rows": ROWS, "cols": COLS, "lat0": 90, "lon0": -180, "quantumM": QUANTUM,
            "colorPx": CPX, "source": "NASA SVS CGI Moon Kit: LOLA ldem_64, LROC WAC colour 16k", "hMinM": hmin}
    (OUT / "index.json").write_text(json.dumps(meta, separators=(",", ":")))
    print("done", len(jobs), "tiles")


if __name__ == "__main__":
    main()
