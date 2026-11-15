import { describe, expect, it } from 'vitest';
import { R_KM } from '../moon/frames';
import { type TileHeights, type TileIndex, buildTileMesh, tileAt, tileHeight, tileOrigin } from '../moon/tiles';

const idx: TileIndex = { deg: 5, n: 4, rows: 34, cols: 72, lat0: 90, lon0: -180, quantumM: 0.5, colorPx: 256, source: 'test', hMinM: [] };
// 5 x 5 corner samples, height = 100 * row + col
const t: TileHeights = { r: 13, c: 40, n: 4, h: Float32Array.from({ length: 25 }, (_, k) => 100 * Math.floor(k / 5) + (k % 5)) };

describe('real-terrain tiles', () => {
  it('maps points to tiles, wrapping longitude and stopping at 80S', () => {
    expect(tileOrigin(idx, 13, 40)).toEqual([25, 20]);
    expect(tileAt(idx, 22.5, 22.5)).toEqual([13, 40]);
    expect(tileAt(idx, 0.1, 179.9)).toEqual([17, 71]);
    expect(tileAt(idx, 0.1, -180 + 360)).toEqual([17, 0]);
    expect(tileAt(idx, -85, 0)).toBeNull();
  });

  it('returns the stored samples at the grid corners and interpolates between them', () => {
    expect(tileHeight(idx, t, 25, 20)).toBe(0);              // NW corner = sample (0, 0)
    expect(tileHeight(idx, t, 20, 25)).toBe(404);            // SE corner = sample (4, 4)
    expect(tileHeight(idx, t, 25 - 1.25, 20 + 2.5)).toBe(102); // row 1, col 2
    expect(tileHeight(idx, t, 25 - 0.625, 20)).toBeCloseTo(50, 6);
    expect(tileHeight(idx, t, 10, 20)).toBeNaN();
  });

  it('builds a true-scale mesh whose vertices sit at R + height', () => {
    const m = buildTileMesh(idx, t, 2, 2);
    const V = 3; // stride 2 on 4 cells
    expect(m.position.length).toBe((V * V + 4 * V) * 3);
    for (let k = 0; k < V * V; k++) {
      const x = m.position[k * 3] + m.center[0], y = m.position[k * 3 + 1] + m.center[1], z = m.position[k * 3 + 2] + m.center[2];
      expect(Math.hypot(x, y, z)).toBeCloseTo(R_KM + m.h[k] / 1000, 3);
    }
    // the SE vertex carries the SE sample
    expect(m.h[V * V - 1]).toBe(404);
    // skirts hang 2 km below their edge vertex
    const s0 = V * V, x = m.position[s0 * 3] + m.center[0], y = m.position[s0 * 3 + 1] + m.center[1], z = m.position[s0 * 3 + 2] + m.center[2];
    expect(Math.hypot(x, y, z)).toBeCloseTo(R_KM + m.h[s0] / 1000 - 2, 3);
    expect(Math.max(...m.index)).toBeLessThan(V * V + 4 * V);
  });
});
