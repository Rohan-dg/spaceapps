import { describe, expect, it } from 'vitest';
import { azElOf, bicubic, bilinear, groundY, makeWorld, skyline, toLatLon, toStereo, visibilityMap, type Grid } from '../terrain';
import { enu, R_M } from '../../lib/moon/frames';

const grid = (): Grid => ({ h: new Float32Array(201 * 201), n: 201, resM: 20, x0: -2000, y0: 2000 });
describe('rover terrain and visibility', () => {
  it('samples a plane without discontinuities and handles grid edges', () => {
    const g = grid();
    for (let j = 0; j < g.n; j++) for (let i = 0; i < g.n; i++) g.h[j * g.n + i] = i * 2 + j * 3;
    expect(bilinear(g, -2000, 2000)).toBe(0);
    expect(bilinear(g, 2000, -2000)).toBe(1000);
    expect(bilinear(g, 2010, 0)).toBeNaN();
    expect(bicubic(g, 10, 10)).toBeCloseTo(bilinear(g, 10, 10), 7);
  });
  it('maps local axes consistently and preserves the selected point', () => {
    const w = makeWorld(grid(), grid(), -90, 0);
    expect(toStereo(w, 40, 60)).toEqual([40, 60]);
    expect(toLatLon(w, 0, 0)[0]).toBe(-90);
    expect(groundY(w, 1000, 0, false)).toBeCloseTo(-1e6 / (2 * R_M), 8);
  });
  it('places a body at the expected local azimuth and elevation', () => {
    const frame = enu(-89.99, 0), w = makeWorld(null, grid(), -89.99, 0);
    expect(azElOf(frame.u, w.xs, w.ys)[1]).toBeCloseTo(90, 5);
    expect(azElOf(frame.e, w.xs, w.ys)[0]).toBeCloseTo(90, 5);
  });
  it('lets a nearby ridge block the horizon without procedural detail changing the result', () => {
    const g = grid(), w = makeWorld(g, g, -90, 0);
    expect(skyline(w, 0, 0, 0, 90, 0.6, 90, 1500).ang).toBeLessThan(0);
    for (let j = 0; j < g.n; j++) for (let i = 108; i <= 112; i++) g.h[j * g.n + i] = 40;
    expect(skyline(w, 0, 0, 0, 90, 0.6, 90, 1500).ang).toBeGreaterThan(10);
    const f = enu(-90, 0), el = 5 * Math.PI / 180;
    const u = f.e.map((v, i) => v * Math.cos(el) + f.u[i] * Math.sin(el));
    expect(visibilityMap(w, u, 0.266, 10, 2, 0.6).every((v) => v === 0)).toBe(true);
  });
  it('does not invent sunlight below the horizon', () => {
    const g = grid(), w = makeWorld(null, g, -90, 0), down = enu(-90, 0).u.map((x) => -x);
    expect([...visibilityMap(w, down, 0.266, 100, 4, 0.6)]).toEqual(new Array(16).fill(0));
  });
});

// SI disclosure (NASA Space Apps): written with SI assistance by OpenAI Codex (OpenAI, 1 commit), under the team's direction. Attribution from the commit history.
