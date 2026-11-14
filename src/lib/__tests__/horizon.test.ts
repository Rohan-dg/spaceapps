import { describe, expect, it } from 'vitest';
import { diskVisibleFraction, flatProfile, horizonAt, isAboveHorizon } from '../horizon';

describe('horizon masking', () => {
  const p = flatProfile();
  p[10] = 2; p[11] = 4; p[359] = 1;
  it('interpolates linearly between 1° samples', () => {
    expect(horizonAt(p, 10.5)).toBeCloseTo(3, 12);
    expect(horizonAt(p, 9.5)).toBeCloseTo(1, 12);
  });
  it('wraps around 360°', () => {
    expect(horizonAt(p, 359.5)).toBeCloseTo(0.5, 12);
    expect(horizonAt(p, -0.5)).toBeCloseTo(0.5, 12);
    expect(horizonAt(p, 370)).toBeCloseTo(2, 12);
  });
  it('a body at 1.5° is masked behind a 3° ridge but visible elsewhere', () => {
    expect(isAboveHorizon(p, 10.5, 1.5)).toBe(false);
    expect(isAboveHorizon(p, 180, 1.5)).toBe(true);
  });
  it('a body below the flat horizon is not visible', () => {
    expect(isAboveHorizon(p, 180, -0.01)).toBe(false);
  });
});

describe('disk visible fraction', () => {
  it('is 0, 0.5, 1 at the canonical positions', () => {
    expect(diskVisibleFraction(-1, 0.27, 0)).toBe(0);
    expect(diskVisibleFraction(0, 0.27, 0)).toBeCloseTo(0.5, 12);
    expect(diskVisibleFraction(1, 0.27, 0)).toBe(1);
  });
  it('is monotonic', () => {
    let prev = -1;
    for (let el = -0.3; el <= 0.3; el += 0.01) {
      const f = diskVisibleFraction(el, 0.27, 0);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
});
