/**
 * Mission comparison: the same criteria for every mission in the site catalogue, so any two can be compared,
 * and a long-run efficiency score with its weights in the open.
 *
 * Every criterion comes from data every site has (the terrain skyline and the Sun/Earth series over the whole
 * data range), so none is ever missing: a mission added without precomputed files gets them computed in the
 * browser from its coordinates (lib/customSite.ts).
 */
import { THRESHOLDS } from '../config/thresholds';
import { bothCount, dailyStats } from './calendar';
import type { SiteData, SiteInfo } from './data';
import { longestGap, upFraction } from './series';

export type Era = 'past' | 'future' | 'reference';

/** landed / crashed / impact / target (planned site of a failed landing) are past; planned / candidate are future. */
export function eraOf(info: Pick<SiteInfo, 'status' | 'program' | 'approximate'>): Era {
  if (info.status === 'landed' || info.status === 'crashed' || info.status === 'impact' || info.status === 'target') return 'past';
  if (info.status === 'planned' || info.status === 'candidate') return 'future';
  return 'reference';
}

/** Year of the mission: the `date` field when present, else the first 19xx/20xx in the mission text. */
export function yearOf(info: Pick<SiteInfo, 'mission'> & { date?: string }): number | null {
  const m = (info.date ?? '').match(/(19|20)\d\d/) ?? (info.mission ?? '').match(/(19|20)\d\d/);
  return m ? Number(m[0]) : null;
}

/** Standby power (W) a lander needs through the night: the mission plan's always-on load. */
export const STANDBY_W = 150;
const HOURS_PER_YEAR = 8766;

export interface Criteria {
  sunPct: number; // share of the whole range with the Sun's centre above the skyline
  earthPct: number;
  bothPct: number; // Sun and Earth at once
  longestNightH: number; // longest stretch without the Sun
  longestBlackoutH: number; // longest stretch without Earth
  batteryKWh: number; // energy to ride out the longest night at STANDBY_W
  sunHoursPerYear: number;
  goodDaysPerYear: number; // landing days meeting the green bar (Sun ≥ 70 %, Earth ≥ 90 % of the day)
  sunDaysPerYear: number; // days with Sun ≥ 70 % (the bar without Earth)
  meanHorizonDeg: number; // how enclosed the site is
  maxHorizonDeg: number;
  rangeH: number; // length of the data range
}

export function criteriaOf(d: SiteData): Criteria {
  const s = d.series, n = s.n, stepH = s.stepMs / 3600000;
  const days = dailyStats(s);
  const years = (n * stepH) / HOURS_PER_YEAR;
  const sunMin = THRESHOLDS.power.greenPct / 100, earthMin = THRESHOLDS.comms.greenPct / 100;
  const hz = d.horizon.horizonDeg;
  const longestNightH = longestGap(s.sunUp, 0, n).length * stepH;
  return {
    sunPct: upFraction(s.sunUp, 0, n) * 100,
    earthPct: upFraction(s.earthUp, 0, n) * 100,
    bothPct: (bothCount(s, 0, n) / n) * 100,
    longestNightH,
    longestBlackoutH: longestGap(s.earthUp, 0, n).length * stepH,
    batteryKWh: (longestNightH * STANDBY_W) / 1000,
    sunHoursPerYear: upFraction(s.sunUp, 0, n) * HOURS_PER_YEAR,
    goodDaysPerYear: days.filter((x) => x.sun >= sunMin && x.earth >= earthMin).length / years,
    sunDaysPerYear: days.filter((x) => x.sun >= sunMin).length / years,
    meanHorizonDeg: hz.reduce((a, b) => a + b, 0) / hz.length,
    maxHorizonDeg: Math.max(...hz),
    rangeH: n * stepH,
  };
}

/** A night at the equator lasts about 354 h (half a synodic month); twice that scores zero. */
const NIGHT_ZERO_H = 2 * 354;

export interface ScorePart { key: 'power' | 'comms' | 'night' | 'blackout' | 'launch'; label: string; weight: number; value: number; why: string }

/** Long-run efficiency, 0–100, from five parts that each run 0–1 on fixed (not pair-relative) scales. */
export function longRunScore(c: Criteria): { score: number; parts: ScorePart[] } {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const parts: ScorePart[] = [
    { key: 'power', label: 'Sunlight for power', weight: 0.35, value: clamp(c.sunPct / 100), why: 'share of time in sunlight' },
    { key: 'comms', label: 'Earth contact', weight: 0.25, value: clamp(c.earthPct / 100), why: 'share of time Earth is in view' },
    { key: 'night', label: 'Surviving the night', weight: 0.2, value: clamp(1 - c.longestNightH / NIGHT_ZERO_H), why: `longest night against ${NIGHT_ZERO_H} h (two equatorial nights)` },
    { key: 'blackout', label: 'Radio blackouts', weight: 0.1, value: clamp(1 - c.longestBlackoutH / NIGHT_ZERO_H), why: 'longest stretch without Earth' },
    { key: 'launch', label: 'Landing opportunities', weight: 0.1, value: clamp(c.goodDaysPerYear / 365), why: 'good landing days per year' },
  ];
  return { score: Math.round(parts.reduce((a, p) => a + p.weight * p.value, 0) * 1000) / 10, parts };
}

export type Better = 'a' | 'b' | 'tie';

export interface Row { key: keyof Criteria; label: string; unit: string; higherIsBetter: boolean; digits: number }

/** The comparison table: every row is defined for every mission. */
export const ROWS: Row[] = [
  { key: 'sunPct', label: 'Sunlight', unit: '% of time', higherIsBetter: true, digits: 1 },
  { key: 'earthPct', label: 'Earth in view', unit: '% of time', higherIsBetter: true, digits: 1 },
  { key: 'bothPct', label: 'Sun and Earth at once', unit: '% of time', higherIsBetter: true, digits: 1 },
  { key: 'longestNightH', label: 'Longest night', unit: 'h', higherIsBetter: false, digits: 0 },
  { key: 'longestBlackoutH', label: 'Longest radio blackout', unit: 'h', higherIsBetter: false, digits: 0 },
  { key: 'batteryKWh', label: `Battery to survive it (${STANDBY_W} W standby)`, unit: 'kWh', higherIsBetter: false, digits: 1 },
  { key: 'sunHoursPerYear', label: 'Sunlit hours per year', unit: 'h', higherIsBetter: true, digits: 0 },
  { key: 'goodDaysPerYear', label: 'Good landing days per year', unit: 'days', higherIsBetter: true, digits: 0 },
  { key: 'sunDaysPerYear', label: 'Sunny days per year', unit: 'days', higherIsBetter: true, digits: 0 },
  { key: 'meanHorizonDeg', label: 'Skyline height (mean)', unit: '°', higherIsBetter: false, digits: 2 },
];

/** Which side wins a row; values within 1 % of each other (or both zero) tie. */
export function better(row: Row, a: number, b: number): Better {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0 || Math.abs(a - b) <= scale * 0.01) return 'tie';
  return (a > b) === row.higherIsBetter ? 'a' : 'b';
}

export interface Verdict { winner: Better; scoreA: number; scoreB: number; reasons: string[]; winsA: number; winsB: number }

/** Overall call: the higher long-run score wins (within 1 point is even), with the parts that decided it. */
export function verdict(ca: Criteria, cb: Criteria, nameA: string, nameB: string): Verdict {
  const sa = longRunScore(ca), sb = longRunScore(cb);
  let winsA = 0, winsB = 0;
  for (const r of ROWS) { const w = better(r, ca[r.key], cb[r.key]); if (w === 'a') winsA++; if (w === 'b') winsB++; }
  const winner: Better = Math.abs(sa.score - sb.score) < 1 ? 'tie' : sa.score > sb.score ? 'a' : 'b';
  const diffs = sa.parts.map((p, i) => ({ p, d: (p.value - sb.parts[i].value) * p.weight * 100 }))
    .filter((x) => Math.abs(x.d) >= 0.5)
    .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
    .slice(0, 3);
  const reasons = diffs.map(({ p, d }) => `${p.label}: ${d > 0 ? nameA : nameB} ahead by ${Math.abs(d).toFixed(1)} points (${p.why})`);
  return { winner, scoreA: sa.score, scoreB: sb.score, reasons, winsA, winsB };
}

/** Great-circle distance (km) between two sites; near zero means the two missions share a site. */
export function separationKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const D = Math.PI / 180, R = 1737.4;
  const h = Math.sin(((b.lat - a.lat) * D) / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin(((b.lon - a.lon) * D) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
