import { describe, expect, it } from 'vitest';
import { NASA_SITES, launchWindows, lst, moonRaDec, planLaunch } from '../launch';

const D = Math.PI / 180;
const unit = (ra: number, dec: number) => [Math.cos(dec * D) * Math.cos(ra * D), Math.cos(dec * D) * Math.sin(ra * D), Math.sin(dec * D)];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('launch windows', () => {
  const arrival = Date.parse('2027-07-12T06:00:00Z');
  const from = arrival - 5 * 86400000;

  for (const site of NASA_SITES) {
    it(`${site.short}: pad and Moon lie in one plane at the stated inclination`, () => {
      const ws = launchWindows(site, arrival, from, from + 86400000);
      expect(ws.length).toBeGreaterThanOrEqual(1);
      const m = moonRaDec(arrival), moon = unit(m.ra, m.dec);
      for (const w of ws) {
        const pad = unit(lst(w.t, site.lon), site.lat);
        const n = cross(pad, moon), len = Math.hypot(...n);
        const nz = Math.abs(n[2] / len);
        expect(Math.acos(nz) / D).toBeCloseTo(w.inclination, 1);
        expect(w.inclination).toBeGreaterThanOrEqual(site.minIncl);
        expect(w.inclination).toBeLessThanOrEqual(site.maxIncl);
        expect(w.azimuth).toBeGreaterThan(0); expect(w.azimuth).toBeLessThan(180);
        expect(dot(n, pad)).toBeCloseTo(0, 9);
      }
    });
  }

  it('Kennedy beats Wallops on the boost from Earth rotation', () => {
    const [ksc, wal] = NASA_SITES;
    const a = launchWindows(ksc, arrival, from, from + 86400000)[0], b = launchWindows(wal, arrival, from, from + 86400000)[0];
    expect(a.boostMs).toBeGreaterThan(b.boostMs);
  });

  it('plans a launch about the transit time before landing, from a NASA centre', () => {
    const day = { t: Date.parse('2027-07-12T00:00:00Z'), sun: 1, earth: 1, both: 1, landing: arrival };
    const p = planLaunch(day, 4.5);
    expect(p.best).not.toBeNull();
    expect(NASA_SITES.map((s) => s.id)).toContain(p.best!.site.id);
    expect(Math.abs(p.best!.window!.t - p.nominal)).toBeLessThanOrEqual(12 * 3600000);
  });
});

describe('good landing days anywhere', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseSeries } = await import('../series');
  const { goodDays } = await import('../launch');
  const load = (id: string) => parseSeries(JSON.parse(readFileSync(`public/series/${id}.json`, 'utf8')));
  const from = Date.parse('2027-07-01T00:00:00Z');

  it('far side (Chang\'e-4): none with Earth required, plenty with sunlight only', () => {
    const s = load('change-4');
    expect(goodDays(s, from, 5, 'sun-earth')).toHaveLength(0);
    const sun = goodDays(s, from, 5, 'sun');
    expect(sun).toHaveLength(5);
    for (const d of sun) { expect(d.sun).toBeGreaterThanOrEqual(0.7); expect(d.landing).toBeGreaterThanOrEqual(d.t); expect(d.landing).toBeLessThan(d.t + 86400000); }
  });

  it('near side (Apollo 11): good days meet both thresholds', () => {
    for (const d of goodDays(load('apollo-11'), from, 5)) { expect(d.sun).toBeGreaterThanOrEqual(0.7); expect(d.earth).toBeGreaterThanOrEqual(0.9); }
  });
});
