import { describe, expect, it } from 'vitest';
import { advance, CHARGE_PCT, distance, iceSignal, newQuest, newVitals, planMission, SPEC, stepVitals, type Maps, type MissionPlan, type Quest, type QuestCtx } from '../sim';

const light = { sunFrac: 1, drive: 0, dig: false, tx: false, lamp: false };
const plan: MissionPlan = { start: { e: 0, n: 0 }, charge: { e: 100, n: 0 }, phone: { e: 120, n: 0 }, zone: { c: { e: 200, n: 100 }, r: 60 }, ice: [{ e: 200, n: 100 }, { e: 240, n: 100 }, { e: 200, n: 140 }], haven: { e: 80, n: 0 } };
const ctx: QuestCtx = { pos: plan.charge, battPct: CHARGE_PCT, earthUp: true, sunFrac: 1, parked: true };

describe('rover energy and heat', () => {
  it('charges in sunlight, caps capacity, and respects partial illumination', () => {
    const v = newVitals();
    expect(stepVitals(v, 0.1, light).wh).toBeGreaterThan(v.wh);
    expect(stepVitals(newVitals(99), 4, light).wh).toBe(SPEC.batteryWh);
    expect(stepVitals(v, 0.01, { ...light, sunFrac: 0.5 }).solarW).toBe(120);
  });
  it('consumes power in shadow and heats cold electronics', () => {
    const v = { ...newVitals(), tempC: -15 };
    const next = stepVitals(v, 0.01, { ...light, sunFrac: 0 });
    expect(next.heaterW).toBe(100);
    expect(next.loadW).toBe(130);
    expect(next.wh).toBeLessThan(v.wh);
  });
  it('cannot dig or run a heater from an empty battery', () => {
    const next = stepVitals({ ...newVitals(0), tempC: -20 }, 0.1, { ...light, sunFrac: 0, dig: true });
    expect(next.wh).toBe(0);
    expect(next.loadW).toBe(0);
    expect(next.heaterW).toBe(0);
    expect(next.tempC).toBeLessThan(-20);
  });
  it('can recover a depleted battery in sunlight', () => {
    expect(stepVitals(newVitals(0), 0.1, light).wh).toBeGreaterThan(0);
  });
  it('keeps the thermostat stable during an accelerated wait', () => {
    const v = newVitals();
    const long = stepVitals(v, 0.5, { ...light, sunFrac: 0 });
    let short = v;
    for (let i = 0; i < 60; i++) short = stepVitals(short, 1 / 120, { ...light, sunFrac: 0 });
    expect(long.tempC).toBeCloseTo(short.tempC, 8);
    expect(long.wh).toBeCloseTo(short.wh, 8);
  });
  it('ignores nonpositive elapsed time and clamps illumination', () => {
    const v = newVitals();
    expect(stepVitals(v, -1, light)).toEqual(v);
    expect(stepVitals(v, 0.001, { ...light, sunFrac: -3 }).solarW).toBe(0);
    expect(stepVitals(v, 0.001, { ...light, sunFrac: 3 }).solarW).toBe(240);
  });
});

describe('mission progression', () => {
  it('completes an entire mission in order', () => {
    let q = newQuest(plan);
    q = advance(q, plan, ctx, { type: 'tick' }).q;
    expect(q.phase).toBe('phone');
    q = advance(q, plan, ctx, { type: 'sent' }).q;
    expect(q.phase).toBe('ice');
    for (const pos of plan.ice) q = advance(q, plan, { ...ctx, pos }, { type: 'dug' }).q;
    expect(q.phase).toBe('uplink');
    expect(q.found).toEqual([true, true, true]);
    q = advance(q, plan, ctx, { type: 'sent' }).q;
    expect(q.phase).toBe('haven');
    q = advance(q, plan, { ...ctx, pos: plan.haven }, { type: 'tick' }).q;
    expect(q.phase).toBe('done');
    expect(advance(q, plan, ctx, { type: 'tick' }).q).toEqual(q);
  });
  it.each([{ parked: false }, { sunFrac: 0 }, { battPct: 84 }, { pos: plan.start }])('requires charging at the correct safe location: %j', (overrides) => {
    expect(advance(newQuest(plan), plan, { ...ctx, ...overrides }, { type: 'tick' }).q.phase).toBe('charge');
  });
  it.each([{ earthUp: false }, { parked: false }, { battPct: 0 }])('does not transmit without available communications and power: %j', (overrides) => {
    const q: Quest = { phase: 'phone', found: [false, false, false] };
    expect(advance(q, plan, { ...ctx, ...overrides }, { type: 'sent' }).q).toEqual(q);
  });
  it('does not collect deposits early, while moving, or without power', () => {
    expect(advance(newQuest(plan), plan, { ...ctx, pos: plan.ice[0] }, { type: 'dug' }).iceFound).toBeNull();
    const q: Quest = { phase: 'ice', found: [false, false, false] };
    expect(advance(q, plan, { ...ctx, pos: plan.ice[0], parked: false }, { type: 'dug' }).iceFound).toBeNull();
    expect(advance(q, plan, { ...ctx, pos: plan.ice[0], battPct: 0 }, { type: 'dug' }).iceFound).toBeNull();
  });
  it('does not count the same deposit twice or mutate checkpoints', () => {
    const q: Quest = { phase: 'ice', found: [false, false, false] };
    const first = advance(q, plan, { ...ctx, pos: plan.ice[0] }, { type: 'dug' });
    expect(first.iceFound).toBe(0);
    expect(q.found[0]).toBe(false);
    const again = advance(first.q, plan, { ...ctx, pos: plan.ice[0] }, { type: 'dug' });
    expect(again.iceFound).toBeNull(); expect(again.dry).toBe(true);
    expect(iceSignal(first.q, plan, plan.ice[0])).toBeLessThan(1);
  });
  it.each([{ earthUp: false }, { sunFrac: 0 }, { parked: false }])('cannot complete in an unsafe haven: %j', (overrides) => {
    expect(advance({ phase: 'haven', found: [true, true, true] }, plan, { ...ctx, pos: plan.haven, ...overrides }, { type: 'tick' }).done).toBeNull();
  });
});

function terrain(): Maps {
  const n = 64, halfM = 800;
  const sun = new Uint8Array(n * n).fill(255), earth = new Uint8Array(n * n).fill(255), slope = new Float32Array(n * n), elev = new Float32Array(n * n);
  for (let j = 12; j < 24; j++) for (let i = 33; i < 45; i++) sun[j * n + i] = 0;
  return { n, halfM, sun, earth, slope, elev };
}
describe('mission placement', () => {
  it('generates repeatable reachable goals and spaced shadow deposits', () => {
    const m = terrain(), p = planMission(m, 42)!;
    expect(p).not.toBeNull(); expect(planMission(m, 42)).toEqual(p);
    const cell = (e: number, n: number) => Math.floor((m.halfM - n) / (2 * m.halfM) * m.n) * m.n + Math.floor((e + m.halfM) / (2 * m.halfM) * m.n);
    for (const a of p.ice) { expect(m.sun[cell(a.e, a.n)]).toBe(0); for (const b of p.ice) if (a !== b) expect(distance(a, b)).toBeGreaterThanOrEqual(28); }
    expect(m.sun[cell(p.haven.e, p.haven.n)]).toBe(255);
    expect(m.earth[cell(p.haven.e, p.haven.n)]).toBe(255);
  });
  it('rejects all-dark, all-light and radio-blackout terrain', () => {
    for (const kind of ['dark', 'light', 'radio']) {
      const m = terrain(); if (kind === 'dark') m.sun.fill(0); else if (kind === 'light') m.sun.fill(255); else m.earth.fill(0);
      expect(planMission(m)).toBeNull();
    }
  });
  it('rejects shadow deposits isolated behind steep terrain', () => {
    const m = terrain();
    for (let j = 11; j <= 24; j++) for (let i = 32; i <= 45; i++) if (j === 11 || j === 24 || i === 32 || i === 45) m.slope[j * m.n + i] = 45;
    expect(planMission(m)).toBeNull();
  });
  it('rejects incomplete grids', () => { expect(planMission({ ...terrain(), sun: new Uint8Array(2) })).toBeNull(); });
});
