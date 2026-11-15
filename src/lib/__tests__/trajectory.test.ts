import { describe, expect, it } from 'vitest';
import { NASA_SITES, launchWindows, planLaunch } from '../launch';
import { MU_E, R_E, PARK_ALT, moonPos, planFlight, solvePerigeeSpeed, timeToRadius } from '../trajectory';

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('transfer orbit solver', () => {
  const rp = R_E + PARK_ALT, r = 384400;
  it('the slowest transfer (apogee at the Moon) takes about 5 days', () => {
    const vMin = Math.sqrt(2 * MU_E * r / (rp * (rp + r)));
    expect(timeToRadius(rp, vMin * (1 + 1e-9), r) / 86400).toBeCloseTo(4.98, 1);
  });
  it('finds the perigee speed for a 3-day transfer, and it is about 10.9 km/s', () => {
    const { vp, clamped } = solvePerigeeSpeed(rp, r, 3 * 86400);
    expect(clamped).toBe(false);
    expect(timeToRadius(rp, vp, r)).toBeCloseTo(3 * 86400, -1);
    expect(vp).toBeGreaterThan(10.8); expect(vp).toBeLessThan(11.0);
  });
  it('handles fast (escape-speed) transfers', () => {
    const { vp } = solvePerigeeSpeed(rp, r, 1 * 86400);
    expect(vp).toBeGreaterThan(Math.sqrt(2 * MU_E / rp));
    expect(timeToRadius(rp, vp, r)).toBeCloseTo(86400, -1);
  });
});

describe('flight plan', () => {
  const ksc = NASA_SITES[0];
  const landing = Date.parse('2027-07-20T00:00:00Z');
  const p = planLaunch({ t: landing, sun: 1, earth: 1, both: 1, landing }, 4.5).best!;
  const f = planFlight(ksc, p.window!.t, landing, p.window!.boostMs / 1000);

  it('events are in order and land on time', () => {
    expect(f.launch).toBeLessThan(f.insertion); expect(f.insertion).toBeLessThanOrEqual(f.tli);
    expect(f.tli).toBeLessThan(f.loi); expect(f.loi).toBeLessThan(f.landing); expect(f.landing).toBe(landing);
    expect(f.coastMin).toBeGreaterThanOrEqual(0); expect(f.coastMin).toBeLessThan(90);
  });
  it('the path ends where the Moon is at arrival, starting from the parking orbit', () => {
    const end = f.transfer[f.transfer.length - 1];
    expect(dist(end.pos, moonPos(f.loi))).toBeLessThan(50);
    expect(Math.abs(end.t - f.loi)).toBeLessThan(120000);
    expect(Math.hypot(...f.transfer[0].pos)).toBeCloseTo(R_E + PARK_ALT, 3);
  });
  it('burns are in the usual ranges', () => {
    expect(f.dv.tli).toBeGreaterThan(3.0); expect(f.dv.tli).toBeLessThan(3.3);
    expect(f.dv.loi).toBeGreaterThan(0.6); expect(f.dv.loi).toBeLessThan(1.2);
    expect(f.inclination).toBeGreaterThanOrEqual(28); expect(f.inclination).toBeLessThan(40);
  });
  it('a transit longer than the slowest transfer waits in lunar orbit', () => {
    const w = launchWindows(ksc, landing, landing - 9 * 86400000 - 43200000, landing - 9 * 86400000 + 43200000)[0];
    const g = planFlight(ksc, w.t, landing, 0.4);
    expect(g.longTransfer).toBe(true);
    expect(g.lunarOrbitH).toBeGreaterThan(48);
  });
});
