import { CalendarSync, Plus, X } from './Icons';
import { useMemo } from 'react';
import { type SiteData, type SiteInfo, useSiteData } from '../lib/data';
import { formatDuration } from '../lib/metrics';
import { type ScenarioResult, useScenario } from '../lib/useScenario';
import { eventText, VerdictBadge } from './Metrics';
import { Loading } from './Help';
import Panorama, { autoYRange } from './Panorama';
import { fromInput, toInput } from './TimeControls';

export interface Scenario { siteId: string; t: number }

const LETTERS = 'ABCD';

interface RowDef {
  label: string;
  get: (r: ScenarioResult) => number;
  fmt: (v: number, r: ScenarioResult) => string;
  better: 'high' | 'low' | null;
  unit: string;
}

const ROWS: RowDef[] = [
  { label: 'Sun elevation', get: (r) => r.metrics.sky.sun.el, fmt: (v) => `${v.toFixed(2)}°`, better: null, unit: '°' },
  { label: 'Sun terrain clearance', get: (r) => r.metrics.sky.sun.el - r.metrics.sunHorizon, fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}°`, better: 'high', unit: '°' },
  { label: 'Earth elevation', get: (r) => r.metrics.sky.earth.el, fmt: (v) => `${v.toFixed(2)}°`, better: null, unit: '°' },
  { label: 'Earth terrain clearance', get: (r) => r.metrics.sky.earth.el - r.metrics.earthHorizon, fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}°`, better: 'high', unit: '°' },
  { label: 'Sunlit, next lunar day', get: (r) => r.metrics.sunPct, fmt: (v) => `${v.toFixed(0)}%`, better: 'high', unit: ' pts' },
  { label: 'Earth visible, next lunar day', get: (r) => r.metrics.earthPct, fmt: (v) => `${v.toFixed(0)}%`, better: 'high', unit: ' pts' },
  { label: 'Longest gap, Sun', get: (r) => r.metrics.longestDarkH, fmt: (v, r) => `${r.metrics.longestDarkClipped ? '≥ ' : ''}${formatDuration(v * 3600000)}`, better: 'low', unit: ' h' },
  { label: 'Longest gap, Earth', get: (r) => r.metrics.longestNoCommH, fmt: (v, r) => `${r.metrics.longestNoCommClipped ? '≥ ' : ''}${formatDuration(v * 3600000)}`, better: 'low', unit: ' h' },
];

function useScenarioData(s: Scenario | undefined) {
  const d = useSiteData(s?.siteId ?? null);
  const r = useScenario(d, s?.t ?? 0);
  return { d, r };
}

export default function Compare({ sites, scenarios, onChange, range }: {
  sites: SiteInfo[]; scenarios: Scenario[]; onChange: (s: Scenario[]) => void; range: [number, number];
}) {
  // Fixed number of hook calls (max 4 scenarios).
  const a = useScenarioData(scenarios[0]), b = useScenarioData(scenarios[1]), c = useScenarioData(scenarios[2]), d = useScenarioData(scenarios[3]);
  const cols = [a, b, c, d].slice(0, scenarios.length);
  const loaded = cols.map((x) => x.d).filter(Boolean) as SiteData[];
  const yRange = useMemo<[number, number] | undefined>(() => {
    if (!loaded.length) return undefined;
    const rs = loaded.map(autoYRange);
    const union: [number, number] = [Math.min(...rs.map((r) => r[0])), Math.max(...rs.map((r) => r[1]))];
    const minSpan = Math.min(...rs.map((r) => r[1] - r[0]));
    // Share one scale only when it doesn't flatten a scenario's terrain beyond recognition.
    return union[1] - union[0] <= 1.8 * minSpan ? union : undefined;
  }, [loaded.map((l) => l.info.id).join()]);

  const set = (i: number, patch: Partial<Scenario>) => onChange(scenarios.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const clamp = (t: number) => Math.max(range[0], Math.min(range[1], t));
  const results = cols.map((x) => x.r);

  return (
    <section className="compare" aria-label="Compare scenarios">
      <div className="compare-bar">
        <div className="btn-row">
          {scenarios.length < 4 && <button onClick={() => onChange([...scenarios, { ...scenarios[scenarios.length - 1] }])}><Plus size={14} aria-hidden /> Add scenario</button>}
          <button onClick={() => onChange(scenarios.map((s) => ({ ...s, t: scenarios[0].t })))}><CalendarSync size={14} aria-hidden /> Sync dates to A</button>
        </div>
        {!yRange && <p className="compare-flag">Vertical scales differ per column</p>}
      </div>
      <div className="compare-grid" style={{ gridTemplateColumns: `repeat(${scenarios.length}, minmax(0, 1fr))` }}>
        {scenarios.map((s, i) => {
          const { d: data, r } = cols[i];
          return (
            <article className="scenario" key={i} aria-label={`Scenario ${LETTERS[i]}`}>
              <header className="scenario-head">
                <span className="scenario-letter">{LETTERS[i]}</span>
                <select id={`scn-${i}-site`} aria-label={`Scenario ${LETTERS[i]} site`} value={s.siteId} onChange={(e) => set(i, { siteId: e.target.value })}>
                  {sites.map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}
                </select>
                {scenarios.length > 2 && (
                  <button className="icon-btn" aria-label={`Remove scenario ${LETTERS[i]}`} onClick={() => onChange(scenarios.filter((_, k) => k !== i))}><X size={16} /></button>
                )}
              </header>
              <div className="scenario-time">
                <input id={`scn-${i}-time`} type="datetime-local" aria-label={`Scenario ${LETTERS[i]} date (UTC)`} value={toInput(s.t)}
                  onChange={(e) => { const v = fromInput(e.target.value); if (isFinite(v)) set(i, { t: clamp(v) }); }} />
                <button onClick={() => set(i, { t: clamp(s.t - 10 * 86400000) })}>−10 d</button>
                <button onClick={() => set(i, { t: clamp(s.t + 10 * 86400000) })}>+10 d</button>
              </div>
              {data && r ? (
                <>
                  <Panorama data={data} t={s.t} height={170} yRange={yRange} compact />
                  <div className="verdicts">
                    <VerdictBadge kind="Power" v={r.power} />
                    <VerdictBadge kind="Comms" v={r.comms} />
                  </div>
                  <dl className="scenario-events">
                    <div><dt>{r.metrics.sunUp ? 'Sun sets' : 'Sun rises'}</dt><dd>{eventText(r.metrics.sunUp ? r.metrics.nextSunset : r.metrics.nextSunrise, s.t)}</dd></div>
                    <div><dt>{r.metrics.earthUp ? 'Earth sets' : 'Earth rises'}</dt><dd>{eventText(r.metrics.earthUp ? r.metrics.nextEarthset : r.metrics.nextEarthrise, s.t)}</dd></div>
                  </dl>
                </>
              ) : <Loading label="Loading site" />}
            </article>
          );
        })}
      </div>
      <div className="table-wrap">
        <table className="compare-table">
          <thead>
            <tr><th scope="col">Quantity</th>{scenarios.map((s, i) => <th scope="col" key={i}>{LETTERS[i]}  {sites.find((x) => x.id === s.siteId)?.short}<small>{toInput(s.t).replace('T', ' ')} UTC</small></th>)}</tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Power</th>
              {results.map((r, i) => <td key={i} className={r && results[0] && r.power.level !== results[0].power.level ? 'diff' : ''}>{r ? <VerdictBadge kind="Power" v={r.power} compact /> : '…'}</td>)}
            </tr>
            <tr>
              <th scope="row">Radio to Earth</th>
              {results.map((r, i) => <td key={i} className={r && results[0] && r.comms.level !== results[0].comms.level ? 'diff' : ''}>{r ? <VerdictBadge kind="Comms" v={r.comms} compact /> : '…'}</td>)}
            </tr>
            {ROWS.map((row) => {
              const vals = results.map((r) => (r ? row.get(r) : NaN));
              const finite = vals.filter(isFinite);
              const best = row.better === 'high' ? Math.max(...finite) : row.better === 'low' ? Math.min(...finite) : NaN;
              const allSame = finite.every((v) => Math.abs(v - finite[0]) < 1e-6);
              return (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {results.map((r, i) => {
                    if (!r) return <td key={i}>…</td>;
                    const v = vals[i];
                    const isBest = row.better && !allSame && Math.abs(v - best) < 1e-6;
                    const delta = i > 0 && isFinite(vals[0]) ? v - vals[0] : null;
                    return (
                      <td key={i} className={isBest ? 'best' : ''}>
                        {row.fmt(v, r)}{isBest && <span className="best-tag">best</span>}
                        {delta !== null && Math.abs(delta) > 0.005 && <small className="delta">{delta > 0 ? '+' : '−'}{Math.abs(delta).toFixed(1)}{row.unit} vs A</small>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
