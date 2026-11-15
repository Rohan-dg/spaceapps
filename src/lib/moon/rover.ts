/**
 * Rover range on battery alone: how far a rover can drive with no sunlight, and the ring it can reach.
 * First-order: flat-ground speed, no slope or route detours (the mission planner's A* route handles those).
 */
import { offsetPoint, type LatLon } from '../mission';
import { bodyFixedGeometry, skyFromGeometry, type BodyFixedGeometry } from '../ephemeris';
import { horizonAt } from '../horizon';
import { R_M } from './frames';
import type { HeightFn } from './probe';

export interface RoverInput { lat: number; lon: number; batteryH: number; speedKmH: number }
export interface RoverRange {
  oneWayKm: number; // drive until the battery is flat
  returnKm: number; // drive out and back to the start on one charge
  ring: LatLon[]; // one-way reach
  returnRing: LatLon[]; // out-and-back reach
}

export function validateRover(q: RoverInput): string | null {
  if (!isFinite(q.lat) || q.lat < -90 || q.lat > 90) return 'Latitude must be between −90 and 90.';
  if (!isFinite(q.lon) || q.lon < -180 || q.lon > 360) return 'Longitude must be between −180 and 360 (east positive).';
  if (!isFinite(q.batteryH) || q.batteryH <= 0) return 'Battery life must be more than 0 hours.';
  if (!isFinite(q.speedKmH) || q.speedKmH <= 0) return 'Speed must be more than 0 km/h.';
  return null;
}

/** Points on the circle `km` away from `c` (great-circle distance), `n` bearings. */
export function ringAround(c: LatLon, km: number, n = 256): LatLon[] {
  return Array.from({ length: n }, (_, i) => offsetPoint(c, km, (i * 360) / n));
}

export function roverRange(q: RoverInput, n = 256): RoverRange {
  const oneWayKm = q.batteryH * q.speedKmH, returnKm = oneWayKm / 2, c = { lat: q.lat, lon: q.lon };
  return { oneWayKm, returnKm, ring: ringAround(c, oneWayKm, n), returnRing: ringAround(c, returnKm, n) };
}

/* ---------- reaching sunlight on battery ---------- */

const D2R = Math.PI / 180;

/** Highest terrain elevation angle (deg) along one azimuth, seen from `obsM` above the ground. */
export function terrainAngleAlong(height: HeightFn, lat: number, lon: number, groundM: number, azDeg: number, resM: number, rangeKm = 150, obsM = 2): number {
  const h0 = R_M + groundM + obsM, φ1 = lat * D2R, λ1 = lon * D2R, sφ1 = Math.sin(φ1), cφ1 = Math.cos(φ1);
  const sα = Math.sin(azDeg * D2R), cα = Math.cos(azDeg * D2R);
  let best = -90;
  for (let d = Math.max(1.5 * resM, 20); d <= rangeKm * 1000; d += Math.max(resM, d * 0.01)) {
    const δ = d / R_M, cd = Math.cos(δ), sd = Math.sin(δ);
    const sφ2 = sφ1 * cd + cφ1 * sd * cα, φ2 = Math.asin(Math.max(-1, Math.min(1, sφ2)));
    const λ2 = λ1 + Math.atan2(sα * sd * cφ1, cd - sφ1 * sφ2);
    const ht = height(φ2 / D2R, λ2 / D2R);
    if (!isFinite(ht)) continue;
    const rt = R_M + ht, ang = Math.atan2(rt * cd - h0, rt * sd) / D2R;
    if (ang > best) best = ang;
  }
  return best;
}

/** Sun centre above the local terrain at a point and instant. */
export function sunlitAt(height: HeightFn, p: LatLon, g: BodyFixedGeometry, resM: number): boolean {
  const h = height(p.lat, p.lon);
  if (!isFinite(h)) return false;
  const k = skyFromGeometry(g, { lat: p.lat, lon: p.lon, heightM: h + 2 });
  if (k.sun.el < -1) return false; // below the geometric horizon: no terrain can help
  return k.sun.el > terrainAngleAlong(height, p.lat, p.lon, h, k.sun.az, resM);
}

export type SunPlan =
  | { kind: 'here' }
  | { kind: 'drive'; target: LatLon; km: number; hours: number; spareH: number }
  | { kind: 'wait'; hours: number }
  | { kind: 'none'; searchedKm: number };

/**
 * Can the rover reach sunlight before its battery runs out? Checks, in order: already sunlit; the nearest
 * point within the one-way range that is sunlit when the rover would arrive (straight drive at constant speed);
 * else whether the Sun rises over the start's own skyline (`startHz`) within the battery life.
 */
export function planSunlight(height: HeightFn, q: RoverInput, t: number, resM: number, startHz: number[] | null, opts = { rings: 24, bearings: 48 }): SunPlan {
  const c = { lat: q.lat, lon: q.lon };
  if (sunlitAt(height, c, bodyFixedGeometry(new Date(t)), resM)) return { kind: 'here' };
  const maxKm = q.batteryH * q.speedKmH;
  const step = maxKm / opts.rings;
  for (let i = 1; i <= opts.rings; i++) {
    const km = i * step, hours = km / q.speedKmH;
    const g = bodyFixedGeometry(new Date(t + hours * 3600000)); // the Sun as it will be on arrival
    let best: LatLon | null = null;
    for (let j = 0; j < opts.bearings; j++) {
      const p = offsetPoint(c, km, (j * 360) / opts.bearings);
      if (sunlitAt(height, p, g, resM)) { best = p; break; }
    }
    if (best) return { kind: 'drive', target: best, km, hours, spareH: q.batteryH - hours };
  }
  if (startHz) {
    const h0 = height(q.lat, q.lon), site = { lat: q.lat, lon: q.lon, heightM: (isFinite(h0) ? h0 : 0) + 2 };
    for (let m = 30; m <= q.batteryH * 60; m += 30) {
      const k = skyFromGeometry(bodyFixedGeometry(new Date(t + m * 60000)), site);
      if (k.sun.el > horizonAt(startHz, k.sun.az)) return { kind: 'wait', hours: m / 60 };
    }
  }
  return { kind: 'none', searchedKm: maxKm };
}
