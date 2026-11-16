/**
 * Mission model: a rover driving from the landing site to a destination, with a simple power budget.
 * Everything here is pure (no React) so it can be unit-tested. Values flagged "estimate" in the UI are
 * first-order models, not engineering predictions; see the notes next to each function.
 */
import { bothCount } from './calendar';
import { bodyFixedGeometry, skyFromGeometry, type BodyFixedGeometry } from './ephemeris';
import { enuBasis, MOON_RADIUS_KM, type Site } from './geometry';
import { diskVisibleFraction, horizonAt, type HorizonProfile } from './horizon';
import type { Series } from './series';

export const SOLAR_CONSTANT = 1361; // W/m², at 1 AU
export const SIGMA = 5.670374e-8; // Stefan–Boltzmann, W/m²/K⁴
export const REGOLITH_ALBEDO = 0.12;
export const REGOLITH_EMISSIVITY = 0.95;
export const SHADOW_TEMP_K = 95; // typical night-side / shadowed surface
export const PSR_TEMP_K = 40; // permanently shadowed crater floors
/** JPL Horizons check (docs/MATH.md, README): 20 Sun/Earth comparisons at 10 site-times. */
export const EPHEMERIS_ERROR = { maxElDeg: 0.0025, maxAzDeg: 0.0036, comparisons: 20 };

const D2R = Math.PI / 180;
const HOUR = 3600_000;

export type Dest = { kind: 'offset'; km: number; bearing: number } | { kind: 'coords'; lat: number; lon: number };

export interface MissionPlan {
  departure: number; // ms UTC: "Date of Mission"
  durationDays: number;
  dest: Dest;
  speedKmH: number; // nominal speed on flat ground
  maxSlopeDeg: number; // steepest traversable slope
  slopeDerate: number; // fraction of speed lost at the slope limit (0..1)
  batteryWh: number;
  startPct: number;
  reservePct: number;
  panelM2: number;
  panelEffPct: number;
  panelMode: 'vertical' | 'tracking';
  hotelW: number; // always-on load: avionics, heaters, radio
  driveW: number; // extra load while driving
}

export const DEFAULT_PLAN: Omit<MissionPlan, 'departure'> = {
  durationDays: 14,
  dest: { kind: 'offset', km: 8, bearing: 90 },
  speedKmH: 0.5,
  maxSlopeDeg: 15,
  slopeDerate: 0.5,
  batteryWh: 4000,
  startPct: 100,
  reservePct: 20,
  panelM2: 2,
  panelEffPct: 30,
  panelMode: 'vertical',
  hotelW: 150,
  driveW: 250,
};

export interface LatLon { lat: number; lon: number }

// ------------------------------------------------------------------ spherical geometry
export function gcDistanceKm(a: LatLon, b: LatLon, R = MOON_RADIUS_KM): number {
  const φ1 = a.lat * D2R, φ2 = b.lat * D2R, dφ = φ2 - φ1, dλ = (b.lon - a.lon) * D2R;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point reached by going `km` along initial bearing `bearingDeg` (clockwise from north). */
export function offsetPoint(p: LatLon, km: number, bearingDeg: number, R = MOON_RADIUS_KM): LatLon {
  const δ = km / R, θ = bearingDeg * D2R, φ1 = p.lat * D2R, λ1 = p.lon * D2R;
  const sφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(Math.max(-1, Math.min(1, sφ2)));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * sφ2);
  return { lat: φ2 / D2R, lon: (((λ2 / D2R) % 360) + 360) % 360 };
}

/** Great-circle interpolation, f in [0,1]. */
export function gcInterp(a: LatLon, b: LatLon, f: number): LatLon {
  const φ1 = a.lat * D2R, λ1 = a.lon * D2R, φ2 = b.lat * D2R, λ2 = b.lon * D2R;
  const d = gcDistanceKm(a, b, 1);
  if (d < 1e-12) return { ...a };
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / D2R, lon: (((Math.atan2(y, x) / D2R) % 360) + 360) % 360 };
}

export const destinationOf = (plan: Pick<MissionPlan, 'dest'>, site: LatLon): LatLon =>
  plan.dest.kind === 'offset' ? offsetPoint(site, plan.dest.km, plan.dest.bearing) : { lat: plan.dest.lat, lon: plan.dest.lon };

// ------------------------------------------------------------------ routes
export interface RoutePoint { lat: number; lon: number; dKm: number; hM: number | null; slopeDeg: number | null }
export interface Waypoint { lat: number; lon: number; dKm: number; hM: number | null; horizonDeg: number[] | null }
export interface Route {
  terrain: boolean; // planned on the DEM (south polar cap only)
  found: boolean; // a path that respects the slope limit exists
  directKm: number;
  lengthKm: number;
  points: RoutePoint[];
  waypoints: Waypoint[];
  maxSlopeDeg: number | null;
  meanSlopeDeg: number | null;
  hazardsDirect: number; // stretches steeper than the limit on the straight line
  hazardKmDirect: number;
  hazardsRoute: number; // stretches steeper than the limit left on the chosen route
  siteSlopeDeg: number | null;
  demResM: number | null;
  note: string;
}

/** Straight great-circle route with no terrain information (outside the polar DEM). */
export function straightRoute(a: LatLon, b: LatLon): Route {
  const L = gcDistanceKm(a, b);
  const n = Math.max(2, Math.min(200, Math.ceil(L / 0.5) + 1));
  const points: RoutePoint[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), p = gcInterp(a, b, f);
    points.push({ ...p, dKm: f * L, hM: null, slopeDeg: null });
  }
  const k = Math.max(2, Math.min(6, Math.round(L / 2) + 1));
  const waypoints = Array.from({ length: k }, (_, i) => { const p = points[Math.round((i / (k - 1)) * (n - 1))]; return { lat: p.lat, lon: p.lon, dKm: p.dKm, hM: null, horizonDeg: null }; });
  return {
    terrain: false, found: true, directKm: L, lengthKm: L, points, waypoints, maxSlopeDeg: null, meanSlopeDeg: null,
    hazardsDirect: 0, hazardKmDirect: 0, hazardsRoute: 0, siteSlopeDeg: null, demResM: null,
    note: 'Straight line. Terrain for route planning is only loaded for the south polar cap (south of 80.5° S), so slope and hazards are unknown here.',
  };
}

/** Effective speed on a slope: falls linearly to (1 − derate) × v0 at the slope limit. */
export const effectiveSpeed = (v0: number, slopeDeg: number, maxSlopeDeg: number, derate: number) =>
  v0 * Math.max(0.05, 1 - derate * Math.min(1, Math.abs(slopeDeg) / maxSlopeDeg));

/** Cumulative drive time (h) at each route point. */
export function driveSchedule(route: Route, plan: Pick<MissionPlan, 'speedKmH' | 'maxSlopeDeg' | 'slopeDerate'>): number[] {
  const out = [0];
  for (let i = 1; i < route.points.length; i++) {
    const seg = route.points[i].dKm - route.points[i - 1].dKm;
    const v = effectiveSpeed(plan.speedKmH, route.points[i].slopeDeg ?? 0, plan.maxSlopeDeg, plan.slopeDerate);
    out.push(out[i - 1] + seg / v);
  }
  return out;
}

export type Phase = 'before' | 'driving' | 'arrived';
export interface RoverState extends LatLon { dKm: number; phase: Phase; index: number; hM: number | null }

export function roverAt(route: Route, sched: number[], departure: number, t: number): RoverState {
  const p = route.points, hrs = (t - departure) / HOUR;
  if (hrs < 0) return { ...p[0], phase: 'before', index: 0 };
  const total = sched[sched.length - 1];
  if (hrs >= total) return { ...p[p.length - 1], phase: 'arrived', index: p.length - 1 };
  let i = 1;
  while (i < sched.length - 1 && sched[i] < hrs) i++;
  const f = (hrs - sched[i - 1]) / Math.max(1e-9, sched[i] - sched[i - 1]);
  const pos = gcInterp(p[i - 1], p[i], f);
  const hM = p[i - 1].hM !== null && p[i].hM !== null ? p[i - 1].hM! + f * (p[i].hM! - p[i - 1].hM!) : null;
  return { ...pos, dKm: p[i - 1].dKm + f * (p[i].dKm - p[i - 1].dKm), phase: 'driving', index: i, hM };
}

// ------------------------------------------------------------------ power, temperature
/** Solar array output (W). Vertical panels (usual at the poles) see the Sun at incidence = elevation. */
export function solarPowerW(plan: Pick<MissionPlan, 'panelM2' | 'panelEffPct' | 'panelMode'>, sunElDeg: number, visibleFrac: number, distAU = 1): number {
  if (visibleFrac <= 0) return 0;
  const cosI = plan.panelMode === 'vertical' ? Math.max(0, Math.cos(sunElDeg * D2R)) : 1;
  return plan.panelM2 * (plan.panelEffPct / 100) * (SOLAR_CONSTANT / (distAU * distAU)) * visibleFrac * cosI;
}

/**
 * Radiative-equilibrium temperature of flat regolith (K): (1−A)·S·sin(el)·f = ε·σ·T⁴.
 * Ignores thermal inertia, slopes and scattered light; floors at a typical shadow temperature.
 */
export function surfaceTempK(sunElDeg: number, visibleFrac: number, permanentShadow = false): number {
  if (permanentShadow) return PSR_TEMP_K;
  const q = (1 - REGOLITH_ALBEDO) * SOLAR_CONSTANT * Math.max(0, Math.sin(sunElDeg * D2R)) * visibleFrac;
  return Math.max(SHADOW_TEMP_K, (q / (REGOLITH_EMISSIVITY * SIGMA)) ** 0.25);
}

// ------------------------------------------------------------------ mission simulation
const geomCache = new Map<number, BodyFixedGeometry>();
function geomAt(t: number): BodyFixedGeometry {
  let g = geomCache.get(t);
  if (!g) {
    if (geomCache.size > 40000) geomCache.clear();
    g = bodyFixedGeometry(new Date(t));
    geomCache.set(t, g);
  }
  return g;
}

export interface MissionTimeline {
  t0: number; stepMs: number; n: number;
  battPct: Float32Array; powerW: Float32Array; loadW: Float32Array;
  sunUp: Uint8Array; earthUp: Uint8Array; driving: Uint8Array;
  minPct: number; minT: number; emptyT: number | null; endPct: number;
  sunDrivePct: number | null; earthDrivePct: number | null; // share of drive time with Sun / Earth up
  sunPct: number; earthPct: number; bothPct: number; // share of the whole mission
  longestDarkH: number; longestNoCommH: number;
  energyInWh: number; energyOutWh: number;
}

const AU_KM = 149597870.7;

/**
 * Step the rover through the mission at the series resolution: where it is, whether the Sun and Earth
 * clear the terrain there (nearest waypoint's horizon, or the landing site's), panel output and battery.
 * The rover drives without stopping from departure to arrival, then parks.
 */
export function simulateMission(plan: MissionPlan, route: Route, sched: number[], siteHz: HorizonProfile, siteHeightM: number, stepMs = 30 * 60000): MissionTimeline {
  const n = Math.max(2, Math.round((plan.durationDays * 86400_000) / stepMs) + 1);
  const battPct = new Float32Array(n), powerW = new Float32Array(n), loadW = new Float32Array(n);
  const sunUp = new Uint8Array(n), earthUp = new Uint8Array(n), driving = new Uint8Array(n);
  const cap = Math.max(1, plan.batteryWh);
  let E = (cap * plan.startPct) / 100, minE = E, minT = plan.departure, emptyT: number | null = null;
  const wps = route.waypoints;
  const hzFor = (dKm: number) => {
    let best = -1, bd = Infinity;
    wps.forEach((w, i) => { const d = Math.abs(w.dKm - dKm); if (w.horizonDeg && d < bd) { bd = d; best = i; } });
    return best >= 0 ? wps[best].horizonDeg! : siteHz;
  };
  let sunDrive = 0, earthDrive = 0, driveN = 0, sunN = 0, earthN = 0, bothN = 0;
  let dark = 0, longestDark = 0, nocomm = 0, longestNoComm = 0, eIn = 0, eOut = 0;
  const dtH = stepMs / HOUR;
  for (let i = 0; i < n; i++) {
    const t = plan.departure + i * stepMs;
    const r = roverAt(route, sched, plan.departure, t);
    const site: Site = { lat: r.lat, lon: r.lon, heightM: (r.hM ?? siteHeightM) + 2 };
    const sky = skyFromGeometry(geomAt(t), site, enuBasis(site));
    const hz = hzFor(r.dKm);
    const hs = horizonAt(hz, sky.sun.az), he = horizonAt(hz, sky.earth.az);
    const su = sky.sun.el > hs, eu = sky.earth.el > he;
    const frac = diskVisibleFraction(sky.sun.el, sky.sun.radiusDeg, hs);
    const P = solarPowerW(plan, sky.sun.el, frac, sky.sun.distKm / AU_KM);
    const isDriving = r.phase === 'driving';
    const L = plan.hotelW + (isDriving ? plan.driveW : 0);
    sunUp[i] = su ? 1 : 0; earthUp[i] = eu ? 1 : 0; driving[i] = isDriving ? 1 : 0;
    powerW[i] = P; loadW[i] = L;
    if (i > 0) {
      eIn += P * dtH; eOut += L * dtH;
      E = Math.max(0, Math.min(cap, E + (P - L) * dtH));
    }
    battPct[i] = (E / cap) * 100;
    if (E < minE) { minE = E; minT = t; }
    if (E <= 0 && emptyT === null) emptyT = t;
    if (isDriving) { driveN++; sunDrive += +su; earthDrive += +eu; }
    sunN += +su; earthN += +eu; bothN += +(su && eu);
    dark = su ? 0 : dark + 1; longestDark = Math.max(longestDark, dark);
    nocomm = eu ? 0 : nocomm + 1; longestNoComm = Math.max(longestNoComm, nocomm);
  }
  return {
    t0: plan.departure, stepMs, n, battPct, powerW, loadW, sunUp, earthUp, driving,
    minPct: (minE / cap) * 100, minT, emptyT, endPct: battPct[n - 1],
    sunDrivePct: driveN ? (sunDrive / driveN) * 100 : null, earthDrivePct: driveN ? (earthDrive / driveN) * 100 : null,
    sunPct: (sunN / n) * 100, earthPct: (earthN / n) * 100, bothPct: (bothN / n) * 100,
    longestDarkH: longestDark * dtH, longestNoCommH: longestNoComm * dtH, energyInWh: eIn, energyOutWh: eOut,
  };
}

/** Sun/Earth visibility at each waypoint when the rover gets there. */
export function waypointVisibility(route: Route, sched: number[], departure: number, siteHz: HorizonProfile, siteHeightM: number) {
  return route.waypoints.map((w) => {
    const k = route.points.findIndex((p) => p.dKm >= w.dKm - 1e-9);
    const t = departure + (sched[Math.max(0, k)] ?? 0) * HOUR;
    const site: Site = { lat: w.lat, lon: w.lon, heightM: (w.hM ?? siteHeightM) + 2 };
    const sky = skyFromGeometry(geomAt(t), site, enuBasis(site));
    const hz = w.horizonDeg ?? siteHz;
    return { ...w, t, sunUp: sky.sun.el > horizonAt(hz, sky.sun.az), earthUp: sky.earth.el > horizonAt(hz, sky.earth.az) };
  });
}

/**
 * Departure in the next `searchDays` that keeps Sun AND Earth up for the largest share of the drive,
 * judged from the landing site's series. Ties go to the earliest time.
 */
export function bestDeparture(s: Series, from: number, travelH: number, searchDays = 30): { t: number; bothPct: number } | null {
  const i0 = Math.max(0, Math.ceil((from - s.t0) / s.stepMs));
  const L = Math.max(1, Math.round((travelH * HOUR) / s.stepMs));
  const iEnd = Math.min(s.n - L, i0 + Math.round((searchDays * 86400_000) / s.stepMs));
  let best = -1, bi = -1;
  for (let i = i0; i <= iEnd; i++) {
    const f = bothCount(s, i, i + L) / L;
    if (f > best + 1e-9) { best = f; bi = i; if (f >= 1) break; }
  }
  return bi < 0 ? null : { t: s.t0 + bi * s.stepMs, bothPct: best * 100 };
}

// ------------------------------------------------------------------ feasibility
export interface ScorePart { label: string; pts: number; max: number; note: string }
const LV = { green: 1, amber: 0.5, red: 0 } as const;

export function feasibility(o: {
  power: 'green' | 'amber' | 'red'; comms: 'green' | 'amber' | 'red'; route: Route; tl: MissionTimeline; travelH: number; plan: MissionPlan;
}): { score: number; parts: ScorePart[] } {
  const { route, tl, plan } = o;
  const routeOk = route.found && route.hazardsRoute === 0;
  const parts: ScorePart[] = [
    { label: 'Power at the landing site', pts: 25 * LV[o.power], max: 25, note: `${o.power} verdict` },
    { label: 'Radio to Earth', pts: 25 * LV[o.comms], max: 25, note: `${o.comms} verdict` },
    {
      label: 'Route', max: 20,
      pts: !route.terrain ? 10 : routeOk ? 20 : route.found ? 8 : 0,
      note: !route.terrain ? 'terrain unknown' : routeOk ? `clear under ${plan.maxSlopeDeg}°` : route.found ? 'hazards remain' : 'no path under the slope limit',
    },
    {
      label: 'Energy', max: 20,
      pts: tl.minPct >= plan.reservePct ? 20 : tl.emptyT === null ? 10 : 0,
      note: tl.emptyT !== null ? 'battery runs flat' : tl.minPct >= plan.reservePct ? `stays above ${plan.reservePct}% reserve` : `dips to ${tl.minPct.toFixed(0)}%, below reserve`,
    },
    {
      label: 'Schedule', max: 10, pts: o.travelH <= plan.durationDays * 24 ? 10 : 0,
      note: o.travelH <= plan.durationDays * 24 ? 'arrives within the mission' : 'drive outlasts the mission',
    },
  ];
  return { score: Math.round(parts.reduce((a, p) => a + p.pts, 0)), parts };
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 3 commits), under the team's direction. Attribution from the commit history.
