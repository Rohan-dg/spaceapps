/**
 * Real-terrain tiles: 5 x 5 degree LOLA ldem_64 blocks from the NASA SVS CGI Moon Kit, built by
 * scripts/build_terrain_tiles.py. Heights are corner-registered, so tile (r, c) sample (i, j) sits exactly at
 * latitude lat0 - r*deg - i*deg/n and longitude lon0 + c*deg + j*deg/n, and neighbours share edge samples.
 */
import { R_KM, dirOf } from './frames';

export interface TileIndex {
  deg: number; n: number; rows: number; cols: number; lat0: number; lon0: number;
  quantumM: number; colorPx: number; source: string; hMinM: number[][];
}

/** Decoded heights of one tile: (n + 1)^2 metres, row 0 on the north edge. */
export interface TileHeights { r: number; c: number; n: number; h: Float32Array }

export const tileKey = (r: number, c: number) => `${r}_${c}`;

/** North-west corner of a tile in degrees. */
export function tileOrigin(idx: TileIndex, r: number, c: number): [number, number] {
  return [idx.lat0 - r * idx.deg, idx.lon0 + c * idx.deg];
}

/** Row and column of the tile holding a point, or null outside the tiled band (south of 80S). */
export function tileAt(idx: TileIndex, lat: number, lon: number): [number, number] | null {
  const r = Math.floor((idx.lat0 - lat) / idx.deg);
  const lo = ((((lon - idx.lon0) % 360) + 360) % 360);
  const c = Math.min(idx.cols - 1, Math.floor(lo / idx.deg));
  if (r < 0 || r >= idx.rows) return null;
  return [r, c];
}

/**
 * Bilinear height (m) inside a tile at grid stride `step` (1 = every sample; the drawn mesh uses 2).
 * Returns NaN outside the tile.
 */
export function tileHeight(idx: TileIndex, t: TileHeights, lat: number, lon: number, step = 1): number {
  const [la0, lo0] = tileOrigin(idx, t.r, t.c);
  let dl = lon - lo0;
  dl = ((dl % 360) + 360) % 360;
  const fx = dl / idx.deg, fy = (la0 - lat) / idx.deg;
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return NaN;
  const m = t.n / step;
  const x = fx * m, y = fy * m;
  const j = Math.min(m - 1, Math.floor(x)), i = Math.min(m - 1, Math.floor(y));
  const ax = x - j, ay = y - i, W = t.n + 1;
  const at = (ii: number, jj: number) => t.h[ii * step * W + jj * step];
  return (at(i, j) * (1 - ax) + at(i, j + 1) * ax) * (1 - ay) + (at(i + 1, j) * (1 - ax) + at(i + 1, j + 1) * ax) * ay;
}

export interface TileMeshData {
  center: [number, number, number];   // km, Moon-fixed
  position: Float32Array;             // km relative to center
  up: Float32Array; uv: Float32Array; h: Float32Array; index: Uint32Array;
}

/**
 * Mesh for one tile at grid stride `step`, true scale, plus a skirt hanging `skirtKm` below each edge so a
 * neighbour that is not loaded yet never leaves a visible crack.
 */
export function buildTileMesh(idx: TileIndex, t: TileHeights, step = 2, skirtKm = 2): TileMeshData {
  const [la0, lo0] = tileOrigin(idx, t.r, t.c);
  const m = t.n / step, W = t.n + 1, V = m + 1;
  const center = dirOf(la0 - idx.deg / 2, lo0 + idx.deg / 2).map((v) => v * R_KM) as [number, number, number];
  const nv = V * V + 4 * V;
  const position = new Float32Array(nv * 3), up = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), h = new Float32Array(nv);
  const put = (k: number, fx: number, fy: number, hm: number, drop: number) => {
    const d = dirOf(la0 - fy * idx.deg, lo0 + fx * idx.deg);
    const rad = R_KM + hm / 1000 - drop;
    position[k * 3] = d[0] * rad - center[0]; position[k * 3 + 1] = d[1] * rad - center[1]; position[k * 3 + 2] = d[2] * rad - center[2];
    up[k * 3] = d[0]; up[k * 3 + 1] = d[1]; up[k * 3 + 2] = d[2];
    uv[k * 2] = fx; uv[k * 2 + 1] = fy; h[k] = hm;
  };
  for (let i = 0; i < V; i++) for (let j = 0; j < V; j++) put(i * V + j, j / m, i / m, t.h[i * step * W + j * step], 0);
  // skirts: north, south, west, east edges
  const edges: [number, number][][] = [
    Array.from({ length: V }, (_, j) => [0, j]), Array.from({ length: V }, (_, j) => [m, j]),
    Array.from({ length: V }, (_, i) => [i, 0]), Array.from({ length: V }, (_, i) => [i, m]),
  ];
  edges.forEach((edge, e) => edge.forEach(([i, j], k) => put(V * V + e * V + k, j / m, i / m, t.h[i * step * W + j * step], skirtKm)));
  const tris: number[] = [];
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    const a = i * V + j, b = a + V;
    tris.push(a, b, a + 1, a + 1, b, b + 1);
  }
  edges.forEach((edge, e) => {
    for (let k = 0; k < m; k++) {
      const [i0, j0] = edge[k], [i1, j1] = edge[k + 1];
      const t0 = i0 * V + j0, t1 = i1 * V + j1, s0 = V * V + e * V + k, s1 = s0 + 1;
      tris.push(t0, s0, t1, t1, s0, s1);
    }
  });
  return { center, position, up, uv, h, index: new Uint32Array(tris) };
}
