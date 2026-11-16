import { describe, expect, it } from 'vitest';
import { flatProfile } from '../horizon';
import { gcDistanceKm } from '../mission';
import { EDU_ROVER, MAX_DRIVE_DAYS, bestStart, evaluatePath, pathRoute, pathScore, type Stop } from '../pathPlan';

const stop = (id: string, lat: number, lon: number, hz = flatProfile()): Stop => ({ id, name: id, lat, lon, heightM: 0, horizonDeg: hz });

describe('pathRoute', () => {
  it('chains the legs and puts a waypoint with its skyline at every stop', () => {
    const s = [stop('a', 0.67, 23.47), stop('b', 0.7, 23.6), stop('c', 0.8, 23.6)];
    const r = pathRoute(s);
    const want = gcDistanceKm(s[0], s[1]) + gcDistanceKm(s[1], s[2]);
    expect(r.lengthKm).toBeCloseTo(want, 6);
    expect(r.points[r.points.length - 1].dKm).toBeCloseTo(want, 6);
    expect(r.waypoints.map((w) => w.dKm)).toEqual([0, gcDistanceKm(s[0], s[1]), want].map((x) => expect.closeTo(x, 6)));
    expect(r.waypoints.every((w) => w.horizonDeg?.length === 360)).toBe(true);
    for (let i = 1; i < r.points.length; i++) expect(r.points[i].dKm).toBeGreaterThan(r.points[i - 1].dKm);
  });
  it('needs two stops', () => {
    expect(() => pathRoute([stop('a', 0, 0)])).toThrow();
  });
});

describe('evaluatePath', () => {
  // near side, flat skyline: Earth always in view
  const day = Date.parse('2027-05-10T00:00:00Z');
  it('a short drive in daylight on the near side is possible', () => {
    const r = evaluatePath([stop('a', 0.67, 23.47), stop('b', 0.67, 23.6)], day);
    expect(r.legs).toHaveLength(1);
    expect(r.hours).toBeCloseTo(r.km / EDU_ROVER.speedKmH, 6);
    expect(r.earth.level).toBe('ok');
    expect(r.battery.level).not.toBe('no');
    expect(r.tooFar).toBe(false);
  });
  it('a drive across the Moon is too far', () => {
    const r = evaluatePath([stop('a', 0.67, 23.47), stop('b', -84, 0)], day);
    expect(r.tooFar).toBe(true);
    expect(r.overall.level).toBe('no');
    expect(r.simulatedH).toBe(MAX_DRIVE_DAYS * 24);
  });
  it('a drive through a whole lunar night empties the battery', () => {
    // ~1 week of driving on the equator starting at sunset runs into the 14-day night
    const sunset = Date.parse('2027-05-20T00:00:00Z');
    const r = evaluatePath([stop('a', 0.67, 23.47), stop('b', 0.67, 26.5)], sunset);
    expect(r.km).toBeGreaterThan(80);
    expect(['no', 'risky']).toContain(r.battery.level);
  });
});

describe('bestStart', () => {
  it('finds a start no worse than any day it tried', () => {
    const stops = [stop('a', 0.67, 23.47), stop('b', 0.67, 26.5)];
    const from = Date.parse('2027-05-20T00:00:00Z');
    const best = bestStart(stops, from, from + 30 * 86400_000, 3)!;
    for (let d = 0; d <= 30; d += 3) expect(pathScore(best.report)).toBeGreaterThanOrEqual(pathScore(evaluatePath(stops, from + d * 86400_000)));
    // the best start keeps more of the week-long drive in daylight than leaving at sunset
    expect(best.report.tl.sunDrivePct!).toBeGreaterThan(evaluatePath(stops, from).tl.sunDrivePct! + 20);
  });
});

describe('polar rover', () => {
  it('vertical panels keep a polar drive going in sunlight', () => {
    // a low Sun near the pole lights vertical panels square on; a flat skyline keeps it up all day in polar summer
    const stops = [stop('a', -88, 0), stop('b', -88, 4)];
    const best = bestStart(stops, Date.parse('2027-01-01T00:00:00Z'), Date.parse('2027-12-31T00:00:00Z'), 5)!;
    expect(best.report.battery.level).toBe('ok');
    expect(best.report.overall.level).not.toBe('no');
  });
});

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
