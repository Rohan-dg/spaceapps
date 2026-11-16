import { describe, expect, it } from 'vitest';
import { azAt, compassShort, earthPhase, separation, wrapDelta, xOf, yOf, type View } from '../firstPerson';

describe('wrapDelta', () => {
  it('returns the short way round', () => {
    expect(wrapDelta(10, 350)).toBeCloseTo(20);
    expect(wrapDelta(350, 10)).toBeCloseTo(-20);
    expect(wrapDelta(180, 0)).toBeCloseTo(180);
    expect(wrapDelta(90, 90)).toBeCloseTo(0);
  });
});

describe('separation', () => {
  it('measures angles on the sky', () => {
    expect(separation(0, 0, 90, 0)).toBeCloseTo(90);
    expect(separation(0, 0, 180, 0)).toBeCloseTo(180);
    expect(separation(123, 89.999, 300, 89.999)).toBeLessThan(0.01);
  });
});

describe('earthPhase', () => {
  it('is full when the Sun is behind the observer and new when it is behind Earth', () => {
    expect(earthPhase(0, 0, 180, 0).lit).toBeCloseTo(1); // elongation 180 deg: full Earth
    expect(earthPhase(90, 0, 90, 0).lit).toBeCloseTo(0); // same direction: new Earth
    expect(earthPhase(0, 0, 90, 0).lit).toBeCloseTo(0.5); // quarter
  });
});

describe('projection', () => {
  const v: View = { yaw: 90, fov: 60, width: 600, height: 300, vScale: 1, horizonY: 200 };
  it('maps azimuth to x inside the field of view only', () => {
    expect(xOf(v, 90)).toBeCloseTo(300);
    expect(xOf(v, 60)).toBeCloseTo(0);
    expect(xOf(v, 120)).toBeCloseTo(600);
    expect(xOf(v, 200)).toBeNull();
  });
  it('inverts x back to azimuth, across north', () => {
    expect(azAt(v, 300)).toBeCloseTo(90);
    const w: View = { ...v, yaw: 5 };
    expect(azAt(w, 0)).toBeCloseTo(335);
    expect(xOf(w, 355)).toBeCloseTo(200);
  });
  it('maps elevation to y with the height stretch', () => {
    expect(yOf(v, 0)).toBe(200);
    expect(yOf(v, 1)).toBeCloseTo(190);
    expect(yOf({ ...v, vScale: 3 }, 1)).toBeCloseTo(170);
  });
  it('names compass directions', () => {
    expect(compassShort(0)).toBe('N');
    expect(compassShort(268)).toBe('W');
    expect(compassShort(-45)).toBe('NW');
  });
});

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 2 commits), under the team's direction. Attribution from the commit history.
