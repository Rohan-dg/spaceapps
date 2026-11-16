#!/usr/bin/env python3
"""
High-resolution terrain windows around each south-polar site, for the 3D view.

For every polar site this picks the finest LOLA polar DEM that covers it
(5 m poleward of 87.5S, 10 m poleward of 85S, otherwise 20 m), reads only the
rows it needs over HTTP range requests (the full files are about 1.8 GB each),
and writes:

  public/hires/<id>.png   16-bit heights packed into R (high byte) and G (low byte)
  public/hires/<id>.json  grid size, spacing, height offset, source product

Height of a pixel in metres above the 1737.4 km sphere is
  hMin + (R * 256 + G) * 0.5
Row 0 is the north edge of the polar-stereographic grid ("up" = toward lon 0),
column 0 the west edge, exactly as in the source product.

Usage: python3 scripts/build_site_dem.py [--only id,id]
"""
import argparse
import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/"
R_MOON = 1737400.0

# name, metres/pixel, lines(=samples), projection offset (pixels), min |lat| covered, window size (pixels)
PRODUCTS = [
    ("ldem_875s_5m", 5.0, 30336, 15167.5, 87.5, 2048),
    ("ldem_85s_10m", 10.0, 30336, 15167.5, 85.0, 1536),
    ("ldem_80s_20m", 20.0, 30400, 15199.5, 80.0, 1024),
]


def rowcol(lat, lon, res, off):
    """PDS polar stereographic (south): r = 2R tan((90+lat)/2), x = r sin(lon), y = r cos(lon)."""
    r = 2 * R_MOON * np.tan(np.radians(90.0 + lat) / 2)
    x = r * np.sin(np.radians(lon))
    y = r * np.cos(np.radians(lon))
    return off - y / res, off + x / res


def fetch_rows(url, record, rows, c0, n, group=64):
    """Read columns c0..c0+n of each row with multipart range requests. Returns int16 array (len(rows), n)."""
    out = np.zeros((len(rows), n), dtype="<i2")
    want = {}
    batches = [rows[i:i + group] for i in range(0, len(rows), group)]

    def one(batch):
        ranges = ",".join(f"{r * record + c0 * 2}-{r * record + (c0 + n) * 2 - 1}" for r in batch)
        req = urllib.request.Request(url, headers={"Range": f"bytes={ranges}", "User-Agent": "lunar-site-compare/1.0"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    body = resp.read()
                    ctype = resp.headers.get("Content-Type", "")
                break
            except Exception:
                if attempt == 3:
                    raise
        got = {}
        if "multipart/byteranges" in ctype:
            boundary = ctype.split("boundary=")[1].strip().strip('"').encode()
            for part in body.split(b"--" + boundary):
                m = re.search(rb"Content-Range: bytes (\d+)-(\d+)/\d+\r\n\r\n", part, re.I)
                if not m:
                    continue
                start, end = int(m.group(1)), int(m.group(2))
                data = part[m.end():m.end() + (end - start + 1)]
                got[start] = data
        else:  # single range
            got[batch[0] * record + c0 * 2] = body
        return got

    with ThreadPoolExecutor(8) as ex:
        for got in ex.map(one, batches):
            want.update(got)
    for i, r in enumerate(rows):
        buf = want[r * record + c0 * 2]
        out[i] = np.frombuffer(buf, dtype="<i2", count=n)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    only = set(filter(None, a.only.split(",")))
    sites = json.loads((ROOT / "data/sites.json").read_text())
    sites = sites["sites"] if isinstance(sites, dict) else sites
    pub = json.loads((ROOT / "public/sites.json").read_text())
    pub = {s["id"]: s for s in (pub["sites"] if isinstance(pub, dict) else pub)}
    out_dir = ROOT / "public/hires"
    out_dir.mkdir(parents=True, exist_ok=True)
    for s in sites:
        sid = s["id"]
        if only and sid not in only:
            continue
        p = pub.get(sid, s)
        lat, lon = p["lat"], p["lon"]
        if lat > -80.5:
            continue
        prod = next(pr for pr in PRODUCTS if -lat >= pr[4] + 0.05)
        name, res, lines, off, _, n = prod
        r, c = rowcol(lat, lon, res, off)
        r0, c0 = int(round(r)) - n // 2, int(round(c)) - n // 2
        record = lines * 2
        print(f"{sid}: {name} {res:g} m/px, {n}x{n} window ({n * res / 1000:.2f} km), rows {r0}..{r0 + n}", flush=True)
        z = fetch_rows(BASE + name + ".img", record, list(range(r0, r0 + n)), c0, n).astype(np.int32)
        bad = z <= -32768
        if bad.any():
            z[bad] = int(np.median(z[~bad]))
        # Single-pixel spikes (a known artefact of the preliminary 5 m product): replace a pixel only
        # when it differs from its 3x3 median by more than 6 m. Everything else keeps its raw value.
        from scipy.ndimage import median_filter
        med = median_filter(z, size=3)
        spike = np.abs(z - med) > 12  # DN units (0.5 m), so 6 m
        z[spike] = med[spike]
        print(f"  replaced {int(spike.sum())} spike pixels ({100 * spike.mean():.3f}%)", flush=True)
        zmin = int(z.min())
        q = (z - zmin).astype(np.uint32)
        if q.max() > 65535:
            sys.exit(f"{sid}: height range too large for 16 bits")
        rgb = np.zeros((n, n, 3), dtype=np.uint8)
        rgb[..., 0] = (q >> 8).astype(np.uint8)
        rgb[..., 1] = (q & 255).astype(np.uint8)
        Image.fromarray(rgb, "RGB").save(out_dir / f"{sid}.png", optimize=True)
        meta = {
            "id": sid, "dem": name.upper(), "resM": res, "n": n,
            "lat": lat, "lon": lon,
            # pixel (row, col) of the site inside the window, fractional
            "siteRow": r - r0, "siteCol": c - c0,
            # window origin in the source product, so pixels map back to lat/lon
            "row0": r0, "col0": c0, "projOffset": off,
            "hMinM": zmin * 0.5, "quantumM": 0.5,
            "encoding": "PNG RGB, height = hMinM + (R*256 + G) * quantumM, metres above 1737.4 km sphere",
        }
        (out_dir / f"{sid}.json").write_text(json.dumps(meta, indent=1))
        print(f"  heights {zmin * 0.5:.0f} .. {z.max() * 0.5:.0f} m, png {(out_dir / f'{sid}.png').stat().st_size / 1e6:.1f} MB", flush=True)


if __name__ == "__main__":
    main()

# SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
