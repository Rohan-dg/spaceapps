import { describe, expect, it } from 'vitest';
import { azElFromBodyFixed, enuBasis, MOON_RADIUS_KM, siteVector, terrainElevationAngle } from '../geometry';
import { dot } from '../vec';
import type { Vec3 } from '../vec';
import { eqjToMoonFixed, skyAt } from '../ephemeris';

const far = 1e13;

describe('ENU basis', () => {
  it('is orthonormal and right-handed at arbitrary sites', () => {
    for (const s of [{ lat: -89.5, lon: 222 }, { lat: 0, lon: 0 }, { lat: 45, lon: -120 }]) {
      const { e, n, u } = enuBasis(s);
      expect(dot(e, e)).toBeCloseTo(1, 12);
      expect(dot(n, n)).toBeCloseTo(1, 12);
      expect(dot(e, n)).toBeCloseTo(0, 12);
      expect(dot(n, u)).toBeCloseTo(0, 12);
      // e × n = u
      const cross: Vec3 = [e[1] * n[2] - e[2] * n[1], e[2] * n[0] - e[0] * n[2], e[0] * n[1] - e[1] * n[0]];
      cross.forEach((c, i) => expect(c).toBeCloseTo(u[i], 12));
    }
  });
});

describe('az/el conversion', () => {
  const eq = { lat: 0, lon: 0 };
  it('target straight up is at el=90', () => {
    expect(azElFromBodyFixed([far, 0, 0], eq).el).toBeCloseTo(90, 6);
  });
  it('cardinal directions at the equator', () => {
    const north = azElFromBodyFixed([MOON_RADIUS_KM, 0, far], eq);
    expect(north.az).toBeCloseTo(0, 6);
    expect(north.el).toBeCloseTo(0, 4);
    const east = azElFromBodyFixed([MOON_RADIUS_KM, far, 0], eq);
    expect(east.az).toBeCloseTo(90, 6);
    const west = azElFromBodyFixed([MOON_RADIUS_KM, -far, 0], eq);
    expect(west.az).toBeCloseTo(270, 6);
  });
  it('at the south pole region, the north pole direction (+z) is far below the horizon', () => {
    const r = azElFromBodyFixed([0, 0, far], { lat: -89, lon: 0 });
    expect(r.el).toBeCloseTo(-89, 3);
  });
  it('a body in the equatorial plane seen from near the south pole is near el≈(90+lat)', () => {
    // From lat -89, an infinitely distant point on the equator in the site's meridian
    // is 1° above the horizon, toward the north (az 0).
    const r = azElFromBodyFixed([far, 0, 0], { lat: -89, lon: 0 });
    expect(r.el).toBeCloseTo(1, 4);
    expect(r.az).toBeCloseTo(0, 4);
  });
  it('applies topocentric parallax for a near target (Earth-like distance)', () => {
    // Earth at 384400 km on the horizon of a sub-earth-limb observer: parallax ≈ R/d rad
    const d = 384400;
    const r = azElFromBodyFixed([0, d, 0], eq);
    expect(r.el).toBeCloseTo(-(Math.atan(MOON_RADIUS_KM / d) * 180) / Math.PI, 4);
  });
  it('site vector has lunar radius plus height', () => {
    const v = siteVector({ lat: -89, lon: 10, heightM: 2000 });
    expect(Math.hypot(...v)).toBeCloseTo(MOON_RADIUS_KM + 2, 9);
  });
});

describe('Moon-fixed rotation', () => {
  it('maps the IAU pole direction onto +z', () => {
    const axis = { ra: 18, dec: 66.5, spin: 123, north: { x: 0, y: 0, z: 0 } } as never;
    const α = 18 * 15 * Math.PI / 180, δ = 66.5 * Math.PI / 180;
    const pole: Vec3 = [Math.cos(δ) * Math.cos(α), Math.cos(δ) * Math.sin(α), Math.sin(δ)];
    const z = eqjToMoonFixed(pole, axis);
    expect(z[2]).toBeCloseTo(1, 12);
  });
  it('matches JPL Horizons at a validation point (Shackleton ridge, 2027-03-01 00:00 UT)', () => {
    // Reference: Horizons DE441, CENTER=coord@301, SITE_COORD=222.69,-89.45,0 (see README Accuracy)
    const k = skyAt({ lat: -89.45, lon: 222.69 }, new Date('2027-03-01T00:00:00Z'));
    expect(Math.abs(k.sun.az - 42.8199)).toBeLessThan(0.01);
    expect(Math.abs(k.sun.el - -0.1665)).toBeLessThan(0.01);
    expect(Math.abs(k.earth.az - 141.3328)).toBeLessThan(0.01);
    expect(Math.abs(k.earth.el - -6.6804)).toBeLessThan(0.01);
  });
});

describe('terrain elevation angle with curvature', () => {
  it('flat terrain at observer height drops below horizontal with distance (d²/2R)', () => {
    // At 30 km, the drop is 30²/(2·1737.4) km ≈ 259 m → ≈ -0.495°
    expect(terrainElevationAngle(30, 0, 0)).toBeCloseTo((Math.atan2(-259.0, 30000) * 180) / Math.PI, 2);
  });
  it('a 500 m ridge 10 km away is ≈ +2.7°', () => {
    expect(terrainElevationAngle(10, 502, 2)).toBeCloseTo((Math.atan2(500 - 28.78, 10000) * 180) / Math.PI, 2);
  });
});
