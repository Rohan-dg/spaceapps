/**
 * Two-site comparison for the Explore page: the two sites picked on the 3D Moon or in the list, side by side on
 * every criterion the challenge asks about (Sun and Earth now, time to sunset / Earthset, power and radio over the
 * next lunar day) plus the long-run criteria and the weighted long-run score, with the better value marked.
 */
import { useMemo, useState } from 'react';
import { DEFAULT_LANDER, LANDER_FIELDS, simulateLander, validateLander, type Lander, type LanderResult, type Pointing } from '../lib/lander';
import type { SiteData } from '../lib/data';
import { criteriaOf, longRunScore, ROWS, verdict, separationKm, type Better } from '../lib/missionCompare';
import { useScenario } from '../lib/useScenario';
import { eventText } from './Metrics';

const WORD = { green: 'Good', amber: 'Marginal', red: 'Poor' } as const;
const RANK = { green: 2, amber: 1, red: 0 } as const;
const fmtLat = (lat: number, lon: number) => {
  const l = ((lon % 360) + 360) % 360;
  return `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? 'S' : 'N'}, ${(l > 180 ? 360 - l : l).toFixed(3)}° ${l > 180 ? 'W' : 'E'}`;
};
const h = (x: number) => (x >= 48 ? `${(x / 24).toFixed(1)} d` : `${x.toFixed(0)} h`);

type Cell = { text: string; v?: number };
interface Line { label: string; a: Cell; b: Cell; higher?: boolean; note?: string }

function win(l: Line): Better {
  if (l.higher === undefined || l.a.v === undefined || l.b.v === undefined) return 'tie';
  const s = Math.max(Math.abs(l.a.v), Math.abs(l.b.v));
  if (s === 0 || Math.abs(l.a.v - l.b.v) <= s * 0.01) return 'tie';
  return (l.a.v > l.b.v) === l.higher ? 'a' : 'b';
}

/** Inputs for a clicked point: what is already known (filled, read-only) and what the user can set, then recalculate. */
function PointForm({ d, tag, range, t, busy, onRecompute }: { d: SiteData; tag: 'A' | 'B'; range?: { start: string; end: string }; t: number; busy?: string | null; onRecompute?: (lat: number, lon: number, mastM: number, slot: 'A' | 'B') => void }) {
  const [lat, setLat] = useState(String(d.info.lat));
  const [lon, setLon] = useState(String(((d.info.lon % 360) + 360) % 360));
  const [mast, setMast] = useState(String(d.horizon.observerHeightM ?? 2));
  const la = Number(lat), lo = Number(lon), m = Number(mast);
  const err = !(la >= -90 && la <= 90) ? 'Latitude must be between −90 and 90.' : !(lo >= -180 && lo <= 360) ? 'Longitude must be between −180 and 360 (east positive).' : !(m >= 0 && m <= 100) ? 'Mast height must be between 0 and 100 m.' : null;
  const outOfRange = range && (t < Date.parse(range.start) || t > Date.parse(range.end));
  return (
    <form className="pair-point" onSubmit={(e) => { e.preventDefault(); if (!err) onRecompute?.(la, lo, m, tag); }} aria-label={`Point ${tag} inputs`}>
      <div className="pair-lander-h"><b>Point {tag}: your inputs</b><small>Filled from NASA data where it exists. Change the editable values and recalculate.</small></div>
      <label><span>Latitude (° north)</span><span className="pair-in"><input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} /><em>°</em></span></label>
      <label><span>Longitude (° east)</span><span className="pair-in"><input type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} /><em>°</em></span></label>
      <label><span>Panel / antenna height above ground</span><span className="pair-in"><input type="number" step="any" min={0} value={mast} onChange={(e) => setMast(e.target.value)} /><em>m</em></span></label>
      <dl className="pair-known">
        <dt>Ground elevation</dt><dd>{Math.round(d.info.siteHeightM)} m <small>from {d.info.dem}</small></dd>
        <dt>Terrain resolution</dt><dd>{d.info.demResolutionM ? `${d.info.demResolutionM} m per sample` : 'n/a'}</dd>
        <dt>Sun and Earth positions</dt><dd>computed for every {Math.round(d.series.stepMs / 60000)} min, {range ? `${range.start.slice(0, 10)} to ${range.end.slice(0, 10)}` : 'data range'}</dd>
      </dl>
      {outOfRange && <p className="pair-err">The selected time is outside the data range; pick a date between {range!.start.slice(0, 10)} and {range!.end.slice(0, 10)}.</p>}
      {err && <p className="pair-err" role="alert">{err}</p>}
      <button type="submit" className="pair-recalc" disabled={!!err || !!busy}>{busy ? busy : 'Recalculate this point'}</button>
    </form>
  );
}

export default function PairCompare({ a, b, t, onSwap, onClear, expert = false, onCloseUp, range, onRecompute, busy }: {
  a: SiteData; b: SiteData; t: number; onSwap: () => void; onClear: () => void; expert?: boolean; onCloseUp?: (id: string) => void;
  range?: { start: string; end: string }; onRecompute?: (lat: number, lon: number, mastM: number, slot: 'A' | 'B') => void; busy?: string | null;
}) {
  const [lander, setLander] = useState<Lander>(DEFAULT_LANDER);
  const landerErr = validateLander(lander);
  const la = useMemo(() => (landerErr ? null : simulateLander(a.series, t, lander)), [a, t, lander, landerErr]);
  const lb = useMemo(() => (landerErr ? null : simulateLander(b.series, t, lander)), [b, t, lander, landerErr]);
  const ra = useScenario(a, t), rb = useScenario(b, t);
  const ca = useMemo(() => criteriaOf(a), [a]), cb = useMemo(() => criteriaOf(b), [b]);
  const sa = useMemo(() => longRunScore(ca), [ca]), sb = useMemo(() => longRunScore(cb), [cb]);
  const v = useMemo(() => verdict(ca, cb, a.info.short || a.info.name, b.info.short || b.info.name), [ca, cb, a, b]);
  if (!ra || !rb) return null;
  const ma = ra.metrics, mb = rb.metrics;
  const nameA = a.info.short || a.info.name, nameB = b.info.short || b.info.name;

  const sections: { title: string; lines: Line[] }[] = [
    {
      title: 'Site',
      lines: [
        { label: 'Position', a: { text: fmtLat(a.info.lat, a.info.lon) }, b: { text: fmtLat(b.info.lat, b.info.lon) } },
        { label: 'Elevation', a: { text: `${a.info.siteHeightM.toFixed(0)} m` }, b: { text: `${b.info.siteHeightM.toFixed(0)} m` } },
        { label: 'Terrain model', a: { text: `${a.info.dem}${a.info.demResolutionM ? `, ${a.info.demResolutionM} m/px` : ''}` }, b: { text: `${b.info.dem}${b.info.demResolutionM ? `, ${b.info.demResolutionM} m/px` : ''}` } },
      ],
    },
    {
      title: `Right now (${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC)`,
      lines: [
        { label: 'Sunlit', a: { text: ma.sunUp ? 'Yes' : 'No', v: +ma.sunUp }, b: { text: mb.sunUp ? 'Yes' : 'No', v: +mb.sunUp }, higher: true },
        { label: 'Solar elevation', a: { text: `${ma.sky.sun.el.toFixed(2)}°`, v: ma.sky.sun.el }, b: { text: `${mb.sky.sun.el.toFixed(2)}°`, v: mb.sky.sun.el }, higher: true, note: 'drives solar power' },
        { label: 'Sun clearance over the skyline', a: { text: `${(ma.sky.sun.el - ma.sunHorizon).toFixed(2)}°`, v: ma.sky.sun.el - ma.sunHorizon }, b: { text: `${(mb.sky.sun.el - mb.sunHorizon).toFixed(2)}°`, v: mb.sky.sun.el - mb.sunHorizon }, higher: true },
        { label: ma.sunUp || mb.sunUp ? 'Next sunset / sunrise' : 'Next sunrise', a: { text: `${ma.sunUp ? 'sets' : 'rises'} ${eventText(ma.sunUp ? ma.nextSunset : ma.nextSunrise, ma.t)}` }, b: { text: `${mb.sunUp ? 'sets' : 'rises'} ${eventText(mb.sunUp ? mb.nextSunset : mb.nextSunrise, mb.t)}` } },
        { label: 'Earth in view', a: { text: ma.earthUp ? 'Yes' : 'No', v: +ma.earthUp }, b: { text: mb.earthUp ? 'Yes' : 'No', v: +mb.earthUp }, higher: true },
        { label: 'Earth elevation', a: { text: `${ma.sky.earth.el.toFixed(2)}°`, v: ma.sky.earth.el }, b: { text: `${mb.sky.earth.el.toFixed(2)}°`, v: mb.sky.earth.el }, higher: true, note: 'direct-to-Earth radio' },
        { label: 'Next Earthset / Earthrise', a: { text: `${ma.earthUp ? 'sets' : 'rises'} ${eventText(ma.earthUp ? ma.nextEarthset : ma.nextEarthrise, ma.t)}` }, b: { text: `${mb.earthUp ? 'sets' : 'rises'} ${eventText(mb.earthUp ? mb.nextEarthset : mb.nextEarthrise, mb.t)}` } },
      ],
    },
    {
      title: 'Next lunar day (29.5 days)',
      lines: [
        { label: 'Power rating', a: { text: WORD[ra.power.level], v: RANK[ra.power.level] }, b: { text: WORD[rb.power.level], v: RANK[rb.power.level] }, higher: true },
        { label: 'Radio-to-Earth rating', a: { text: WORD[ra.comms.level], v: RANK[ra.comms.level] }, b: { text: WORD[rb.comms.level], v: RANK[rb.comms.level] }, higher: true },
        { label: 'Time in sunlight', a: { text: `${ma.sunPct.toFixed(1)} %`, v: ma.sunPct }, b: { text: `${mb.sunPct.toFixed(1)} %`, v: mb.sunPct }, higher: true },
        { label: 'Longest dark spell', a: { text: h(ma.longestDarkH), v: ma.longestDarkH }, b: { text: h(mb.longestDarkH), v: mb.longestDarkH }, higher: false },
        { label: 'Time Earth in view', a: { text: `${ma.earthPct.toFixed(1)} %`, v: ma.earthPct }, b: { text: `${mb.earthPct.toFixed(1)} %`, v: mb.earthPct }, higher: true },
        { label: 'Longest radio blackout', a: { text: h(ma.longestNoCommH), v: ma.longestNoCommH }, b: { text: h(mb.longestNoCommH), v: mb.longestNoCommH }, higher: false },
      ],
    },
    {
      title: 'Long run (whole data range, 2027 to 2029)',
      lines: ROWS.map((r) => ({
        label: r.label, higher: r.higherIsBetter,
        a: { text: `${ca[r.key].toFixed(r.digits)} ${r.unit}`, v: ca[r.key] }, b: { text: `${cb[r.key].toFixed(r.digits)} ${r.unit}`, v: cb[r.key] },
      })),
    },
    ...(expert && la && lb ? [{
      title: `Your lander, ${lander.durationDays} days from the selected time`,
      lines: (() => {
        const n = (x: number, d = 0) => x.toFixed(d);
        const row = (label: string, fa: (r: LanderResult) => string, fv: (r: LanderResult) => number, higher?: boolean, note?: string): Line =>
          ({ label, note, higher, a: { text: fa(la), v: fv(la) }, b: { text: fa(lb), v: fv(lb) } });
        return [
          row('Survives the whole mission', (r) => (r.survives ? 'Yes' : 'No'), (r) => +r.survives, true),
          row('First loss of power', (r) => (r.firstOutageH === null ? 'never' : `after ${n(r.firstOutageH)} h`), (r) => r.firstOutageH ?? 1e9, true),
          row('Hours without power', (r) => `${n(r.hoursWithoutPower)} h`, (r) => r.hoursWithoutPower, false),
          row('Lowest battery charge', (r) => `${n(r.minChargePct)} %`, (r) => r.minChargePct, true, 'protection limit at the max depth of discharge'),
          row('Peak array output', (r) => `${n(r.peakArrayW)} W`, (r) => r.peakArrayW, true),
          row('Mean array output while sunlit', (r) => `${n(r.meanArrayWSunlit)} W`, (r) => r.meanArrayWSunlit, true, 'Sun elevation, visible disk and dust included'),
          row('Energy generated', (r) => `${n(r.generatedKWh)} kWh`, (r) => r.generatedKWh, true),
          row('Energy used', (r) => `${n(r.usedKWh)} kWh`, (r) => r.usedKWh, false),
          row('Of which survival heaters', (r) => `${n(r.heaterKWh)} kWh`, (r) => r.heaterKWh, false),
          row('Net energy', (r) => `${r.netKWh >= 0 ? '+' : ''}${n(r.netKWh)} kWh`, (r) => r.netKWh, true),
          row('Operating hours (sunlit, powered)', (r) => `${n(r.operatingHours)} h`, (r) => r.operatingHours, true),
          row('Link hours (Earth above the mask, powered)', (r) => `${n(r.linkHours)} h`, (r) => r.linkHours, true),
        ];
      })(),
    }] : []),
  ];

  const winner = v.winner === 'a' ? nameA : v.winner === 'b' ? nameB : null;
  return (
    <section className="pair" aria-label={`Comparison of ${nameA} and ${nameB}`}>
      <div className="pair-head">
        <div className="pair-site a"><span className="pair-tag">A</span><b>{a.info.name}</b><small>{a.info.mission ?? ''}</small>
          {expert && onCloseUp && <button className="pair-closeup" onClick={() => onCloseUp(a.info.id)}>View close-up on the Moon</button>}</div>
        <div className="pair-vs">
          <span className="num">{separationKm(a.info, b.info).toFixed(0)} km apart</span>
          <button onClick={onSwap} title="Swap A and B">⇄</button>
          <button onClick={onClear} title="Clear the comparison">Clear</button>
        </div>
        <div className="pair-site b"><span className="pair-tag">B</span><b>{b.info.name}</b><small>{b.info.mission ?? ''}</small>
          {expert && onCloseUp && <button className="pair-closeup" onClick={() => onCloseUp(b.info.id)}>View close-up on the Moon</button>}</div>
      </div>

      <div className="pair-score">
        {[{ s: sa, n: nameA, k: 'a' }, { s: sb, n: nameB, k: 'b' }].map(({ s, n, k }) => (
          <div key={k} className={`pair-score-card ${k}${v.winner === k ? ' wins' : ''}`}>
            <span className="pair-score-n num">{s.score.toFixed(1)}<small>%</small></span>
            <span className="pair-score-l">Success rate · {n}</span>
            <ul>
              {s.parts.map((p) => (
                <li key={p.key}><span>{p.label}</span><span className="bar"><i style={{ width: `${p.value * 100}%` }} /></span><span className="num">{Math.round(p.value * 100)}%</span></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="pair-verdict">
        {winner ? <><b>{winner}</b> has the higher success rate ({v.scoreA.toFixed(1)}% vs {v.scoreB.toFixed(1)}%).</> : <>Too close to call ({v.scoreA.toFixed(1)}% vs {v.scoreB.toFixed(1)}%).</>}
        {v.reasons.length > 0 && <> {v.reasons.join('. ')}.</>}
        <small> Success rate weights: sunlight 35 %, Earth contact 25 %, surviving the night 20 %, radio blackouts 10 %, landing opportunities 10 %.</small>
      </p>

      {(a.info.approximate || b.info.approximate) && (
        <div className="pair-points">
          {a.info.approximate && <PointForm key={a.info.id} d={a} tag="A" range={range} t={t} busy={busy} onRecompute={onRecompute} />}
          {b.info.approximate && <PointForm key={b.info.id} d={b} tag="B" range={range} t={t} busy={busy} onRecompute={onRecompute} />}
        </div>
      )}

      {expert && (
        <form className="pair-lander" onSubmit={(e) => e.preventDefault()} aria-label="Engineering inputs">
          <div className="pair-lander-h">
            <b>Engineering inputs</b>
            <small>Your lander's numbers. Both sites recalculate step by step (every {Math.round(a.series.stepMs / 60000)} min) on their real Sun elevation, visible solar disk and Earth elevation over the terrain skyline. No atmosphere: full solar constant, no refraction, no convective cooling.</small>
          </div>
          <label className="pair-wide"><span>Array pointing</span>
            <select value={lander.pointing} onChange={(e) => setLander({ ...lander, pointing: e.target.value as Pointing })}>
              <option value="vertical-tracking">Vertical, tracks the Sun in azimuth (polar landers)</option>
              <option value="horizontal">Horizontal, deck-mounted</option>
              <option value="two-axis">Two-axis tracker (always face-on)</option>
            </select>
          </label>
          {[...new Set(LANDER_FIELDS.map((f) => f.group))].map((g) => (
            <fieldset key={g} className="pair-group"><legend>{g}</legend>
              {LANDER_FIELDS.filter((f) => f.group === g).map((f) => (
                <label key={f.key} title={f.hint}><span>{f.label}</span>
                  <span className="pair-in"><input type="number" step="any" min={f.min} max={f.max} value={Number.isFinite(lander[f.key]) ? lander[f.key] : ''}
                    onChange={(e) => setLander({ ...lander, [f.key]: e.target.value === '' ? NaN : Number(e.target.value) })} /><em>{f.unit}</em></span>
                  {f.hint && <small className="pair-hint">{f.hint}</small>}
                </label>
              ))}
            </fieldset>
          ))}
          <button type="button" className="pair-reset" onClick={() => setLander(DEFAULT_LANDER)}>Reset to defaults</button>
          {landerErr && <p className="pair-err" role="alert">{landerErr}</p>}
          <p className="pair-note">Thermal is modelled as heater power drawn through the night, not a full heat balance. Array temperature effects belong in System losses.</p>
        </form>
      )}

      <table className="pair-table">
        <thead><tr><th scope="col">Criterion</th><th scope="col">A · {nameA}</th><th scope="col">B · {nameB}</th></tr></thead>
        {sections.map((sec) => (
          <tbody key={sec.title}>
            <tr className="pair-sec"><th colSpan={3} scope="colgroup">{sec.title}</th></tr>
            {sec.lines.map((l) => {
              const w = win(l);
              return (
                <tr key={l.label}>
                  <th scope="row">{l.label}{l.note && <small>{l.note}</small>}</th>
                  <td className={w === 'a' ? 'best' : ''}>{l.a.text}</td>
                  <td className={w === 'b' ? 'best' : ''}>{l.b.text}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </section>
  );
}
