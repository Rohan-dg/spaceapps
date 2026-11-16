/**
 * Generic one-unknown solver for the calculator. Each equation is written once as lhs = rhs;
 * to solve for any variable we scan its allowed range for sign changes of (lhs − rhs) and refine
 * each bracket by bisection. Spurious brackets (poles, discontinuities) are rejected by checking
 * the residual at the root.
 */
export type Values = Record<string, number>;

export interface VarDef {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  def: number;
  /** Key into the sim snapshot used by "Fill from the sim". */
  sim?: string;
  hint?: string;
}

export interface Equation {
  id: string;
  group: string;
  title: string;
  /** Spreadsheet variables (by #) this equation covers. */
  covers: number[];
  formula: string;
  about: string;
  vars: VarDef[];
  /** Returns [lhs, rhs]. */
  f: (v: Values) => [number, number];
}

export interface SolveResult { roots: number[]; error: string | null }

function residual(eq: Equation, v: Values, key: string, x: number): number {
  const [l, r] = eq.f({ ...v, [key]: x });
  return l - r;
}

function ok(eq: Equation, v: Values, key: string, x: number): boolean {
  const [l, r] = eq.f({ ...v, [key]: x });
  if (!isFinite(l) || !isFinite(r)) return false;
  return Math.abs(l - r) <= 1e-6 * (1 + Math.abs(l) + Math.abs(r));
}

export function solve(eq: Equation, values: Values, key: string, samples = 2000): SolveResult {
  const vd = eq.vars.find((x) => x.key === key);
  if (!vd) return { roots: [], error: 'Unknown variable.' };
  for (const x of eq.vars) if (x.key !== key && !isFinite(values[x.key])) return { roots: [], error: `Enter a value for ${x.label}.` };
  const { min, max } = vd;
  // Log spacing when the range is positive and spans orders of magnitude.
  const logScale = min > 0 && max / min > 100;
  const at = (i: number) => (logScale ? min * (max / min) ** (i / samples) : min + ((max - min) * i) / samples);
  const roots: number[] = [];
  let xa = at(0), fa = residual(eq, values, key, xa);
  if (fa === 0 && ok(eq, values, key, xa)) roots.push(xa);
  for (let i = 1; i <= samples; i++) {
    const xb = at(i), fb = residual(eq, values, key, xb);
    if (fb === 0) { if (ok(eq, values, key, xb)) roots.push(xb); }
    else if (isFinite(fa) && isFinite(fb) && fa !== 0 && Math.sign(fa) !== Math.sign(fb)) {
      let a = xa, b = xb, f0 = fa;
      for (let k = 0; k < 100; k++) {
        const m = (a + b) / 2, fm = residual(eq, values, key, m);
        if (fm === 0) { a = b = m; break; }
        if (Math.sign(fm) === Math.sign(f0)) { a = m; f0 = fm; } else b = m;
      }
      const x = (a + b) / 2;
      if (ok(eq, values, key, x)) roots.push(x);
    }
    xa = xb; fa = fb;
  }
  const uniq = roots.filter((x, i) => i === 0 || Math.abs(x - roots[i - 1]) > 1e-9 * (1 + Math.abs(x)));
  if (!uniq.length) return { roots: [], error: `No solution for ${vd.label} between ${min} and ${max} ${vd.unit}. Check the other values: they may be impossible together.` };
  return { roots: uniq, error: null };
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
