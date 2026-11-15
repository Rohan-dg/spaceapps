import { Ray, Vector3 } from 'three';
import { type EqGrid, type PolarGrid, R_KM, dirOf, posOf, sampleEq, sampleGrid, stereoLatLon, stereoXY } from './frames';

export const CAMERA_CLEARANCE_KM = 0.001;
// mesh density only sets the silhouette; slopes, colour and shadows are per pixel from the height maps
export const CAP_SEGMENTS = 383;
export const GLOBE_SEGMENTS = 360;
export const CORE_DEPTH_KM = 9.6;

export interface MoonSurface {
  eq: EqGrid | null;
  cap: PolarGrid | null;
  hi: PolarGrid | null;
  exag: number;
  capHalfM: number;
  /** Height (m) of a drawn real-terrain tile at a point, NaN where none is drawn (the globe is hidden there). */
  tileH?: (lat: number, lon: number) => number;
}

/** Match the rendered triangles, rather than the finer DEM used for lighting and science. */
export function createSurfaceSampler(state: () => MoonSurface) {
  const ray = new Ray(), hit = new Vector3();
  const corners = Array.from({ length: 4 }, () => new Vector3());
  function quad(vertex: (r: number, c: number) => [number, number, number], r: number, c: number, globe = false) {
    corners[0].set(...vertex(r, c)); corners[1].set(...vertex(r, c + 1));
    corners[2].set(...vertex(r + 1, c)); corners[3].set(...vertex(r + 1, c + 1));
    const triangles = globe ? [[1, 0, 3], [0, 2, 3]] : [[0, 2, 1], [1, 2, 3]];
    let radius = 0;
    for (const [a, b, c] of triangles) {
      if (ray.intersectTriangle(corners[a], corners[b], corners[c], false, hit)) radius = Math.max(radius, hit.length());
    }
    return radius;
  }
  function polar(g: PolarGrid, x: number, y: number, stepM: number, x0: number, y0: number, cells: number, exag: number) {
    const col = (x - x0) / stepM, row = (y0 - y) / stepM;
    if (col < 0 || row < 0 || col > cells || row > cells) return 0;
    const c = Math.min(cells - 1, Math.floor(col)), r = Math.min(cells - 1, Math.floor(row));
    const vertex = (rr: number, cc: number) => {
      const xx = x0 + cc * stepM, yy = y0 - rr * stepM;
      // The GPU clamps to edge texels, including the half texel outside the cap DEM.
      const h = sampleGrid(g, Math.max(g.x0, Math.min(g.x0 + (g.n - 1) * g.resM, xx)), Math.max(g.y0 - (g.n - 1) * g.resM, Math.min(g.y0, yy)));
      return posOf(...stereoLatLon(xx, yy), h * exag);
    };
    let radius = quad(vertex, r, c);
    // A spherical triangle edge projects to a slight curve in stereographic coordinates.
    if (!radius) {
      for (let rr = Math.max(0, r - 1); rr <= Math.min(cells - 1, r + 1); rr++) {
        for (let cc = Math.max(0, c - 1); cc <= Math.min(cells - 1, c + 1); cc++) radius = Math.max(radius, quad(vertex, rr, cc));
      }
    }
    return radius;
  }
  return (position: Vector3): number => {
    const s = state();
    if (!position.lengthSq()) return R_KM;
    ray.direction.copy(position).normalize();
    const lat = Math.asin(Math.max(-1, Math.min(1, ray.direction.z))) * 180 / Math.PI;
    const lon = Math.atan2(ray.direction.y, ray.direction.x) * 180 / Math.PI;
    let radius = R_KM - CORE_DEPTH_KM * s.exag;
    if (s.tileH && lat > -80) {
      const th = s.tileH(lat, lon);
      if (!isNaN(th)) return Math.max(radius, R_KM + (th * s.exag) / 1000);
    }
    if (!s.cap || lat >= -80.05) {
      const step = 360 / GLOBE_SEGMENTS;
      const col = Math.min(GLOBE_SEGMENTS - 1, Math.floor((lon + 180) / step));
      const row = Math.min(GLOBE_SEGMENTS / 2 - 1, Math.floor((90 - lat) / step));
      const vertex = (r: number, c: number) => {
        const la = 90 - r * step, lo = c * step - 180;
        return posOf(la, lo, s.eq ? sampleEq(s.eq, la, lo) * s.exag : 0);
      };
      const globeRadius = quad(vertex, row, col, true);
      // At a pole or an exact shared edge, floating point intersection can miss both triangles.
      radius = Math.max(radius, globeRadius || R_KM + (s.eq ? sampleEq(s.eq, lat, lon) * s.exag / 1000 : 0));
    }
    if (lat <= -80) {
      const [x, y] = stereoXY(lat, lon), g = s.hi;
      const col = g ? (x - g.x0) / g.resM : -1, row = g ? (g.y0 - y) / g.resM : -1;
      const patchCoversCap = g && col > 1.5 && row > 1.5 && col < g.n - 2.5 && row < g.n - 2.5;
      if (s.cap && !patchCoversCap) radius = Math.max(radius, polar(s.cap, x, y, 2 * s.capHalfM / CAP_SEGMENTS, -s.capHalfM, s.capHalfM, CAP_SEGMENTS, s.exag));
      if (g) {
        const step = g.n > 1100 ? 2 : 1;
        radius = Math.max(radius, polar(g, x, y, step * g.resM, g.x0, g.y0, Math.floor((g.n - 1) / step), s.exag));
      }
    }
    return radius;
  };
}

/** Keep panning targets on the surface, then enforce clearance before the frame is drawn. */
export function constrainCamera(position: Vector3, target: Vector3, radiusAt: (p: Vector3) => number, lockTarget: boolean) {
  if (lockTarget && target.lengthSq() > 1) {
    const snapped = target.clone().setLength(radiusAt(target));
    position.add(snapped.clone().sub(target));
    target.copy(snapped);
  }
  if (!position.lengthSq()) position.set(...dirOf(-90, 0)).multiplyScalar(R_KM + 1);
  const floor = radiusAt(position) + CAMERA_CLEARANCE_KM;
  if (position.length() < floor) position.setLength(floor);
}
