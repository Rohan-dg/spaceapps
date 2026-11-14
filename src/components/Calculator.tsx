import { RotateCcw, Satellite } from 'lucide-react';
import { useMemo } from 'react';
import { variable } from '../config/variables';
import { EQUATIONS } from '../lib/equations';
import { solve } from '../lib/solver';

export interface CalcState { eq: string; target: Record<string, string>; inputs: Record<string, Record<string, string>> }
export const initialCalc = (): CalcState => ({ eq: EQUATIONS[0].id, target: {}, inputs: {} });

const fmt = (x: number) => {
  if (x === 0) return '0';
  const a = Math.abs(x);
  return a >= 1e6 || a < 1e-3 ? x.toExponential(4) : (+x.toPrecision(6)).toString();
};

interface Props { state: CalcState; onState: (s: CalcState) => void; sim: Record<string, number>; simLabel: string }

export default function Calculator({ state, onState, sim, simLabel }: Props) {
  const eq = EQUATIONS.find((e) => e.id === state.eq) ?? EQUATIONS[0];
  const target = state.target[eq.id] ?? eq.vars[0].key;
  const raw = state.inputs[eq.id] ?? {};
  const str = (k: string) => raw[k] ?? String(eq.vars.find((v) => v.key === k)!.def);
  const values = Object.fromEntries(eq.vars.map((v) => [v.key, str(v.key).trim() === '' ? NaN : Number(str(v.key))]));
  const result = useMemo(() => solve(eq, values, target), [eq, target, JSON.stringify(values)]); // eslint-disable-line react-hooks/exhaustive-deps
  const tv = eq.vars.find((v) => v.key === target)!;
  const fromSim = eq.vars.filter((v) => v.sim && v.key !== target && isFinite(sim[v.sim]));

  const setInput = (k: string, s: string) => onState({ ...state, inputs: { ...state.inputs, [eq.id]: { ...raw, [k]: s } } });
  const setTarget = (k: string) => onState({ ...state, target: { ...state.target, [eq.id]: k } });
  const fill = () => onState({ ...state, inputs: { ...state.inputs, [eq.id]: { ...raw, ...Object.fromEntries(fromSim.map((v) => [v.key, fmt(sim[v.sim!])])) } } });
  const reset = () => { const next = { ...state.inputs }; delete next[eq.id]; onState({ ...state, inputs: next }); };
  const groups = [...new Set(EQUATIONS.map((e) => e.group))];

  return (
    <div className="calc">
      <div className="compare-intro">
        <div>
          <h2>Calculator</h2>
          <p>Pick an equation, choose the variable you don’t know, and fill in the rest. It solves for that one, whichever it is. “Fill from the sim” pulls in the live numbers for {simLabel}.</p>
        </div>
      </div>
      <div className="calc-body">
        <nav className="calc-list" aria-label="Equations">
          {groups.map((g) => (
            <div key={g}>
              <span className="eyebrow">{g}</span>
              <ul>
                {EQUATIONS.filter((e) => e.group === g).map((e) => (
                  <li key={e.id}><button aria-current={e.id === eq.id ? 'true' : undefined} onClick={() => onState({ ...state, eq: e.id })}>{e.title}</button></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <section className="calc-main" aria-labelledby="calc-h">
          <h3 id="calc-h">{eq.title}</h3>
          <p className="calc-formula num">{eq.formula}</p>
          <p className="muted">{eq.about}</p>
          <p className="small muted">Mission variables: {eq.covers.map((n) => `#${n} ${variable(n).name}`).join(', ')}</p>
          <div className="btn-row">
            <button onClick={fill} disabled={!fromSim.length} title={fromSim.length ? `Fills ${fromSim.map((v) => v.label).join(', ')}` : 'Nothing in this equation comes from the sim'}><Satellite size={14} aria-hidden /> Fill from the sim</button>
            <button onClick={reset}><RotateCcw size={14} aria-hidden /> Reset</button>
          </div>
          <table className="calc-table">
            <thead><tr><th scope="col">Solve for</th><th scope="col">Variable</th><th scope="col">Value</th></tr></thead>
            <tbody>
              {eq.vars.map((v) => {
                const isT = v.key === target;
                return (
                  <tr key={v.key} className={isT ? 'is-target' : undefined}>
                    <td><input type="radio" name={`solve-${eq.id}`} checked={isT} onChange={() => setTarget(v.key)} aria-label={`Solve for ${v.label}`} /></td>
                    <th scope="row"><label htmlFor={`cv-${eq.id}-${v.key}`}>{v.label}</label>{v.hint && <small>{v.hint}</small>}</th>
                    <td>
                      {isT ? (
                        <output id={`cv-${eq.id}-${v.key}`} className="calc-out num" aria-live="polite">
                          {result.roots.length ? fmt(result.roots[0]) : '-'} <span className="unit">{v.unit}</span>
                        </output>
                      ) : (
                        <span className="calc-in">
                          <input id={`cv-${eq.id}-${v.key}`} inputMode="decimal" value={str(v.key)} onChange={(e) => setInput(v.key, e.target.value)}
                            aria-invalid={!isFinite(values[v.key])} />
                          <span className="unit">{v.unit}</span>
                          {v.sim && isFinite(sim[v.sim]) && <button className="sim-chip" onClick={() => setInput(v.key, fmt(sim[v.sim!]))} title="Use the sim value">sim {fmt(sim[v.sim])}</button>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="calc-result" role="status">
            {result.error ? <p className="err">{result.error}</p> : (
              <>
                <p><b>{tv.label}</b> = <span className="num big">{fmt(result.roots[0])}</span> {tv.unit}</p>
                {result.roots.length > 1 && <p className="small muted">Other solutions in range: {result.roots.slice(1, 6).map(fmt).join(', ')} {tv.unit}</p>}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

