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

describe('terrain-aware reach', async () => {
  const { roverReach, validateSpec, LUNAR_G } = await import('../moon/rover');
  const base = {
    lat: -10, lon: 30, batteryWh: 4000, startPct: 100, reservePct: 20, hotelW: 150, driveW: 250, speedKmH: 0.5,
    maxSlopeDeg: 15, slopeDerate: 0.5, massKg: 200, drivetrainPct: 60, detourPct: 0, solarW: 0,
  };
  const flat = () => 0;

  it('on flat ground every direction reaches usable energy / power × speed, return is half', () => {
    const r = roverReach(flat, base, 100, 36);
    expect(r.usableWh).toBeCloseTo(3200);
    expect(r.flatKm).toBeCloseTo(4, 6);
    for (const ray of r.rays) { expect(ray.oneWayKm).toBeCloseTo(4, 3); expect(ray.returnKm).toBeGreaterThan(1.9); expect(ray.returnKm).toBeLessThanOrEqual(2); }
    for (const p of r.ring) expect(gcDistanceKm(base, p)).toBeCloseTo(4, 3);
    expect(r.blocked).toBe(0);
  });

  it('detour, reserve and solar charging change the radius as expected', () => {
    expect(roverReach(flat, { ...base, detourPct: 25 }, 100, 8).oneWay.median).toBeCloseTo(3.2, 3);
    expect(roverReach(flat, { ...base, reservePct: 60 }, 100, 8).oneWay.median).toBeCloseTo(2, 3);
    expect(roverReach(flat, { ...base, solarW: 200 }, 100, 8).oneWay.median).toBeCloseTo(8, 3);
  });

  it('climbing costs m·g·Δh / efficiency and slows the rover; downhill is cheaper than uphill', () => {
    // a uniform 5° ramp rising to the east
    const kmPerDegLon = (Math.PI / 180) * 1737.4 * Math.cos((base.lat * Math.PI) / 180);
    const ramp = (_la: number, lo: number) => (lo - base.lon) * kmPerDegLon * 1000 * Math.tan((5 * Math.PI) / 180);
    const r = roverReach(ramp, base, 50, 4); // N, E, S, W
    const [n, e, , w] = r.rays;
    expect(e.oneWayKm).toBeLessThan(w.oneWayKm);
    expect(w.oneWayKm).toBeLessThan(n.oneWayKm + 1e-9);
    // east: speed at 5° = 0.5 × (1 − 0.5 × 5/15); energy per km = 400 W × h/km + m g tan5° × 1000 / 0.6 / 3600
    const v = 0.5 * (1 - 0.5 * (5 / 15)), whPerKm = 400 / v + (200 * LUNAR_G * 1000 * Math.tan((5 * Math.PI) / 180)) / 0.6 / 3600;
    expect(e.oneWayKm).toBeCloseTo(3200 / whPerKm, 1);
  });

  it('a wall steeper than the limit stops that direction only', () => {
    const wall = (la: number) => (la > base.lat + 0.02 ? 500 : 0); // ~0.6 km north, 500 m cliff
    const r = roverReach(wall, base, 50, 8);
    expect(r.rays[0].stop).toBe('slope');
    expect(r.rays[0].oneWayKm).toBeLessThan(0.7);
    expect(r.rays[4].oneWayKm).toBeCloseTo(4, 2);
    expect(r.blocked).toBeGreaterThan(0);
  });

  it('rejects impossible inputs', () => {
    expect(validateSpec({ ...base, reservePct: 100 })).toMatch(/Reserve/);
    expect(validateSpec({ ...base, drivetrainPct: 0 })).toMatch(/Drivetrain/);
    expect(validateSpec({ ...base, maxSlopeDeg: 0 })).toMatch(/slope/);
    expect(validateSpec(base)).toBeNull();
  });
});
