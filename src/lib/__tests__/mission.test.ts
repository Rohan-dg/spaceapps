import { describe, expect, it } from 'vitest';
import { flatProfile } from '../horizon';
import {
  DEFAULT_PLAN, driveSchedule, effectiveSpeed, gcDistanceKm, offsetPoint, roverAt, simulateMission, solarPowerW, straightRoute, surfaceTempK,
} from '../mission';
import { planRoute } from '../routeplan';
import type { PolarDem } from '../raymarch';

describe('mission geometry', () => {
  it('offsetPoint and gcDistance agree', () => {
    const a = { lat: -89.45, lon: 222.7 };
    const b = offsetPoint(a, 8, 90);
    expect(gcDistanceKm(a, b)).toBeCloseTo(8, 6);
  });
  it('drive schedule and rover position', () => {
    const r = straightRoute({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }); // ~30.3 km
    const plan = { ...DEFAULT_PLAN, departure: 0 };
    const s = driveSchedule(r, plan);
    expect(s[s.length - 1]).toBeCloseTo(r.lengthKm / plan.speedKmH, 6);
    const mid = roverAt(r, s, 0, (s[s.length - 1] / 2) * 3600000);
    expect(mid.phase).toBe('driving');
    expect(mid.dKm).toBeCloseTo(r.lengthKm / 2, 3);
    expect(roverAt(r, s, 0, -1).phase).toBe('before');
    expect(roverAt(r, s, 0, 1e12).phase).toBe('arrived');
  });
  it('slope derating', () => {
    expect(effectiveSpeed(1, 0, 15, 0.5)).toBe(1);
    expect(effectiveSpeed(1, 15, 15, 0.5)).toBe(0.5);
  });
  it('power and temperature models', () => {
    expect(solarPowerW({ panelM2: 1, panelEffPct: 100, panelMode: 'tracking' }, 30, 1)).toBeCloseTo(1361, 6);
    expect(solarPowerW({ panelM2: 1, panelEffPct: 100, panelMode: 'vertical' }, 60, 1)).toBeCloseTo(680.5, 3);
    expect(surfaceTempK(90, 1)).toBeGreaterThan(380);
    expect(surfaceTempK(90, 1)).toBeLessThan(400);
    expect(surfaceTempK(-5, 0)).toBe(95);
    expect(surfaceTempK(10, 1, true)).toBe(40);
  });
  it('battery never exceeds capacity or drops below zero', () => {
    const r = straightRoute({ lat: 0.674, lon: 23.47 }, offsetPoint({ lat: 0.674, lon: 23.47 }, 5, 0));
    const plan = { ...DEFAULT_PLAN, departure: Date.parse('2027-05-01T00:00:00Z'), durationDays: 20, hotelW: 400 };
    const tl = simulateMission(plan, r, driveSchedule(r, plan), flatProfile(), 0);
    for (const b of tl.battPct) { expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThanOrEqual(100.0001); }
    expect(tl.sunPct).toBeGreaterThan(20);
    expect(tl.earthPct).toBe(100); // near side, flat horizon
  });
});

describe('route planning', () => {
  // Synthetic DEM: flat, with a wall of steep ground across the middle that has one gap.
  const size = 101, res = 400;
  const data = new Int16Array(size * size);
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (c === 50 && (r < 40 || r > 44)) data[r * size + c] = 2000;
  const dem: PolarDem = { data, size, resM: res, scaleFactor: 1 };
  // Grid centre is the pole; build endpoints either side of the wall.
  const R = 1737400;
  const ll = (row: number, col: number) => {
    const cc = (size - 1) / 2, x = (col - cc) * res, y = (cc - row) * res, rr = Math.hypot(x, y);
    return { lat: (2 * Math.atan(rr / (2 * R)) * 180) / Math.PI - 90, lon: ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360 };
  };
  it('goes around the wall through the gap', () => {
    const a = ll(20, 40), b = ll(20, 60);
    const route = planRoute(dem, a, b, { maxSlopeDeg: 15, maxWaypoints: 2, horizonRangeKm: 5 });
    expect(route.found).toBe(true);
    expect(route.hazardsRoute).toBe(0);
    expect(route.hazardsDirect).toBeGreaterThan(0);
    expect(route.lengthKm).toBeGreaterThan(route.directKm * 1.5);
    expect(route.maxSlopeDeg!).toBeLessThanOrEqual(15);
  });
});

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
