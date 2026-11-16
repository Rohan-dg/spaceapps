/**
 * Slope-aware route planning on the 400 m south-polar DEM: A* over the 8-connected grid,
 * with cells joined only where the slope between them is under the rover's limit and a cost that
 * grows with slope. Runs in a Web Worker (src/workers/route.ts). Stereographic scale (< 1% south of
 * 80.5° S) is ignored.
 */
import { gcDistanceKm, gcInterp, type LatLon, type Route, type RoutePoint, type Waypoint } from './mission';
import { computeHorizon, demHeight, latLonOf, rowcol, type PolarDem } from './raymarch';

const R2D = 180 / Math.PI;

class Heap {
  private k: number[] = []; private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop(): number {
    const k = this.k, v = this.v, top = v[0], lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0; const n = k.length;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

/** Count stretches steeper than `limit` along a sequence of slopes, and their total length. */
function hazards(pts: { dKm: number; slopeDeg: number | null }[], limit: number) {
  let count = 0, km = 0, inside = false;
  for (let i = 1; i < pts.length; i++) {
    const s = pts[i].slopeDeg ?? 0;
    if (s > limit) { if (!inside) count++; inside = true; km += pts[i].dKm - pts[i - 1].dKm; } else inside = false;
  }
  return { count, km };
}

export interface PlanOptions { maxSlopeDeg: number; observerM?: number; horizonRangeKm?: number; maxWaypoints?: number }

export function planRoute(dem: PolarDem, a: LatLon, b: LatLon, o: PlanOptions): Route {
  const N = dem.size, res = dem.resM, H = (i: number) => dem.data[i] * dem.scaleFactor;
  const [ra, ca] = rowcol(dem, a.lat, a.lon).map(Math.round);
  const [rb, cb] = rowcol(dem, b.lat, b.lon).map(Math.round);
  const inside = (r: number, c: number) => r >= 1 && c >= 1 && r <= N - 2 && c <= N - 2;
  if (!inside(ra, ca) || !inside(rb, cb)) throw new Error('Both ends must be inside the polar DEM (south of 80.5° S).');
  const directKm = gcDistanceKm(a, b);

  // Straight-line profile: sampled every cell width, slope over each step.
  const nStraight = Math.max(2, Math.ceil((directKm * 1000) / res) + 1);
  const straight: RoutePoint[] = [];
  for (let i = 0; i < nStraight; i++) {
    const f = i / (nStraight - 1), p = gcInterp(a, b, f), h = demHeight(dem, p.lat, p.lon);
    const prev = straight[i - 1];
    const dKm = f * directKm;
    const slope = prev && prev.hM !== null && isFinite(h) ? Math.atan(Math.abs(h - prev.hM) / Math.max(1, (dKm - prev.dKm) * 1000)) * R2D : null;
    straight.push({ ...p, dKm, hM: isFinite(h) ? h : null, slopeDeg: i ? slope : 0 });
  }
  const hzDirect = hazards(straight, o.maxSlopeDeg);

  // A* in a padded bounding box; widen it once if the detour needs more room.
  const span = Math.max(Math.abs(ra - rb), Math.abs(ca - cb));
  let search = astar(Math.max(25, Math.round(span * 0.75)));
  if (!search.found) search = astar(Math.max(80, span * 2));
  const { found, goal, parent, W, r0, c0 } = search;

  function astar(pad: number) {
    const r0 = Math.max(1, Math.min(ra, rb) - pad), r1 = Math.min(N - 2, Math.max(ra, rb) + pad);
    const c0 = Math.max(1, Math.min(ca, cb) - pad), c1 = Math.min(N - 2, Math.max(ca, cb) + pad);
    const W = c1 - c0 + 1, Hh = r1 - r0 + 1, M = W * Hh;
    const g = new Float64Array(M).fill(Infinity), parent = new Int32Array(M).fill(-1), closed = new Uint8Array(M);
    const idx = (r: number, c: number) => (r - r0) * W + (c - c0);
    const start = idx(ra, ca), goal = idx(rb, cb);
    const tanMax = Math.tan((o.maxSlopeDeg * Math.PI) / 180);
    const heap = new Heap();
    g[start] = 0; heap.push(Math.hypot(ra - rb, ca - cb) * res, start);
    const DR = [-1, -1, -1, 0, 0, 1, 1, 1], DC = [-1, 0, 1, -1, 1, -1, 0, 1];
    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      if (cur === goal) { found = true; break; }
      closed[cur] = 1;
      const r = r0 + Math.floor(cur / W), c = c0 + (cur % W), hc = H(r * N + c);
      for (let k = 0; k < 8; k++) {
        const nr = r + DR[k], nc = c + DC[k];
        if (nr < r0 || nr > r1 || nc < c0 || nc > c1) continue;
        const ni = idx(nr, nc);
        if (closed[ni]) continue;
        const len = res * (DR[k] && DC[k] ? Math.SQRT2 : 1);
        const grade = Math.abs(H(nr * N + nc) - hc) / len;
        if (grade > tanMax) continue;
        const q = grade / tanMax;
        const ng = g[cur] + len * (1 + 2 * q * q);
        if (ng < g[ni]) { g[ni] = ng; parent[ni] = cur; heap.push(ng + Math.hypot(nr - rb, nc - cb) * res, ni); }
      }
    }
    return { found, goal, parent, W, r0, c0 };
  }

  let points: RoutePoint[];
  if (found) {
    const cells: number[] = [];
    for (let x = goal; x >= 0; x = parent[x]) cells.push(x);
    cells.reverse();
    points = [];
    let d = 0;
    cells.forEach((cell, i) => {
      const r = r0 + Math.floor(cell / W), c = c0 + (cell % W);
      const [lat, lon] = latLonOf(dem, r, c), h = H(r * N + c);
      let slope = 0;
      if (i) {
        const pr = r0 + Math.floor(cells[i - 1] / W), pc = c0 + (cells[i - 1] % W);
        const len = res * Math.hypot(r - pr, c - pc);
        d += len / 1000;
        slope = Math.atan(Math.abs(h - H(pr * N + pc)) / len) * R2D;
      }
      points.push({ lat, lon, dKm: d, hM: h, slopeDeg: slope });
    });
    // Pin the exact ends (the grid path starts and ends at the nearest cell centres).
    points[0] = { ...points[0], lat: a.lat, lon: a.lon };
    points[points.length - 1] = { ...points[points.length - 1], lat: b.lat, lon: b.lon };
  } else {
    points = straight;
  }
  const lengthKm = points[points.length - 1].dKm;
  const slopes = points.slice(1).map((p) => p.slopeDeg ?? 0);
  const hzRoute = hazards(points, o.maxSlopeDeg);

  // Waypoints: evenly spaced along the route, each with its own terrain horizon.
  const k = Math.max(2, Math.min(o.maxWaypoints ?? 10, Math.round(lengthKm / 2) + 1));
  const waypoints: Waypoint[] = [];
  for (let i = 0; i < k; i++) {
    const target = (i / (k - 1)) * lengthKm;
    let j = 0;
    while (j < points.length - 1 && points[j].dKm < target) j++;
    const p = points[j];
    let horizonDeg: number[] | null = null;
    try { horizonDeg = computeHorizon(dem, p.lat, p.lon, o.observerM ?? 2, o.horizonRangeKm ?? 150).horizonDeg; } catch { /* edge of the grid */ }
    waypoints.push({ lat: p.lat, lon: p.lon, dKm: p.dKm, hM: p.hM, horizonDeg });
  }

  // Local slope at the landing site: central differences on the grid.
  const gx = (H(ra * N + ca + 1) - H(ra * N + ca - 1)) / (2 * res), gy = (H((ra + 1) * N + ca) - H((ra - 1) * N + ca)) / (2 * res);

  return {
    terrain: true, found, directKm, lengthKm, points, waypoints,
    maxSlopeDeg: slopes.length ? Math.max(...slopes) : 0,
    meanSlopeDeg: slopes.length ? slopes.reduce((s, x) => s + x, 0) / slopes.length : 0,
    hazardsDirect: hzDirect.count, hazardKmDirect: hzDirect.km, hazardsRoute: hzRoute.count,
    siteSlopeDeg: Math.atan(Math.hypot(gx, gy)) * R2D, demResM: res,
    note: found
      ? `Planned on ${res} m terrain, avoiding slopes over ${o.maxSlopeDeg}°. Boulders and craters smaller than ~${res} m are not visible at this resolution.`
      : `No path keeps every slope under ${o.maxSlopeDeg}° between these points. Showing the straight line and its hazards instead.`,
  };
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
