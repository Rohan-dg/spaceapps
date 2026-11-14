/**
 * In-browser horizon ray-marching on a (coarse) south-polar stereographic DEM.
 * TypeScript port of scripts/build_horizons.py (same projection, same exact-curvature geometry).
 */
const R_M = 1737400;
const D2R = Math.PI / 180;

export interface PolarDem { data: Int16Array; size: number; resM: number; scaleFactor: number }

export function rowcol(dem: PolarDem, lat: number, lon: number): [number, number] {
  const r = 2 * R_M * Math.tan(((90 + lat) * D2R) / 2);
  const x = r * Math.sin(lon * D2R), y = r * Math.cos(lon * D2R);
  const c = (dem.size - 1) / 2;
  return [c - y / dem.resM, c + x / dem.resM];
}

/** Inverse of rowcol: grid (row, col) to planetocentric lat/lon (deg). */
export function latLonOf(dem: PolarDem, row: number, col: number): [number, number] {
  const c = (dem.size - 1) / 2;
  const x = (col - c) * dem.resM, y = (c - row) * dem.resM;
  const r = Math.hypot(x, y);
  return [(2 * Math.atan(r / (2 * R_M))) / D2R - 90, ((Math.atan2(x, y) / D2R) + 360) % 360];
}

/** Bilinear height (m) or NaN outside the grid. */
export function demHeight(dem: PolarDem, lat: number, lon: number): number {
  const [r, c] = rowcol(dem, lat, lon);
  if (!(r >= 0 && c >= 0 && r <= dem.size - 2 && c <= dem.size - 2)) return NaN;
  const r0 = Math.floor(r), c0 = Math.floor(c), fr = r - r0, fc = c - c0, n = dem.size, d = dem.data;
  const i = r0 * n + c0;
  return (d[i] * (1 - fr) * (1 - fc) + d[i + 1] * (1 - fr) * fc + d[i + n] * fr * (1 - fc) + d[i + n + 1] * fr * fc) * dem.scaleFactor;
}

export interface HorizonResult { horizonDeg: number[]; horizonDistKm: number[]; siteHeightM: number; coverage: number }

export function computeHorizon(dem: PolarDem, lat: number, lon: number, observerM = 2, rangeKm = 150): HorizonResult {
  const hSite = demHeight(dem, lat, lon);
  if (!isFinite(hSite)) throw new Error('Site is outside the DEM coverage (south of 80°S only).');
  const h0 = R_M + hSite + observerM;
  const dists: number[] = [];
  for (let d = 1.5 * dem.resM; d <= rangeKm * 1000; d += Math.max(dem.resM * 0.5, d * 0.003)) dists.push(d);
  const φ1 = lat * D2R, λ1 = lon * D2R, sφ1 = Math.sin(φ1), cφ1 = Math.cos(φ1);
  const horizonDeg: number[] = [], horizonDistKm: number[] = [];
  let inside = 0, total = 0;
  for (let az = 0; az < 360; az++) {
    const α = az * D2R, sα = Math.sin(α), cα = Math.cos(α);
    let best = -90, bestD = 0;
    for (const d of dists) {
      const δ = d / R_M, sδ = Math.sin(δ), cδ = Math.cos(δ);
      const sφ2 = sφ1 * cδ + cφ1 * sδ * cα;
      const φ2 = Math.asin(Math.max(-1, Math.min(1, sφ2)));
      const λ2 = λ1 + Math.atan2(sα * sδ * cφ1, cδ - sφ1 * sφ2);
      total++;
      const ht = demHeight(dem, φ2 / D2R, λ2 / D2R);
      if (!isFinite(ht)) continue;
      inside++;
      const rt = R_M + ht;
      const ang = Math.atan2(rt * cδ - h0, rt * sδ) / D2R;
      if (ang > best) { best = ang; bestD = d; }
    }
    horizonDeg.push(Math.round(best * 1000) / 1000);
    horizonDistKm.push(Math.round(bestD / 10) / 100);
  }
  return { horizonDeg, horizonDistKm, siteHeightM: hSite, coverage: inside / total };
}

export interface TerrainTile { n: number; halfKm: number; z: Int16Array }

/**
 * Local height grid around a site for the 3D view (TypeScript port of write_terrain_tile in
 * scripts/build_horizons.py): n×n samples on the site's tangent plane, row 0 = north edge,
 * west to east, heights in metres relative to the site's surface, curvature drop included.
 */
export function terrainTile(dem: PolarDem, lat: number, lon: number, halfKm = 12, n = 161): TerrainTile {
  const h0 = demHeight(dem, lat, lon);
  if (!isFinite(h0)) throw new Error('Site is outside the DEM coverage (south of 80°S only).');
  const half = halfKm * 1000, step = (2 * half) / (n - 1);
  const φ1 = lat * D2R, λ1 = lon * D2R, sφ1 = Math.sin(φ1), cφ1 = Math.cos(φ1);
  const z = new Int16Array(n * n);
  for (let r = 0; r < n; r++) {
    const N = half - r * step;
    for (let c = 0; c < n; c++) {
      const E = -half + c * step;
      const d = Math.hypot(E, N), α = Math.atan2(E, N), δ = d / R_M;
      const sφ2 = sφ1 * Math.cos(δ) + cφ1 * Math.sin(δ) * Math.cos(α);
      const φ2 = Math.asin(Math.max(-1, Math.min(1, sφ2)));
      const λ2 = λ1 + Math.atan2(Math.sin(α) * Math.sin(δ) * cφ1, Math.cos(δ) - sφ1 * sφ2);
      const h = demHeight(dem, φ2 / D2R, λ2 / D2R);
      z[r * n + c] = isFinite(h) ? Math.round(h - h0 - (d * d) / (2 * R_M)) : 0;
    }
  }
  return { n, halfKm, z };
}
