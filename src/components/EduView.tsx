/**
 * Education mode: the 3D Moon fills the screen and every mission point sits on it. Clicking a point opens a
 * pop-up card about it; points can be strung into a rover path, and the path is checked for battery, sunlight
 * and contact with Earth (lib/pathPlan.ts, the Scientific mission model under the hood).
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SiteData, SiteInfo, SitesDoc } from '../lib/data';
import { loadSite } from '../lib/data';
import { indexAt, isUp } from '../lib/series';
import { EDU_ROVER, bestStart, evaluatePath, fmtDuration, type Check, type Level, type PathReport, type Stop } from '../lib/pathPlan';
import { gcDistanceKm } from '../lib/mission';
import { CalendarSync, ChevronRight, CircleHelp, Contrast, Earth, Icon, Info, Play, Plus, Sun, X } from './Icons';
import { LogoMark } from './Logo';
import { Loading } from './Help';

const MoonView = lazy(() => import('./MoonView'));

const STATUS: Record<string, string> = {
  landed: 'Landed', crashed: 'Crashed', impact: 'Impact', planned: 'Planned landing', target: 'Planned site of a failed landing',
  candidate: 'Candidate landing region', reference: 'Reference point',
};
const PROGRAM: Record<string, string> = {
  artemis: 'NASA Artemis', clps: 'NASA Commercial Lunar Payload Services', apollo: 'NASA Apollo', nasa: 'NASA',
  commercial: 'Commercial', international: 'International', reference: 'Reference',
};
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const fmtLat = (x: number) => `${Math.abs(x).toFixed(2)}° ${x < 0 ? 'S' : 'N'}`;
const fmtLon = (x: number) => { const l = ((((x + 180) % 360) + 360) % 360) - 180; return `${Math.abs(l).toFixed(2)}° ${l < 0 ? 'W' : 'E'}`; };

interface Props {
  doc: SitesDoc; sites: SiteInfo[]; t: number; range: [number, number];
  selectedId: string; onSelect: (id: string) => void;
  onScientific: () => void; onTour: () => void; onAbout: () => void; onRover: () => void; onTheme: () => void; themeName: string;
}

export default function EduView({ doc, sites, t, range, selectedId, onSelect, onScientific, onTour, onAbout, onRover, onTheme, themeName }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [building, setBuilding] = useState(false);
  const [start, setStart] = useState(() => Math.max(range[0], Math.min(range[1], t)));
  const [loaded, setLoaded] = useState<Record<string, SiteData>>({});
  const [frame, setFrame] = useState<{ pts: { lat: number; lon: number }[]; n: number } | null>(null);
  const byId = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

  // load what the open card and the path need (each site's skyline and Sun/Earth series)
  const need = useMemo(() => [...new Set([...(open ? [open] : []), ...path])], [open, path]);
  useEffect(() => {
    let live = true;
    for (const id of need) if (!loaded[id]) loadSite(id).then((d) => { if (live) setLoaded((m) => (m[id] ? m : { ...m, [id]: d })); }, () => {});
    return () => { live = false; };
  }, [need, loaded]);

  const pick = useCallback((id: string) => {
    onSelect(id);
    setOpen(id);
    if (building) setPath((p) => (p[p.length - 1] === id ? p : [...p, id]));
  }, [onSelect, building]);
  const toggleStop = (id: string) => setPath((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const removeAt = (i: number) => setPath((p) => p.filter((_, k) => k !== i));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.chooser-backdrop, [role="dialog"][aria-modal="true"]')) return;
      if (open) setOpen(null); else if (building) setBuilding(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, building]);

  // the path check runs once every stop's data is in
  const stops = useMemo<Stop[] | null>(() => {
    if (path.length < 2) return null;
    const out: Stop[] = [];
    for (const id of path) {
      const d = loaded[id]; if (!d) return null;
      out.push({ id, name: d.info.short || d.info.name, lat: d.info.lat, lon: d.info.lon, heightM: d.horizon.siteHeightM, horizonDeg: d.horizon.horizonDeg });
    }
    return out;
  }, [path, loaded]);
  const report = useMemo<PathReport | null>(() => (stops ? evaluatePath(stops, start) : null), [stops, start]);

  const openSite = open ? byId.get(open) ?? null : null;
  const popup = openSite ? (
    <PointCard s={openSite} d={loaded[openSite.id] ?? null} t={t} doc={doc} inPath={path.includes(openSite.id)}
      order={path.indexOf(openSite.id)} prev={path.length && path[path.length - 1] !== openSite.id ? byId.get(path[path.length - 1]) ?? null : null}
      onToggle={() => toggleStop(openSite.id)} onClose={() => setOpen(null)} />
  ) : null;

  return (
    <div className={`edu${path.length ? ' has-path' : ''}`}>
      <div className="edu-moon">
        <Suspense fallback={<div className="moon moon-wait"><Loading label="Loading 3D view" /></div>}>
          <MoonView sites={sites} selectedId={selectedId} t={t} onSelect={pick} expert={false} minimal
            pathIds={path} popupAt={openSite ? { lat: openSite.lat, lon: openSite.lon, hM: openSite.siteHeightM ?? 0 } : null} popup={popup}
            onGroundClick={() => setOpen(null)} frame={frame} />
        </Suspense>
      </div>

      <header className="edu-top">
        <div className="edu-brand"><LogoMark size={22} /><span>Sol Teris</span></div>
        <div className="ui-toggle seg" role="radiogroup" aria-label="Interface">
          <button role="radio" aria-checked onClick={() => {}} title="Learn the science: for students and classrooms">Education</button>
          <button role="radio" aria-checked={false} onClick={onScientific} title="Full mission-planning tools">Scientific</button>
        </div>
        <button className="edu-rover" onClick={onRover} title="Pick a real Moon rover, drive it, collect ice and keep power and Earth contact"><Play size={14} /> <span>Drive a rover</span></button>
        <div className="edu-actions">
          <button onClick={onTour} aria-label="Take the tour" title="Take the tour"><CircleHelp size={16} /></button>
          <button onClick={onAbout} aria-label="About" title="About this app and its data"><Info size={16} /></button>
          <button onClick={onTheme} aria-label={`Switch to ${themeName === 'dark' ? 'light' : 'dark'} theme`} title="Light / dark"><Contrast size={16} /></button>
        </div>
      </header>

      <p className="edu-hint" aria-live="polite">
        {building
          ? path.length === 0 ? 'Click mission points in the order the rover should visit them.' : path.length === 1 ? 'Now click the next point to drive to.' : 'Keep clicking to add stops, or press Done.'
          : 'Every dot is a mission point. Click one to learn about it. Drag to spin the Moon, scroll to zoom.'}
      </p>

      <div className="edu-dock">
        <button className={`edu-build${building ? ' on' : ''}`} aria-pressed={building} onClick={() => setBuilding((b) => !b)}>
          {building ? 'Done adding stops' : path.length ? 'Add more stops' : 'Plan a rover path'}
        </button>
        {path.length > 0 && <button className="edu-clear" onClick={() => { setPath([]); setBuilding(false); }}>Clear path</button>}
      </div>

      {path.length > 0 && (
        <PathPanel path={path} byId={byId} report={report} waiting={path.length >= 2 && !report} start={start} range={range} stops={stops}
          onShow={() => setFrame((f) => ({ pts: path.map((id) => byId.get(id)).filter((x): x is SiteInfo => !!x), n: (f?.n ?? 0) + 1 }))}
          onStart={setStart} onRemove={removeAt} onOpen={(id) => { onSelect(id); setOpen(id); }} />
      )}
    </div>
  );
}

/* ---------- the pop-up card for one mission point ---------- */
function PointCard({ s, d, t, doc, inPath, order, prev, onToggle, onClose }: {
  s: SiteInfo; d: SiteData | null; t: number; doc: SitesDoc; inPath: boolean; order: number; prev: SiteInfo | null; onToggle: () => void; onClose: () => void;
}) {
  const now = useMemo(() => {
    if (!d) return null;
    const i = indexAt(d.series, t);
    if (i < 0 || i >= d.series.n) return null;
    return { sun: isUp(d.series.sunUp, i), earth: isUp(d.series.earthUp, i) };
  }, [d, t]);
  const yrs = `${doc.range.start.slice(0, 4)}–${doc.range.end.slice(0, 4)}`;
  const facts: ReactNode[] = [];
  if (s.status) facts.push(<span key="st">{STATUS[s.status] ?? s.status}{s.date ? `, ${s.date}` : ''}</span>);
  if (s.program && PROGRAM[s.program]) facts.push(<span key="pr">{PROGRAM[s.program]}</span>);
  return (
    <div className="edu-card" role="dialog" aria-label={s.name} onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <div>
          <h2>{s.name}</h2>
          {s.mission && s.mission !== s.name && <p className="edu-card-mission">{s.mission}</p>}
        </div>
        <button className="edu-x" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </header>
      {facts.length > 0 && <p className="edu-card-facts">{facts}</p>}
      {s.description && <p className="edu-card-desc">{s.description}</p>}
      <dl className="edu-card-stats">
        <div><dt><Sun size={15} /> Sunlight</dt><dd><b className="num">{s.stats.sunPct.toFixed(0)}%</b> of the time</dd></div>
        <div><dt><Earth size={15} /> Earth in view</dt><dd><b className="num">{s.stats.earthPct.toFixed(0)}%</b> of the time</dd></div>
      </dl>
      <p className="edu-card-now">
        {now ? <>On {day(t)}: {now.sun ? 'the Sun is up' : 'it is dark'}, and Earth is {now.earth ? 'in view' : 'hidden'}.</> : d ? null : 'Loading conditions…'}
        <span className="dim"> Shares are over {yrs}, from NASA terrain at {fmtLat(s.lat)}, {fmtLon(s.lon)}.</span>
      </p>
      <div className="edu-card-actions">
        <button className={inPath ? '' : 'primary'} onClick={onToggle}>
          {inPath ? <><X size={14} /> Remove stop {order + 1} from the path</> : <><Plus size={14} /> Add to rover path</>}
        </button>
        {!inPath && prev && <span className="dim num">{gcDistanceKm(prev, s).toFixed(0)} km from {prev.short || prev.name}</span>}
      </div>
    </div>
  );
}

/* ---------- the path panel: the Scientific dashboard's right-hand column of glass cards ---------- */
const WORD: Record<Level, string> = { ok: 'Good', risky: 'Marginal', no: 'Fails' };
const STATUS_WORD: Record<Level, string> = { ok: 'Possible', risky: 'Risky', no: 'Not possible' };
const BARS: Record<Level, number> = { ok: 3, risky: 2, no: 1 };
const LevelBars = ({ level }: { level: Level }) => (
  <span className={`lvl lv-${level}`} aria-hidden>{[0, 1, 2].map((i) => <i key={i} className={i < BARS[level] ? 'on' : ''} />)}</span>
);
const shortDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);
const kmStr = (km: number) => km.toFixed(km < 10 ? 1 : 0);

function PathPanel({ path, byId, report, waiting, start, range, stops, onShow, onStart, onRemove, onOpen }: {
  path: string[]; byId: Map<string, SiteInfo>; report: PathReport | null; waiting: boolean; start: number; range: [number, number]; stops: Stop[] | null;
  onShow: () => void; onStart: (t: number) => void; onRemove: (i: number) => void; onOpen: (id: string) => void;
}) {
  const [min, setMin] = useState(false);
  // "find the best day": tries a start every 2 days for a year from the chosen date
  const [search, setSearch] = useState<{ key: string; state: 'busy' | 'none' | 'same' } | null>(null);
  const key = path.join('|');
  const findBest = () => {
    if (!stops) return;
    setSearch({ key, state: 'busy' });
    window.setTimeout(() => {
      const to = Math.min(range[1], start + 365 * 86400_000);
      const best = bestStart(stops, start, to, 2);
      if (!best || best.report.overall.level === 'no') { setSearch({ key, state: 'none' }); return; }
      if (best.t === start) { setSearch({ key, state: 'same' }); return; }
      setSearch(null); onStart(best.t);
    }, 30);
  };
  const found = search && search.key === key ? search.state : null;
  const arrive = report && !report.tooFar ? report.legs[report.legs.length - 1].arrive : null;
  return (
    <aside className={`edu-path${min ? ' min' : ''}`} aria-label="Rover path">
      <section className="edu-pg">
        <header className="edu-pg-h">
          <div>
            <h2>Rover path</h2>
            <p className="edu-pg-sub num">{path.length} {path.length === 1 ? 'stop' : 'stops'}{report ? ` · ${kmStr(report.km)} km` : ''}</p>
          </div>
          {report && <span className={`edu-status ${report.overall.level}`}>{STATUS_WORD[report.overall.level]}</span>}
        </header>
        {!min && <ol className="edu-stops">
          {path.map((id, i) => {
            const s = byId.get(id), leg = report?.legs[i - 1];
            return (
              <li key={`${id}-${i}`}>
                {i > 0 && <span className="edu-leg num">{leg ? `${kmStr(leg.km)} km · ${fmtDuration(leg.hours)}` : ''}</span>}
                <div className="edu-stop">
                  <b className="path-n num">{i + 1}</b>
                  <button className="edu-stop-name" onClick={() => onOpen(id)}>{s?.short || s?.name || id}</button>
                  <button className="edu-stop-x" onClick={() => onRemove(i)} aria-label={`Remove ${s?.name ?? id}`} title="Remove stop"><X size={13} /></button>
                </div>
              </li>
            );
          })}
        </ol>}
        {!min && path.length < 2 && <p className="edu-pg-note">Add at least one more stop to check the drive.</p>}
        {!min && waiting && <p className="edu-pg-note"><span className="loader" aria-hidden /> Checking the drive…</p>}
        <div className="edu-pg-actions">
          <button onClick={onShow} title="Fly the camera to see the whole path"><Icon name="expand" size={14} /> Show path</button>
          <button className="edu-round" onClick={() => setMin((m) => !m)} aria-expanded={!min} aria-label={min ? 'Show path details' : 'Hide path details'} title={min ? 'Show details' : 'Hide details'}>
            <ChevronRight size={15} style={{ transform: `rotate(${min ? 90 : -90}deg)` }} />
          </button>
        </div>
      </section>

      {!min && report && <>
        <section className="edu-pg">
          <header className="edu-pg-h"><p><b>Drive</b> {report.tooFar ? 'longer than the simulation runs' : `arrives ${shortDate(arrive!)}, ${hhmm(arrive!)} UTC`}</p></header>
          <div className="edu-big">
            <span><b className="num">{kmStr(report.km)}</b><small>km</small></span>
            {!report.tooFar && (report.hours < 48
              ? <span><b className="num">{report.hours.toFixed(report.hours < 10 ? 1 : 0)}</b><small>h driving</small></span>
              : <span><b className="num">{(report.hours / 24).toFixed(report.hours < 240 ? 1 : 0)}</b><small>days driving</small></span>)}
          </div>
          <p className="edu-pg-text">{report.overall.detail}</p>
          <label className="edu-start"><span>Leave on</span>
            <input type="date" value={day(start)} min={day(range[0])} max={day(range[1])}
              onChange={(e) => { const v = Date.parse(`${e.target.value}T00:00:00Z`); if (isFinite(v)) onStart(Math.max(range[0], Math.min(range[1], v))); }} />
          </label>
          {!report.tooFar && (report.overall.level !== 'ok' || found) && (
            <div className="edu-best">
              {found !== 'busy' && found !== 'same' && report.overall.level !== 'ok' && <button onClick={findBest}><CalendarSync size={14} /> Find a better day to leave</button>}
              {found === 'busy' && <span><span className="loader" aria-hidden /> Trying every other day for a year…</span>}
              {found === 'none' && <span>No start date in the next year makes this path work. Try fewer stops or stops closer together.</span>}
              {found === 'same' && <span>This is already the best day in the next year.</span>}
            </div>
          )}
        </section>

        <section className="edu-pg">
          <header className="edu-pg-h"><p><b>Checks</b> along the whole drive</p></header>
          <dl className="edu-checks">
            <CheckRow label="Battery" c={report.battery} />
            <CheckRow label="Sunlight" c={report.sunlight} />
            <CheckRow label="Earth contact" c={report.earth} />
          </dl>
        </section>

        <section className="edu-pg">
          <header className="edu-pg-h"><p><b>Battery</b> charge on the way</p></header>
          <BatteryChart r={report} start={start} />
          <p className="edu-pg-foot">
            The rover drives non-stop at {EDU_ROVER.speedKmH} km/h with a {(EDU_ROVER.batteryWh / 1000).toFixed(0)} kWh battery and {EDU_ROVER.panelM2} m² of solar panels.
            It uses {EDU_ROVER.hotelW} W for heaters, computers and radio, plus {EDU_ROVER.driveW} W to drive. Sun and Earth positions are real for the date you pick;
            the hills that block them are measured at each stop. The path is a straight line between stops, so craters and steep slopes on the way are not checked.
          </p>
        </section>
      </>}
    </aside>
  );
}

function CheckRow({ label, c }: { label: string; c: Check }) {
  return (
    <div className={`edu-check ${c.level}`}>
      <dt>{label}</dt>
      <dd><b>{c.title.charAt(0).toUpperCase() + c.title.slice(1)}</b><span className="sr-only"> ({WORD[c.level]})</span></dd>
      <LevelBars level={c.level} />
      <p>{c.detail}</p>
    </div>
  );
}

/** Battery charge over the drive, with the dark stretches shaded and the stops ticked. */
function BatteryChart({ r, start }: { r: PathReport; start: number }) {
  const W = 300, H = 76, { tl } = r, n = tl.n;
  const x = (i: number) => (i / Math.max(1, n - 1)) * W, y = (p: number) => H - 4 - (p / 100) * (H - 8);
  let d = '';
  for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(tl.battPct[i]).toFixed(1)}`;
  const dark: [number, number][] = [];
  for (let i = 0; i < n; i++) if (!tl.sunUp[i]) { if (dark.length && dark[dark.length - 1][1] === i - 1) dark[dark.length - 1][1] = i; else dark.push([i, i]); }
  const spanMs = (n - 1) * tl.stepMs;
  const reserveY = y(EDU_ROVER.reservePct);
  return (
    <figure className="edu-chart">
      <div className="edu-chart-figs num">
        <span><b>{tl.minPct.toFixed(0)}</b><small>% lowest</small></span>
        <span><b>{tl.endPct.toFixed(0)}</b><small>% at the end</small></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Battery from ${tl.battPct[0].toFixed(0)}% to ${tl.endPct.toFixed(0)}%, lowest ${tl.minPct.toFixed(0)}%`}>
        {dark.map(([a, b]) => <rect key={a} x={x(a)} y={0} width={Math.max(1, x(b) - x(a))} height={H} className="dark" />)}
        <line x1={0} x2={W} y1={reserveY} y2={reserveY} className="reserve" />
        {r.legs.slice(0, -1).map((l) => { const f = (l.arrive - start) / spanMs; return f > 0 && f < 1 ? <line key={l.arrive} x1={f * W} x2={f * W} y1={0} y2={H} className="stop" /> : null; })}
        <path d={d} className="batt" />
      </svg>
      <div className="edu-chart-axis num"><span>{shortDate(start)}</span><span>{shortDate(start + spanMs)}</span></div>
      <figcaption className="edu-chart-key"><span><i className="k-dark" />No sunlight</span><span><i className="k-res" />{EDU_ROVER.reservePct}% reserve</span><span><i className="k-stop" />Stop</span></figcaption>
    </figure>
  );
}
