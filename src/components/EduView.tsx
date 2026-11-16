/**
 * Education mode: the 3D Moon fills the screen and every mission point sits on it. Clicking a point opens a
 * pop-up card about it; points can be strung into a rover path, and the path is checked for battery, sunlight
 * and contact with Earth (lib/pathPlan.ts, the Scientific mission model under the hood).
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { SiteData, SiteInfo, SitesDoc } from '../lib/data';
import { loadSite } from '../lib/data';
import { EDU_ROVER, bestStart, evaluatePath, fmtDuration, type Level, type PathReport, type Stop } from '../lib/pathPlan';
import { arrivalCharge, type BatteryPoint, type BatteryRange } from '../lib/educationRange';
import { CircleCheck, CircleHelp, Contrast, Earth, Info, OctagonX, Play, Plus, Sun, TriangleAlert, X } from './Icons';
import { LogoMark } from './Logo';
import { Loading } from './Help';

const MoonView = lazy(() => import('./MoonView'));

const distance = (km: number) => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
const rangeText = (r?: BatteryRange) => !r ? 'Calculating…' : r.maxKm === 0 ? 'No driving range' : Math.abs(r.maxKm - r.minKm) < 0.05 ? `Up to ${distance(r.maxKm)}` : `${distance(r.minKm)}–${distance(r.maxKm)}`;
const LevelIcon = ({ level }: { level: Level }) => level === 'ok' ? <CircleCheck size={18} /> : level === 'risky' ? <TriangleAlert size={18} /> : <OctagonX size={18} />;

interface Props {
  doc: SitesDoc; sites: SiteInfo[]; t: number; range: [number, number];
  selectedId: string; onSelect: (id: string) => void;
  onScientific: () => void; onTour: () => void; onAbout: () => void; onRover: () => void; onTheme: () => void; themeName: string;
}

export default function EduView({ sites, t, range, selectedId, onSelect, onScientific, onTour, onAbout, onRover, onTheme, themeName }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [building, setBuilding] = useState(false);
  const [start, setStart] = useState(() => Math.max(range[0], Math.min(range[1], t)));
  const [loaded, setLoaded] = useState<Record<string, SiteData>>({});
  const [chargePct, setChargePct] = useState(EDU_ROVER.startPct);
  const [batteryRanges, setBatteryRanges] = useState<BatteryRange[]>([]);
  const receiveRanges = useCallback((ranges: BatteryRange[]) => setBatteryRanges(ranges), []);
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
    if (building) {
      setOpen(null);
      setPath((p) => (p.includes(id) ? p.filter((point) => point !== id) : [...p, id]));
    } else setOpen(id);
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
  const rover = useMemo(() => ({ ...EDU_ROVER, startPct: chargePct }), [chargePct]);
  const report = useMemo<PathReport | null>(() => (stops ? evaluatePath(stops, start, rover) : null), [stops, start, rover]);
  const batteryPoints = useMemo<BatteryPoint[]>(() => sites.map((s) => {
    const stop = path.indexOf(s.id);
    return { id: s.id, lat: s.lat, lon: s.lon, chargePct: stop < 0 ? chargePct : arrivalCharge(report, stop, chargePct) };
  }), [sites, path, report, chargePct]);

  const openSite = !building && open ? byId.get(open) ?? null : null;
  const popup = openSite ? (
    <PointCard s={openSite} battery={batteryRanges.find((r) => r.id === openSite.id)} charge={batteryPoints.find((p) => p.id === openSite.id)?.chargePct ?? null} inPath={path.includes(openSite.id)}
      order={path.indexOf(openSite.id)}
      onToggle={() => toggleStop(openSite.id)} onClose={() => setOpen(null)} />
  ) : null;

  return (
    <div className={`edu${path.length ? ' has-path' : ''}${openSite ? ' has-card' : ''}`}>
      <div className="edu-moon">
        <Suspense fallback={<div className="moon moon-wait"><Loading label="Loading 3D view" /></div>}>
          <MoonView sites={sites} selectedId={selectedId} t={t} onSelect={pick} expert={false} minimal
            pathIds={path} batteryPoints={batteryPoints} onBatteryRanges={receiveRanges}
            popupAt={openSite ? { lat: openSite.lat, lon: openSite.lon, hM: openSite.siteHeightM ?? 0 } : null} popup={popup}
            onGroundClick={() => setOpen(null)} frame={frame} />
        </Suspense>
      </div>

      <header className="edu-top">
        <div className="edu-brand"><LogoMark size={22} /><span>Sol Teris</span></div>
        <div className="ui-toggle seg" role="radiogroup" aria-label="Interface">
          <button role="radio" aria-checked onClick={() => {}} title="Learn the science: for students and classrooms">Education</button>
          <button role="radio" aria-checked={false} onClick={onScientific} title="Full mission-planning tools">Scientific</button>
        </div>
        <div className="edu-actions">
          <button onClick={onRover} title="Drive RASSOR, collect ice samples and keep power and Earth contact"><Play size={14} /> <span>Drive a rover</span></button>
          <button onClick={onTour} aria-label="Take the tour" title="Take the tour"><CircleHelp size={16} /></button>
          <button onClick={onAbout} aria-label="About" title="About this app and its data"><Info size={16} /></button>
          <button onClick={onTheme} aria-label={`Switch to ${themeName === 'dark' ? 'light' : 'dark'} theme`} title="Light / dark"><Contrast size={16} /></button>
        </div>
      </header>

      <p className="edu-hint" aria-live="polite">
        {building
          ? 'Click points to add stops in order. Click a selected point again to remove it.'
          : 'Every dot is a mission point. Click one to learn about it. Drag to spin the Moon, scroll to zoom.'}
      </p>

      <div className="edu-dock">
        <label className="edu-charge">Battery available <b>{chargePct}%</b>
          <input type="range" min="0" max="100" step="5" value={chargePct} aria-label="Battery available"
            onChange={(e) => setChargePct(Number(e.target.value))} />
          <small>Blue rings show one-way reach. Zoom in to see them; hills can shorten the range. A 20% reserve is kept.</small>
        </label>
        <button className={`edu-build${building ? ' on' : ''}`} aria-pressed={building} onClick={() => { setOpen(null); setBuilding((b) => !b); }}>
          {building ? 'Done adding stops' : path.length ? 'Add more stops' : 'Plan a rover path'}
        </button>
        {path.length > 0 && <button className="edu-clear" onClick={() => { setPath([]); setBuilding(false); }}>Clear path</button>}
      </div>

      {path.length > 0 && (
        <PathPanel path={path} byId={byId} report={report} waiting={path.length >= 2 && !report} start={start} range={range} stops={stops} chargePct={chargePct}
          onShow={() => setFrame((f) => ({ pts: path.map((id) => byId.get(id)).filter((x): x is SiteInfo => !!x), n: (f?.n ?? 0) + 1 }))}
          onStart={setStart} onRemove={removeAt} onOpen={pick} />
      )}
    </div>
  );
}
/* ---------- the pop-up card for one mission point ---------- */
function PointCard({ s, battery, charge, inPath, order, onToggle, onClose }: {
  s: SiteInfo; battery?: BatteryRange; charge: number | null; inPath: boolean; order: number; onToggle: () => void; onClose: () => void;
}) {
  return (
    <div className="edu-card" role="dialog" aria-label={s.short || s.name} onPointerDown={(e) => e.stopPropagation()}>
      <header><h2>{s.short || s.name}</h2><button className="edu-x" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
      <dl className="edu-card-stats">
        <div><dt><Sun size={15} /> Sunlight visibility</dt><dd><b>{Math.round(s.stats.sunPct)}%</b> of the time</dd></div>
        <div><dt><Earth size={15} /> Earth visibility</dt><dd><b>{Math.round(s.stats.earthPct)}%</b> of the time</dd></div>
        <div className="edu-card-range"><dt><span className="edu-batt" aria-hidden /> Battery range</dt>
          <dd><b>{charge === null ? 'Not reached yet' : rangeText(battery)}</b></dd>
          <small>{charge === null ? 'Check the earlier stops first.' : `${Math.round(charge)}% charge${inPath && order > 0 ? ' on arrival' : ' available'}. ${charge <= EDU_ROVER.reservePct ? 'The safety reserve is kept.' : 'One way, without recharging; varies by direction.'}`}</small>
        </div>
      </dl>
      <div className="edu-card-actions"><button className={inPath ? '' : 'primary'} onClick={onToggle}>
        {inPath ? <><X size={14} /> Remove stop {order + 1}</> : <><Plus size={14} /> Add to rover path</>}
      </button></div>
    </div>
  );
}

/* ---------- the path panel: stops, and whether the drive is possible ---------- */
function PathPanel({ path, byId, report, waiting, start, range, stops, chargePct, onShow, onStart, onRemove, onOpen }: {
  path: string[]; byId: Map<string, SiteInfo>; report: PathReport | null; waiting: boolean; start: number; range: [number, number]; stops: Stop[] | null; chargePct: number;
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
      const best = bestStart(stops, start, to, 2, 200, { ...EDU_ROVER, startPct: chargePct });
      if (!best || best.report.overall.level === 'no') { setSearch({ key, state: 'none' }); return; }
      if (best.t === start) { setSearch({ key, state: 'same' }); return; }
      setSearch(null); onStart(best.t);
    }, 30);
  };
  const found = search && search.key === key ? search.state : null;
  return (
    <aside className={`edu-path${min ? ' min' : ''}`} aria-label="Rover path">
      <header>
        <h2>Rover path</h2>
        {report && <span className={`edu-badge ${report.overall.level}`}><LevelIcon level={report.overall.level} /> {report.overall.title}</span>}
        <button className="edu-show" onClick={onShow} title="Fly the camera to see the whole path">Show path</button>
        <button className="edu-x" onClick={() => setMin((m) => !m)} aria-expanded={!min} aria-label={min ? 'Show path details' : 'Hide path details'}>{min ? '▴' : '▾'}</button>
      </header>
      {!min && <div className="edu-path-body">
        <ol className="edu-stops">
          {path.map((id, i) => {
            const s = byId.get(id), leg = report?.legs[i - 1];
            return (
              <li key={`${id}-${i}`}>
                {leg && <span className="edu-leg num">{leg.km.toFixed(leg.km < 10 ? 1 : 0)} km · {fmtDuration(leg.hours)}</span>}
                <div className="edu-stop">
                  <b className="path-n">{i + 1}</b>
                  <button className="edu-stop-name" onClick={() => onOpen(id)}>{s?.short || s?.name || id}</button>
                  <button className="edu-x" onClick={() => onRemove(i)} aria-label={`Remove ${s?.name ?? id}`}><X size={13} /></button>
                </div>
              </li>
            );
          })}
        </ol>
        {path.length < 2 && <p className="dim">Add at least one more stop to check the drive.</p>}
        {waiting && <p className="dim">Checking the drive…</p>}
        {report && <>
          <p className="edu-overall">{report.overall.detail}</p>
          {!report.tooFar && (report.overall.level !== 'ok' || found) && (
            <div className="edu-best">
              {found !== 'busy' && found !== 'same' && report.overall.level !== 'ok' && <button onClick={findBest}>Find a better day to leave</button>}
              {found === 'busy' && <span className="dim">Trying every other day for a year…</span>}
              {found === 'none' && <span className="dim">No start date in the next year makes this path work. Try fewer stops or stops closer together.</span>}
              {found === 'same' && <span className="dim">This is already the best day in the next year.</span>}
            </div>
          )}
          <dl className="edu-totals">
            <div><dt>Sunlight visibility</dt><dd>{Math.round(report.tl.sunDrivePct ?? 0)}% of the drive</dd></div>
            <div><dt>Earth visibility</dt><dd>{Math.round(report.tl.earthDrivePct ?? 0)}% of the drive</dd></div>
            <div><dt>Battery</dt><dd>{report.tl.emptyT !== null ? 'Runs out on the way' : `${Math.round(report.tl.endPct)}% left at the end`}</dd></div>
          </dl>
          <p className="edu-note dim">Each stop’s ring uses the charge left when the rover gets there. Rings estimate one-way battery range and keep a 20% reserve. The path joins stops directly; it does not avoid obstacles.</p>
        </>}
      </div>}
    </aside>
  );
}
