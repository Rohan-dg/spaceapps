import { describe, expect, it } from 'vitest';
import { gcDistanceKm } from '../mission';
import { roverRange, validateRover } from '../moon/rover';

describe('rover range on battery', () => {
  it('distance is battery hours × speed, out-and-back is half', () => {
    const r = roverRange({ lat: -89.45, lon: 222.69, batteryH: 8, speedKmH: 0.5 });
    expect(r.oneWayKm).toBeCloseTo(4);
    expect(r.returnKm).toBeCloseTo(2);
  });

  it('ring points sit at the range from the start, including over the pole', () => {
    for (const c of [{ lat: -89.9, lon: 10 }, { lat: 0, lon: 0 }, { lat: 45, lon: 179 }]) {
      const r = roverRange({ ...c, batteryH: 20, speedKmH: 2 }, 64);
      for (const p of r.ring) expect(gcDistanceKm(c, p)).toBeCloseTo(40, 6);
      for (const p of r.returnRing) expect(gcDistanceKm(c, p)).toBeCloseTo(20, 6);
    }
  });

  it('rejects impossible inputs', () => {
    expect(validateRover({ lat: -95, lon: 0, batteryH: 8, speedKmH: 1 })).toMatch(/Latitude/);
    expect(validateRover({ lat: 0, lon: NaN, batteryH: 8, speedKmH: 1 })).toMatch(/Longitude/);
    expect(validateRover({ lat: 0, lon: 0, batteryH: 0, speedKmH: 1 })).toMatch(/Battery/);
    expect(validateRover({ lat: 0, lon: 0, batteryH: 8, speedKmH: -1 })).toMatch(/Speed/);
    expect(validateRover({ lat: 0, lon: 0, batteryH: 8, speedKmH: 1 })).toBeNull();
  });
});
