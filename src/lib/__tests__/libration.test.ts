import * as Astro from 'astronomy-engine';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { librationAt, librationSeries, periodDays, rangeOf, siteLibration, unwrap } from '../libration';

const T0 = Date.parse('2027-01-01T00:00:00Z'), T1 = Date.parse('2029-12-31T00:00:00Z');
const series = librationSeries(T0, T1, 6);
const hz = (id: string) => JSON.parse(readFileSync(`public/horizons/${id}.json`, 'utf8'));

describe('libration and orbital variation', () => {
  it('agrees with astronomy-engine\'s independent libration routine', () => {
    for (const iso of ['2027-03-05T00:00:00Z', '2028-07-19T12:00:00Z', '2029-11-02T06:00:00Z']) {
      const ours = librationAt(Date.parse(iso)), ref = Astro.Libration(new Date(iso));
      expect(Math.abs(ours.lonDeg - ref.elon)).toBeLessThan(0.3);
      expect(Math.abs(ours.latDeg - ref.elat)).toBeLessThan(0.3);
      expect(Math.abs(ours.distKm - ref.dist_km) / ref.dist_km).toBeLessThan(0.001);
    }
  });

  it('amplitudes and orbit match the known values', () => {
    const lon = rangeOf(series, 'lonDeg'), lat = rangeOf(series, 'latDeg'), dist = rangeOf(series, 'distKm'), sun = rangeOf(series, 'sunLatDeg');
    expect(lon.max).toBeGreaterThan(6.5); expect(lon.max).toBeLessThan(8.5); expect(lon.min).toBeLessThan(-6.5);
    expect(lat.max).toBeGreaterThan(6.3); expect(lat.max).toBeLessThan(7.2); expect(lat.min).toBeLessThan(-6.3);
    expect(dist.min).toBeGreaterThan(355000); expect(dist.min).toBeLessThan(360000);
    expect(dist.max).toBeGreaterThan(404000); expect(dist.max).toBeLessThan(407500);
    expect(Math.abs(sun.max)).toBeLessThan(1.7); expect(sun.max).toBeGreaterThan(1.4);
  });

  it('periods: anomalistic month for distance, draconic month for latitude, a year for the Sun\'s season', () => {
    expect(periodDays(series, 'distKm')).toBeCloseTo(27.55, 0);
    expect(periodDays(series, 'latDeg')).toBeCloseTo(27.21, 0);
    expect(Math.abs(periodDays(series, 'sunLatDeg', 120) - 346.6)).toBeLessThan(15); // eclipse year
  });

  it('site effect: libration can create Earth visibility or take it away, depending on the terrain', () => {
    const at = (id: string) => { const h = hz(id); return siteLibration({ lat: h.lat, lon: h.lon, heightM: h.siteHeightM + 2 }, h.horizonDeg, Date.parse('2027-07-08T00:00:00Z')); };
    const rim = at('shackleton-rim'), ridge = at('connecting-ridge'), mal = at('malapert'), a11 = at('apollo-11'), far = at('change-4');
    expect(rim.elMax - rim.elMin).toBeGreaterThan(10); // Earth bobs up and down by more than 10° at the pole
    expect(rim.fixedEarth.up).toBe(false); expect(rim.earthUpPct).toBeGreaterThan(20); // the wobble lifts Earth into view
    expect(ridge.fixedEarth.up).toBe(true); expect(ridge.earthUpPct).toBeLessThan(80); // the wobble hides Earth part of the time
    expect(mal.earthUpPct).toBe(100); // high enough that the wobble never hides Earth
    expect(a11.earthUpPct).toBe(100); expect(a11.fixedEarth.up).toBe(true);
    expect(far.earthUpPct).toBe(0); expect(far.fixedEarth.up).toBe(false);
  });

  it('unwraps azimuths across north', () => {
    expect(unwrap([350, 355, 2, 8])).toEqual([350, 355, 362, 368]);
  });
});
