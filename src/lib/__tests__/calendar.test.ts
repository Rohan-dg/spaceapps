import { describe, expect, it } from 'vitest';
import { bestWindows, bothCount, type DayStat } from '../calendar';
import type { Series } from '../series';

const mk = (sunUp: number[], earthUp: number[]) => ({ sunUp, earthUp }) as unknown as Series;

describe('bothCount (run intersection)', () => {
  it('counts overlap of sun and earth runs within window', () => {
    const s = mk([0, 5, 8, 12], [3, 9]);
    expect(bothCount(s, 0, 20)).toBe(2 + 1); // [3,5) and [8,9)
    expect(bothCount(s, 4, 20)).toBe(1 + 1);
    expect(bothCount(mk([], [0, 9]), 0, 9)).toBe(0);
  });
});

describe('bestWindows', () => {
  it('returns non-overlapping windows ranked by mean', () => {
    const days: DayStat[] = [0.1, 0.9, 0.9, 0.1, 0.1, 0.8, 0.8, 0.2].map((v, i) => ({ t: i * 86400000, sun: v, earth: v, both: v }));
    const w = bestWindows(days, 'sun', 2, 3);
    expect(w.map((x) => x.start / 86400000)).toEqual([1, 5, 3]);
    expect(w[0].score).toBeCloseTo(0.9);
  });
});

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
