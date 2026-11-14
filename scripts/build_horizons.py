#!/usr/bin/env python3
"""
Build per-site terrain horizon profiles from LOLA DEMs.

    python scripts/build_horizons.py            # download DEMs if needed, write public/horizons/*.json
    python scripts/build_horizons.py --synthetic # force clearly-labelled synthetic profiles
    python scripts/build_horizons.py --range-km 150 --observer-m 2

For each site and each azimuth 0..359 deg, march outward along the great circle and record
the maximum elevation angle of the terrain, seen from an observer `observer-m` above the DEM
surface, including lunar curvature (exact spherical geometry, equal to d^2/2R to 2nd order).

DEMs (NASA PDS Geosciences Node, LRO LOLA GDR, heights relative to a 1737.4 km sphere):
  * LDEM_80S_40M (or LDEM_80S_80M fallback): south polar stereographic, 40 m/px, lat <= -80
  * LDEM_16: global simple cylindrical, 16 px/deg (~1.9 km/px), used for non-polar sites
Requires only numpy (no GDAL/rasterio needed: PDS3 .IMG files are raw int16 + text label).
"""
from __future__ import annotations

import argparse
import base64
import json
import math
import os
import re
import sys
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DEM_DIR = ROOT / "data" / "dem"
OUT_DIR = ROOT / "public" / "horizons"
SITES = ROOT / "data" / "sites.json"
R_MOON = 1737400.0  # m

PDS = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr"
POLAR_CANDIDATES = ["ldem_80s_40m", "ldem_80s_80m"]  # best first
GLOBAL_CANDIDATES = ["ldem_16"]
URLS = {
    "ldem_80s_40m": f"{PDS}/polar/img/ldem_80s_40m",
    "ldem_80s_80m": f"{PDS}/polar/img/ldem_80s_80m",
    "ldem_16": f"{PDS}/cylindrical/img/ldem_16",
}


# ----------------------------------------------------------------------------- DEM I/O
def parse_label(path: Path) -> dict:
    txt = path.read_text(errors="replace")

    def num(key):
        m = re.search(rf"^\s*{key}\s*=\s*([-+0-9.Ee]+)", txt, re.M)
        return float(m.group(1)) if m else None

    proj = re.search(r'MAP_PROJECTION_TYPE\s*=\s*"([^"]+)"', txt)
    return {
        "lines": int(num("LINES")),
        "samples": int(num("LINE_SAMPLES")),
        "scale_factor": num("SCALING_FACTOR") or 1.0,
        "map_scale_m": (num("MAP_SCALE") or 0) * (1000.0 if re.search(r"MAP_SCALE\s*=\s*[-0-9.]+\s*<KM", txt) else 1.0),
        "resolution_ppd": num("MAP_RESOLUTION"),
        "line_offset": num("LINE_PROJECTION_OFFSET"),
        "sample_offset": num("SAMPLE_PROJECTION_OFFSET"),
        "projection": proj.group(1) if proj else "?",
    }


def download(name: str) -> bool:
    DEM_DIR.mkdir(parents=True, exist_ok=True)
    try:
        for ext in (".lbl", ".img"):
            dst = DEM_DIR / f"{name}{ext}"
            if dst.exists() and dst.stat().st_size > 0:
                continue
            url = URLS[name] + ext
            print(f"  downloading {url} ...", flush=True)
            tmp = dst.with_suffix(ext + ".part")
            with urllib.request.urlopen(url, timeout=60) as r, open(tmp, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            tmp.rename(dst)
        return True
    except Exception as e:  # network blocked, 404, ...
        print(f"  download of {name} failed: {e}", file=sys.stderr)
        return False


class Dem:
    def __init__(self, name: str):
        self.name = name
        self.lbl = parse_label(DEM_DIR / f"{name}.lbl")
        L = self.lbl
        raw = np.memmap(DEM_DIR / f"{name}.img", dtype="<i2", mode="r", shape=(L["lines"], L["samples"]))
        self.h = raw  # DN; height_m = DN * scale_factor
        self.k = L["scale_factor"]
        self.polar = "STEREOGRAPHIC" in L["projection"].upper()
        self.res_m = L["map_scale_m"]

    # lat/lon (deg) arrays -> fractional (row, col), 0-based pixel centres
    def rowcol(self, lat, lon):
        L = self.lbl
        if self.polar:
            # PDS DSMAP_POLAR (south): r = 2R tan((90+lat)/2); x = r sin(lon) (right), y = r cos(lon) (up)
            r = 2 * R_MOON * np.tan(np.radians(90.0 + lat) / 2)
            x = r * np.sin(np.radians(lon))
            y = r * np.cos(np.radians(lon))
            c_row = L["line_offset"] if L["line_offset"] is not None else (L["lines"] / 2 - 0.5)
            c_col = L["sample_offset"] if L["sample_offset"] is not None else (L["samples"] / 2 - 0.5)
            return c_row - y / self.res_m, c_col + x / self.res_m
        ppd = L["resolution_ppd"]
        return (90.0 - lat) * ppd - 0.5, np.mod(lon, 360.0) * ppd - 0.5

    def covers(self, lat, lon) -> np.ndarray:
        r, c = self.rowcol(lat, lon)
        return (r >= 0) & (c >= 0) & (r <= self.lbl["lines"] - 2) & (c <= self.lbl["samples"] - 2)

    def height(self, lat, lon) -> np.ndarray:
        """Bilinear height (m above 1737.4 km sphere)."""
        r, c = self.rowcol(np.asarray(lat, float), np.asarray(lon, float))
        if not self.polar:
            c = np.mod(c, self.lbl["samples"])  # wrap longitudes
        r = np.clip(r, 0, self.lbl["lines"] - 1.001)
        c = np.clip(c, 0, self.lbl["samples"] - 1.001)
        r0 = np.floor(r).astype(np.int64); c0 = np.floor(c).astype(np.int64)
        fr = r - r0; fc = c - c0
        c1 = np.minimum(c0 + 1, self.lbl["samples"] - 1) if self.polar else (c0 + 1) % self.lbl["samples"]
        r1 = np.minimum(r0 + 1, self.lbl["lines"] - 1)
        h = self.h
        v = (h[r0, c0] * (1 - fr) * (1 - fc) + h[r0, c1] * (1 - fr) * fc
             + h[r1, c0] * fr * (1 - fc) + h[r1, c1] * fr * fc)
        return v.astype(np.float64) * self.k


# ----------------------------------------------------------------------------- geometry
def destination(lat, lon, az, dist_m):
    """Great-circle destination (deg) from (lat, lon) along azimuth az (deg, from north) for dist_m."""
    φ1, λ1 = math.radians(lat), math.radians(lon)
    α = np.radians(az)[:, None]
    δ = (np.asarray(dist_m) / R_MOON)[None, :]
    sφ2 = np.sin(φ1) * np.cos(δ) + np.cos(φ1) * np.sin(δ) * np.cos(α)
    φ2 = np.arcsin(np.clip(sφ2, -1, 1))
    λ2 = λ1 + np.arctan2(np.sin(α) * np.sin(δ) * np.cos(φ1), np.cos(δ) - np.sin(φ1) * sφ2)
    return np.degrees(φ2), np.degrees(λ2)


def sample_distances(res_m: float, range_m: float) -> np.ndarray:
    """Start 1.5 px out (skip the observer's own pixel); step = max(res/2, 0.3% of distance)."""
    d, out = 1.5 * res_m, []
    while d <= range_m:
        out.append(d)
        d += max(res_m * 0.5, d * 0.003)
    return np.array(out)


def elevation_angles(h0_m, ht_m, d_m):
    """Exact elevation angle (deg) of terrain at ground distance d (arc) and height ht, seen
    from an observer at height h0 (both above the reference sphere). Includes curvature drop."""
    θ = d_m / R_MOON
    rt = R_MOON + ht_m
    horiz = rt * np.sin(θ)
    vert = rt * np.cos(θ) - (R_MOON + h0_m)  # ≈ ht - h0 - d²/2R
    return np.degrees(np.arctan2(vert, horiz))


def snap_to_high(dem: Dem, lat, lon, radius_m):
    """Highest DEM point within radius_m of (lat, lon) - used for rim/summit sites."""
    az = np.arange(0, 360, 2.0)
    d = np.arange(0, radius_m + 1, dem.res_m / 2)
    la, lo = destination(lat, lon, az, d)
    h = dem.height(la, lo)
    i = np.unravel_index(np.argmax(h), h.shape)
    return float(la[i]), float(np.mod(lo[i] + 180, 360) - 180), float(d[i[1]])


def horizon_profile(dem: Dem, lat, lon, observer_m, range_m, n_az=360):
    az = np.arange(n_az) * (360.0 / n_az)
    h_site = float(dem.height(np.array([lat]), np.array([lon]))[0])
    h0 = h_site + observer_m
    d = sample_distances(dem.res_m, range_m)
    la, lo = destination(lat, lon, az, d)
    inside = dem.covers(la, lo)
    ht = dem.height(la, lo)
    ang = elevation_angles(h0, ht, d[None, :])
    ang[~inside] = -90.0
    idx = np.argmax(ang, axis=1)
    hz = ang[np.arange(n_az), idx]
    coverage = float(inside.mean())
    return h_site, hz, d[idx], coverage


# ----------------------------------------------------------------------------- synthetic fallback
def synthetic_profile(site: dict) -> np.ndarray:
    """Deterministic, clearly-fake horizon so the UI can be developed without DEM access."""
    rng = np.random.default_rng(abs(hash(site["id"])) % (2**32))
    az = np.radians(np.arange(360))
    amp = {"south-pole": 1.2, "high-latitude": 1.0, "equatorial": 0.6, "far-side": 1.5}.get(site.get("region"), 1.0)
    if "floor" in site["id"] or "PSR" in site["name"]:
        amp, base = 3.0, 4.0
    else:
        base = 0.3
    prof = np.full(360, base)
    for k in range(1, 9):
        prof += amp / k * rng.uniform(0.2, 1.0) * np.sin(k * az + rng.uniform(0, 2 * np.pi))
    return np.maximum(prof, -1.5)


# ----------------------------------------------------------------------------- coarse DEM for the browser
def write_coarse_dem(dem: Dem, factor: int):
    """Block-average the polar DEM by `factor` for the in-browser 'custom coordinates' horizon (approximate)."""
    L = dem.lbl
    n = (L["lines"] // factor) * factor
    a = np.asarray(dem.h[:n, :n], dtype=np.float32).reshape(n // factor, factor, n // factor, factor).mean(axis=(1, 3))
    out = ROOT / "public" / "dem"
    out.mkdir(parents=True, exist_ok=True)
    name = f"south_polar_{int(dem.res_m * factor)}m"
    for old in out.glob("*.bin"):
        old.unlink()
    meta = {"name": name, "encoding": "base64 little-endian int16 DN, row-major; height_m = DN * scaleFactor", "source": dem.name.upper(), "size": n // factor, "resM": dem.res_m * factor,
            "scaleFactor": dem.k, "projection": "south polar stereographic (PDS DSMAP_POLAR), R=1737.4 km",
            "note": "row = c - y/res, col = c + x/res, c=(size-1)/2, x=r sin(lon), y=r cos(lon), r=2R tan((90+lat)/2)"}
    meta["data"] = base64.b64encode(np.round(a).astype("<i2").tobytes()).decode()
    (out / f"{name}.json").write_text(json.dumps(meta))
    print(f"wrote coarse DEM public/dem/{name}.json ({(out / f'{name}.json').stat().st_size / 1e6:.1f} MB) for custom sites")


def write_terrain_tile(dem: Dem, site_id: str, lat: float, lon: float, half_km=12.0, n=161):
    """Local height grid around a site for the 3D view: n×n samples on the site's tangent plane
    (x = east, y = north), heights relative to the site's surface and including curvature drop."""
    out = ROOT / "public" / "terrain"
    out.mkdir(parents=True, exist_ok=True)
    ax = np.linspace(-half_km * 1000, half_km * 1000, n)
    E, N = np.meshgrid(ax, ax[::-1])  # row 0 = north edge
    d = np.hypot(E, N)
    az = np.degrees(np.arctan2(E, N))
    φ1, λ1 = math.radians(lat), math.radians(lon)
    δ = d / R_MOON; α = np.radians(az)
    sφ2 = np.sin(φ1) * np.cos(δ) + np.cos(φ1) * np.sin(δ) * np.cos(α)
    φ2 = np.arcsin(np.clip(sφ2, -1, 1))
    λ2 = λ1 + np.arctan2(np.sin(α) * np.sin(δ) * np.cos(φ1), np.cos(δ) - np.sin(φ1) * sφ2)
    h = dem.height(np.degrees(φ2), np.degrees(λ2))
    h0 = float(dem.height(np.array([lat]), np.array([lon]))[0])
    z = h - h0 - d * d / (2 * R_MOON)
    (out / f"{site_id}.bin").unlink(missing_ok=True)
    (out / f"{site_id}.json").write_text(json.dumps({"n": n, "halfKm": half_km, "spacingM": 2 * half_km * 1000 / (n - 1),
        "unit": "m relative to site surface, tangent plane, curvature included", "dem": dem.name.upper(),
        "encoding": "base64 little-endian int16, row 0 = north edge, west to east",
        "data": base64.b64encode(np.round(z).astype("<i2").tobytes()).decode()}))


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--range-km", type=float, default=150.0)
    ap.add_argument("--observer-m", type=float, default=2.0)
    ap.add_argument("--synthetic", action="store_true", help="force synthetic profiles")
    ap.add_argument("--no-download", action="store_true")
    ap.add_argument("--no-series", action="store_true", help="skip the Sun/Earth series precompute (npm run series)")
    args = ap.parse_args()

    sites = json.loads(SITES.read_text())["sites"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    polar = glob = None
    if not args.synthetic:
        for name in POLAR_CANDIDATES:
            if (DEM_DIR / f"{name}.img").exists() or (not args.no_download and download(name)):
                polar = Dem(name); break
        for name in GLOBAL_CANDIDATES:
            if (DEM_DIR / f"{name}.img").exists() or (not args.no_download and download(name)):
                glob = Dem(name); break
    if polar is None and glob is None and not args.synthetic:
        print("!! No DEM available: falling back to SYNTHETIC horizon profiles.", file=sys.stderr)

    range_m = args.range_km * 1000
    print(f"{'site':22s} {'snap m':>6s} {'DEM':14s} {'res m':>6s} {'h_site m':>9s} {'hz min':>7s} {'hz max':>7s} {'hz mean':>7s} {'cover':>6s}")
    for s in sites:
        lat, lon = s["lat"], s["lon"]
        dem = None
        if polar is not None and lat <= -82.0:
            dem = polar
        elif glob is not None:
            dem = glob
        rec = {"id": s["id"], "azStepDeg": 1, "observerHeightM": args.observer_m, "maxRangeKm": args.range_km}
        if dem is None:
            hz = synthetic_profile(s)
            rec.update(lat=lat, lon=lon, snappedM=0, synthetic=True, dem="SYNTHETIC (not real terrain)", demResolutionM=None,
                       siteHeightM=0.0, horizonDeg=[round(float(v), 3) for v in hz], horizonDistKm=None)
            h_site, cov = 0.0, 0.0
        else:
            snap_m = 0.0
            if s.get("snapRadiusM"):
                lat, lon, snap_m = snap_to_high(dem, lat, lon, s["snapRadiusM"])
            h_site, hz, dist, cov = horizon_profile(dem, lat, lon, args.observer_m, range_m)
            if dem.polar:
                write_terrain_tile(dem, s["id"], lat, lon)
            else:  # ~1.9 km/px global DEM: a wider, coarser tile so the 3D view still shows landforms
                write_terrain_tile(dem, s["id"], lat, lon, half_km=60.0, n=121)
            rec.update(lat=round(lat, 5), lon=round(lon, 5), snappedM=round(snap_m),synthetic=False, dem=dem.name.upper(), demResolutionM=round(dem.res_m, 1),
                       siteHeightM=round(h_site, 1), rayCoverage=round(cov, 4),
                       horizonDeg=[round(float(v), 3) for v in hz],
                       horizonDistKm=[round(float(v) / 1000, 2) for v in dist])
        (OUT_DIR / f"{s['id']}.json").write_text(json.dumps(rec, separators=(",", ":")))
        print(f"{s['id']:22s} {rec['snappedM']:6.0f} {rec['dem'][:14]:14s} {str(rec['demResolutionM']):>6s} {h_site:9.0f} "
              f"{hz.min():7.2f} {hz.max():7.2f} {hz.mean():7.2f} {cov:6.1%}")
    print(f"wrote {len(sites)} profiles to {OUT_DIR.relative_to(ROOT)}/")
    if polar is not None:
        write_coarse_dem(polar, max(1, int(round(400 / polar.res_m))))
    if not args.no_series:
        import subprocess
        print("\nPrecomputing illumination / Earth-visibility series (npx tsx scripts/build_series.ts) ...", flush=True)
        subprocess.run(["npx", "tsx", "scripts/build_series.ts"], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
