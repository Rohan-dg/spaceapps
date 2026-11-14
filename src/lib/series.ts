/**
 * Compact illumination / Earth-visibility time series.
 *
 * Visibility is stored run-length encoded as a flat array of half-open index ranges
 * [s0, e0, s1, e1, ...] where the body is above the terrain horizon for samples s ≤ i < e.
 * Elevations are Int16 centidegrees, base64-encoded. Sample i is at start + i·step.
 */

export const SYNODIC_DAYS = 29.530589;

export type Runs = number[]; // flat [start, end, start, end, ...], sorted, non-overlapping

export interface SeriesFile {
  id: string;
  version: number;
  start: string; // ISO UTC of sample 0
  stepMin: number;
  n: number;
  synthetic: boolean;
  sunUp: Runs;
  earthUp: Runs;
  sunEl: string; // base64 Int16 LE, centidegrees
  earthEl: string;
  sunFrac: string; // base64 Uint8, visible solar-disk fraction × 250
}

export interface Series {
  id: string;
  t0: number; // ms
  stepMs: number;
  n: number;
  synthetic: boolean;
  sunUp: Runs;
  earthUp: Runs;
  sunEl: Int16Array;
  earthEl: Int16Array;
  sunFrac: Uint8Array;
}

// ------------------------------------------------------------------ encoding
export function encodeRuns(flags: ArrayLike<boolean | number>): Runs {
  const runs: Runs = [];
  let start = -1;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] && start < 0) start = i;
    else if (!flags[i] && start >= 0) { runs.push(start, i); start = -1; }
  }
  if (start >= 0) runs.push(start, flags.length);
  return runs;
}

// Node's Buffer when available (precompute scripts), browser atob/btoa otherwise.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Buffer = (globalThis as any).Buffer as undefined | { from(...a: unknown[]): any };

function b64encode(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  if (typeof Buffer !== 'undefined') { const b = Buffer.from(s, 'base64'); return new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice(); }
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const encodeI16 = (a: Int16Array) => b64encode(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
export const encodeU8 = (a: Uint8Array) => b64encode(a);
export const decodeI16 = (s: string) => new Int16Array(b64decode(s).buffer); // little-endian hosts
export const decodeU8 = (s: string) => b64decode(s);

export function parseSeries(f: SeriesFile): Series {
  return {
    id: f.id, t0: Date.parse(f.start), stepMs: f.stepMin * 60000, n: f.n, synthetic: f.synthetic,
    sunUp: f.sunUp, earthUp: f.earthUp,
    sunEl: decodeI16(f.sunEl), earthEl: decodeI16(f.earthEl), sunFrac: decodeU8(f.sunFrac),
  };
}

// ------------------------------------------------------------------ queries
export const indexAt = (s: Pick<Series, 't0' | 'stepMs'>, t: number) => (t - s.t0) / s.stepMs;
export const timeAt = (s: Pick<Series, 't0' | 'stepMs'>, i: number) => s.t0 + i * s.stepMs;

/** Index of the run containing sample i, or −(insertion point)−1 if i is not in a run. */
export function findRun(runs: Runs, i: number): number {
  let lo = 0, hi = runs.length / 2 - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (i < runs[2 * m]) hi = m - 1;
    else if (i >= runs[2 * m + 1]) lo = m + 1;
    else return m;
  }
  return -lo - 1;
}

export const isUp = (runs: Runs, i: number) => findRun(runs, Math.floor(i)) >= 0;

export interface Transition {
  /** Sample index of the event (may be fractional input rounded), or null if not within the series. */
  index: number | null;
  /** True when the event lies beyond the end of the precomputed range. */
  beyondRange: boolean;
}

/**
 * Next "set" (body goes below horizon) at or after sample i: end of the current run.
 * If the body is currently down, the next set is the end of the next run.
 */
export function nextSet(runs: Runs, i: number, n: number): Transition {
  const k = findRun(runs, Math.floor(i));
  const r = k >= 0 ? k : -k - 1;
  if (2 * r >= runs.length) return { index: null, beyondRange: true };
  const end = runs[2 * r + 1];
  if (end >= n) return { index: null, beyondRange: true };
  return { index: end, beyondRange: false };
}

/** Next "rise" strictly after sample i: start of the next run (not the current one). */
export function nextRise(runs: Runs, i: number): Transition {
  const ii = Math.floor(i);
  const k = findRun(runs, ii);
  const r = k >= 0 ? k + 1 : -k - 1;
  if (2 * r >= runs.length) return { index: null, beyondRange: true };
  return { index: runs[2 * r], beyondRange: false };
}

/** Number of "up" samples in [a, b). */
export function upCount(runs: Runs, a: number, b: number): number {
  let c = 0;
  for (let k = 0; k < runs.length; k += 2) {
    if (runs[k] >= b) break;
    const s = Math.max(runs[k], a), e = Math.min(runs[k + 1], b);
    if (e > s) c += e - s;
  }
  return c;
}

export const upFraction = (runs: Runs, a: number, b: number) => (b > a ? upCount(runs, a, b) / (b - a) : 0);

/** Longest stretch of "down" samples within [a, b); `clipped` if it touches the window edges. */
export function longestGap(runs: Runs, a: number, b: number): { length: number; start: number; clipped: boolean } {
  let best = { length: 0, start: a, clipped: false };
  let cursor = a;
  const consider = (s: number, e: number) => {
    if (e - s > best.length) best = { length: e - s, start: s, clipped: s === a || e === b };
  };
  for (let k = 0; k < runs.length; k += 2) {
    const s = runs[k], e = runs[k + 1];
    if (e <= a) continue;
    if (s >= b) break;
    if (s > cursor) consider(cursor, s);
    cursor = Math.max(cursor, e);
  }
  if (cursor < b) consider(cursor, b);
  return best;
}

/** Longest continuous "up" stretch in [a, b). */
export function longestRun(runs: Runs, a: number, b: number): number {
  let best = 0;
  for (let k = 0; k < runs.length; k += 2) {
    const s = Math.max(runs[k], a), e = Math.min(runs[k + 1], b);
    if (e - s > best) best = e - s;
  }
  return best;
}
