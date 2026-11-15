/**
 * Libration and orbital variation tool: Earth's wobble in the lunar sky, the Moon's changing orbit, and what both
 * mean for Earth contact and sunlight at the selected site. All figures come from lib/libration.ts.
 */
import { useMemo } from 'react';
import type { SiteData } from '../lib/data';
import { horizonAt } from '../lib/horizon';
import { librationAt, librationSeries, periodDays, rangeOf, siteLibration, unwrap, type LibrationState } from '../lib/libration';

const DAY = 86400000;
const utc = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const sgn = (x: number, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`;
const km = (x: number) => `${Math.round(x).toLocaleString('en-US')} km`;

let FULL: { key: string; s: LibrationState[] } | null = null;
/** The whole data range at 12 h steps, computed once. */
function fullSeries(t0: number, t1: number) {
  const key = `${t0}|${t1}`;
  if (!FULL || FULL.key !== key) FULL = { key, s: librationSeries(t0, t1, 12) };
  return FULL.s;
}

interface Props { data: SiteData; t: number; range: [number, number]; onSeek: (t: number) => void }

export default function LibrationTool({ data, t, range, onSeek }: Props) {
  const tq = Math.floor(t / 3600000) * 3600000, td = Math.floor(t / (6 * 3600000)) * 6 * 3600000; // cycle charts refresh every 6 h of mission time
  const full = useMemo(() => fullSeries(range[0], range[1]), [range]);
  const now = useMemo(() => librationAt(tq), [tq]);
  const month = useMemo(() => librationSeries(td, td + 29.53 * DAY, 6), [td]);
  const site = { lat: data.horizon.lat, lon: data.horizon.lon, heightM: data.horizon.siteHeightM + data.horizon.observerHeightM };
  const sl = useMemo(() => siteLibration(site, data.horizon.horizonDeg, td), [data, td]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => ({
    lon: rangeOf(full, 'lonDeg'), lat: rangeOf(full, 'latDeg'), dist: rangeOf(full, 'distKm'), sun: rangeOf(full, 'sunLatDeg'), diam: rangeOf(full, 'earthDiamDeg'),
    pLon: periodDays(full, 'lonDeg'), pLat: periodDays(full, 'latDeg'), pDist: periodDays(full, 'distKm'), pSun: periodDays(full, 'sunLatDeg', 120),
  }), [full]);

  const f = sl.fixedEarth, up = sl.earthUpPct;
  const effect = f.up && up < 99.5
    ? { kind: 'hides', text: `Libration hides Earth ${(100 - up).toFixed(0)}% of the next lunar cycle here. Held at its mean position, Earth would sit ${f.clearance.toFixed(2)}° above the skyline and stay in view the whole time.` }
    : !f.up && up > 0.5
      ? { kind: 'creates', text: `Libration is the only reason Earth is ever in view here. Held at its mean position, Earth would stay ${Math.abs(f.clearance).toFixed(2)}° below the skyline; the wobble lifts it into view ${up.toFixed(0)}% of the next lunar cycle.` }
      : up >= 99.5
        ? { kind: 'none', text: `Earth stands high enough that libration never hides it here: its wobble moves it between ${sl.elMin.toFixed(1)}° and ${sl.elMax.toFixed(1)}° elevation, always above the skyline.` }
        : { kind: 'never', text: `Earth stays below the skyline all cycle, even at the top of its wobble (${sl.bestClearance.toFixed(1)}° below at best). A relay satellite is needed for radio contact.` };

  return (
    <section className="lib" aria-label="Libration and orbital variation">
      <header className="lib-head">
        <div>
          <span className="lib-badge">Challenge criterion · Libration</span>
          <h3>Libration and orbital variation</h3>
          <p className="muted">How Earth wobbles in the lunar sky and how the Moon's orbit changes Sun and Earth geometry, computed from the same ephemeris as every other figure (checked against JPL Horizons). At {utc(tq)} UTC.</p>
        </div>
      </header>

      <div className="lib-tiles">
        <Tile label="Libration in longitude" value={`${sgn(now.lonDeg)}°`} sub={`range ${sgn(stats.lon.min, 1)}° to ${sgn(stats.lon.max, 1)}° · ${stats.pLon.toFixed(1)} d cycle`} tone="earth" />
        <Tile label="Libration in latitude" value={`${sgn(now.latDeg)}°`} sub={`range ${sgn(stats.lat.min, 1)}° to ${sgn(stats.lat.max, 1)}° · ${stats.pLat.toFixed(1)} d cycle`} tone="earth" />
        <Tile label="Earth–Moon distance" value={km(now.distKm)} sub={`perigee ${km(stats.dist.min)} · apogee ${km(stats.dist.max)} · ${stats.pDist.toFixed(1)} d`} />
        <Tile label="Earth's apparent size" value={`${now.earthDiamDeg.toFixed(2)}°`} sub={`${stats.diam.min.toFixed(2)}° to ${stats.diam.max.toFixed(2)}° (${(((stats.diam.max / stats.diam.min) - 1) * 100).toFixed(0)}% larger at perigee)`} />
        <Tile label="Sun's latitude (lunar season)" value={`${sgn(now.sunLatDeg)}°`} sub={`range ${sgn(stats.sun.min)}° to ${sgn(stats.sun.max)}° · ${stats.pSun.toFixed(0)} d cycle`} tone="sun" />
        <Tile label={`Earth's swing at ${data.info.short}`} value={`${(sl.elMax - sl.elMin).toFixed(1)}°`} sub={`elevation ${sl.elMin.toFixed(1)}° to ${sl.elMax.toFixed(1)}° over the next cycle`} tone="earth" />
      </div>

      <div className={`lib-effect ${effect.kind}`}>
        <b>What libration does at {data.info.name}</b>
        <p>{effect.text}</p>
        <p className="muted small">Earth in view {up.toFixed(0)}% of the next 29.5 days with libration, {f.up ? '100' : '0'}% without it.
          {sl.bestClearance > 0 && <> Highest above the skyline: {sl.bestClearance.toFixed(2)}° at {utc(sl.bestT)} UTC <button className="lib-jump" onClick={() => onSeek(sl.bestT)}>Jump to it</button></>}
        </p>
      </div>

      <div className="lib-charts">
        <figure className="lib-fig">
          <figcaption><b>Earth's wobble</b><span className="muted small">Where Earth stands overhead on the Moon. Grey: 2027 to 2029. Blue: next 29.5 days, dot each week.</span></figcaption>
          <Loop full={full} month={month} now={now} />
        </figure>
        <figure className="lib-fig">
          <figcaption><b>Earth in this site's sky</b><span className="muted small">Next 29.5 days against the terrain skyline. Blue when in view, grey when hidden. Click to jump.</span></figcaption>
          <SkyTrack sl={sl} hz={data.horizon.horizonDeg} onSeek={onSeek} />
        </figure>
      </div>
      <figure className="lib-fig wide">
        <figcaption><b>The orbit over 2027 to 2029</b><span className="muted small">Click anywhere to move the time there.</span></figcaption>
        <OrbitStrip full={full} t={tq} range={range} onSeek={onSeek} />
      </figure>
      <p className="lib-note small muted">
        Libration in longitude comes from the eccentric orbit (speed along the orbit varies, rotation does not); libration in latitude from the 6.7° tilt of the Moon's equator to its orbit.
        The Sun's latitude swings about ±1.5° because the Moon's axis is tilted 1.54° to the ecliptic, which sets polar day and night. Positions use the IAU Moon-fixed frame, so physical libration is included.
        "Mean position" holds Earth at selenographic 0°, 0° and 384,400 km.
      </p>
    </section>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'earth' | 'sun' }) {
  return (
    <div className={`lib-tile${tone ? ` ${tone}` : ''}`}>
      <span className="lib-tile-l">{label}</span>
      <b className="num">{value}</b>
      <span className="lib-tile-s">{sub}</span>
    </div>
  );
}

const W = 420, H = 260, P = { l: 38, r: 12, t: 12, b: 28 };

function Loop({ full, month, now }: { full: LibrationState[]; month: LibrationState[]; now: LibrationState }) {
  const x = (v: number) => P.l + ((v + 9) / 18) * (W - P.l - P.r), y = (v: number) => P.t + ((8 - v) / 16) * (H - P.t - P.b);
  const path = (s: LibrationState[]) => s.map((q, i) => `${i ? 'L' : 'M'}${x(q.lonDeg).toFixed(1)},${y(q.latDeg).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="lib-svg" role="img" aria-label="Sub-Earth point in selenographic longitude and latitude">
      {[-8, -4, 0, 4, 8].map((v) => <g key={`x${v}`}><line className="lib-grid" x1={x(v)} x2={x(v)} y1={P.t} y2={H - P.b} /><text className="lib-tick" x={x(v)} y={H - 10} textAnchor="middle">{v}°</text></g>)}
      {[-6, -3, 0, 3, 6].map((v) => <g key={`y${v}`}><line className="lib-grid" x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} /><text className="lib-tick" x={P.l - 6} y={y(v) + 3} textAnchor="end">{v}°</text></g>)}
      <path className="lib-cloud" d={path(full)} />
      <path className="lib-month" d={path(month)} />
      {month.filter((_, i) => i > 0 && i % 28 === 0).map((q) => <circle key={q.t} className="lib-week" cx={x(q.lonDeg)} cy={y(q.latDeg)} r={3} />)}
      <circle className="lib-now" cx={x(now.lonDeg)} cy={y(now.latDeg)} r={5.5} />
      <text className="lib-axis" x={(W + P.l) / 2} y={H - 0.5} textAnchor="middle">libration in longitude</text>
      <text className="lib-axis" x={10} y={(H - P.b) / 2} transform={`rotate(-90 10 ${(H - P.b) / 2})`} textAnchor="middle">latitude</text>
    </svg>
  );
}

function SkyTrack({ sl, hz, onSeek }: { sl: ReturnType<typeof siteLibration>; hz: number[]; onSeek: (t: number) => void }) {
  const az = unwrap(sl.track.map((p) => p.az));
  const pad = 6, a0 = Math.floor(sl.azMin - pad), a1 = Math.ceil(sl.azMax + pad);
  const sky: [number, number][] = [];
  for (let a = a0; a <= a1; a += 0.5) sky.push([a, horizonAt(hz, ((a % 360) + 360) % 360)]);
  const e0 = Math.floor(Math.min(sl.elMin, ...sky.map((s) => s[1])) - 1), e1 = Math.ceil(Math.max(sl.elMax, ...sky.map((s) => s[1])) + 1);
  const x = (a: number) => P.l + ((a - a0) / (a1 - a0 || 1)) * (W - P.l - P.r), y = (e: number) => P.t + ((e1 - e) / (e1 - e0 || 1)) * (H - P.t - P.b);
  const segs: { up: boolean; d: string }[] = [];
  let prev = '';
  sl.track.forEach((p, i) => {
    const pt = `${x(az[i]).toFixed(1)},${y(p.el).toFixed(1)}`;
    const last = segs[segs.length - 1];
    // a new segment starts at the previous point so the line stays continuous where visibility changes
    if (!last || last.up !== p.up) segs.push({ up: p.up, d: prev ? `M${prev}L${pt}` : `M${pt}` });
    else last.d += `L${pt}`;
    prev = pt;
  });
  const ticks = niceTicks(e0, e1, 5), aticks = niceTicks(a0, a1, 6);
  const pick = (ev: React.MouseEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    sl.track.forEach((_, i) => { const d = Math.abs(x(az[i]) - px); if (d < bd) { bd = d; best = i; } });
    onSeek(sl.track[best].t);
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="lib-svg clickable" role="img" aria-label="Earth's azimuth and elevation over the next lunar cycle against the skyline" onClick={pick}>
      {ticks.map((v) => <g key={`e${v}`}><line className="lib-grid" x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} /><text className="lib-tick" x={P.l - 6} y={y(v) + 3} textAnchor="end">{v}°</text></g>)}
      {aticks.map((v) => <text key={`a${v}`} className="lib-tick" x={x(v)} y={H - 10} textAnchor="middle">{((v % 360) + 360) % 360}°</text>)}
      <path className="lib-skyline" d={`M${x(a0)},${y(e0)}${sky.map(([a, e]) => `L${x(a).toFixed(1)},${y(e).toFixed(1)}`).join('')}L${x(a1)},${y(e0)}Z`} />
      {segs.map((s, i) => <path key={i} className={s.up ? 'lib-up' : 'lib-down'} d={s.d} />)}
      <circle className="lib-now" cx={x(az[0])} cy={y(sl.track[0].el)} r={5.5} />
      <text className="lib-axis" x={(W + P.l) / 2} y={H - 0.5} textAnchor="middle">azimuth</text>
      <text className="lib-axis" x={10} y={(H - P.b) / 2} transform={`rotate(-90 10 ${(H - P.b) / 2})`} textAnchor="middle">elevation</text>
    </svg>
  );
}

function OrbitStrip({ full, t, range, onSeek }: { full: LibrationState[]; t: number; range: [number, number]; onSeek: (t: number) => void }) {
  const SW = 860, RH = 62, rows: { key: 'distKm' | 'latDeg' | 'sunLatDeg'; label: string; fmt: (v: number) => string; cls: string }[] = [
    { key: 'distKm', label: 'Earth–Moon distance', fmt: (v) => `${Math.round(v / 1000)}k km`, cls: 'dist' },
    { key: 'latDeg', label: 'Libration in latitude', fmt: (v) => `${v.toFixed(1)}°`, cls: 'earth' },
    { key: 'sunLatDeg', label: "Sun's latitude", fmt: (v) => `${v.toFixed(2)}°`, cls: 'sun' },
  ];
  const L = 150, R = 12, x = (tt: number) => L + ((tt - range[0]) / (range[1] - range[0])) * (SW - L - R);
  const pick = (ev: React.MouseEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * SW;
    onSeek(Math.max(range[0], Math.min(range[1], range[0] + ((px - L) / (SW - L - R)) * (range[1] - range[0]))));
  };
  const years = [2027, 2028, 2029, 2030].map((yy) => Date.UTC(yy, 0, 1)).filter((v) => v >= range[0] && v <= range[1] - 30 * DAY);
  return (
    <svg viewBox={`0 0 ${SW} ${RH * 3 + 22}`} className="lib-svg clickable" role="img" aria-label="Earth-Moon distance, libration in latitude and the Sun's latitude over the data range" onClick={pick}>
      {rows.map((row, i) => {
        const vals = full.map((q) => q[row.key]), lo = Math.min(...vals), hi = Math.max(...vals);
        const y = (v: number) => i * RH + 6 + ((hi - v) / (hi - lo || 1)) * (RH - 14);
        const d = full.map((q, k) => `${k ? 'L' : 'M'}${x(q.t).toFixed(1)},${y(q[row.key]).toFixed(1)}`).join('');
        return (
          <g key={row.key}>
            <text className="lib-row-l" x={0} y={i * RH + 20}>{row.label}</text>
            <text className="lib-tick" x={0} y={i * RH + 36} textAnchor="start">{row.fmt(lo)} to {row.fmt(hi)}</text>
            <line className="lib-grid" x1={L} x2={SW - R} y1={i * RH + RH - 2} y2={i * RH + RH - 2} />
            <path className={`lib-row ${row.cls}`} d={d} />
          </g>
        );
      })}
      {years.map((yv) => <g key={yv}><line className="lib-grid" x1={x(yv)} x2={x(yv)} y1={0} y2={RH * 3} /><text className="lib-tick" x={x(yv) + 3} y={RH * 3 + 14}>{new Date(yv).getUTCFullYear()}</text></g>)}
      <line className="lib-nowline" x1={x(t)} x2={x(t)} y1={0} y2={RH * 3} />
    </svg>
  );
}

function niceTicks(a: number, b: number, n: number): number[] {
  const step0 = (b - a) / n, mag = 10 ** Math.floor(Math.log10(step0 || 1)), step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}
