/**
 * Terrain for the rover game: the same LOLA heights the rest of the app uses, read in a flat local frame.
 *
 * Two grids on the south polar stereographic plane: the 20 m window around the site (public/hires) and a crop of
 * the 148 m polar grid for everything farther out. The game works in local metres from the site (e east, n north).
 * This module has no DOM or three.js in it: the game's worker and its tests import it too.
 */
import { R_M, stereoLatLon, stereoXY } from '../lib/moon/frames';
import { diskVisibleFraction } from '../lib/horizon';

export interface Grid { h: Float32Array | Int16Array; n: number; resM: number; x0: number; y0: number }
export interface World {
  hi: Grid | null; cap: Grid;
  lat: number; lon: number;
  /** site position on the stereographic plane, the local east and north unit vectors there, and the map scale */
  xs: number; ys: number; E: [number, number]; N: [number, number]; k: number;
  /** DEM height at the site, metres above the 1737.4 km sphere */
  h0: number;
}

/** Bilinear height at stereographic (x, y); NaN outside the grid. */
export function bilinear(g: Grid, x: number, y: number): number {
  const c = (x - g.x0) / g.resM, r = (g.y0 - y) / g.resM, n = g.n;
  if (!(c >= 0 && r >= 0 && c <= n - 1 && r <= n - 1)) return NaN;
  const c0 = c | 0, r0 = r | 0, c1 = c0 + 1 < n ? c0 + 1 : c0, r1 = r0 + 1 < n ? r0 + 1 : r0, fc = c - c0, fr = r - r0, h = g.h;
  const a = h[r0 * n + c0] * (1 - fc) + h[r0 * n + c1] * fc, b = h[r1 * n + c0] * (1 - fc) + h[r1 * n + c1] * fc;
  return a * (1 - fr) + b * fr;
}

/** Catmull-Rom height: smooth across the 20 m cells, so the ground under the wheels has no creases. */
export function bicubic(g: Grid, x: number, y: number): number {
  const c = (x - g.x0) / g.resM, r = (g.y0 - y) / g.resM, n = g.n;
  if (!(c >= 1 && r >= 1 && c <= n - 3 && r <= n - 3)) return bilinear(g, x, y);
  const c0 = c | 0, r0 = r | 0, fc = c - c0, fr = r - r0, h = g.h;
  const w = (f: number): [number, number, number, number] => [((-f + 2) * f - 1) * f * 0.5, ((3 * f - 5) * f * f + 2) * 0.5, ((-3 * f + 4) * f + 1) * f * 0.5, (f - 1) * f * f * 0.5];
  const wc = w(fc), wr = w(fr);
  let s = 0;
  for (let j = 0; j < 4; j++) {
    const o = (r0 - 1 + j) * n + c0 - 1;
    s += wr[j] * (h[o] * wc[0] + h[o + 1] * wc[1] + h[o + 2] * wc[2] + h[o + 3] * wc[3]);
  }
  return s;
}

export function makeWorld(hi: Grid | null, cap: Grid, lat: number, lon: number): World {
  const [xs, ys] = stereoXY(lat, lon), l = (lon * Math.PI) / 180;
  const w: World = { hi, cap, lat, lon, xs, ys, E: [Math.cos(l), -Math.sin(l)], N: [Math.sin(l), Math.cos(l)], k: 1 + (Math.hypot(xs, ys) / (2 * R_M)) ** 2, h0: 0 };
  w.h0 = demAt(w, xs, ys);
  return w;
}

/** DEM height (m) at a stereographic point: the 20 m window where it has data, else the 148 m grid. NaN off both. */
export function demAt(w: World, x: number, y: number): number {
  if (w.hi) { const h = bilinear(w.hi, x, y); if (h === h) return h; }
  return bilinear(w.cap, x, y);
}

export const toStereo = (w: World, e: number, n: number): [number, number] =>
  [w.xs + w.k * (e * w.E[0] + n * w.N[0]), w.ys + w.k * (e * w.E[1] + n * w.N[1])];
export function toLatLon(w: World, e: number, n: number): [number, number] { const [x, y] = toStereo(w, e, n); return stereoLatLon(x, y); }

// small-scale relief the 20 m DEM cannot hold: value noise, a few tens of centimetres. Looks only; never used for Sun or Earth tests.
const hash = (i: number, j: number) => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
export const detail = (e: number, n: number) => 0.34 * (vnoise(e / 14, n / 14) - 0.5) + 0.12 * (vnoise(e / 4.3, n / 4.3) - 0.5) + 0.035 * (vnoise(e / 1.2, n / 1.2) - 0.5);

/** Height (m) of the ground at a local point, relative to the site, with the Moon's curve taken off so far ground sinks below the horizon. */
export function groundY(w: World, e: number, n: number, fine: boolean): number {
  const [x, y] = toStereo(w, e, n);
  let h = fine && w.hi ? bicubic(w.hi, x, y) : NaN;
  if (h !== h) h = demAt(w, x, y);
  if (h !== h) h = w.h0;
  return h - w.h0 - (e * e + n * n) / (2 * R_M) + (fine ? detail(e, n) : 0);
}

/**
 * Highest terrain elevation angle (deg) along one compass direction from a stereographic point, and how far away
 * that terrain is. The same test the app's horizon profiles make (ray against terrain on a curved Moon), marched on
 * the projection plane so it is cheap enough to run for every texel of a shadow map. `stopDeg`: give up early once
 * the terrain is this high (the body is certainly hidden).
 */
export function skyline(w: World, x: number, y: number, groundM: number, azDeg: number, obsM: number, stopDeg = 90, rangeM = 150000): { ang: number; dist: number } {
  const lam = Math.atan2(x, y), a = (azDeg * Math.PI) / 180, k = 1 + (Math.hypot(x, y) / (2 * R_M)) ** 2;
  const dx = (Math.sin(a) * Math.cos(lam) + Math.cos(a) * Math.sin(lam)) * k, dy = (-Math.sin(a) * Math.sin(lam) + Math.cos(a) * Math.cos(lam)) * k;
  const h0 = R_M + groundM + obsM, stop = Math.tan((Math.min(stopDeg, 89) * Math.PI) / 180);
  let best = -1e9, bestD = 0;
  for (let d = 12; d <= rangeM; d += d < 400 ? 10 : d * 0.03 < 20 ? 20 : d * 0.03 > 600 ? 600 : d * 0.03) {
    const ht = demAt(w, x + dx * d, y + dy * d);
    if (ht !== ht) break;
    const del = d / R_M, rt = R_M + ht, t = (rt * (1 - del * del / 2) - h0) / (rt * del);
    if (t > best) { best = t; bestD = d; if (t > stop) break; }
  }
  return { ang: best < -1e8 ? -90 : (Math.atan(best) * 180) / Math.PI, dist: bestD };
}

/** A body's direction as local azimuth and elevation (deg) at a stereographic point, from its Moon-fixed unit vector. */
export function azElOf(u: readonly number[], x: number, y: number): [number, number] {
  const [lat, lon] = stereoLatLon(x, y), p = (lat * Math.PI) / 180, l = (lon * Math.PI) / 180;
  const sp = Math.sin(p), cp = Math.cos(p), sl = Math.sin(l), cl = Math.cos(l);
  const up = u[0] * cp * cl + u[1] * cp * sl + u[2] * sp, east = -u[0] * sl + u[1] * cl, north = -u[0] * sp * cl - u[1] * sp * sl + u[2] * cp;
  return [(Math.atan2(east, north) * 180) / Math.PI, (Math.asin(Math.max(-1, Math.min(1, up))) * 180) / Math.PI];
}

/**
 * Visibility map of a body over a square of ground centred on the site: one byte per texel, 0 hidden to 255 fully
 * in view (the Sun's disc can be partly up). Row 0 is the north edge. `u` is the body's Moon-fixed unit vector.
 */
export function visibilityMap(w: World, u: readonly number[], radiusDeg: number, halfM: number, n: number, obsM: number): Uint8Array {
  const out = new Uint8Array(n * n), step = (2 * halfM) / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const [x, y] = toStereo(w, -halfM + (i + 0.5) * step, halfM - (j + 0.5) * step);
    const g = demAt(w, x, y);
    if (g !== g) continue;
    const [az, el] = azElOf(u, x, y);
    if (el < -3) continue; // below even a mountain-top horizon
    const s = skyline(w, x, y, g, az, obsM, el + radiusDeg + 0.02);
    out[j * n + i] = Math.round(255 * diskVisibleFraction(el, radiusDeg, s.ang));
  }
  return out;
}
