/**
 * Shadow map around a site: which ground cells of the site's terrain tile are sunlit at a given time, and the
 * share of a period each cell is lit. Works on the precomputed tile (public/terrain/<id>.json: n×n heights on
 * the site's tangent plane, curvature drop included).
 *
 * Method: for every cell, the terrain horizon inside the tile is traced at NAZ azimuths (once per site, in a
 * worker). A cell is lit when the Sun's elevation, as seen from that cell (local vertical tilted by the
 * Moon's curvature), clears both its own tile horizon and the distant skyline beyond the tile (taken from the
 * site's 150 km horizon profile, used only where that skyline lies outside the tile). The Sun is treated as
 * a point at its centre. Ground level, no mast.
 */
export const NAZ = 72; // 5° azimuth bins
const R_M = 1737400;
const D2R = Math.PI / 180;

export interface Tile { n: number; halfKm: number; spacingM: number; z: Int16Array; dem: string }

/** Per-cell horizon (centidegrees, Int16, [cell * NAZ + bin]) from heights relative to the site plane. */
export function cellHorizons(tile: Tile): Int16Array {
  const { n, spacingM, z } = tile;
  const c0 = (n - 1) / 2;
  // back out the curvature drop baked into the tile: true height above the site's sphere level
  const h = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const d2 = ((r - c0) ** 2 + (c - c0) ** 2) * spacingM * spacingM;
    h[r * n + c] = z[r * n + c] + d2 / (2 * R_M);
  }
  let hMax = -Infinity;
  for (let i = 0; i < h.length; i++) if (h[i] > hMax) hMax = h[i];
  const out = new Int16Array(n * n * NAZ);
  const dr = new Float32Array(NAZ), dc = new Float32Array(NAZ);
  for (let a = 0; a < NAZ; a++) { const az = (a * 360 / NAZ) * D2R; dc[a] = Math.sin(az); dr[a] = -Math.cos(az); }
  // step lengths in cells: fine near the cell, coarser further out
  const steps: number[] = [];
  for (let k = 1; k < n * 1.5; k += Math.max(1, k * 0.04)) steps.push(k);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const hA = h[r * n + c], base = (r * n + c) * NAZ;
      for (let a = 0; a < NAZ; a++) {
        let best = -Infinity;
        for (const k of steps) {
          const rr = Math.round(r + dr[a] * k), cc = Math.round(c + dc[a] * k);
          if (rr < 0 || cc < 0 || rr >= n || cc >= n) break;
          const s = k * spacingM;
          // nothing further out can be higher than the tile's highest point: stop once even that wouldn't beat best
          if (Math.atan((hMax - hA) / s) - s / (2 * R_M) <= best) break;
          const ang = Math.atan((h[rr * n + cc] - hA) / s) - s / (2 * R_M);
          if (ang > best) best = ang;
        }
        out[base + a] = best === -Infinity ? -9000 : Math.max(-9000, Math.round(best / D2R * 100));
      }
    }
  }
  return out;
}

/** Interpolated tile horizon (deg) of cell i at azimuth az. */
export function hzAt(hz: Int16Array, i: number, az: number): number {
  const x = (((az % 360) + 360) % 360) / (360 / NAZ);
  const a0 = Math.floor(x) % NAZ, a1 = (a0 + 1) % NAZ, f = x - Math.floor(x);
  return (hz[i * NAZ + a0] * (1 - f) + hz[i * NAZ + a1] * f) / 100;
}

export interface SunDir { az: number; el: number }

/**
 * Lit mask (1 = sunlit) for one Sun direction. `farHz` is the distant skyline (deg) at the Sun's azimuth, or
 * −90 when nothing beyond the tile blocks it.
 */
export function litMask(tile: Tile, hz: Int16Array, sun: SunDir, farHz: number, out = new Uint8Array(tile.n * tile.n)): Uint8Array {
  const { n, spacingM } = tile;
  const c0 = (n - 1) / 2;
  if (sun.el < farHz || sun.el < -2) { out.fill(0); return out; }
  const ce = Math.cos(sun.el * D2R), sE = ce * Math.sin(sun.az * D2R), sN = ce * Math.cos(sun.az * D2R), sU = Math.sin(sun.el * D2R);
  for (let r = 0; r < n; r++) {
    const N = (c0 - r) * spacingM / R_M;
    for (let c = 0; c < n; c++) {
      const E = (c - c0) * spacingM / R_M;
      const elC = Math.asin((sE * E + sN * N + sU) / Math.sqrt(1 + E * E + N * N)) / D2R;
      const i = r * n + c;
      out[i] = elC > hzAt(hz, i, sun.az) ? 1 : 0;
    }
  }
  return out;
}

/** Share of `suns` (0–250 per cell) during which each cell is lit. */
export function litFraction(tile: Tile, hz: Int16Array, suns: (SunDir & { far: number })[]): Uint8Array {
  const nn = tile.n * tile.n, acc = new Uint16Array(nn), m = new Uint8Array(nn);
  for (const s of suns) { litMask(tile, hz, s, s.far, m); for (let i = 0; i < nn; i++) acc[i] += m[i]; }
  const out = new Uint8Array(nn);
  for (let i = 0; i < nn; i++) out[i] = suns.length ? Math.round(acc[i] / suns.length * 250) : 0;
  return out;
}

/** Unit surface normals (E, N, U) from the tile, for shading. */
export function normals(tile: Tile): Float32Array {
  const { n, spacingM, z } = tile, out = new Float32Array(n * n * 3);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const zl = z[r * n + Math.max(0, c - 1)], zr = z[r * n + Math.min(n - 1, c + 1)];
    const zu = z[Math.max(0, r - 1) * n + c], zd = z[Math.min(n - 1, r + 1) * n + c];
    const gx = (zr - zl) / (2 * spacingM), gy = (zu - zd) / (2 * spacingM); // dz/dE, dz/dN
    const k = 1 / Math.sqrt(gx * gx + gy * gy + 1), i = (r * n + c) * 3;
    out[i] = -gx * k; out[i + 1] = -gy * k; out[i + 2] = k;
  }
  return out;
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
