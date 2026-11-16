/**
 * Estimated flight path for a planned launch: ascent, parking orbit, trans-lunar injection (TLI), coast,
 * lunar orbit insertion (LOI) and descent, timed so the craft lands at the planned moment.
 *
 * Model: patched conics, first order. Only Earth's gravity acts from TLI to the Moon's distance; the Moon's
 * gravity and the Sun are ignored on the way out, then the arrival speed relative to the Moon sets the LOI burn.
 * The transfer orbit's perigee is the TLI point in the parking orbit; its plane is the launch plane (pad and Moon
 * at arrival), and the coast time is solved so the craft reaches the Moon's distance exactly when the Moon gets there.
 * Real missions refine this with full n-body trajectory design and mid-course corrections.
 */
import * as Astro from 'astronomy-engine';
import type { LaunchSite } from './launch';

export const MU_E = 398600.4418; // km³/s²
export const MU_M = 4902.8001;
export const R_E = 6378.137; // km
export const R_MOON = 1737.4;
export const PARK_ALT = 185; // km, typical low parking orbit
export const LLO_ALT = 100; // km, low lunar orbit
export const ASCENT_MIN = 9; // launch to parking-orbit insertion
export const ASCENT_DOWNRANGE_DEG = 17; // ~1,900 km downrange at insertion
export const LUNAR_ORBIT_H = 24; // time in low lunar orbit before descent
export const DESCENT_DV = 1.9; // km/s, low lunar orbit to the surface (typical)
export const ASCENT_DV = 9.4; // km/s to low Earth orbit, including gravity and drag losses (typical)

type V = [number, number, number];
const D = Math.PI / 180, HOUR = 3600000, DAY = 86400000;
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V): V => { const n = norm(a); return [a[0] / n, a[1] / n, a[2] / n]; };
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const scale = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
/** Rotate unit vector `r` (in the plane with normal `n`) by `ang` radians about `n`. */
const rot = (r: V, n: V, ang: number): V => add(scale(r, Math.cos(ang)), cross(n, r), Math.sin(ang));

/** Moon's geocentric position (km, J2000 equator). */
export function moonPos(t: number): V {
  const v = Astro.GeoMoon(Astro.MakeTime(new Date(t)));
  const k = 149597870.7;
  return [v.x * k, v.y * k, v.z * k];
}
function moonVel(t: number): V {
  const a = moonPos(t - 60000), b = moonPos(t + 60000);
  return scale(add(b, a, -1), 1 / 120);
}
/** Launch pad direction (unit, J2000 equator) at a time. */
export function padDir(site: LaunchSite, t: number): V {
  const time = Astro.MakeTime(new Date(t));
  const lst = (Astro.SiderealTime(time) * 15 + site.lon) * D, la = site.lat * D;
  const v = Astro.RotateVector(Astro.Rotation_EQD_EQJ(time), new Astro.Vector(Math.cos(la) * Math.cos(lst), Math.cos(la) * Math.sin(lst), Math.sin(la), time));
  return unit([v.x, v.y, v.z]);
}

/** Time (s) from perigee (radius rp, speed vp) out to radius r; Infinity when the orbit never gets there. */
export function timeToRadius(rp: number, vp: number, r: number, mu = MU_E): number {
  const e = (rp * vp * vp) / mu - 1;
  const eps = (vp * vp) / 2 - mu / rp;
  if (Math.abs(e - 1) < 1e-9) { // parabola: Barker's equation
    const p = 2 * rp, nu = Math.acos(Math.min(1, p / r - 1)), Dp = Math.tan(nu / 2);
    return Math.sqrt((p * p * p) / mu) / 2 * (Dp + (Dp * Dp * Dp) / 3);
  }
  const a = -mu / (2 * eps);
  if (e < 1) {
    if (r > a * (1 + e)) return Infinity;
    const E = Math.acos(Math.max(-1, Math.min(1, (1 - r / a) / e)));
    return (E - e * Math.sin(E)) * Math.sqrt((a * a * a) / mu);
  }
  const F = Math.acosh(Math.max(1, (1 - r / a) / e));
  return (e * Math.sinh(F) - F) * Math.sqrt((-a * a * a) / mu);
}
/** True anomaly (rad) at radius r on the outbound leg. */
const trueAnomaly = (rp: number, vp: number, r: number, mu = MU_E) => {
  const e = (rp * vp * vp) / mu - 1, p = rp * (1 + e);
  return Math.acos(Math.max(-1, Math.min(1, (p / r - 1) / e)));
};

/** Perigee speed that reaches radius r in exactly `tofS` seconds (slowest is the transfer whose apogee is r). */
export function solvePerigeeSpeed(rp: number, r: number, tofS: number): { vp: number; clamped: boolean } {
  const vMin = Math.sqrt(2 * MU_E * r / (rp * (rp + r))) * (1 + 1e-9); // apogee exactly at r
  if (timeToRadius(rp, vMin, r) <= tofS) return { vp: vMin, clamped: true };
  let lo = vMin, hi = Math.sqrt(2 * MU_E / rp) * 2;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (timeToRadius(rp, m, r) > tofS) lo = m; else hi = m; }
  return { vp: (lo + hi) / 2, clamped: false };
}

export interface PathPoint { t: number; pos: V } // km, J2000 geocentric
export interface FlightPlan {
  launch: number; insertion: number; tli: number; loi: number; landing: number;
  coastMin: number; transferH: number; lunarOrbitH: number;
  inclination: number; // deg, parking/transfer plane
  dv: { ascent: number; tli: number; loi: number; descent: number; total: number }; // km/s
  vInfMoon: number; // km/s, arrival speed relative to the Moon
  apogeeKm: number | null; // null for an escape (hyperbolic) transfer
  transfer: PathPoint[]; moonPath: PathPoint[];
  frame: { x: V; y: V; n: V }; // plane basis for drawing: x = toward the Moon at arrival
  tliPos: V; insertionPos: V; arrivalPos: V;
  longTransfer: boolean; // asked-for transit longer than the slowest direct transfer: the extra time is spent in lunar orbit
}

/**
 * Plan the flight from `site` launching at `launch` to land at `landing`. The path is in the plane through the pad
 * at launch and the Moon at arrival, prograde (eastward).
 */
export function planFlight(site: LaunchSite, launch: number, landing: number, boostKmS: number): FlightPlan {
  const rp = R_E + PARK_ALT, parkPeriodS = 2 * Math.PI * Math.sqrt((rp * rp * rp) / MU_E);
  let lunarOrbitH = LUNAR_ORBIT_H;
  let arrival = landing - lunarOrbitH * HOUR;
  const insertion = launch + ASCENT_MIN * 60000;
  const pad = padDir(site, launch);
  let coastS = 0, vp = 0, nu = 0, tli: V = pad, n: V = [0, 0, 1], ins: V = pad, mArr: V = moonPos(arrival);
  for (let it = 0; it < 8; it++) {
    mArr = moonPos(arrival);
    n = unit(cross(pad, mArr));
    if (n[2] < 0) n = scale(n, -1); // prograde
    const padIn = unit(add(pad, n, -dot(pad, n)));
    ins = rot(padIn, n, ASCENT_DOWNRANGE_DEG * D);
    const tofS = (arrival - insertion) / 1000 - coastS;
    const sol = solvePerigeeSpeed(rp, norm(mArr), tofS);
    vp = sol.vp;
    if (sol.clamped) {
      // slowest direct transfer is shorter than asked: arrive earlier and spend the rest in lunar orbit
      const tMax = timeToRadius(rp, vp, norm(mArr));
      arrival = insertion + (coastS + tMax) * 1000;
      lunarOrbitH = (landing - arrival) / HOUR;
    }
    nu = trueAnomaly(rp, vp, norm(mArr));
    tli = rot(unit(mArr), n, -nu);
    // coast from insertion to the TLI point, moving prograde
    let ang = Math.atan2(dot(cross(ins, tli), n), dot(ins, tli));
    if (ang < 0) ang += 2 * Math.PI;
    coastS = (ang / (2 * Math.PI)) * parkPeriodS;
  }
  const tliT = insertion + coastS * 1000;
  const e = (rp * vp * vp) / MU_E - 1, p = rp * (1 + e);
  const transfer: PathPoint[] = [];
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const f = (nu * i) / steps, r = p / (1 + e * Math.cos(f));
    transfer.push({ t: tliT + timeToRadius(rp, vp, r) * 1000, pos: scale(rot(tli, n, f), r) });
  }
  const moonPath: PathPoint[] = [];
  for (let i = 0; i <= 60; i++) { const t = tliT + ((arrival - tliT) * i) / 60; moonPath.push({ t, pos: moonPos(t) }); }
  // arrival speed relative to the Moon, then the LOI burn into a 100 km circular orbit
  const rhat = unit(mArr), that = cross(n, rhat), h = Math.sqrt(MU_E * p);
  const vSc = add(scale(rhat, (MU_E / h) * e * Math.sin(nu)), that, (MU_E / h) * (1 + e * Math.cos(nu)));
  const vInf = norm(add(vSc, moonVel(arrival), -1));
  const rl = R_MOON + LLO_ALT;
  const loiDv = Math.sqrt(vInf * vInf + (2 * MU_M) / rl) - Math.sqrt(MU_M / rl);
  const tliDv = vp - Math.sqrt(MU_E / rp);
  const ascent = ASCENT_DV - boostKmS;
  const a = 1 / (2 / rp - (vp * vp) / MU_E);
  const x = unit(mArr);
  return {
    launch, insertion, tli: tliT, loi: arrival, landing,
    coastMin: coastS / 60, transferH: (arrival - tliT) / HOUR, lunarOrbitH,
    inclination: Math.acos(Math.min(1, Math.abs(n[2]))) / D,
    dv: { ascent, tli: tliDv, loi: loiDv, descent: DESCENT_DV, total: ascent + tliDv + loiDv + DESCENT_DV },
    vInfMoon: vInf, apogeeKm: e < 1 ? a * (1 + e) - R_E : null,
    transfer, moonPath, frame: { x, y: cross(n, x), n },
    tliPos: scale(tli, rp), insertionPos: scale(ins, rp), arrivalPos: mArr,
    longTransfer: lunarOrbitH > LUNAR_ORBIT_H + 0.01,
  };
}

export const DAY_MS = DAY;

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
