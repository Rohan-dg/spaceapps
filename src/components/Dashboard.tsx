import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Level } from '../config/thresholds';
import type { SiteData, SiteInfo } from '../lib/data';
import { formatDuration, type Event, type Metrics } from '../lib/metrics';
import { indexAt, timeAt, type Runs, type Series } from '../lib/series';
import type { ScenarioResult } from '../lib/useScenario';
import { CalendarSync, Columns2, Earth, Globe, Icon, Pause, Play, SlidersHorizontal, Sun, SunDim, X } from './Icons';
import { stretchStart } from './TimeLeft';
import { SPEEDS } from './TimeControls';

/** Every sheet the dashboard can open. Together they hold everything the old stacked Explore page showed. */
export type DashTab = 'conditions' | 'sites' | 'horizon' | 'month' | 'slip' | 'earth' | 'libration' | 'calendar' | 'mission' | 'compare';

export const DASH_TABS: { id: DashTab; label: string; icon: ReactNode; desc: string }[] = [
  { id: 'conditions', label: 'Conditions', icon: <Icon name="gauge" size={18} />, desc: 'Time controls, sunlight and Earth visibility now, the power and radio ratings for this lunar day, and the site record.' },
  { id: 'sites', label: 'Sites', icon: <Globe size={18} />, desc: 'Every landing site with its state now and its ratings. Add your own point by coordinates.' },
  { id: 'horizon', label: 'Horizon', icon: <Icon name="mountain" size={18} />, desc: 'The terrain skyline seen from the site with the paths of the Sun and Earth. No air means no refraction: the skyline is pure geometry.' },
  { id: 'month', label: 'Next 30 days', icon: <Icon name="bars" size={18} />, desc: 'When the site is sunlit and when Earth is above the horizon. Click to jump to a time.' },
  { id: 'slip', label: 'Date slip', icon: <Icon name="slip" size={18} />, desc: 'The same site at earlier and later landing dates: how far the date can move before the power or radio rating changes.' },
  { id: 'earth', label: 'Moon vs Earth', icon: <Earth size={18} />, desc: 'This site next to the same latitude on Earth: why lunar days, shadows and sunsets need different planning.' },
  { id: 'libration', label: 'Libration & orbit', icon: <Icon name="compass" size={18} />, desc: 'Earth\'s wobble and the Moon\'s orbital variation, and what they do to Earth contact here. CSV and JSON export.' },
  { id: 'calendar', label: 'Calendar', icon: <CalendarSync size={18} />, desc: 'Sunlight and Earth visibility for every day in the data range. Click a day to jump to it.' },
  { id: 'mission', label: 'Mission plan', icon: <SlidersHorizontal size={18} />, desc: 'Mission inputs and the resulting power, communications and rover estimates.' },
  { id: 'compare', label: 'Compare', icon: <Columns2 size={18} />, desc: 'The two picked sites side by side: conditions now, the next lunar day, the long run and an overall score.' },
];

const DAY = 86400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const utc = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? 'S' : 'N'}`;
const fmtLon = (lon: number) => { const l = ((lon % 360) + 360) % 360; return l > 180 ? `${(360 - l).toFixed(3)}° W` : `${l.toFixed(3)}° E`; };
const WORD: Record<Level, string> = { green: 'Good', amber: 'Marginal', red: 'Poor' };
const BARS: Record<Level, number> = { green: 3, amber: 2, red: 1 };
const sgn = (x: number, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`;

/** Big light-weight countdown. Leading zeros are dimmed. */
function DotClock({ e, now }: { e: Event | null; now: number }) {
  let groups: [string, string][];
  if (!e || e.t === null) groups = [['--', 'hrs'], ['--', 'min']];
  else {
    const s = Math.max(0, Math.floor((e.t - now) / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    groups = d > 0 ? [[pad(d), d === 1 ? 'day' : 'days'], [pad(h), 'hrs'], [pad(m), 'min']] : [[pad(h), 'hrs'], [pad(m), 'min'], [pad(s % 60), 'sec']];
  }
  let lead = true;
  const out: ReactNode[] = [];
  groups.forEach(([v, u], gi) => {
    if (gi > 0) out.push(<span key={`s${gi}`} className={`dc-sep${lead ? ' dim' : ''}`}>:</span>);
    out.push(
      <span className="dc-g" key={u}>
        <span className="dc-v">
          {[...v].map((ch, i) => {
            const last = gi === groups.length - 1 && i === v.length - 1;
            if (ch !== '0' || last) lead = false;
            return <b key={i} className={lead || ch === '-' ? 'dim' : ''}>{ch}</b>;
          })}
        </span>
        <small>{u}</small>
      </span>,
    );
  });
  return <div className="dc" aria-hidden>{out}</div>;
}

/** Ring of ticks filled to `pct`, with the value in the middle (the reference's battery gauge). */
function Ring({ pct, label }: { pct: number; label: string }) {
  const N = 64, lit = Math.round((pct / 100) * N);
  return (
    <div className="ring" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <svg viewBox="0 0 120 120">
        {Array.from({ length: N }, (_, i) => {
          const a = (i / N) * Math.PI * 2 - Math.PI / 2, r0 = 46, r1 = i % 8 === 0 ? 56 : 53;
          return <line key={i} x1={60 + r0 * Math.cos(a)} y1={60 + r0 * Math.sin(a)} x2={60 + r1 * Math.cos(a)} y2={60 + r1 * Math.sin(a)}
            className={i < lit ? (i === lit - 1 ? 'tip' : 'on') : ''} />;
        })}
      </svg>
      <span className="ring-v"><b className="num">{pct.toFixed(0)}</b><small>%</small></span>
    </div>
  );
}

/** Elevation over ±36 h from the stored series (centidegrees), as a tiny line with today's point. */
function Spark({ s, el, t }: { s: Series; el: Int16Array; t: number }) {
  const th = Math.floor(t / 3600_000) * 3600_000;
  const d = useMemo(() => {
    const n = 36, pts: number[] = [];
    for (let k = 0; k <= n; k++) {
      const i = Math.floor(indexAt(s, th + (k - n / 2) * 2 * 3600_000));
      pts.push(i >= 0 && i < s.n ? el[i] / 100 : NaN);
    }
    const ok = pts.filter(isFinite);
    if (!ok.length) return null;
    const lo = Math.min(...ok, -1), hi = Math.max(...ok, 1);
    const Y = (v: number) => 18 - ((v - lo) / (hi - lo)) * 16;
    const zero = Y(0);
    return { path: pts.map((v, k) => (isFinite(v) ? `${k === 0 || !isFinite(pts[k - 1]) ? 'M' : 'L'}${(k / n) * 64},${Y(v).toFixed(1)}` : '')).join(''), zero, y: Y(pts[n / 2]) };
  }, [s, el, th]);
  if (!d) return <svg className="spark" viewBox="0 0 64 20" />;
  return (
    <svg className="spark" viewBox="0 0 64 20" aria-hidden>
      <line x1="0" x2="64" y1={d.zero} y2={d.zero} className="spark-zero" />
      <path d={d.path} />
      {isFinite(d.y) && <circle cx="32" cy={d.y} r="2" />}
    </svg>
  );
}

const Ticks = ({ frac, n = 14 }: { frac: number; n?: number }) => (
  <span className="ticks" aria-hidden>{Array.from({ length: n }, (_, i) => <i key={i} className={i < Math.round(frac * n) ? 'on' : ''} />)}</span>
);
const LevelBars = ({ level }: { level: Level }) => (
  <span className={`lvl lv-${level}`} aria-hidden>{[0, 1, 2].map((i) => <i key={i} className={i < BARS[level] ? 'on' : ''} />)}</span>
);

/** Thin glass button that opens a sheet. */
const Open = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button className="dg-open" onClick={onClick} aria-label={label} title={label}><Icon name="arrowUpRight" size={15} /></button>
);

/** The time bar: play, a 12-day track with sunlit and Earth-in-view bands and their events, speed and date. */
function TimeBar({ s, t, t0, t1, onT, playing, onPlaying, speed, onSpeed, onOpen }: {
  s: Series | null; t: number; t0: number; t1: number; onT: (t: number) => void; playing: boolean; onPlaying: (p: boolean) => void;
  speed: number; onSpeed: (s: number) => void; onOpen: () => void;
}) {
  const span = 12 * DAY;
  const start = Math.floor(t / (2 * DAY)) * 2 * DAY - 4 * DAY; // moves in 2-day jumps so the track holds still while playing
  const X = (tt: number) => ((tt - start) / span) * 100;
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const bands = useMemo(() => {
    if (!s) return null;
    const out = { sun: [] as [number, number][], earth: [] as [number, number][], ev: [] as { x: number; k: string; t: number }[] };
    const i0 = indexAt(s, start), i1 = indexAt(s, start + span);
    const take = (runs: Runs, key: 'sun' | 'earth', up: string, down: string) => {
      for (let k = 0; k < runs.length; k += 2) {
        if (runs[k + 1] < i0 || runs[k] > i1) continue;
        const a = timeAt(s, runs[k]), b = timeAt(s, runs[k + 1]);
        out[key].push([Math.max(0, X(a)), Math.min(100, X(b))]);
        if (runs[k] > 0 && a >= start) out.ev.push({ x: X(a), k: up, t: a });
        if (runs[k + 1] < s.n && b <= start + span) out.ev.push({ x: X(b), k: down, t: b });
      }
    };
    take(s.sunUp, 'sun', 'Sunrise', 'Sunset');
    take(s.earthUp, 'earth', 'Earthrise', 'Earthset');
    out.ev.sort((a, b) => a.x - b.x);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, start]);
  const seek = (clientX: number) => {
    const r = track.current?.getBoundingClientRect(); if (!r) return;
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onT(Math.max(t0, Math.min(t1, Math.round((start + f * span) / 600_000) * 600_000)));
  };
  const days = Array.from({ length: 13 }, (_, i) => start + i * DAY);
  let lastLabel = -100;
  return (
    <div className="dash-time glass" role="group" aria-label="Time">
      <button className="dt-play" onClick={() => onPlaying(!playing)} aria-pressed={playing} aria-label={playing ? 'Pause' : 'Play'} title="Play or pause (Space)">
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <div className="dt-track" ref={track} role="slider" tabIndex={0} aria-label="Time" aria-valuemin={t0} aria-valuemax={t1} aria-valuenow={Math.round(t)} aria-valuetext={`${utc(t)} UTC`}
        onPointerDown={(e) => { drag.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); onPlaying(false); seek(e.clientX); }}
        onPointerMove={(e) => { if (drag.current) seek(e.clientX); }}
        onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}
        onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.stopPropagation(); e.preventDefault(); onT(Math.max(t0, Math.min(t1, t + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? DAY : 3600_000)))); } }}>
        <div className="dt-days" aria-hidden>
          {days.map((d, i) => (
            <span key={d} style={{ left: `${X(d)}%` }} className={i % 2 ? 'odd' : ''}>
              {i < 12 && <em>{new Date(d).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })}</em>}
            </span>
          ))}
        </div>
        <div className="dt-band sun" aria-hidden>{bands?.sun.map(([a, b], i) => <i key={i} style={{ left: `${a}%`, width: `${Math.max(0.2, b - a)}%` }} />)}</div>
        <div className="dt-band earth" aria-hidden>{bands?.earth.map(([a, b], i) => <i key={i} style={{ left: `${a}%`, width: `${Math.max(0.2, b - a)}%` }} />)}</div>
        <div className="dt-ev" aria-hidden>
          {bands?.ev.map((e, i) => {
            const show = e.x - lastLabel > 7; if (show) lastLabel = e.x;
            return <span key={i} style={{ left: `${e.x}%` }} className={e.k.startsWith('Sun') ? 'sun' : 'earth'} title={`${e.k} ${utc(e.t)} UTC`}><i />{show && <em>{e.k}</em>}</span>;
          })}
        </div>
        <span className="dt-cursor" style={{ left: `${X(t)}%` }} aria-hidden><i /></span>
      </div>
      <button className="dt-pill" onClick={() => onSpeed((speed + 1) % SPEEDS.length)} title="Playback speed (click to change)">
        <b className="num">{SPEEDS[speed].label.replace(' / s', '/s')}</b>
      </button>
      <button className="dt-pill wide" onClick={onOpen} title="Date, step buttons and the full range">
        <span className="num">{utc(t)}</span><Icon name="arrowUpRight" size={14} />
      </button>
    </div>
  );
}

export interface DashProps {
  data: SiteData | null; res: ScenarioResult | null; info: SiteInfo | undefined; updating: boolean;
  t: number; tl: number; t0: number; t1: number; onT: (t: number) => void;
  playing: boolean; onPlaying: (p: boolean) => void; speed: number; onSpeed: (s: number) => void;
  goodSites: { d: SiteData; r: ScenarioResult }[]; activeCount: number; onPickSite: (id: string) => void;
  partnerName: string | null; onCompare: () => void; onPlanLaunch: () => void; onLogic: () => void;
  busy: string | null;
  sheet: DashTab | null; onSheet: (t: DashTab | null) => void; sheetBody: ReactNode;
  /** app-wide tools (search, help, about, theme), kept in the dock so the dashboard needs only one rail */
  utils: { label: string; icon: ReactNode; onClick: () => void }[];
  /** Compare, Calculator and Launch: replaces the site card column on the right; everything else stays */
  right?: ReactNode;
}

/**
 * Scientific mode's Explore view: the 3D Moon fills the screen and the figures float over it on glass. Each panel
 * shows the few numbers that matter and opens a sheet (left dock or the ↗ buttons) with the full tool behind it.
 */
export default function Dashboard(p: DashProps) {
  const { data, res, info, t, tl } = p;
  const m: Metrics | null = res?.metrics ?? null;
  const sunE = m ? (m.sunUp ? m.nextSunset : m.nextSunrise) : null;
  const earthE = m ? (m.earthUp ? m.nextEarthset : m.nextEarthrise) : null;
  const tabs = DASH_TABS.filter((x) => x.id !== 'compare' || p.partnerName);
  // the sheet stays mounted for its closing animation, showing the last section until it has slid away
  const open = p.sheet ? DASH_TABS.find((x) => x.id === p.sheet) ?? null : null;
  const [last, setLast] = useState(open);
  if (open && open !== last) setLast(open);
  const cur = open ?? last;
  const closing = !open && !!last;
  const lastBody = useRef<ReactNode>(null);
  if (open) lastBody.current = p.sheetBody;
  useEffect(() => {
    if (!closing) return;
    const k = window.setTimeout(() => setLast(null), 260);
    return () => window.clearTimeout(k);
  }, [closing]);
  // Earth contact card: how much of the current contact (or blackout) stretch is left
  const eStart = data && m ? stretchStart(data.series.earthUp, data.series, tl) : null;
  const eFrac = earthE?.t != null && eStart != null ? Math.max(0, Math.min(1, (earthE.t - t) / (earthE.t - eStart))) : null;
  const eLeft = earthE?.t != null ? Math.max(0, earthE.t - t) : null;
  const goodIds = new Set(p.goodSites.map((x) => x.d.info.id));
  // the section box on the left: opens from the Sites card's width, animates its width between sections (and back
  // to the card's width as it closes), with the content sliding in the direction of travel along the dock
  const sheetEl = useRef<HTMLElement>(null);
  const prev = useRef<{ w: number; i: number } | null>(null);
  useLayoutEffect(() => {
    const el = sheetEl.current;
    if (!el) { prev.current = null; return; }
    const reduce = (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || innerWidth <= 900;
    const cardW = el.parentElement?.querySelector<HTMLElement>('.dash-sites')?.getBoundingClientRect().width;
    const ease = 'cubic-bezier(0.32, 0.72, 0, 1)';
    if (!p.sheet) {
      if (prev.current && cardW && !reduce) el.animate([{ width: `${prev.current.w}px` }, { width: `${cardW}px` }], { duration: 260, easing: ease, fill: 'forwards' });
      prev.current = null;
      return;
    }
    const i = DASH_TABS.findIndex((x) => x.id === p.sheet);
    el.getAnimations().forEach((a) => { if (!(a instanceof CSSAnimation)) a.cancel(); });
    const to = el.getBoundingClientRect().width;
    const from = prev.current ? prev.current.w : cardW ?? to;
    el.style.setProperty('--dy', String(prev.current && i < prev.current.i ? -1 : 1));
    prev.current = { w: to, i };
    if (Math.abs(from - to) < 1 || reduce) return;
    el.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: 520, easing: ease });
  }, [p.sheet]);

  return (
    <>
      <nav className="dash-dock glass" aria-label="Open a panel">
        {tabs.map((x) => (
          <button key={x.id} className={p.sheet === x.id ? 'on' : ''} aria-pressed={p.sheet === x.id} aria-label={x.label} disabled={!data && x.id !== 'sites'}
            onClick={() => p.onSheet(p.sheet === x.id ? null : x.id)}>{x.icon}<span className="dock-tip">{x.label}</span></button>
        ))}
        {p.utils.length > 0 && <span className="dock-sep" aria-hidden />}
        {p.utils.map((x) => (
          <button key={x.label} className="util" aria-label={x.label} onClick={x.onClick}>{x.icon}<span className="dock-tip">{x.label}</span></button>
        ))}
      </nav>

      <header className="dash-hero" aria-live="off">
        <p className="dh-k">{info ? <><b>{info.short || info.name}</b> {m ? (m.sunUp ? 'sunset in' : 'sunrise in') : 'loading'}</> : 'No site selected'}</p>
        <DotClock e={sunE} now={t} />
        <p className="sr-only">{sunE?.t != null ? `${m?.sunUp ? 'Sunset' : 'Sunrise'} in ${formatDuration(sunE.t - t)}` : ''}</p>
        <div className="dh-chips">
          {m && info ? <>
            <span className={`chip${m.sunUp ? ' on' : ''}`}>{m.sunUp ? <Sun size={13} /> : <SunDim size={13} />}<span className="num">{sgn(m.sky.sun.el)}°</span> {m.sunUp ? 'lit' : 'shadow'}</span>
            <span className="chip num">{sunE?.t != null ? `${utc(sunE.t)} UTC` : sunE?.beyondRange ? 'after the data ends' : 'never'}</span>
          </> : <span className="chip">Pick a site on the Moon or open Sites</span>}
        </div>
      </header>

      {p.right ?? (
      <aside className="dash-side" aria-label="Selected site">
        <div className="ds-top">
          <span className="pill num">UTC <b>{utc(t).slice(11)}</b></span>
          <span className="pill num">{utc(t).slice(0, 10)}</span>
        </div>
        <section className={`dg glass dash-site${p.updating ? ' updating' : ''}`} aria-busy={p.updating}>
          {info && m && res && data ? <>
            <header className="dg-h">
              <div>
                <h2>{info.short || info.name}</h2>
                <p className="dg-sub">{info.mission || 'Landing site'}</p>
              </div>
              <span className={`status${m.sunUp ? ' lit' : ''}`}>{m.sunUp ? 'Sunlit' : 'In shadow'}</span>
            </header>
            <div className="dg-ring">
              <Ring pct={m.sunPct} label="Sunlit fraction, next lunar day" />
              <p>Sunlit, next lunar day<br /><span className="num">{m.longestDarkH > 0 ? `longest dark ${formatDuration(m.longestDarkH * 3600_000)}` : 'no dark spell'}</span></p>
            </div>
            <dl className="dg-grid">
              <div><dt>Sun elevation</dt><dd><b className="num">{sgn(m.sky.sun.el)}</b><small>°</small></dd><Spark s={data.series} el={data.series.sunEl} t={tl} /></div>
              <div><dt>Earth elevation</dt><dd><b className="num">{sgn(m.sky.earth.el)}</b><small>°</small></dd><Spark s={data.series} el={data.series.earthEl} t={tl} /></div>
              <div><dt>Earth in view</dt><dd><b className="num">{m.earthPct.toFixed(0)}</b><small>%</small></dd><Ticks frac={m.earthPct / 100} /></div>
              <div><dt>Skyline at Sun</dt><dd><b className="num">{m.sunHorizon.toFixed(1)}</b><small>°</small></dd><Ticks frac={Math.min(1, Math.max(0, m.sunHorizon / 10))} /></div>
              <div><dt>Power</dt><dd><b>{WORD[res.power.level]}</b></dd><LevelBars level={res.power.level} /></div>
              <div><dt>Radio to Earth</dt><dd><b>{WORD[res.comms.level]}</b></dd><LevelBars level={res.comms.level} /></div>
            </dl>
            <p className="dg-pos num">{fmtLat(info.lat)} · {fmtLon(info.lon)} · {info.siteHeightM.toFixed(0)} m</p>
            <div className="dg-actions">
              <button onClick={p.onCompare} disabled={!p.partnerName} title={p.partnerName ? 'Open the side-by-side comparison' : 'Click a second site on the Moon or in Sites'}>
                <Columns2 size={14} /> <span className="ell">{p.partnerName ? `vs ${p.partnerName}` : 'Compare'}</span>
              </button>
              <button onClick={p.onPlanLaunch}><CalendarSync size={14} /> Launch</button>
              <button onClick={p.onLogic}><SlidersHorizontal size={14} /> Logic</button>
              <Open onClick={() => p.onSheet('conditions')} label="Open Conditions" />
            </div>
          </> : (
            <div className="dg-empty">
              <h2>{info ? 'Loading site' : 'Select a site'}</h2>
              <p>Click a site on the Moon, or open the list. Any other point on the surface can be probed and computed too.</p>
              <button onClick={() => p.onSheet('sites')}><Globe size={14} /> Browse sites</button>
            </div>
          )}
          {p.busy && <p className="dg-busy" role="status"><span className="loader" aria-hidden /> {p.busy}</p>}
        </section>

        {m && earthE && (
          <section className="dg glass dash-alert" aria-label="Earth contact">
            <header className="dg-h"><p><b>{m.earthUp ? 'Earthset' : 'Earthrise'}</b> {m.earthUp ? 'end of direct contact' : 'blackout ends'}</p><Open onClick={() => p.onSheet('slip')} label="Open Date slip" /></header>
            <p className="da-big">
              {eLeft === null ? <b className="da-none">{m.earthUp ? 'Always in view' : 'Never in view'}<small>{earthE.beyondRange ? 'no change before the data ends' : 'a relay is needed'}</small></b> : eLeft >= DAY
                ? <><b className="num">{Math.floor(eLeft / DAY)}</b><small>d</small> <b className="num">{pad(Math.floor((eLeft % DAY) / 3600_000))}</b><small>h</small></>
                : <><b className="num">{pad(Math.floor(eLeft / 3600_000))}:{pad(Math.floor((eLeft % 3600_000) / 60_000))}</b><small>h</small></>}
            </p>
            <p className="da-sub num">Earth in view {m.earthPct.toFixed(0)}% of the lunar day{m.longestNoCommH > 0 ? ` · longest gap ${formatDuration(m.longestNoCommH * 3600_000)}` : ''}</p>
            {eFrac !== null && <div className="da-track" aria-hidden><Ticks frac={eFrac} n={40} /></div>}
            <button className="da-link" onClick={() => p.onSheet('slip')}>If the landing slips <Icon name="arrowUpRight" size={13} /></button>
          </section>
        )}
      </aside>
      )}

      <section className="dg glass dash-sites" aria-label="Good power, next lunar day">
        <header className="dg-h"><p><b>Sites</b> good power, next lunar day</p><Open onClick={() => p.onSheet('sites')} label="Open Sites" /></header>
        <p className="ds-count"><b className="num">{p.goodSites.length}</b><small className="num">/{p.activeCount}</small></p>
        <div className="ds-dots" aria-hidden>
          {Array.from({ length: p.activeCount }, (_, i) => <i key={i} className={i < goodIds.size ? 'on' : ''} />)}
        </div>
        <ol className="ds-list">
          {p.goodSites.slice(0, 3).map((x) => (
            <li key={x.d.info.id}><button onClick={() => p.onPickSite(x.d.info.id)} className={x.d.info.id === info?.id ? 'on' : ''}>{x.d.info.short || x.d.info.name}</button><span className="num">{x.r.metrics.sunPct.toFixed(0)}%</span></li>
          ))}
        </ol>
      </section>

      <TimeBar s={data?.series ?? null} t={t} t0={p.t0} t1={p.t1} onT={p.onT} playing={p.playing} onPlaying={p.onPlaying} speed={p.speed} onSpeed={p.onSpeed} onOpen={() => p.onSheet('conditions')} />

      {cur && (
        <section ref={sheetEl} className={`dash-sheet glass sh-${cur.id}${closing ? ' closing' : ''}`} role="dialog" aria-label={cur.label}>
          <header className="sh-head">
            <span className="sh-ico" aria-hidden>{cur.icon}</span>
            <div className="sh-title">
              <h2>{cur.label}</h2>
              <p className="sh-desc">{cur.desc}</p>
            </div>
            <button className="sh-close" onClick={() => p.onSheet(null)} aria-label="Close panel" title="Close (Esc)"><X size={16} /></button>
          </header>
          <div className="sh-body" key={cur.id}>{open ? p.sheetBody : lastBody.current}</div>
        </section>
      )}
    </>
  );
}
