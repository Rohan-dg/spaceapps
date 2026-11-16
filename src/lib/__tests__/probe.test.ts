import { describe, expect, it } from 'vitest';
import { horizonFrom, probeNow, probePeriod } from '../moon/probe';

describe('point probe', () => {
  it('flat ground: skyline is the geometric dip below horizontal', () => {
    const hz = horizonFrom(() => 0, -89.5, 0, 0, 400, 50);
    // dip for a 2 m mast on a 1737.4 km sphere ≈ sqrt(2h/R) ≈ 0.087°
    for (const v of hz) { expect(v).toBeGreaterThan(-0.2); expect(v).toBeLessThan(0); }
  });

  it('a 10 km wall all around blocks the Sun and Earth', () => {
    const lat = -45, lon = 30;
    const hz = horizonFrom(() => 10000, lat, lon, 0, 1000, 30); // ground at 0 m, everything around it 10 km up
    expect(Math.min(...hz)).toBeGreaterThan(10);
    const t = Date.parse('2027-07-08T00:00:00Z');
    expect(probeNow(lat, lon, 0, hz, t).earthUp).toBe(false);
    const p = probePeriod(lat, lon, 0, hz, t, 120);
    expect(p.sunPct).toBe(0);
    expect(p.earthPct).toBe(0);
  });

  it('near side sees Earth all cycle with no terrain; far side never does', () => {
    const t = Date.parse('2027-07-08T00:00:00Z');
    const flat = new Array(360).fill(0);
    expect(probePeriod(0, 0, 0, flat, t, 120).earthPct).toBe(100);
    expect(probePeriod(0, 180, 0, flat, t, 120).earthPct).toBe(0);
    const eq = probePeriod(0, 0, 0, flat, t, 120).sunPct;
    expect(eq).toBeGreaterThan(45); expect(eq).toBeLessThan(55);
  });
});

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
