import { describe, expect, it } from 'vitest';
import { flatProfile } from '../horizon';
import { DEFAULT_PLAN, driveSchedule, feasibility, offsetPoint, roverAt, simulateMission, straightRoute } from '../mission';

const site = { lat: -89.45, lon: 222.7 };
const finite = (o: unknown): string[] => {
  const bad: string[] = [];
  const walk = (v: unknown, p: string) => {
    if (typeof v === 'number' && !Number.isFinite(v)) bad.push(p);
    else if (v && typeof v === 'object' && !ArrayBuffer.isView(v)) for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`);
    else if (ArrayBuffer.isView(v) || Array.isArray(v)) (v as unknown as number[]).forEach((x, i) => typeof x === 'number' && !Number.isFinite(x) && bad.push(`${p}[${i}]`));
  };
  walk(o, '');
  return bad;
};

describe('mission model edge cases stay finite', () => {
  const cases: [string, Partial<typeof DEFAULT_PLAN> & { km?: number; dep?: string }][] = [
    ['tiny drive', { km: 0.1 }],
    ['500 km drive', { km: 500 }],
    ['zero panels', { panelM2: 0 }],
    ['zero efficiency', { panelEffPct: 0 }],
    ['zero loads', { hotelW: 0, driveW: 0 }],
    ['empty battery start', { startPct: 0 }],
    ['1 Wh battery', { batteryWh: 1 }],
    ['full derate', { slopeDerate: 0.95 }],
    ['90-day mission', { durationDays: 90 }],
    ['short mission', { durationDays: 0.1 }],
    ['before data', { dep: '2026-06-01T00:00:00Z' }],
    ['after data', { dep: '2030-06-01T00:00:00Z' }],
    ['slow rover', { speedKmH: 0.01, km: 5 }],
  ];
  for (const [name, c] of cases) it(name, () => {
    const plan = { ...DEFAULT_PLAN, ...c, departure: Date.parse(c.dep ?? '2027-07-08T00:00:00Z') };
    const r = straightRoute(site, offsetPoint(site, c.km ?? 8, 90));
    const s = driveSchedule(r, plan);
    const tl = simulateMission(plan, r, s, flatProfile(), 1900);
    expect(finite(tl)).toEqual([]);
    for (const t of [plan.departure - 1, plan.departure + 3600e3, plan.departure + 1e12]) expect(finite(roverAt(r, s, plan.departure, t))).toEqual([]);
    const f = feasibility({ power: 'amber', comms: 'green', route: r, tl, travelH: s[s.length - 1], plan });
    expect(f.score).toBeGreaterThanOrEqual(0); expect(f.score).toBeLessThanOrEqual(100);
    for (const b of tl.battPct) { expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThanOrEqual(100.0001); }
  });
});

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
