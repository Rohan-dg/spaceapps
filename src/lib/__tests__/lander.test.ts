import { describe, expect, it } from 'vitest';
import { DEFAULT_LANDER, simulateLander, validateLander, type Lander } from '../lander';
import type { Series } from '../series';

// hourly series, 30 days: Sun up the first 300 h at 10° with the full disk visible, then dark; Earth up at 5°
const n = 720;
const sunEl = new Int16Array(n).fill(-500); for (let i = 0; i < 300; i++) sunEl[i] = 1000;
const series = {
  id: 'x', t0: 0, stepMs: 3600000, n, synthetic: true, sunUp: [0, 300], earthUp: [0, n],
  sunEl, earthEl: new Int16Array(n).fill(500), sunFrac: new Uint8Array(n).fill(250),
} as unknown as Series;
const base: Lander = { ...DEFAULT_LANDER, durationDays: 30, dustLossPctPerDay: 0, systemLossPct: 0, roundTripEffPct: 100, maxDepthOfDischargePct: 100, commsDutyPct: 0 };

describe('expert lander model', () => {
  it('array output follows Sun elevation and pointing', () => {
    const v = simulateLander(series, 0, { ...base, pointing: 'vertical-tracking' });
    const h = simulateLander(series, 0, { ...base, pointing: 'horizontal' });
    const full = 3 * 0.29 * 1361; // area x efficiency x solar constant
    expect(v.peakArrayW).toBeCloseTo(full * Math.cos((10 * Math.PI) / 180), 0);
    expect(h.peakArrayW).toBeCloseTo(full * Math.sin((10 * Math.PI) / 180), 0);
  });

  it('runs out of battery in a long night and says when', () => {
    // night draw 60 + 90 W = 150 W for 420 h needs 63 kWh; 30 kWh lasts 200 h
    const r = simulateLander(series, 0, { ...base, batteryKWh: 30 });
    expect(r.survives).toBe(false);
    expect(r.firstOutageH).toBeCloseTo(500, -1);
    expect(r.heaterKWh).toBeCloseTo(37.8, 0);
  });

  it('survives with enough battery and counts link hours above the mask', () => {
    const r = simulateLander(series, 0, { ...base, batteryKWh: 80 });
    expect(r.survives).toBe(true);
    expect(r.linkHours).toBe(n);
    expect(simulateLander(series, 0, { ...base, batteryKWh: 80, minEarthElDeg: 10 }).linkHours).toBe(0);
  });

  it('rejects impossible inputs', () => {
    expect(validateLander(DEFAULT_LANDER)).toBeNull();
    expect(validateLander({ ...DEFAULT_LANDER, batteryKWh: 0 })).not.toBeNull();
    expect(validateLander({ ...DEFAULT_LANDER, cellEffPct: NaN })).not.toBeNull();
  });
});

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 2 commits), under the team's direction. Attribution from the commit history.
