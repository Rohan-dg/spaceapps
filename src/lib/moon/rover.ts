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
export function planSunlight(height: HeightFn, q: RoverInput, t: number, resM: number, startHz: number[] | null,
  opts: { rings?: number; bearings?: number; reachKm?: (bearingDeg: number) => number; parkedH?: number } = {}): SunPlan {
  const rings = opts.rings ?? 24, nb = opts.bearings ?? 48;
  const c = { lat: q.lat, lon: q.lon };
  if (sunlitAt(height, c, bodyFixedGeometry(new Date(t)), resM)) return { kind: 'here' };
  const maxKm = q.batteryH * q.speedKmH;
  const step = maxKm / rings;
  for (let i = 1; i <= rings; i++) {
    const km = i * step, hours = km / q.speedKmH;
    const g = bodyFixedGeometry(new Date(t + hours * 3600000)); // the Sun as it will be on arrival
    let best: LatLon | null = null;
    for (let j = 0; j < nb; j++) {
      const az = (j * 360) / nb;
      if (opts.reachKm && opts.reachKm(az) < km) continue; // a slope wall or the terrain's cost stops it short here
      const p = offsetPoint(c, km, az);
      if (sunlitAt(height, p, g, resM)) { best = p; break; }
    }
    if (best) return { kind: 'drive', target: best, km, hours, spareH: q.batteryH - hours };
  }
  if (startHz) {
    const h0 = height(q.lat, q.lon), site = { lat: q.lat, lon: q.lon, heightM: (isFinite(h0) ? h0 : 0) + 2 };
    // waiting parked draws only the hotel load, so it can last longer than driving
    for (let m = 30; m <= (opts.parkedH ?? q.batteryH) * 60; m += 30) {
      const k = skyFromGeometry(bodyFixedGeometry(new Date(t + m * 60000)), site);
      if (k.sun.el > horizonAt(startHz, k.sun.az)) return { kind: 'wait', hours: m / 60 };
    }
  }
  return { kind: 'none', searchedKm: maxKm };
}

/* ---------- terrain-aware reach (expert) ---------- */

export const LUNAR_G = 1.62; // m/s²

/** Rover and energy parameters for the terrain-aware reach. */
export interface RoverSpec {
  lat: number; lon: number;
  batteryWh: number; // nameplate capacity
  startPct: number; // charge at the start, % of capacity
  reservePct: number; // never drawn below this, % of capacity
  hotelW: number; // avionics, heaters, radio: drawn all the time
  driveW: number; // extra draw while driving on flat ground at full speed
  speedKmH: number; // flat-ground speed
  maxSlopeDeg: number; // steeper ground stops the rover
  slopeDerate: number; // fraction of speed lost at the slope limit (0..1)
  massKg: number; // for the climbing energy m·g·Δh
  drivetrainPct: number; // motor + gearbox efficiency when climbing, %
  detourPct: number; // extra path length over the straight line (wheel slip, weaving round rocks), %
  solarW?: number; // average charging power while driving (0 in the dark)
}

export interface ReachRay {
  bearing: number;
  oneWayKm: number; // straight-line distance reached before the battery hits the reserve
  returnKm: number; // furthest straight-line distance from which it can still drive back
  stop: 'battery' | 'slope' | 'data'; // what ended the one-way ray
  stopSlopeDeg: number | null; // the slope that stopped it, if any
  maxSlopeDeg: number; // steepest step met on the way out
  climbM: number; // total ascent on the way out
}

export interface Reach {
  usableWh: number;
  driveHFlat: number; // hours of driving on flat ground on the usable energy
  parkedH: number; // hours the rover survives parked (hotel load only)
  flatKm: number; // flat-ground, straight-line one-way limit (the old circle)
  stepM: number;
  gridM: number; // terrain grid spacing; slopes on features smaller than this are smoothed away
  rays: ReachRay[];
  ring: LatLon[]; // one-way boundary, one point per ray
  returnRing: LatLon[];
  oneWay: { min: number; median: number; max: number; areaKm2: number };
  ret: { min: number; median: number; max: number; areaKm2: number };
  blocked: number; // rays stopped by a slope wall
}

export function validateSpec(q: RoverSpec): string | null {
  const base = validateRover({ lat: q.lat, lon: q.lon, batteryH: 1, speedKmH: q.speedKmH });
  if (base) return base;
  if (!(q.batteryWh > 0)) return 'Battery capacity must be more than 0 Wh.';
  if (!(q.startPct > 0 && q.startPct <= 100)) return 'Starting charge must be between 0 and 100 %.';
  if (!(q.reservePct >= 0 && q.reservePct < q.startPct)) return 'Reserve must be at least 0 % and below the starting charge.';
  if (!(q.hotelW >= 0) || !(q.driveW >= 0) || q.hotelW + q.driveW <= 0) return 'Hotel and drive power must be 0 W or more, and not both 0.';
  if (!(q.maxSlopeDeg > 0 && q.maxSlopeDeg < 60)) return 'Maximum slope must be between 0 and 60°.';
  if (!(q.slopeDerate >= 0 && q.slopeDerate <= 0.95)) return 'Slope speed loss must be between 0 and 95 %.';
  if (!(q.massKg >= 0)) return 'Mass must be 0 kg or more.';
  if (!(q.drivetrainPct > 0 && q.drivetrainPct <= 100)) return 'Drivetrain efficiency must be between 0 and 100 %.';
  if (!(q.detourPct >= 0 && q.detourPct <= 300)) return 'Detour must be between 0 and 300 %.';
  if (q.solarW !== undefined && !(q.solarW >= 0)) return 'Solar charging must be 0 W or more.';
  return null;
}

const speedOn = (q: RoverSpec, slopeDeg: number) =>
  q.speedKmH * Math.max(0.05, 1 - q.slopeDerate * Math.min(1, Math.abs(slopeDeg) / q.maxSlopeDeg));

const stats = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b), n = s.length;
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  // area of the star-shaped region: Σ ½ r² Δθ (flat-map approximation, fine well below the Moon's radius)
  const dθ = (2 * Math.PI) / n, areaKm2 = v.reduce((a, r) => a + 0.5 * r * r * dθ, 0);
  return { min: s[0], median, max: s[n - 1], areaKm2 };
};

/**
 * Terrain-aware reach. Each bearing is marched outward along the great circle in steps of `stepM`; every step
 * costs (hotel + drive − solar) × time at the slope-derated speed, plus m·g·Δh / efficiency when climbing (no
 * regeneration downhill). Ground steeper than the slope limit ends the ray. The return radius is the furthest
 * point from which the same path can be driven back on what is left: the way back costs the same time and the
 * climbs that were descents on the way out.
 */
export function roverReach(height: HeightFn, q: RoverSpec, resM: number, bearings = 180): Reach {
  const usableWh = (q.batteryWh * (q.startPct - q.reservePct)) / 100;
  const netW = Math.max(1e-6, q.hotelW + q.driveW - (q.solarW ?? 0));
  const driveHFlat = usableWh / netW;
  const parkedH = q.hotelW > 0 ? usableWh / q.hotelW : Infinity;
  const detour = 1 + q.detourPct / 100;
  const flatKm = (driveHFlat * q.speedKmH) / detour;
  // step at the terrain grid spacing, but at least 40 and at most 600 samples per direction (never under 10 m)
  const stepM = Math.max(10, Math.min(Math.max(resM, (flatKm * 1000) / 600), (flatKm * 1000) / 40));
  const climbWhPerM = (q.massKg * LUNAR_G) / (3600 * (q.drivetrainPct / 100)); // Wh per metre of ascent
  const c = { lat: q.lat, lon: q.lon };
  const h0 = height(q.lat, q.lon);
  const rays: ReachRay[] = [];
  for (let j = 0; j < bearings; j++) {
    const bearing = (j * 360) / bearings;
    let prevH = isFinite(h0) ? h0 : NaN, out = 0, back = 0, d = 0;
    let oneWayKm = 0, returnKm = 0, stop: ReachRay['stop'] = 'battery', stopSlopeDeg: number | null = null, maxSlope = 0, climbM = 0;
    if (!isFinite(prevH)) stop = 'data';
    while (isFinite(prevH)) {
      const dNext = d + stepM, p = offsetPoint(c, dNext / 1000, bearing), h = height(p.lat, p.lon);
      if (!isFinite(h)) { stop = 'data'; break; }
      const dh = h - prevH, slope = (Math.atan2(Math.abs(dh), stepM) * 180) / Math.PI;
      if (slope > q.maxSlopeDeg) { stop = 'slope'; stopSlopeDeg = slope; break; }
      const hours = (stepM * detour) / 1000 / speedOn(q, slope);
      const timeWh = netW * hours;
      const eOut = timeWh + Math.max(0, dh) * climbWhPerM, eBack = timeWh + Math.max(0, -dh) * climbWhPerM;
      if (out + eOut > usableWh) { // battery runs out inside this step: interpolate
        oneWayKm = (d + stepM * Math.max(0, (usableWh - out) / eOut)) / 1000;
        break;
      }
      out += eOut; back += eBack; d = dNext; prevH = h;
      if (dh > 0) climbM += dh;
      if (slope > maxSlope) maxSlope = slope;
      oneWayKm = d / 1000;
      if (out + back <= usableWh) returnKm = d / 1000;
    }
    rays.push({ bearing, oneWayKm, returnKm, stop, stopSlopeDeg, maxSlopeDeg: maxSlope, climbM });
  }
  return {
    usableWh, driveHFlat, parkedH, flatKm, stepM, gridM: resM, rays,
    ring: rays.map((r) => offsetPoint(c, r.oneWayKm, r.bearing)),
    returnRing: rays.map((r) => offsetPoint(c, r.returnKm, r.bearing)),
    oneWay: stats(rays.map((r) => r.oneWayKm)),
    ret: stats(rays.map((r) => r.returnKm)),
    blocked: rays.filter((r) => r.stop === 'slope').length,
  };
}

/** Round-trip energy (Wh) to drive `km` straight out along `bearing` and back, or null if a slope wall is in the way. */
export function roundTripWh(height: HeightFn, q: RoverSpec, km: number, bearing: number, stepM: number): number | null {
  const netW = Math.max(1e-6, q.hotelW + q.driveW - (q.solarW ?? 0)), detour = 1 + q.detourPct / 100;
  const climbWhPerM = (q.massKg * LUNAR_G) / (3600 * (q.drivetrainPct / 100));
  const c = { lat: q.lat, lon: q.lon }, n = Math.max(1, Math.ceil((km * 1000) / stepM)), ds = (km * 1000) / n;
  let prevH = height(q.lat, q.lon), e = 0;
  for (let i = 1; i <= n; i++) {
    const p = offsetPoint(c, (i * ds) / 1000, bearing), h = height(p.lat, p.lon);
    if (!isFinite(h) || !isFinite(prevH)) return null;
    const dh = h - prevH, slope = (Math.atan2(Math.abs(dh), ds) * 180) / Math.PI;
    if (slope > q.maxSlopeDeg) return null;
    e += 2 * netW * ((ds * detour) / 1000 / speedOn(q, slope)) + Math.abs(dh) * climbWhPerM;
    prevH = h;
  }
  return e;
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 3 commits), under the team's direction. Attribution from the commit history.
