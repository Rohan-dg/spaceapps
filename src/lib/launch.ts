/**
 * Launch planner: for each good landing day at a lunar site, when to launch from a NASA launch centre in the
 * United States, and from which one.
 *
 * Geometry (first order, not a trajectory design): a direct Earth-to-Moon transfer starts from a low parking
 * orbit whose plane contains the Moon's position at arrival. A launch is possible when Earth's rotation carries
 * the pad through that plane, so each day has a few instantaneous windows. The plane's inclination must be at
 * least the pad latitude and the Moon's declination, and inside the range the pad's safety corridor allows.
 * Launching closer to due east gains more of Earth's rotation, so the lower-latitude centre usually wins.
 */
import * as Astro from 'astronomy-engine';
import { dailyStats, type DayStat } from './calendar';
import type { Series } from './series';
import { THRESHOLDS } from '../config/thresholds';

const D = Math.PI / 180;
const DAY = 86400000;
const SIDEREAL_DEG_PER_DAY = 360.98564736629;
const EARTH_EQ_SPEED = 465.1; // m/s at the equator

export interface LaunchSite {
  id: string; name: string; short: string; pad: string; state: string;
  lat: number; lon: number; // deg, east positive
  minIncl: number; maxIncl: number; // orbital inclinations the range safety corridor allows (approximate)
  vehicles: string;
}

/** NASA's own launch centres in the United States. */
export const NASA_SITES: LaunchSite[] = [
  {
    id: 'ksc', name: 'Kennedy Space Center', short: 'Kennedy', pad: 'Launch Complex 39B', state: 'Florida',
    lat: 28.6272, lon: -80.6208, minIncl: 28.5, maxIncl: 57,
    vehicles: 'Heavy-lift pads: SLS for Artemis, and commercial heavy launchers',
  },
  {
    id: 'wallops', name: 'Wallops Flight Facility', short: 'Wallops', pad: 'Pad 0A', state: 'Virginia',
    lat: 37.8338, lon: -75.4881, minIncl: 38, maxIncl: 60,
    vehicles: 'Small and medium launchers only, suited to light lunar payloads',
  },
];

const wrap360 = (a: number) => ((a % 360) + 360) % 360;

/** Moon's geocentric right ascension and declination (deg, true equator of date) at a time. */
export function moonRaDec(t: number): { ra: number; dec: number } {
  const time = Astro.MakeTime(new Date(t));
  const v = Astro.RotateVector(Astro.Rotation_EQJ_EQD(time), Astro.GeoMoon(time));
  return { ra: wrap360(Math.atan2(v.y, v.x) / D), dec: Math.asin(v.z / Math.hypot(v.x, v.y, v.z)) / D };
}

/** Local apparent sidereal time (deg) at an east longitude. */
export const lst = (t: number, lonE: number) => wrap360(Astro.SiderealTime(new Date(t)) * 15 + lonE);

export interface LaunchWindow {
  t: number; // launch instant, ms UTC
  azimuth: number; // deg from north
  inclination: number; // deg
  boostMs: number; // eastward speed from Earth's rotation along the launch direction, m/s
}

/** Right ascension offset from the node of a point at argument of latitude u on an orbit of inclination i. */
const raOffset = (u: number, i: number) => Math.atan2(Math.cos(i * D) * Math.sin(u * D), Math.cos(u * D)) / D;

/**
 * Launch windows from `site` in [from, to) into a parking orbit whose plane contains the Moon's direction at
 * `arrival`. Returns [] when no allowed inclination can reach the Moon's declination.
 */
export function launchWindows(site: LaunchSite, arrival: number, from: number, to: number): LaunchWindow[] {
  const m = moonRaDec(arrival);
  const i = Math.max(site.minIncl, site.lat + 1e-6, Math.abs(m.dec) + 0.05);
  if (i > site.maxIncl) return [];
  const out: LaunchWindow[] = [];
  const uMoon = Math.asin(Math.max(-1, Math.min(1, Math.sin(m.dec * D) / Math.sin(i * D)))) / D;
  const uPad = Math.asin(Math.max(-1, Math.min(1, Math.sin(site.lat * D) / Math.sin(i * D)))) / D;
  const azNE = Math.asin(Math.max(-1, Math.min(1, Math.cos(i * D) / Math.cos(site.lat * D)))) / D;
  for (const um of [uMoon, 180 - uMoon]) {
    const node = m.ra - raOffset(um, i);
    for (const [up, az] of [[uPad, azNE], [180 - uPad, 180 - azNE]]) {
      const need = wrap360(node + raOffset(up, i)); // sidereal time at which the pad lies in the plane
      let t = from + (wrap360(need - lst(from, site.lon)) / SIDEREAL_DEG_PER_DAY) * DAY;
      for (; t < to; t += (360 / SIDEREAL_DEG_PER_DAY) * DAY) {
        out.push({ t, azimuth: az, inclination: i, boostMs: EARTH_EQ_SPEED * Math.cos(site.lat * D) * Math.sin(az * D) });
      }
    }
  }
  // the two passes coincide when the inclination equals the pad latitude
  out.sort((a, b) => a.t - b.t);
  return out.filter((w, k) => k === 0 || w.t - out[k - 1].t > 60000);
}

export interface GoodDay extends DayStat { landing: number } // landing instant: first moment of the day with Sun and Earth both up

export type GoodDayRule = 'sun-earth' | 'sun';

/**
 * Landing days that meet the green thresholds on the day itself: Sun up ≥ 70 % of the day and, unless `rule` is
 * 'sun' (for points that never see Earth, such as the far side), Earth in view ≥ 90 %.
 */
export function goodDays(s: Series, from: number, limit = 12, rule: GoodDayRule = 'sun-earth'): GoodDay[] {
  const sunMin = THRESHOLDS.power.greenPct / 100, earthMin = rule === 'sun' ? 0 : THRESHOLDS.comms.greenPct / 100;
  const out: GoodDay[] = [];
  for (const d of dailyStats(s)) {
    if (d.t + DAY <= from || d.sun < sunMin || d.earth < earthMin) continue;
    const a = Math.max(d.t, from);
    out.push({ ...d, landing: (rule === 'sun' ? firstUp(s, a, d.t + DAY) : firstBoth(s, a, d.t + DAY)) ?? a });
    if (out.length === limit) break;
  }
  return out;
}

function inRuns(runs: number[], i: number) {
  for (let k = 0; k < runs.length; k += 2) if (i >= runs[k] && i < runs[k + 1]) return true;
  return false;
}
function firstUp(s: Series, a: number, b: number): number | null {
  for (let t = a; t < b; t += s.stepMs) {
    const i = Math.round((t - s.t0) / s.stepMs);
    if (i >= 0 && i < s.n && inRuns(s.sunUp, i)) return s.t0 + i * s.stepMs;
  }
  return null;
}
function firstBoth(s: Series, a: number, b: number): number | null {
  for (let t = a; t < b; t += s.stepMs) {
    const i = Math.round((t - s.t0) / s.stepMs);
    if (i >= 0 && i < s.n && inRuns(s.sunUp, i) && inRuns(s.earthUp, i)) return s.t0 + i * s.stepMs;
  }
  return null;
}

export interface LaunchOption { site: LaunchSite; window: LaunchWindow | null; arrival: number | null }
export interface LaunchPlan { day: GoodDay; nominal: number; options: LaunchOption[]; best: LaunchOption | null }

/**
 * For a good landing day: the window from each NASA centre closest to (landing − transit), so the craft arrives
 * on the good day, and the recommended centre (largest boost from Earth's rotation, then the earlier launch).
 */
export function planLaunch(day: GoodDay, transitDays: number): LaunchPlan {
  const nominal = day.landing - transitDays * DAY;
  const options = NASA_SITES.map((site) => {
    const ws = launchWindows(site, day.landing, nominal - DAY / 2, nominal + DAY / 2);
    const w = ws.sort((a, b) => Math.abs(a.t - nominal) - Math.abs(b.t - nominal))[0] ?? null;
    return { site, window: w, arrival: w ? w.t + transitDays * DAY : null };
  });
  const ok = options.filter((o) => o.window);
  const best = ok.sort((a, b) => b.window!.boostMs - a.window!.boostMs || a.window!.t - b.window!.t)[0] ?? null;
  return { day, nominal, options, best };
}
