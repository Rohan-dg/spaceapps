/**
 * Coordinate helpers for the 3D Moon. World units are kilometres in the Moon-fixed frame
 * (x toward 0°N 0°E, y toward 0°N 90°E, z toward the north pole), the same frame the ephemeris uses.
 *
 * South polar stereographic grid (LOLA PDS convention): r = 2R tan((90 + lat) / 2),
 * x = r sin(lon), y = r cos(lon), in metres. Row 0 of a grid image is +y.
 */
export const R_M = 1737400;
export const R_KM = 1737.4;
const D = Math.PI / 180;

export type V3 = [number, number, number];

export function dirOf(latDeg: number, lonDeg: number): V3 {
  const φ = latDeg * D, λ = lonDeg * D;
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
}

/** Moon-fixed position (km) of a point at a height (m) above the 1737.4 km sphere. */
export function posOf(latDeg: number, lonDeg: number, hM: number): V3 {
  const d = dirOf(latDeg, lonDeg), r = R_KM + hM / 1000;
  return [d[0] * r, d[1] * r, d[2] * r];
}

export function enu(latDeg: number, lonDeg: number): { e: V3; n: V3; u: V3 } {
  const φ = latDeg * D, λ = lonDeg * D, sφ = Math.sin(φ), cφ = Math.cos(φ), sλ = Math.sin(λ), cλ = Math.cos(λ);
  return { e: [-sλ, cλ, 0], n: [-sφ * cλ, -sφ * sλ, cφ], u: [cφ * cλ, cφ * sλ, sφ] };
}

export function stereoXY(latDeg: number, lonDeg: number): [number, number] {
  const r = 2 * R_M * Math.tan(((90 + latDeg) * D) / 2);
  return [r * Math.sin(lonDeg * D), r * Math.cos(lonDeg * D)];
}

export function stereoLatLon(x: number, y: number): [number, number] {
  const r = Math.hypot(x, y);
  return [(2 * Math.atan(r / (2 * R_M))) / D - 90, Math.atan2(x, y) / D];
}

/** A height grid on the south polar stereographic projection. */
export interface PolarGrid {
  /** heights in metres above the reference sphere, row-major, row 0 = north edge (+y) */
  h: Float32Array;
  n: number;
  resM: number;
  /** stereographic x of column 0's centre and y of row 0's centre */
  x0: number;
  y0: number;
}

/** Bilinear height at stereographic (x, y); NaN outside the grid. */
export function sampleGrid(g: PolarGrid, x: number, y: number): number {
  const c = (x - g.x0) / g.resM, r = (g.y0 - y) / g.resM;
  if (c < 0 || r < 0 || c > g.n - 1 || r > g.n - 1) return NaN;
  const c0 = Math.floor(c), r0 = Math.floor(r), c1 = Math.min(c0 + 1, g.n - 1), r1 = Math.min(r0 + 1, g.n - 1);
  const fc = c - c0, fr = r - r0, h = g.h, n = g.n;
  const a = h[r0 * n + c0] * (1 - fc) + h[r0 * n + c1] * fc;
  const b = h[r1 * n + c0] * (1 - fc) + h[r1 * n + c1] * fc;
  return a * (1 - fr) + b * fr;
}

/** Equirectangular height grid, lon 0 at the centre column, row 0 = 90°N. */
export interface EqGrid { h: Float32Array; w: number; hgt: number }

export function sampleEq(g: EqGrid, latDeg: number, lonDeg: number): number {
  const u = (((lonDeg + 180) % 360) + 360) % 360 / 360 * g.w - 0.5;
  const v = (90 - latDeg) / 180 * g.hgt - 0.5;
  const c0 = Math.floor(u), r0 = Math.max(0, Math.min(g.hgt - 1, Math.floor(v)));
  const fc = u - c0, fr = Math.max(0, Math.min(1, v - r0));
  const cA = ((c0 % g.w) + g.w) % g.w, cB = (cA + 1) % g.w, r1 = Math.min(r0 + 1, g.hgt - 1);
  const h = g.h, w = g.w;
  const a = h[r0 * w + cA] * (1 - fc) + h[r0 * w + cB] * fc;
  const b = h[r1 * w + cA] * (1 - fc) + h[r1 * w + cB] * fc;
  return a * (1 - fr) + b * fr;
}
