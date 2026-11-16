/**
 * Point probe for the 3D Moon: the terrain skyline at any clicked point, then whether the Sun and Earth
 * clear it now and for what share of the next lunar cycle. Heights come from whatever the 3D view has
 * loaded (site patch 5–20 m, polar cap 148 m, global 4k grid), so results are approximate away from the
 * precomputed sites.
 */
import { bodyFixedGeometry, skyFromGeometry, type BodyFixedGeometry } from '../ephemeris';
import { enuBasis } from '../geometry';
import { diskVisibleFraction, horizonAt } from '../horizon';
import { R_M } from './frames';

const D2R = Math.PI / 180;
export const OBSERVER_M = 2;
export const SYNODIC_MS = 29.530589 * 86400000;

/** Height (m above the 1737.4 km sphere) at lat/lon, NaN where nothing is loaded. */
export type HeightFn = (latDeg: number, lonDeg: number) => number;

/**
 * Max terrain elevation angle (deg) at each whole azimuth 0..359 seen from an observer `obsM` above the
 * ground. Exact spherical geometry (same as raymarch.ts); steps start at `resM` and grow with distance.
 */
export function horizonFrom(height: HeightFn, lat: number, lon: number, groundM: number, resM: number, rangeKm = 150, obsM = OBSERVER_M): number[] {
  const h0 = R_M + groundM + obsM;
  const dists: number[] = [];
  for (let d = Math.max(1.5 * resM, 10); d <= rangeKm * 1000; d += Math.max(resM * 0.5, d * 0.004)) dists.push(d);
  const φ1 = lat * D2R, λ1 = lon * D2R, sφ1 = Math.sin(φ1), cφ1 = Math.cos(φ1);
  const cd = dists.map((d) => Math.cos(d / R_M)), sd = dists.map((d) => Math.sin(d / R_M));
  const out: number[] = [];
  for (let az = 0; az < 360; az++) {
    const sα = Math.sin(az * D2R), cα = Math.cos(az * D2R);
    let best = -90;
    for (let i = 0; i < dists.length; i++) {
      const sφ2 = sφ1 * cd[i] + cφ1 * sd[i] * cα;
      const φ2 = Math.asin(Math.max(-1, Math.min(1, sφ2)));
      const λ2 = λ1 + Math.atan2(sα * sd[i] * cφ1, cd[i] - sφ1 * sφ2);
      const ht = height(φ2 / D2R, λ2 / D2R);
      if (!isFinite(ht)) continue;
      const rt = R_M + ht;
      const ang = Math.atan2(rt * cd[i] - h0, rt * sd[i]) / D2R;
      if (ang > best) best = ang;
    }
    out.push(best);
  }
  return out;
}

export interface ProbeNow {
  sunPct: number; // % of the solar disc above the skyline
  sunEl: number; sunAz: number; sunClear: number; // clearance above the skyline, deg
  earthUp: boolean; earthPct: number; earthEl: number; earthAz: number; earthClear: number;
}

export function probeNow(lat: number, lon: number, groundM: number, hz: number[], t: number): ProbeNow {
  const site = { lat, lon, heightM: groundM + OBSERVER_M };
  const k = skyFromGeometry(bodyFixedGeometry(new Date(t)), site);
  const hs = horizonAt(hz, k.sun.az), he = horizonAt(hz, k.earth.az);
  return {
    sunPct: diskVisibleFraction(k.sun.el, k.sun.radiusDeg, hs) * 100, sunEl: k.sun.el, sunAz: k.sun.az, sunClear: k.sun.el - hs,
    earthUp: k.earth.el > he, earthPct: diskVisibleFraction(k.earth.el, k.earth.radiusDeg, he) * 100,
    earthEl: k.earth.el, earthAz: k.earth.az, earthClear: k.earth.el - he,
  };
}

export interface ProbePeriod { t0: number; t1: number; sunPct: number; earthPct: number; longestDarkH: number; longestNoEarthH: number }

let geomCache: { t0: number; step: number; g: BodyFixedGeometry[] } | null = null;

/** Share of [t0, t0 + one synodic month) with the Sun (centre) and Earth (centre) above the skyline. */
export function probePeriod(lat: number, lon: number, groundM: number, hz: number[], t0: number, stepMin = 30): ProbePeriod {
  const step = stepMin * 60000, n = Math.ceil(SYNODIC_MS / step);
  if (!geomCache || geomCache.t0 !== t0 || geomCache.step !== step) {
    const g: BodyFixedGeometry[] = [];
    for (let i = 0; i < n; i++) g.push(bodyFixedGeometry(new Date(t0 + i * step)));
    geomCache = { t0, step, g };
  }
  const site = { lat, lon, heightM: groundM + OBSERVER_M }, basis = enuBasis(site);
  let sun = 0, earth = 0, dark = 0, noE = 0, maxDark = 0, maxNoE = 0;
  for (const g of geomCache.g) {
    const k = skyFromGeometry(g, site, basis);
    const su = k.sun.el > horizonAt(hz, k.sun.az), eu = k.earth.el > horizonAt(hz, k.earth.az);
    if (su) { sun++; dark = 0; } else maxDark = Math.max(maxDark, ++dark);
    if (eu) { earth++; noE = 0; } else maxNoE = Math.max(maxNoE, ++noE);
  }
  const h = stepMin / 60;
  return { t0, t1: t0 + n * step, sunPct: (sun / n) * 100, earthPct: (earth / n) * 100, longestDarkH: maxDark * h, longestNoEarthH: maxNoE * h };
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
