import { describe, expect, it } from 'vitest';
import { simulateLander, validateLander, DEFAULT_LANDER } from '../lander';
import type { Series } from '../series';

// hourly series, 30 days: sunlit for the first 300 h, dark for the rest; Earth always up
const n = 720;
const series = { id: 'x', t0: 0, stepMs: 3600000, n, synthetic: true, sunUp: [0, 300], earthUp: [0, n] } as unknown as Series;

describe('lander energy model', () => {
  it('drains through the night and reports the shortfall', () => {
    const r = simulateLander(series, 0, { arrayW: 400, batteryKWh: 30, dayLoadW: 200, nightLoadW: 150 }, 30);
    // 420 h of dark at 150 W needs 63 kWh, so a 30 kWh battery runs out after 200 h
    expect(r.survives).toBe(false);
    expect(r.minChargePct).toBe(0);
    expect(r.hoursWithoutPower).toBeCloseTo(220, 0);
    expect(r.operatingHours).toBe(300);
  });

  it('survives with a battery big enough for the night', () => {
    const r = simulateLander(series, 0, { arrayW: 400, batteryKWh: 70, dayLoadW: 200, nightLoadW: 150 }, 30);
    expect(r.survives).toBe(true);
    expect(r.minChargePct).toBeGreaterThan(0);
    expect(r.linkHours).toBe(n);
  });

  it('rejects impossible inputs', () => {
    expect(validateLander(DEFAULT_LANDER)).toBeNull();
    expect(validateLander({ ...DEFAULT_LANDER, batteryKWh: 0 })).not.toBeNull();
    expect(validateLander({ ...DEFAULT_LANDER, arrayW: NaN })).not.toBeNull();
  });
});
