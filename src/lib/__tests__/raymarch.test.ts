import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeHorizon, demHeight, type PolarDem } from '../raymarch';
import { decodeI16 } from '../series';

const meta = JSON.parse(readFileSync('public/dem/south_polar_400m.json', 'utf8'));
const dem: PolarDem = { data: decodeI16(meta.data), size: meta.size, resM: meta.resM, scaleFactor: meta.scaleFactor };

describe('in-browser horizon (coarse DEM) vs pipeline (40 m DEM)', () => {
  for (const id of ['connecting-ridge', 'malapert', 'shackleton-floor']) {
    it(`${id}: matches the 40 m profile within tolerance`, () => {
      const ref = JSON.parse(readFileSync(`public/horizons/${id}.json`, 'utf8'));
      const r = computeHorizon(dem, ref.lat, ref.lon, 2, 150);
      const diffs = r.horizonDeg.map((v, i) => Math.abs(v - ref.horizonDeg[i]));
      const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      // Coarse 400 m terrain is "approximate": mean error under 1° (measured 0.2–0.6°).
      expect(mean).toBeLessThan(1.0);
      console.log(`${id}: mean |Δ| ${mean.toFixed(2)}°, max ${Math.max(...diffs).toFixed(2)}°`);
      expect(r.coverage).toBeGreaterThan(0.99);
    });
  }
  it('returns NaN outside coverage', () => {
    expect(demHeight(dem, -70, 0)).toBeNaN();
  });
});
