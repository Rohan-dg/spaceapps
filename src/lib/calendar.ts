/** Per-day statistics and "best window" search for the date heatmap. */
import { type Series, indexAt, upCount } from './series';

export interface DayStat { t: number; sun: number; earth: number; both: number } // fractions 0..1

const DAY = 86400000;

/** Daily (UTC) sunlit and Earth-visible fractions, plus the fraction with BOTH. */
export function dailyStats(s: Series): DayStat[] {
  const out: DayStat[] = [];
  const perDay = Math.round(DAY / s.stepMs);
  const first = Math.ceil(s.t0 / DAY) * DAY;
  for (let t = first; ; t += DAY) {
    const a = Math.round(indexAt(s, t)), b = a + perDay;
    if (b > s.n) break;
    out.push({ t, sun: upCount(s.sunUp, a, b) / perDay, earth: upCount(s.earthUp, a, b) / perDay, both: bothCount(s, a, b) / perDay });
  }
  return out;
}

/** Samples in [a,b) where both Sun and Earth are up (run intersection). */
export function bothCount(s: Series, a: number, b: number): number {
  let c = 0, i = 0, j = 0;
  const A = s.sunUp, B = s.earthUp;
  while (i < A.length && j < B.length) {
    const lo = Math.max(A[i], B[j], a), hi = Math.min(A[i + 1], B[j + 1], b);
    if (hi > lo) c += hi - lo;
    if (A[i + 1] < B[j + 1]) i += 2; else j += 2;
  }
  return c;
}

export type Metric = 'sun' | 'earth' | 'both';

export interface Window { start: number; days: number; score: number; sun: number; earth: number }

/**
 * Best non-overlapping windows of `days` consecutive days ranked by mean daily value of `metric`.
 * Ties favour earlier dates.
 */
export function bestWindows(days: DayStat[], metric: Metric, len = 14, count = 5): Window[] {
  if (days.length < len) return [];
  const pre = [0], preS = [0], preE = [0];
  days.forEach((d) => { pre.push(pre[pre.length - 1] + d[metric]); preS.push(preS[preS.length - 1] + d.sun); preE.push(preE[preE.length - 1] + d.earth); });
  const cands: Window[] = [];
  for (let i = 0; i + len <= days.length; i++) {
    cands.push({ start: days[i].t, days: len, score: (pre[i + len] - pre[i]) / len, sun: (preS[i + len] - preS[i]) / len, earth: (preE[i + len] - preE[i]) / len });
  }
  cands.sort((x, y) => y.score - x.score || x.start - y.start);
  const picked: Window[] = [];
  for (const c of cands) {
    if (picked.every((p) => Math.abs(p.start - c.start) >= len * DAY)) picked.push(c);
    if (picked.length === count) break;
  }
  return picked;
}
