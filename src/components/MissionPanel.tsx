import { Calculator, ChevronRight, Copy, Columns2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { variable, type Priority } from '../config/variables';
import { bothCount } from '../lib/calendar';
import type { SiteData, SiteInfo } from '../lib/data';
import { compass, formatDuration } from '../lib/metrics';
import { EPHEMERIS_ERROR, type Dest, type MissionPlan } from '../lib/mission';
import { SYNODIC_DAYS, indexAt, upCount } from '../lib/series';
import type { MissionState } from '../lib/useMission';
import type { ScenarioResult } from '../lib/useScenario';
import { toCSV } from '../lib/export';
import { BatteryChart, RouteProfile } from './MissionCharts';
import { fromInput, toInput } from './TimeControls';

type Src = 'live' | 'input' | 'estimate' | 'reference';
const SRC_LABEL: Record<Src, string> = { live: 'Sim', input: 'Your plan', estimate: 'Estimate', reference: 'Reference' };
interface Row { n: number; value: string; detail?: string; src: Src }

const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}`;
const fmtLon = (lon: number) => `${(((lon % 360) + 360) % 360).toFixed(3)}° E`;
const ll = (p: { lat: number; lon: number }) => `${fmtLat(p.lat)}, ${fmtLon(p.lon)}`;
const deg = (x: number) => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(2)}°`;
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}°`;
const utc = (t: number) => `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const hrs = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`);
const pct = (x: number) => `${x.toFixed(0)}%`;

// ------------------------------------------------------------------ inputs
function NumField({ label, value, onChange, unit, min, max, step = 'any' }: { label: string; value: number; onChange: (v: number) => void; unit?: string; min?: number; max?: number; step?: string }) {
  const [s, setS] = useState(String(value));
  useEffect(() => { if (Number(s) !== value) setS(String(+value.toFixed(6))); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="pf">
      <span>{label}{unit && <small> {unit}</small>}</span>
      <input inputMode="decimal" type="number" step={step} min={min} max={max} value={s}
        onChange={(e) => { setS(e.target.value); const v = Number(e.target.value); if (e.target.value !== '' && isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max)) onChange(v); }} />
    </label>
  );
}

function PlanForm({ plan, set, m, sites, t }: { plan: MissionPlan; set: (p: Partial<MissionPlan>) => void; m: MissionState; sites: SiteInfo[]; t: number }) {
  const destKind = plan.dest.kind === 'offset' ? 'offset' : 'coords';
  const setDest = (d: Dest) => set({ dest: d });
  return (
    <details className="plan" open>
      <summary><ChevronRight size={16} aria-hidden /> Mission plan <span className="muted small">your inputs: route, rover and power</span></summary>
      <div className="plan-grid">
        <fieldset>
          <legend>When</legend>
          <label className="pf"><span>Departure <small>UTC</small></span>
            <input type="datetime-local" value={toInput(plan.departure)} onChange={(e) => { const v = fromInput(e.target.value); if (isFinite(v)) set({ departure: v }); }} />
          </label>
          <div className="btn-row">
            <button onClick={() => set({ departure: Math.round(t / 60000) * 60000 })}>Depart at sim time</button>
            {m.best && <button onClick={() => set({ departure: m.best!.t })} title="Best departure in the next 30 days for Sun and Earth during the drive">Use best departure</button>}
          </div>
          <NumField label="Mission duration" unit="days" value={plan.durationDays} min={0.1} max={90} onChange={(v) => set({ durationDays: v })} />
        </fieldset>
        <fieldset>
          <legend>Destination</legend>
          <label className="pf"><span>Set by</span>
            <select value={destKind} onChange={(e) => setDest(e.target.value === 'offset' ? { kind: 'offset', km: 8, bearing: 90 } : { kind: 'coords', lat: m.dest.lat, lon: m.dest.lon })}>
              <option value="offset">Distance and direction</option>
              <option value="coords">Coordinates</option>
            </select>
          </label>
          {plan.dest.kind === 'offset' ? (
            <div className="pf-row">
              <NumField label="Distance" unit="km" value={plan.dest.km} min={0.1} max={500} onChange={(v) => setDest({ ...(plan.dest as Extract<Dest, { kind: 'offset' }>), km: v })} />
              <NumField label="Bearing" unit="° from N" value={plan.dest.bearing} min={0} max={360} onChange={(v) => setDest({ ...(plan.dest as Extract<Dest, { kind: 'offset' }>), bearing: v })} />
            </div>
          ) : (
            <div className="pf-row">
              <NumField label="Latitude" unit="°" value={plan.dest.lat} min={-90} max={90} onChange={(v) => setDest({ ...(plan.dest as Extract<Dest, { kind: 'coords' }>), lat: v })} />
              <NumField label="Longitude" unit="° E" value={plan.dest.lon} min={-360} max={360} onChange={(v) => setDest({ ...(plan.dest as Extract<Dest, { kind: 'coords' }>), lon: v })} />
            </div>
          )}
          <label className="pf"><span>Or drive to a site</span>
            <select value="" onChange={(e) => { const s = sites.find((x) => x.id === e.target.value); if (s) setDest({ kind: 'coords', lat: s.lat, lon: s.lon }); }}>
              <option value="">Choose…</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Rover</legend>
          <NumField label="Speed on flat ground" unit="km/h" value={plan.speedKmH} min={0.01} max={50} onChange={(v) => set({ speedKmH: v })} />
          <NumField label="Steepest slope it can climb" unit="°" value={plan.maxSlopeDeg} min={1} max={45} onChange={(v) => set({ maxSlopeDeg: v })} />
          <NumField label="Speed lost at that slope" unit="%" value={plan.slopeDerate * 100} min={0} max={95} onChange={(v) => set({ slopeDerate: v / 100 })} />
        </fieldset>
        <fieldset>
          <legend>Power</legend>
          <div className="pf-row">
            <NumField label="Battery" unit="Wh" value={plan.batteryWh} min={1} onChange={(v) => set({ batteryWh: v })} />
            <NumField label="Starts at" unit="%" value={plan.startPct} min={0} max={100} onChange={(v) => set({ startPct: v })} />
          </div>
          <NumField label="Reserve to keep" unit="%" value={plan.reservePct} min={0} max={100} onChange={(v) => set({ reservePct: v })} />
          <div className="pf-row">
            <NumField label="Panel area" unit="m²" value={plan.panelM2} min={0} onChange={(v) => set({ panelM2: v })} />
            <NumField label="Efficiency" unit="%" value={plan.panelEffPct} min={0} max={100} onChange={(v) => set({ panelEffPct: v })} />
          </div>
          <label className="pf"><span>Panels</span>
            <select value={plan.panelMode} onChange={(e) => set({ panelMode: e.target.value as MissionPlan['panelMode'] })}>
              <option value="vertical">Vertical (polar)</option>
              <option value="tracking">Two-axis tracker</option>
            </select>
          </label>
          <div className="pf-row">
            <NumField label="Always-on load" unit="W" value={plan.hotelW} min={0} onChange={(v) => set({ hotelW: v })} />
            <NumField label="Extra while driving" unit="W" value={plan.driveW} min={0} onChange={(v) => set({ driveW: v })} />
          </div>
        </fieldset>
      </div>
    </details>
  );
}

// ------------------------------------------------------------------ table
const GROUPS: [string, number[]][] = [
  ['Mission and time', [2, 9, 27]],
  ['Sun and Earth', [3, 4, 14, 15]],
  ['Landing site and terrain', [7, 10, 11, 31, 32, 28]],
  ['Visibility', [12, 13, 30, 16, 17]],
  ['Route and rover', [8, 1, 23, 18, 19, 20, 6, 5, 24, 25]],
  ['Power', [22, 21]],
  ['Assessment', [26, 29, 33]],
];

function buildRows(d: SiteData, r: ScenarioResult, m: MissionState, t: number, ranking: RankRow[]): Map<number, Row> {
  const x = r.metrics, p = m.plan, rt = m.route, tl = m.tl;
  const hz = d.horizon.horizonDeg;
  const dirs = [0, 90, 180, 270].map((a) => `${compass(a)[0].toUpperCase()} ${deg(hz[a])}`).join(' · ');
  const maxI = hz.indexOf(Math.max(...hz));
  const both = bothCount(d.series, Math.max(0, Math.floor(indexAt(d.series, t))), Math.min(d.series.n, Math.floor(indexAt(d.series, t)) + Math.round((SYNODIC_DAYS * 86400000) / d.series.stepMs)));
  const winN = Math.min(d.series.n, Math.floor(indexAt(d.series, t)) + Math.round((SYNODIC_DAYS * 86400000) / d.series.stepMs)) - Math.max(0, Math.floor(indexAt(d.series, t)));
  const phase = m.rover.phase === 'before' ? `waiting at the landing site, departs in ${formatDuration(p.departure - t)}` : m.rover.phase === 'arrived' ? 'arrived at the destination' : `driving, ${m.rover.dKm.toFixed(2)} of ${rt.lengthKm.toFixed(2)} km`;
  const wpSun = m.wp.filter((w) => w.sunUp).length, wpEarth = m.wp.filter((w) => w.earthUp).length;
  const top = ranking[0];
  const rows: Row[] = [
    { n: 1, value: `${rt.lengthKm.toFixed(2)} km`, detail: `straight line ${rt.directKm.toFixed(2)} km${rt.terrain ? `, detour +${(rt.lengthKm - rt.directKm).toFixed(2)} km around steep ground` : ''}`, src: rt.terrain ? 'live' : 'estimate' },
    { n: 2, value: utc(p.departure), detail: `sim clock ${utc(t)}`, src: 'input' },
    { n: 3, value: `az ${x.sky.sun.az.toFixed(1)}°, el ${deg(x.sky.sun.el)}`, detail: `toward the ${compass(x.sky.sun.az)}, disk ${(x.sky.sun.radiusDeg * 2).toFixed(2)}° wide`, src: 'live' },
    { n: 4, value: `az ${x.sky.earth.az.toFixed(1)}°, el ${deg(x.sky.earth.el)}`, detail: `toward the ${compass(x.sky.earth.az)}, ${x.sky.earth.distKm.toFixed(0)} km away`, src: 'live' },
    { n: 5, value: ll(m.rover), detail: phase, src: 'live' },
    { n: 6, value: formatDuration(m.travelH * 3600000), detail: `average ${m.avgSpeed.toFixed(2)} km/h after slowing on slopes; arrives ${utc(p.departure + m.travelH * 3600000)}`, src: 'live' },
    { n: 7, value: ll(d.info), detail: `${d.info.siteHeightM.toFixed(0)} m${d.info.snappedM ? `, moved ${d.info.snappedM} m from the cited ${ll({ lat: d.info.citedLat, lon: d.info.citedLon })}` : ''}`, src: 'reference' },
    { n: 8, value: ll(m.dest), detail: p.dest.kind === 'offset' ? `${p.dest.km} km toward ${p.dest.bearing}° from the site` : 'entered coordinates', src: 'input' },
    { n: 9, value: `${p.durationDays} days`, detail: `${(p.durationDays / SYNODIC_DAYS).toFixed(2)} lunar days, ends ${utc(p.departure + p.durationDays * 86400000)}`, src: 'input' },
    { n: 10, value: `${d.horizon.siteHeightM.toFixed(0)} m`, detail: `above the 1737.4 km reference sphere${m.rover.hM !== null && m.rover.phase !== 'before' ? `; rover now at ${m.rover.hM.toFixed(0)} m` : ''}`, src: 'reference' },
    { n: 11, value: `highest ${deg(hz[maxI])} to the ${compass(maxI)}`, detail: `${dirs}; toward Sun ${deg(x.sunHorizon)}, toward Earth ${deg(x.earthHorizon)}`, src: 'reference' },
    { n: 12, value: pct(x.sunPct), detail: `of the next lunar day; ${pct(tl.sunPct)} over the mission at the rover; ${pct(d.info.stats.sunPct)} over all three years`, src: 'live' },
    { n: 13, value: pct(x.earthPct), detail: `of the next lunar day; ${pct(tl.earthPct)} over the mission at the rover; ${pct(d.info.stats.earthPct)} over all three years`, src: 'live' },
    { n: 14, value: signed(x.sky.sun.el - x.sunHorizon), detail: x.sunUp ? 'Sun above the skyline: sunlit' : 'Sun behind terrain or below the horizon', src: 'live' },
    { n: 15, value: signed(x.sky.earth.el - x.earthHorizon), detail: x.earthUp ? 'Earth above the skyline: direct link possible' : 'Earth hidden: no direct link', src: 'live' },
    { n: 16, value: `${x.longestDarkClipped ? '≥ ' : ''}${hrs(x.longestDarkH)}`, detail: `longest in the next lunar day at the site; ${hrs(tl.longestDarkH)} for the rover over the mission`, src: 'live' },
    { n: 17, value: `${x.longestNoCommClipped ? '≥ ' : ''}${hrs(x.longestNoCommH)}`, detail: `longest in the next lunar day at the site; ${hrs(tl.longestNoCommH)} for the rover over the mission`, src: 'live' },
    { n: 18, value: rt.terrain ? `max ${rt.maxSlopeDeg!.toFixed(1)}°, mean ${rt.meanSlopeDeg!.toFixed(1)}°` : 'unknown', detail: rt.terrain ? `along the route, over ${rt.demResM} m steps; ${rt.siteSlopeDeg!.toFixed(1)}° at the landing site` : rt.note, src: rt.terrain ? 'live' : 'estimate' },
    { n: 19, value: rt.terrain ? `${rt.hazardsDirect} on the straight line` : 'unknown', detail: rt.terrain ? `${rt.hazardKmDirect.toFixed(1)} km steeper than ${p.maxSlopeDeg}°; ${rt.hazardsRoute} left on the planned route. Features under ~${rt.demResM} m are not detectable.` : rt.note, src: rt.terrain ? 'live' : 'estimate' },
    { n: 20, value: `${p.speedKmH} km/h`, detail: `on flat ground; ${(p.speedKmH * (1 - p.slopeDerate)).toFixed(2)} km/h at the ${p.maxSlopeDeg}° limit`, src: 'input' },
    { n: 21, value: pct(m.battPct), detail: `${((m.battPct / 100) * p.batteryWh).toFixed(0)} of ${p.batteryWh} Wh; lowest ${pct(tl.minPct)} at ${utc(tl.minT)}${tl.emptyT !== null ? `; runs flat at ${utc(tl.emptyT)}` : ''}`, src: 'estimate' },
    { n: 22, value: `${m.powerW.toFixed(0)} W`, detail: `now at the rover (${pct(m.sunFrac * 100)} of the Sun’s disk visible); load ${m.loadW} W; mission total in ${(tl.energyInWh / 1000).toFixed(1)} kWh, out ${(tl.energyOutWh / 1000).toFixed(1)} kWh`, src: 'estimate' },
    { n: 23, value: `${m.wp.length} waypoints`, detail: m.busy ? m.busy : rt.note, src: rt.terrain ? 'live' : 'estimate' },
    { n: 24, value: tl.sunDrivePct === null ? '—' : pct(tl.sunDrivePct), detail: `of drive time; Sun up at ${wpSun} of ${m.wp.length} waypoints on arrival`, src: 'live' },
    { n: 25, value: tl.earthDrivePct === null ? '—' : pct(tl.earthDrivePct), detail: `of drive time; Earth up at ${wpEarth} of ${m.wp.length} waypoints on arrival`, src: 'live' },
    { n: 26, value: top ? `best now: ${top.name}` : '—', detail: 'ranked by time with Sun and Earth both up in the next lunar day (table below)', src: 'live' },
    { n: 27, value: m.best ? utc(m.best.t) : '—', detail: m.best ? `${pct(m.best.bothPct)} of a ${hrs(Math.max(m.travelH, 0.5))} drive with Sun and Earth both up (searched 30 days from departure, at the site)` : 'outside the data range', src: 'live' },
    { n: 28, value: `${m.tempK.toFixed(0)} K (${(m.tempK - 273.15).toFixed(0)} °C)`, detail: 'flat ground at the rover, radiative balance; shadow ≈ 95 K, permanent shadow ≈ 40 K', src: 'estimate' },
    { n: 29, value: `${m.feas.score} / 100`, detail: m.feas.parts.map((q) => `${q.label} ${q.pts}/${q.max}`).join(' · '), src: 'estimate' },
    { n: 30, value: pct(winN > 0 ? (both / winN) * 100 : 0), detail: `of the next lunar day at the site; ${pct(tl.bothPct)} over the mission at the rover`, src: 'live' },
    { n: 31, value: `${d.horizon.observerHeightM} m`, detail: 'camera or antenna above the ground, used for every skyline', src: 'reference' },
    { n: 32, value: d.info.demResolutionM ? `${d.info.demResolutionM} m/px` : d.info.dem, detail: `${d.info.dem}; route planning on the 400 m downsample. Skylines good to ~0.1–0.3° near the site.`, src: 'reference' },
    { n: 33, value: `≤ ${EPHEMERIS_ERROR.maxAzDeg}° az, ${EPHEMERIS_ERROR.maxElDeg}° el`, detail: `vs JPL Horizons DE441, ${EPHEMERIS_ERROR.comparisons} comparisons (npm run validate)`, src: 'reference' },
  ];
  return new Map(rows.map((x) => [x.n, x]));
}

interface RankRow { id: string; name: string; sun: number; earth: number; both: number }

function useRanking(all: (SiteData | null)[], t: number): RankRow[] {
  const tq = Math.round(t / 1800000);
  return useMemo(() => all.filter((x): x is SiteData => !!x).map((s) => {
    const a = Math.max(0, Math.floor(indexAt(s.series, t))), b = Math.min(s.series.n, a + Math.round((SYNODIC_DAYS * 86400000) / s.series.stepMs));
    const n = Math.max(1, b - a);
    return { id: s.info.id, name: s.info.name, sun: (upCount(s.series.sunUp, a, b) / n) * 100, earth: (upCount(s.series.earthUp, a, b) / n) * 100, both: (bothCount(s.series, a, b) / n) * 100 };
  }).sort((p, q) => q.both - p.both || q.sun - p.sun), [all, tq]); // eslint-disable-line react-hooks/exhaustive-deps
}

const PRIO: Record<Priority, string> = { Critical: 'prio-crit', High: 'prio-high', Extra: 'prio-extra' };

interface Props {
  d: SiteData; r: ScenarioResult; m: MissionState; t: number; plan: MissionPlan; onPlan: (p: MissionPlan) => void;
  sites: SiteInfo[]; all: (SiteData | null)[]; onSeek: (t: number) => void; onCompare: (ids: string[]) => void; onCalc: () => void;
}

export default function MissionPanel({ d, r, m, t, plan, onPlan, sites, all, onSeek, onCompare, onCalc }: Props) {
  const ranking = useRanking(all, t);
  const rows = buildRows(d, r, m, t, ranking);
  const [copied, setCopied] = useState(false);
  const set = (p: Partial<MissionPlan>) => onPlan({ ...plan, ...p });
  const csv = () => toCSV([...rows.values()].sort((a, b) => a.n - b.n).map((x) => ({ n: x.n, variable: variable(x.n).name, value: x.value, detail: x.detail ?? '', source: SRC_LABEL[x.src], priority: variable(x.n).priority })));
  const cell = (n: number): ReactNode => {
    const row = rows.get(n)!, v = variable(n);
    return (
      <tr key={n}>
        <td className="mv-n num">{n}</td>
        <th scope="row"><span className="mv-name">{v.name}</span><small>{v.description}</small></th>
        <td className="mv-val">{row.value}{row.detail && <small>{row.detail}</small>}</td>
        <td className="mv-tags"><span className={`prio ${PRIO[v.priority]}`}>{v.priority}</span><span className={`src src-${row.src}`}>{SRC_LABEL[row.src]}</span></td>
      </tr>
    );
  };

  return (
    <section className="mission" aria-labelledby="mv-h">
      <div className="cal-head">
        <h2 id="mv-h">Mission variables <span>all 33, live at the sim time</span></h2>
        <div className="btn-row">
          <button onClick={onCalc}><Calculator size={14} aria-hidden /> Open the calculator</button>
          <button onClick={() => navigator.clipboard?.writeText(csv()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}><Copy size={14} aria-hidden /> {copied ? 'Copied' : 'Copy as CSV'}</button>
        </div>
      </div>
      <PlanForm plan={plan} set={set} m={m} sites={sites} t={t} />

      <div className="mission-charts">
        <div className="instrument">
          <h3 className="mchart-h">Route profile <span className="muted small">{m.busy ?? `${m.route.lengthKm.toFixed(1)} km, ${m.wp.length} waypoints, steep stretches in red`}</span></h3>
          <RouteProfile m={m} />
        </div>
        <div className="instrument">
          <h3 className="mchart-h">Battery <span className="muted small">shaded where the rover is sunlit; click to jump</span></h3>
          <BatteryChart m={m} t={t} onSeek={onSeek} />
        </div>
      </div>

      <div className="table-wrap">
        <table className="mv-table">
          <caption className="sr-only">Mission variables</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Variable</th><th scope="col">Value</th><th scope="col"><span className="sr-only">Priority and source</span></th></tr></thead>
          {GROUPS.map(([g, ns]) => (
            <tbody key={g}>
              <tr className="mv-group"><th colSpan={4} scope="rowgroup">{g}</th></tr>
              {ns.map(cell)}
            </tbody>
          ))}
        </table>
      </div>

      <div className="mv-rank">
        <div className="best-head">
          <h3>Landing site comparison <span className="muted small">next lunar day from the sim time</span></h3>
          <button onClick={() => onCompare(ranking.slice(0, 3).map((x) => x.id))}><Columns2 size={14} aria-hidden /> Top three side by side</button>
        </div>
        <div className="table-wrap">
          <table className="compare-table">
            <thead><tr><th>Site</th><th>Sunlit</th><th>Earth in view</th><th>Both</th></tr></thead>
            <tbody>
              {ranking.map((x) => (
                <tr key={x.id} className={x.id === d.info.id ? 'is-current' : undefined}>
                  <th scope="row">{x.name}{x.id === d.info.id && <span className="best-tag">selected</span>}</th>
                  <td>{pct(x.sun)}</td><td>{pct(x.earth)}</td><td>{pct(x.both)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="note">Sources: <b>Sim</b> is computed from LOLA terrain and the ephemeris at the sim time. <b>Your plan</b> comes from the form above. <b>Estimate</b> uses simple models (radiative balance, steady loads, a rover that drives without stopping). <b>Reference</b> is fixed site or validation data.</p>
    </section>
  );
}
