import { describe, expect, it } from 'vitest';
import { arrivalCharge, educationReach } from '../educationRange';
import { EDU_ROVER, evaluatePath, type Stop } from '../pathPlan';

describe('Education battery rings', () => {
  const point = { id: 'start', lat: 0, lon: 0, chargePct: 100 };
  it('shrinks with available charge and keeps the safety reserve', () => {
    const full = educationReach(() => 0, point, 40)!;
    const half = educationReach(() => 0, { ...point, chargePct: 50 }, 40)!;
    expect(full.oneWay.max).toBeCloseTo(4, 6);
    expect(half.oneWay.max).toBeCloseTo(1.5, 6);
    expect(educationReach(() => 0, { ...point, chargePct: 20 }, 40)!.oneWay.max).toBe(0);
    expect(educationReach(() => 0, { ...point, chargePct: 0 }, 40)!.oneWay.max).toBe(0);
    expect(educationReach(() => 0, { ...point, chargePct: null }, 40)).toBeNull();
  });
  it('shortens only the directions blocked by steep ground', () => {
    const reach = educationReach((_lat, lon) => lon > 0.01 && lon < 180 ? 1000 : 0, point, 40)!;
    expect(reach.rays.find((r) => r.bearing === 90)!.oneWayKm).toBeLessThan(0.4);
    expect(reach.rays.find((r) => r.bearing === 270)!.oneWayKm).toBeCloseTo(4, 6);
  });
  it('uses arrival charge and gives no range after the battery has emptied', () => {
    const stop: Stop = { id: 'a', name: 'A', lat: 0, lon: 0, heightM: 0, horizonDeg: Array(360).fill(90) };
    const report = evaluatePath([stop, { ...stop, id: 'b', name: 'B', lon: 0.01 }], Date.UTC(2027, 0, 1));
    expect(arrivalCharge(report, 0, 100)).toBe(100);
    const charge = arrivalCharge(report, 1, 100)!;
    expect(charge).toBeLessThan(100);
    expect(charge).toBeGreaterThan(EDU_ROVER.reservePct);
    expect(educationReach(() => 0, { ...point, chargePct: charge }, 40)!.oneWay.max).toBeLessThan(4);
    const stranded = evaluatePath([stop, { ...stop, id: 'b', lon: 1 }], Date.UTC(2027, 0, 1));
    expect(arrivalCharge(stranded, 1, 100)).toBe(0);
    expect(arrivalCharge(null, 1, 100)).toBeNull();
  });
});
