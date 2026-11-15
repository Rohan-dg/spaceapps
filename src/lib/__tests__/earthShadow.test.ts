import { describe, expect, it } from 'vitest';
import { declination, earthDayLengthH, earthNoonEl, earthSunEl, horizonDistKm, MOON_R_M, MOON_SUN_RATE, sunriseDurationH } from '../earthCompare';
import { cellHorizons, hzAt, litFraction, litMask, NAZ, type Tile } from '../shadowMap';

describe('earthCompare', () => {
  it('declination follows the seasons', () => {
    expect(declination(Date.UTC(2027, 5, 21))).toBeCloseTo(23.44, 0);
    expect(declination(Date.UTC(2027, 11, 21))).toBeCloseTo(-23.44, 0);
    expect(Math.abs(declination(Date.UTC(2027, 2, 20)))).toBeLessThan(1);
  });
  it('noon Sun at the equator at equinox is near the zenith', () => {
    const t = Date.UTC(2027, 2, 20, 12, 7); // equation of time ≈ +7 min in March
    expect(earthSunEl(0, 0, t)).toBeGreaterThan(88);
    expect(earthNoonEl(0, t)).toBeGreaterThan(89);
  });
  it('polar night and midnight sun', () => {
    expect(earthDayLengthH(-85, Date.UTC(2027, 6, 1))).toBe(0);
    expect(earthDayLengthH(-85, Date.UTC(2027, 0, 1))).toBe(24);
    expect(earthDayLengthH(0, Date.UTC(2027, 2, 20))).toBeCloseTo(12.1, 0);
  });
  it('a lunar sunrise is ~30x slower than on Earth, and endless near the pole', () => {
    const moon = sunriseDurationH(0, 0, MOON_SUN_RATE), earth = sunriseDurationH(0, 0, 15);
    expect(moon / earth).toBeCloseTo(15 / MOON_SUN_RATE, 3);
    expect(moon).toBeGreaterThan(1);
    expect(sunriseDurationH(-89.9, 0, MOON_SUN_RATE)).toBeGreaterThan(24 * 20);
  });
  it('horizon distance for a 2 m mast', () => {
    expect(horizonDistKm(2, MOON_R_M)).toBeCloseTo(2.64, 1);
  });
});

/** A flat n×n tile with a wall of height `wallM` along the east edge. Heights are relative to the site plane
 *  with the curvature drop included, as in the real tiles. */
function wallTile(n = 41, spacingM = 100, wallM = 500): Tile {
  const z = new Int16Array(n * n), c0 = (n - 1) / 2;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const d2 = ((r - c0) ** 2 + (c - c0) ** 2) * spacingM * spacingM;
    z[r * n + c] = Math.round((c >= n - 3 ? wallM : 0) - d2 / (2 * 1737400));
  }
  return { n, halfKm: (c0 * spacingM) / 1000, spacingM, z, dem: 'test' };
}

describe('shadowMap', () => {
  const tile = wallTile();
  const hz = cellHorizons(tile);
  const n = tile.n, mid = ((n - 1) / 2) * n + (n - 1) / 2;
  it('traces the wall to the east and open ground to the west', () => {
    expect(hz.length).toBe(n * n * NAZ);
    // centre cell: wall 1.7 km east, 500 m high → about atan(500/1700) ≈ 16°
    expect(hzAt(hz, mid, 90)).toBeGreaterThan(14);
    expect(hzAt(hz, mid, 90)).toBeLessThan(18);
    expect(hzAt(hz, mid, 270)).toBeLessThan(0.5);
  });
  it('a low Sun in the east leaves the ground in shadow; in the west it is lit', () => {
    const east = litMask(tile, hz, { az: 90, el: 5 }, -90);
    const west = litMask(tile, hz, { az: 270, el: 5 }, -90);
    expect(east[mid]).toBe(0);
    expect(west[mid]).toBe(1);
  });
  it('the distant skyline blocks the whole tile', () => {
    expect(litMask(tile, hz, { az: 270, el: 2 }, 3).every((v) => v === 0)).toBe(true);
  });
  it('sunlit fraction averages the samples', () => {
    const f = litFraction(tile, hz, [{ az: 90, el: 5, far: -90 }, { az: 270, el: 5, far: -90 }]);
    expect(f[mid]).toBe(125);
  });
});
