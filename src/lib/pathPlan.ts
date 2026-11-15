/**
 * Education mode's path checker: a rover drives non-stop through a list of stops (landing sites) in order, and
 * we ask whether its battery lasts and how much of the drive has sunlight and a direct line to Earth.
 * It reuses the Scientific mission model (simulateMission): real Sun and Earth positions every step, masked by the
 * terrain skyline of the nearest stop, solar panels charging the battery, hotel and drive loads draining it.
 * The legs are straight great-circle lines; there is no slope or hazard check between stops.
 */
import { THRESHOLDS } from '../config/thresholds';
import { DEFAULT_PLAN, driveSchedule, gcDistanceKm, gcInterp, simulateMission, type MissionPlan, type MissionTimeline, type Route, type RoutePoint, type Waypoint } from './mission';

export interface Stop { id: string; name: string; lat: number; lon: number; heightM: number; horizonDeg: number[] }
export type Rover = Pick<MissionPlan, 'speedKmH' | 'batteryWh' | 'startPct' | 'reservePct' | 'panelM2' | 'panelEffPct' | 'panelMode' | 'hotelW' | 'driveW'>;
/** The same small rover the Scientific mission planner starts with. */
export const EDU_ROVER: Rover = {
  speedKmH: DEFAULT_PLAN.speedKmH, batteryWh: DEFAULT_PLAN.batteryWh, startPct: DEFAULT_PLAN.startPct, reservePct: DEFAULT_PLAN.reservePct,
  panelM2: DEFAULT_PLAN.panelM2, panelEffPct: DEFAULT_PLAN.panelEffPct, panelMode: DEFAULT_PLAN.panelMode, hotelW: DEFAULT_PLAN.hotelW, driveW: DEFAULT_PLAN.driveW,
};
/** The simulation stops after this many days of driving; a longer trip is reported as too far. */
export const MAX_DRIVE_DAYS = 60;

export type Level = 'ok' | 'risky' | 'no';
export interface Check { level: Level; title: string; detail: string }
export interface Leg { from: string; to: string; km: number; hours: number; arrive: number }
export interface PathReport {
  km: number; hours: number; legs: Leg[]; tooFar: boolean; simulatedH: number;
  battery: Check; sunlight: Check; earth: Check; overall: Check;
  tl: MissionTimeline;
}

/** One route through every stop: straight legs, a waypoint at each stop carrying its terrain skyline. */
export function pathRoute(stops: Stop[]): Route {
  if (stops.length < 2) throw new Error('A path needs at least two stops.');
  const points: RoutePoint[] = [], waypoints: Waypoint[] = [];
  let d0 = 0;
  for (let k = 0; k < stops.length - 1; k++) {
    const a = stops[k], b = stops[k + 1], L = gcDistanceKm(a, b);
    const n = Math.max(2, Math.min(400, Math.ceil(L / 2) + 1));
    for (let i = k === 0 ? 0 : 1; i < n; i++) {
      const f = i / (n - 1);
      points.push({ ...gcInterp(a, b, f), dKm: d0 + f * L, hM: a.heightM + f * (b.heightM - a.heightM), slopeDeg: null });
    }
    waypoints.push({ lat: a.lat, lon: a.lon, dKm: d0, hM: a.heightM, horizonDeg: a.horizonDeg });
    d0 += L;
  }
  const last = stops[stops.length - 1];
  waypoints.push({ lat: last.lat, lon: last.lon, dKm: d0, hM: last.heightM, horizonDeg: last.horizonDeg });
  return {
    terrain: false, found: true, directKm: gcDistanceKm(stops[0], last), lengthKm: d0, points, waypoints,
    maxSlopeDeg: null, meanSlopeDeg: null, hazardsDirect: 0, hazardKmDirect: 0, hazardsRoute: 0, siteSlopeDeg: null, demResM: null,
    note: 'Straight legs between stops; the skyline of the nearest stop is used along the way.',
  };
}

const fmtH = (h: number) => (h < 48 ? `${h.toFixed(h < 10 ? 1 : 0)} hours` : `${(h / 24).toFixed(h < 240 ? 1 : 0)} days`);
export const fmtDuration = fmtH;

export function evaluatePath(stops: Stop[], departure: number, rover: Rover = EDU_ROVER): PathReport {
  const route = pathRoute(stops);
  const plan: MissionPlan = { ...DEFAULT_PLAN, ...rover, departure, dest: { kind: 'coords', lat: stops[stops.length - 1].lat, lon: stops[stops.length - 1].lon }, durationDays: 1 };
  const sched = driveSchedule(route, plan), hours = sched[sched.length - 1];
  const tooFar = hours > MAX_DRIVE_DAYS * 24;
  const simulatedH = Math.min(hours, MAX_DRIVE_DAYS * 24);
  plan.durationDays = Math.max(1 / 24, simulatedH / 24);
  // half-hour steps, coarser for long trips so a two-month drive still takes well under a second
  const stepMs = (simulatedH > 24 * 20 ? 60 : 30) * 60000;
  const tl = simulateMission(plan, route, sched, stops[0].horizonDeg, stops[0].heightM, stepMs);

  const legs: Leg[] = [];
  let at = 0;
  for (let k = 0; k < stops.length - 1; k++) {
    const km = gcDistanceKm(stops[k], stops[k + 1]), h = km / rover.speedKmH;
    at += h;
    legs.push({ from: stops[k].name, to: stops[k + 1].name, km, hours: h, arrive: departure + at * 3600_000 });
  }

  // battery
  const kmAt = (t: number) => Math.min(route.lengthKm, ((t - departure) / 3600_000) * rover.speedKmH);
  const battery: Check = tl.emptyT !== null
    ? { level: 'no', title: 'runs flat', detail: `The battery is empty ${fmtH((tl.emptyT - departure) / 3600_000)} into the drive, about ${kmAt(tl.emptyT).toFixed(0)} km along. The solar panels cannot keep up with the motors, heaters and radio.` }
    : tl.minPct < rover.reservePct
      ? { level: 'risky', title: 'gets low', detail: `The charge drops to ${tl.minPct.toFixed(0)}%, below the ${rover.reservePct}% safety reserve, about ${kmAt(tl.minT).toFixed(0)} km along.` }
      : { level: 'ok', title: 'lasts the whole drive', detail: `The lowest charge is ${tl.minPct.toFixed(0)}% and the rover arrives with ${tl.endPct.toFixed(0)}%.` };

  // sunlight on the way
  const sunPct = tl.sunDrivePct ?? 0, dark = tl.longestDarkH;
  const sunLevel: Level = sunPct >= THRESHOLDS.power.greenPct && dark <= THRESHOLDS.power.greenMaxDarkH ? 'ok'
    : sunPct >= THRESHOLDS.power.amberPct || dark <= THRESHOLDS.power.amberMaxDarkH ? 'risky' : 'no';
  const sunlight: Check = {
    level: sunLevel,
    title: sunLevel === 'ok' ? 'up most of the way' : sunLevel === 'risky' ? 'some long dark stretches' : 'dark most of the way',
    detail: `The Sun is up for ${sunPct.toFixed(0)}% of the drive.${dark > 0.5 ? ` The longest stretch without sunlight is ${fmtH(dark)}.` : ' It never sets on the way.'}`,
  };

  // direct radio contact with Earth on the way
  const earthPct = tl.earthDrivePct ?? 0, gap = tl.longestNoCommH;
  const earthLevel: Level = earthPct >= THRESHOLDS.comms.greenPct && gap <= THRESHOLDS.comms.greenMaxGapH ? 'ok'
    : earthPct >= THRESHOLDS.comms.amberPct || gap <= THRESHOLDS.comms.amberMaxGapH ? 'risky' : 'no';
  const earth: Check = {
    level: earthLevel,
    title: earthLevel === 'ok' ? 'in touch most of the way' : earthLevel === 'risky' ? 'comes and goes' : 'out of touch most of the way',
    detail: `Earth is above the skyline for ${earthPct.toFixed(0)}% of the drive.${gap > 0.5 ? ` The longest silence is ${fmtH(gap)}.` : ' The radio link never drops.'}`,
  };

  const levels = [battery.level, sunlight.level, earth.level];
  const overall: Check = tooFar
    ? { level: 'no', title: 'Too far to drive', detail: `This path is ${route.lengthKm.toFixed(0)} km: ${fmtH(hours)} of non-stop driving at ${rover.speedKmH} km/h. Only the first ${MAX_DRIVE_DAYS} days were simulated.` }
    : battery.level === 'no' ? { level: 'no', title: 'Not possible', detail: 'The rover would run out of power on the way.' }
    : levels.includes('no') ? { level: 'no', title: 'Not a good idea', detail: levels[2] === 'no' && levels[1] !== 'no' ? 'The rover would be out of touch with Earth for most of the drive.' : 'The rover would spend most of the drive in the dark.' }
    : levels.includes('risky') ? { level: 'risky', title: 'Possible, with risks', detail: 'The rover gets there, but read the warnings below.' }
    : { level: 'ok', title: 'Possible', detail: 'The rover has power, sunlight and contact with Earth for the whole drive.' };

  return { km: route.lengthKm, hours, legs, tooFar, simulatedH, battery, sunlight, earth, overall, tl };
}

const LEVEL_RANK: Record<Level, number> = { ok: 2, risky: 1, no: 0 };
/** Higher is better: the verdict first, then a battery that never empties, then the lowest charge, then light and contact. */
export const pathScore = (r: PathReport) =>
  LEVEL_RANK[r.overall.level] * 1e6 + (r.tl.emptyT === null ? 1e5 : 0) + r.tl.minPct * 100 + (r.tl.sunDrivePct ?? 0) + (r.tl.earthDrivePct ?? 0) / 10;

/** Try a start every `stepDays` from `from` to `to` (at most `maxTries` of them) and return the best one. */
export function bestStart(stops: Stop[], from: number, to: number, stepDays = 2, maxTries = 200, rover: Rover = EDU_ROVER): { t: number; report: PathReport } | null {
  let best: { t: number; report: PathReport; s: number } | null = null;
  for (let k = 0, t = from; t <= to && k < maxTries; k++, t += stepDays * 86400_000) {
    const report = evaluatePath(stops, t, rover), s = pathScore(report);
    if (!best || s > best.s) best = { t, report, s };
  }
  return best && { t: best.t, report: best.report };
}
