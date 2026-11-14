import { describe, expect, it } from 'vitest';
import { EQUATIONS } from '../equations';
import { solve } from '../solver';

const eq = (id: string) => EQUATIONS.find((e) => e.id === id)!;
const defaults = (id: string) => Object.fromEntries(eq(id).vars.map((v) => [v.key, v.def]));

describe('solver', () => {
  it('solves D = v t for each unknown', () => {
    const v = { D: 10, v: 0.5, t: 20 };
    expect(solve(eq('travel'), v, 'D').roots[0]).toBeCloseTo(10, 6);
    expect(solve(eq('travel'), v, 'v').roots[0]).toBeCloseTo(0.5, 6);
    expect(solve(eq('travel'), v, 't').roots[0]).toBeCloseTo(20, 6);
  });
  it('round-trips every variable of every equation from a consistent state', () => {
    for (const e of EQUATIONS) {
      const v = defaults(e.id);
      // Make the defaults consistent by solving the first variable, then solve each of the others back.
      const first = e.vars[0].key;
      const r0 = solve(e, v, first);
      expect(r0.error, `${e.id}.${first}`).toBeNull();
      v[first] = r0.roots[0];
      for (const x of e.vars) {
        const r = solve(e, v, x.key);
        expect(r.error, `${e.id}.${x.key}`).toBeNull();
        expect(r.roots.some((y) => Math.abs(y - v[x.key]) <= 1e-4 * (1 + Math.abs(v[x.key]))), `${e.id}.${x.key} → ${r.roots}`).toBe(true);
      }
    }
  });
  it('reports impossible combinations instead of a bogus root', () => {
    const r = solve(eq('horizon-dist'), { d: 0, Ho: -5 }, 'd');
    expect(r.roots).toEqual([]);
    expect(r.error).toMatch(/No solution/);
  });
  it('asks for missing inputs', () => {
    expect(solve(eq('travel'), { D: NaN, v: 1, t: 2 }, 'v').error).toMatch(/Enter a value/);
  });
});
