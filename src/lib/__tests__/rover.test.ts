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

describe('reaching sunlight', async () => {
  const { planSunlight } = await import('../moon/rover');
  const { bodyFixedGeometry } = await import('../ephemeris');
  const t = Date.parse('2027-07-08T00:00:00Z');
  const s = bodyFixedGeometry(new Date(t)).sunKm;
  const subLat = (Math.asin(s[2] / Math.hypot(...s)) * 180) / Math.PI, subLon = (Math.atan2(s[1], s[0]) * 180) / Math.PI;
  const flat = () => 0;

  it('under a high Sun on flat ground the start is already lit', () => {
    expect(planSunlight(flat, { lat: subLat, lon: subLon, batteryH: 5, speedKmH: 1 }, t, 1000, null).kind).toBe('here');
  });

  it('just past the terminator, driving sunward finds light within range', () => {
    // 1.5° of arc (about 45 km) into the night from the sunrise line
    const r = planSunlight(flat, { lat: 0, lon: subLon - 91.5, batteryH: 80, speedKmH: 1 }, t, 1000, null);
    expect(r.kind).toBe('drive');
    if (r.kind === 'drive') { expect(r.km).toBeLessThanOrEqual(80); expect(r.spareH).toBeGreaterThanOrEqual(0); }
  });

  it('deep in the night with a small battery there is no sunlight in reach', () => {
    const r = planSunlight(flat, { lat: 0, lon: subLon + 180, batteryH: 5, speedKmH: 0.5 }, t, 1000, new Array(360).fill(0));
    expect(r.kind).toBe('none');
  });
});
