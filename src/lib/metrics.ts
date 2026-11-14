/** Scenario metrics: everything on the metric cards, derived from series + live ephemeris. */
import { skyAt, type SkyState } from './ephemeris';
import type { Site } from './geometry';
import { horizonAt, type HorizonProfile } from './horizon';
import {
  type Runs, type Series, SYNODIC_DAYS, findRun, indexAt, longestGap, nextRise, nextSet, timeAt, upFraction,
} from './series';

export interface Event { t: number | null; beyondRange: boolean }

export interface Metrics {
  t: number;
  inRange: boolean;
  sky: SkyState;
  sunHorizon: number; // terrain elevation in the Sun's direction
  earthHorizon: number;
  sunUp: boolean;
  earthUp: boolean;
  nextSunset: Event;
  nextSunrise: Event;
  nextEarthset: Event;
  nextEarthrise: Event;
  windowDays: number; // actual window length (may be truncated at end of range)
  windowTruncated: boolean;
  sunPct: number;
  earthPct: number;
  longestDarkH: number;
  longestDarkStart: number;
  longestDarkClipped: boolean;
  longestNoCommH: number;
  longestNoCommStart: number;
  longestNoCommClipped: boolean;
}

const MS_H = 3600_000;

/** Signed clearance (deg) of body above terrain at time t. */
function clearance(site: Site, hz: HorizonProfile, t: number, body: 'sun' | 'earth'): number {
  const k = skyAt(site, new Date(t))[body];
  return k.el - horizonAt(hz, k.az);
}

/**
 * Refine a transition located between samples i−1 and i (series resolution) to ~30 s by bisection
 * on the live ephemeris. `rising` = body goes from below to above.
 */
export function refineCrossing(site: Site, hz: HorizonProfile, s: Series, i: number, body: 'sun' | 'earth', rising: boolean): number {
  let a = timeAt(s, i - 1), b = timeAt(s, i);
  const sign = rising ? 1 : -1;
  // f(a)·sign < 0, f(b)·sign > 0 expected; if not (sampling edge), return sample time.
  if (sign * clearance(site, hz, a, body) > 0 || sign * clearance(site, hz, b, body) <= 0) return b;
  for (let k = 0; k < 6; k++) {
    const m = (a + b) / 2;
    if (sign * clearance(site, hz, m, body) > 0) b = m; else a = m;
  }
  return (a + b) / 2;
}

function eventsFor(site: Site, hz: HorizonProfile, s: Series, runs: Runs, i: number, t: number, body: 'sun' | 'earth') {
  const find = (fn: (from: number) => { index: number | null; beyondRange: boolean }, rising: boolean): Event => {
    let from = i;
    for (let guard = 0; guard < 3; guard++) {
      const r = fn(from);
      if (r.index === null) return { t: null, beyondRange: r.beyondRange };
      const te = r.index > 0 ? refineCrossing(site, hz, s, r.index, body, rising) : timeAt(s, r.index);
      if (te > t) return { t: te, beyondRange: false };
      from = r.index + 1; // the refined crossing is already behind us: look for the next one
    }
    return { t: null, beyondRange: true };
  };
  return {
    set: find((f) => nextSet(runs, f, s.n), false),
    rise: find((f) => nextRise(runs, f), true),
  };
}

export function computeMetrics(site: Site, hz: HorizonProfile, s: Series, t: number): Metrics {
  const sky = skyAt(site, new Date(t));
  const sunHorizon = horizonAt(hz, sky.sun.az);
  const earthHorizon = horizonAt(hz, sky.earth.az);
  const fi = indexAt(s, t);
  const inRange = fi >= 0 && fi < s.n;
  const i = Math.max(0, Math.min(s.n - 1, Math.floor(fi)));
  const win = Math.round((SYNODIC_DAYS * 86400_000) / s.stepMs);
  const a = i, b = Math.min(s.n, i + win);
  const stepH = s.stepMs / MS_H;
  const sunE = eventsFor(site, hz, s, s.sunUp, i, t, 'sun');
  const earthE = eventsFor(site, hz, s, s.earthUp, i, t, 'earth');
  const dark = longestGap(s.sunUp, a, b);
  const nocomm = longestGap(s.earthUp, a, b);
  return {
    t, inRange, sky, sunHorizon, earthHorizon,
    sunUp: sky.sun.el > sunHorizon,
    earthUp: sky.earth.el > earthHorizon,
    nextSunset: sunE.set, nextSunrise: sunE.rise, nextEarthset: earthE.set, nextEarthrise: earthE.rise,
    windowDays: ((b - a) * s.stepMs) / 86400_000,
    windowTruncated: b - a < win,
    sunPct: upFraction(s.sunUp, a, b) * 100,
    earthPct: upFraction(s.earthUp, a, b) * 100,
    longestDarkH: dark.length * stepH,
    longestDarkStart: timeAt(s, dark.start),
    longestDarkClipped: dark.clipped,
    longestNoCommH: nocomm.length * stepH,
    longestNoCommStart: timeAt(s, nocomm.start),
    longestNoCommClipped: nocomm.clipped,
  };
}

/** Whether sample index i is "up" (series resolution). */
export const upAt = (runs: Runs, s: Series, t: number) => findRun(runs, Math.floor(indexAt(s, t))) >= 0;

export const compass = (az: number) =>
  ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((az % 360) + 360) % 360 / 45) % 8];

export function formatDuration(ms: number): string {
  if (!isFinite(ms)) return '-';
  const m = Math.round(ms / 60000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${mm} m`;
  return `${mm} m`;
}
