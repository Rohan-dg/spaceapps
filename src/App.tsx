import { CalendarSync, Calculator as CalcIcon, CircleHelp, Columns2, Contrast, Earth, Globe, Info, Pause, Play, Satellite, Search, Sparkles, SlidersHorizontal, Sun } from './components/Icons';
import CommandPalette, { type Command } from './components/CommandPalette';
import { LogoMark } from './components/Logo';
import { lazy, memo, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import About from './components/About';
import Compare, { type Scenario } from './components/Compare';
import Calculator, { initialCalc, type CalcState } from './components/Calculator';
import LaunchPlanner, { type LaunchTarget } from './components/LaunchPlanner';
import MissionCompare, { type MissionPair } from './components/MissionCompare';
import CustomSite from './components/CustomSite';
import Export from './components/Export';
import Guide from './components/Guide';
import { Loading } from './components/Help';
import Heatmap from './components/Heatmap';
import MissionPanel from './components/MissionPanel';
import { Readout, Summary } from './components/Metrics';
import Panorama from './components/Panorama';
import SiteList from './components/SiteList';
import SkyPlot from './components/SkyPlot';
import FirstPerson from './components/FirstPerson';
import TimeControls from './components/TimeControls';
import Timeline from './components/Timeline';
import { type SiteData, type SiteInfo, useAllSites, useSiteData, useSites } from './lib/data';
import { findRun, indexAt, type Runs, type Series } from './lib/series';
import { PRESETS, type Preset } from './lib/presets';
import { useTheme } from './lib/theme';
import { DEFAULT_PLAN, type MissionPlan } from './lib/mission';
import { simSnapshot, useMission } from './lib/useMission';
import { useScenario } from './lib/useScenario';

type Mode = 'explore' | 'compare' | 'calc' | 'launch';
const PLAN_KEY = 'lsc-mission-plan';
function loadPlan(t: number): MissionPlan {
  try { const s = localStorage.getItem(PLAN_KEY); if (s) return { ...DEFAULT_PLAN, departure: t, ...JSON.parse(s) }; } catch { /* storage blocked */ }
  return { ...DEFAULT_PLAN, departure: t };
}
type View = 'panorama' | 'sky' | 'first';
type Deep = 'calendar' | 'numbers' | 'mission';
const VIEWS: { id: View; label: string }[] = [
  { id: 'panorama', label: 'Panorama' },
  { id: 'sky', label: 'Sky plot' },
  { id: 'first', label: 'First person' },
];
const MoonView = lazy(() => import('./components/MoonView'));
const DEFAULT_T = Date.parse('2027-07-08T00:00:00Z'); // opening scene of docs/DEMO.md

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const t = Number(p.get('t'));
  const cmp = p.get('cmp');
  return {
    // no site is selected until the user picks one
    site: p.get('site')?.startsWith('custom') ? '' : p.get('site') ?? '',
    t: isFinite(t) && t > 0 ? t : DEFAULT_T,
    mode: (p.get('mode') as Mode) ?? 'explore',
    scenarios: cmp && !cmp.includes('custom') ? cmp.split('|').map((x) => { const [siteId, tt] = x.split('@'); return { siteId, t: Number(tt) }; }) : null,
  };
}

// Panels below the 3D view are memoised and fed a deferred time, so time playback and the 3D view stay smooth:
// React draws the urgent parts (time controls, 3D view) first and catches the panels up when it has room.
const SiteListM = memo(SiteList), HeatmapM = memo(Heatmap), PanoramaM = memo(Panorama), SkyPlotM = memo(SkyPlot);
const TimelineM = memo(Timeline), SummaryM = memo(Summary), ReadoutM = memo(Readout), ExportM = memo(Export);
/** Is the Sun / Earth up at time t, read straight from the precomputed series (no event search).
 *  The series store run-length visibility ([start, end, start, end, ...] sample indices), so this looks up the run. */
const upAt = (runs: Runs, s: Series, t: number) => findRun(runs, Math.floor(indexAt(s, t))) >= 0;

const fmtLon = (lon: number) => { const l = ((lon % 360) + 360) % 360; return l > 180 ? `${(360 - l).toFixed(3)}° W` : `${l.toFixed(3)}° E`; };
const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}`;
const when = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');

export default function App() {
  const init = useMemo(readHash, []);
  const { doc, err } = useSites();
  const theme = useTheme();
  const [siteId, setSiteId] = useState(init.site);
  const [t, setT] = useState(init.t);
  const [mode, setMode] = useState<Mode>(init.mode);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [about, setAbout] = useState(false);
  // Help opens only from its button (or the ? key), never on its own.
  const [guide, setGuide] = useState(false);
  const [palette, setPalette] = useState(false);
  // mission comparison sidebar: open state and the two missions being compared
  const [missionsOpen, setMissionsOpen] = useState(false);
  const [pair, setPair] = useState<MissionPair>({ a: null, b: null, active: 'a' });
  const toggleMissions = useCallback(() => setMissionsOpen((o) => {
    if (!o) setPair((p) => (p.a || p.b ? p : { a: siteId || 'apollo-11', b: 'griffin-1', active: 'b' }));
    return !o;
  }), [siteId]);
  const [deep, setDeep] = useState<Deep>('calendar');
  const [view, setView] = useState<View>('panorama');
  const [customs, setCustoms] = useState<SiteInfo[]>([]);
  const [launchTarget, setLaunchTarget] = useState<LaunchTarget | null>(null);
  const addCustom = useCallback((d: SiteData) => { setCustoms((c) => [...c.filter((x) => x.id !== d.info.id), d.info]); setSiteId(d.info.id); }, []);
  const planLaunchTo = useCallback((lat: number, lon: number) => { setLaunchTarget({ lat, lon, nonce: Date.now() }); setMode('launch'); window.scrollTo({ top: 0 }); }, []);
  const [scenarios, setScenarios] = useState<Scenario[]>(init.scenarios ?? [
    { siteId: 'connecting-ridge', t: init.t },
    { siteId: 'de-gerlache-rim', t: init.t },
  ]);

  const range = useMemo<[number, number]>(() => doc ? [Date.parse(doc.range.start), Date.parse(doc.range.end) - 1800000] : [0, 1], [doc]);
  const allSites = useMemo(() => [...(doc?.sites ?? []), ...customs], [doc, customs]);
  const ids = useMemo(() => allSites.map((s) => s.id), [allSites]);
  const all = useAllSites(ids);
  const live = useSiteData(siteId);
  // while a newly picked site loads, keep showing the last one (marked as updating) instead of blanking the panels
  const lastData = useRef<SiteData | null>(null);
  if (live) lastData.current = live;
  const data = live ?? (siteId ? lastData.current : null);
  const updating = !!data && data.info.id !== siteId;
  const tl = useDeferredValue(t);
  const res = useScenario(data, tl);
  const info = allSites.find((s) => s.id === siteId);
  // summary strip: how many tracked sites are sunlit / see Earth now, read from each site's precomputed series
  const tq = Math.floor(tl / 3600000) * 3600000;
  const kpi = useMemo(() => {
    let n = 0, sun = 0, earth = 0;
    for (const d of all) {
      if (!d) continue;
      n++; if (upAt(d.series.sunUp, d.series, tq)) sun++; if (upAt(d.series.earthUp, d.series, tq)) earth++;
    }
    return { n, sun, earth };
  }, [all, tq]);
  const [plan, setPlan] = useState<MissionPlan>(() => loadPlan(init.t));
  useEffect(() => { try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch { /* storage blocked */ } }, [plan]);
  const mission = useMission(data, res, plan, tl);
  const [calc, setCalc] = useState<CalcState>(initialCalc);

  useEffect(() => {
    if (playing) return;
    const p = new URLSearchParams({ t: String(Math.round(t)), mode });
    if (siteId) p.set('site', siteId);
    if (mode === 'compare') p.set('cmp', scenarios.map((s) => `${s.siteId}@${Math.round(s.t)}`).join('|'));
    try { history.replaceState(null, '', `#${p}`); } catch { /* sandboxed host */ }
  }, [siteId, t, mode, scenarios, playing]);

  const onT = useCallback((x: number) => setT(x), []);
  const pickDay = useCallback((x: number) => { setPlaying(false); setT(Math.max(range[0], Math.min(range[1], x))); }, [range]);
  const pickSite = useCallback((id: string) => { setSiteId(id); if (mode !== 'explore') setMode('explore'); }, [mode]);
  // with the mission sidebar open, a site clicked on the 3D Moon fills the active A/B slot
  const onMoonSelect = useCallback((id: string) => {
    if (missionsOpen) setPair((p) => (p.active === 'a' ? { a: id, b: p.b, active: 'b' } : { a: p.a, b: id, active: 'a' }));
    pickSite(id);
  }, [missionsOpen, pickSite]);
  // the logo: back to Explore with nothing selected, the 3D Moon on its home view, top of the page
  const [homeSignal, setHomeSignal] = useState(0);
  const goHome = useCallback(() => {
    setMode('explore'); setSiteId(''); setHomeSignal((n) => n + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  const closeGuide = useCallback(() => setGuide(false), []);
  const applyPreset = useCallback((p: Preset) => {
    setPlaying(false);
    setSiteId(p.siteId);
    setT(p.t);
    setView('panorama');
    if (p.compare) setScenarios(p.compare.map((id) => ({ siteId: id, t: p.t })));
    setMode(p.mode);
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const h = (e.shiftKey ? 24 : 1) * (e.key === 'ArrowRight' ? 1 : -1);
        setT((x) => Math.max(range[0], Math.min(range[1], x + h * 3600000)));
      }
      if (e.key === 'Escape') { setAbout(false); closeGuide(); }
      if (e.key === '?') setGuide(true);
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'm' || e.key === 'M')) toggleMissions();
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4')) {
        document.querySelectorAll<HTMLButtonElement>('.ct-tabs button')[Number(e.key) - 1]?.click();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [range, closeGuide, toggleMissions]);
  // ⌘K / Ctrl+K toggles the command menu from anywhere, including inside inputs
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((x) => !x); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const goMode = useCallback((m: Mode) => {
    if (m === 'compare' && mode !== 'compare') setScenarios((s) => [{ siteId, t }, ...s.slice(1)]);
    setMode(m);
    window.scrollTo({ top: 0 });
  }, [mode, siteId, t]);
  const commands = useMemo<Command[]>(() => {
    const showDeep = (d: Deep) => () => { setMode('explore'); setDeep(d); requestAnimationFrame(() => document.querySelector('.deep')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
    return [
      ...allSites.map((s) => ({
        id: `site-${s.id}`, group: 'Sites', title: s.name, keywords: `${s.short} ${s.mission} ${s.region}`,
        icon: <Globe size={16} />, accessory: <span className="num">{Math.abs(s.lat).toFixed(2)}°{s.lat < 0 ? 'S' : 'N'}</span>,
        run: () => pickSite(s.id),
      })),
      ...PRESETS.map((p) => ({
        id: `preset-${p.id}`, group: 'Presets', title: p.title, keywords: p.blurb, icon: <Sparkles size={16} />,
        accessory: <span>{p.mode === 'compare' ? 'Compare' : 'Explore'}</span>, run: () => applyPreset(p),
      })),
      { id: 'mode-explore', group: 'Views', title: 'Explore a site', icon: <Search size={16} />, accessory: <kbd>1</kbd>, run: () => goMode('explore') },
      { id: 'mode-compare', group: 'Views', title: 'Compare sites side by side', icon: <Columns2 size={16} />, accessory: <kbd>2</kbd>, run: () => goMode('compare') },
      { id: 'missions', group: 'Views', title: 'Mission comparison (past and future)', keywords: 'missions clps apollo artemis chang\'e compare better efficient', icon: <Satellite size={16} />, accessory: <kbd>M</kbd>, run: toggleMissions },
      { id: 'mode-calc', group: 'Views', title: 'Calculator', keywords: 'solve equation variable', icon: <CalcIcon size={16} />, accessory: <kbd>3</kbd>, run: () => goMode('calc') },
      { id: 'mode-launch', group: 'Views', title: 'Launch planner', keywords: 'launch kennedy wallops nasa rocket window date', icon: <CalendarSync size={16} />, accessory: <kbd>4</kbd>, run: () => goMode('launch') },
      { id: 'deep-calendar', group: 'Views', title: 'Daily visibility calendar', keywords: 'heatmap best windows', icon: <CalendarSync size={16} />, run: showDeep('calendar') },
      { id: 'deep-mission', group: 'Views', title: 'Mission variables', keywords: 'plan power battery comms', icon: <SlidersHorizontal size={16} />, run: showDeep('mission') },
      { id: 'deep-numbers', group: 'Views', title: 'Readout and export', keywords: 'csv json numbers', icon: <SlidersHorizontal size={16} />, run: showDeep('numbers') },
      { id: 'act-play', group: 'Actions', title: playing ? 'Pause time' : 'Play time', icon: playing ? <Pause size={15} /> : <Play size={15} />, accessory: <kbd>Space</kbd>, run: () => setPlaying((p) => !p) },
      { id: 'act-theme', group: 'Actions', title: `Switch to ${theme.name === 'dark' ? 'light' : 'dark'} theme`, keywords: 'appearance dark light', icon: <Contrast size={16} />, run: theme.toggle },
      { id: 'act-about', group: 'Actions', title: 'About', keywords: 'about data method sources lola nasa', icon: <Info size={16} />, run: () => setAbout(true) },
      { id: 'act-help', group: 'Actions', title: 'How to use', keywords: 'help guide shortcuts', icon: <CircleHelp size={16} />, accessory: <kbd>?</kbd>, run: () => setGuide(true) },
    ];
  }, [allSites, pickSite, applyPreset, goMode, playing, theme.name, theme.toggle, toggleMissions]);

  if (err) return <div className="fatal wrap">Couldn't load the site data ({err}). Reload the page; if it keeps failing, the data files are missing from the deploy.</div>;
  if (!doc) return <div className="fatal wrap"><Loading label="Loading site data" /></div>;
  const synthetic = doc.sites.some((s) => s.synthetic);

  return (
    <div className="app">
      {synthetic && <div className="banner" role="alert">Synthetic terrain: horizons are placeholders, not LOLA data. Run <code>python scripts/build_horizons.py</code> to replace them.</div>}
      <nav className="ct-rail" aria-label="Sections">
        <button className={mode === 'explore' ? 'on' : ''} aria-label="Explore" title="Explore" onClick={() => setMode('explore')}><Globe size={18} /></button>
        <button className={mode === 'compare' ? 'on' : ''} aria-label="Compare" title="Compare" onClick={() => setMode('compare')}><Columns2 size={18} /></button>
        <button className={mode === 'calc' ? 'on' : ''} aria-label="Calculator" title="Calculator" onClick={() => setMode('calc')}><CalcIcon size={18} /></button>
        <button className={mode === 'launch' ? 'on' : ''} aria-label="Launch" title="Launch" onClick={() => setMode('launch')}><CalendarSync size={18} /></button>
        <button className={missionsOpen ? 'on' : ''} aria-label="Mission comparison" aria-pressed={missionsOpen} title="Mission comparison (M)" onClick={toggleMissions}><Satellite size={18} /></button>
        <span className="ct-rail-gap" />
        <button aria-label="Search sites and actions" title="Search (Ctrl K)" onClick={() => setPalette(true)}><Search size={18} /></button>
        <button aria-label="About" title="About" onClick={() => setAbout(true)}><Info size={18} /></button>
        <button aria-label="Help" title="Help" onClick={() => setGuide(true)}><CircleHelp size={18} /></button>
        <button aria-label={`Switch to ${theme.name === 'dark' ? 'light' : 'dark'} theme`} title="Light / dark" onClick={theme.toggle}><Contrast size={18} /></button>
      </nav>
      <div className="ct-main">
      <header className="ct-bar">
        <h1 className="ct-title">
          <button className="ct-home" onClick={goHome} title="Home: Explore, no site selected, whole Moon"><LogoMark size={22} /><span>Sol Teris</span></button>
        </h1>
        <label className="preset-pick">
          <span>Preset</span>
          <select id="preset" value="" onChange={(e) => { const p = PRESETS.find((x) => x.id === e.target.value); if (p) applyPreset(p); }}>
            <option value="">Select</option>
            {PRESETS.map((p) => <option key={p.id} value={p.id} title={p.blurb}>{p.title}</option>)}
          </select>
        </label>
        <nav className="ct-tabs" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={mode === 'explore'} onClick={() => setMode('explore')}><Globe size={15} /> Explore</button>
          <button role="tab" aria-selected={mode === 'compare'}
            onClick={() => { if (mode !== 'compare') setScenarios((s) => [{ siteId, t }, ...s.slice(1)]); setMode('compare'); }}><Columns2 size={15} /> Compare</button>
          <button role="tab" aria-selected={mode === 'calc'} onClick={() => setMode('calc')}><CalcIcon size={15} /> Calculator</button>
          <button role="tab" aria-selected={mode === 'launch'} onClick={() => setMode('launch')}><CalendarSync size={15} /> Launch</button>
        </nav>
        <button className={`ct-missions${missionsOpen ? ' on' : ''}`} aria-pressed={missionsOpen} onClick={toggleMissions} title="Compare any two missions, past and future (M)"><Satellite size={15} /> Missions</button>
      </header>
      <div className="ct-kpis" aria-label="Summary at the selected time">
        <div className="ct-kpi"><span className="ct-kpi-ico"><Globe size={18} /></span><b className="num">{kpi.n}</b><span>Sites tracked</span></div>
        <div className="ct-kpi"><span className="ct-kpi-ico sun"><Sun size={18} /></span><b className="num">{kpi.sun}</b><span>Sunlit now</span></div>
        <div className="ct-kpi"><span className="ct-kpi-ico earth"><Earth size={18} /></span><b className="num">{kpi.earth}</b><span>Earth in view now</span></div>
        <div className="ct-kpi"><span className="ct-kpi-ico"><CalendarSync size={18} /></span><b className="num">{when(t).slice(0, 10)}</b><span>{when(t).slice(11)} UTC</span></div>
      </div>
      <div className={mode === 'explore' ? 'ct-split' : 'hero'}>
        <div className="ct-map">
          <Suspense fallback={<div className="moon moon-wait"><Loading label="Loading 3D view" /></div>}>
            <MoonView sites={allSites} selectedId={mode === 'compare' ? scenarios[0]?.siteId ?? siteId : siteId} t={mode === "compare" ? scenarios[0]?.t ?? t : t} onSelect={onMoonSelect} onPlanLaunch={planLaunchTo} homeSignal={homeSignal} />
          </Suspense>
        </div>
        {mode === 'explore' && (
          <aside className="ct-side">
            <section className="ct-panel">
              <header className="ct-panel-h"><span className="ct-badge">A</span><h2>Landing sites</h2><span className="ct-chip num">{allSites.length} sites</span></header>
              <SiteListM sites={allSites} all={all} t={tl} selected={siteId} onSelect={setSiteId} />
              <CustomSite doc={doc} onReady={addCustom} />
            </section>
            <section className="ct-panel">
              <header className="ct-panel-h"><span className="ct-badge">B</span><h2>Review site</h2></header>
              {info && <div className="ct-actions">
                <button onClick={() => planLaunchTo(info.lat, info.lon)}><CalendarSync size={14} /> Plan launch</button>
                <button onClick={() => { setScenarios([{ siteId, t }, ...scenarios.slice(1)]); setMode('compare'); }}><Columns2 size={14} /> Compare</button>
                <button onClick={() => setAbout(true)}><Info size={14} /> Explain</button>
                <button className="ct-logic" onClick={() => setMode('calc')}><SlidersHorizontal size={14} /> Show logic</button>
              </div>}
              {info ? (
                <div className="ct-review">
                  <p className="ct-from"><span className="ct-from-ico"><Sparkles size={16} /></span><span><b>{info.name}</b>{info.approximate && <span className="flag flag-approx">approximate</span>}<small>{info.mission ?? 'Landing site'}</small></span></p>
                  <div className="ct-fields">
                    <div><b className="num">{fmtLat(info.lat)}, {fmtLon(info.lon)}</b><small>Position</small></div>
                    <div><b className="num">{info.siteHeightM.toFixed(0)} m</b><small>Elevation</small></div>
                    <div><b>{info.dem}{info.demResolutionM ? `, ${info.demResolutionM} m/px` : ''}</b><small>Terrain model</small></div>
                    <div><b>{res ? (res.metrics.sunUp ? 'Sunlit' : 'In shadow') : '—'} · {res ? (res.metrics.earthUp ? 'Earth in view' : 'Earth hidden') : '—'}</b><small>Now</small></div>
                  </div>
                  <p className="ct-src"><small>Source</small>{info.source}{info.verify && <> <span className="flag flag-verify">verify</span> coordinate unchecked</>}</p>
                </div>
              ) : <p className="ct-empty">Select a site in the table or on the Moon.</p>}
            </section>
          </aside>
        )}
      </div>

      {mode === 'explore' ? (
        <main key="explore" className="explore wrap view-in">

          <section className={`work${updating ? ' updating' : ''}`} aria-label="Selected site" aria-busy={updating}>
            {data && res ? (
              <>
                <div className="work-head">
                  <span className="overline">Landing site</span>
                  <h2>{data.info.name}</h2>
                  <p className="when"><span className="num">{when(t)} UTC</span><span className="num">{fmtLat(data.info.lat)}, {fmtLon(data.info.lon)}</span>{data.info.mission && <span>{data.info.mission}</span>}</p>
                </div>

                <div className="instrument">
                  <header className="pnl-h"><h3>Time</h3><p>The date and time being evaluated. Everything below updates to match.</p></header>
                  <TimeControls t={t} t0={range[0]} t1={range[1]} onChange={onT} playing={playing} onPlaying={setPlaying} speed={speed} onSpeed={setSpeed} />
                </div>
                <div className="instrument">
                  <header className="pnl-h"><h3>Conditions</h3><p>Sunlight and Earth visibility now, and the power and radio outlook for this lunar day.</p></header>
                  <SummaryM r={res} />
                </div>

                <div className="instrument">
                  <div className="view-head pnl-h">
                    <div><h3>Horizon</h3><p>The terrain skyline seen from the site, with the paths of the Sun and Earth.</p></div>
                    <div className="seg" role="radiogroup" aria-label="View">
                      {VIEWS.map((v) => (
                        <button key={v.id} role="radio" aria-checked={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>
                      ))}
                    </div>
                  </div>
                  {view === 'panorama' ? <PanoramaM data={data} t={tl} height={300} />
                    : view === 'first' ? <FirstPerson data={data} t={tl} height={320} />
                    : <SkyPlotM data={data} t={tl} />}
                </div>

                <div className="instrument">
                  <div className="view-head pnl-h">
                    <div><h3>Next 30 days</h3><p>When the site is sunlit and when Earth is above the horizon. Click to jump to a time.</p></div>
                    <ul className="chart-legend" aria-label="Legend">
                      <li><span className="swatch" style={{ background: 'var(--sun)' }} aria-hidden /> Sunlit</li>
                      <li><span className="swatch" style={{ background: 'var(--earth)' }} aria-hidden /> Earth in view</li>
                      <li><span className="swatch swatch-line" aria-hidden /> Now</li>
                    </ul>
                  </div>
                  <TimelineM data={data} t={tl} onSeek={onT} />
                </div>

                <section className="deep" aria-label="Detail">
                  <div className="view-head pnl-h">
                    <div><h3>Detailed analysis</h3><p>{deep === 'calendar' ? 'Sunlight and Earth visibility for every day in the data range. Click a day to jump to it.' : deep === 'numbers' ? 'Every computed figure for this site and time, with CSV and JSON export.' : 'Mission inputs and the resulting power, communications and rover estimates.'}</p></div>
                    <div className="seg" role="tablist" aria-label="Detail panels">
                      <button role="tab" aria-selected={deep === 'calendar'} onClick={() => setDeep('calendar')}>Calendar</button>
                      <button role="tab" aria-selected={deep === 'numbers'} onClick={() => setDeep('numbers')}>All figures</button>
                      <button role="tab" aria-selected={deep === 'mission'} onClick={() => setDeep('mission')}>Mission plan</button>
                    </div>
                  </div>
                  {deep === 'calendar' ? (
                    <HeatmapM data={data} t={tl} onPick={pickDay} />
                  ) : deep === 'mission' ? (
                    mission ? <MissionPanel d={data} r={res} m={mission} t={t} plan={plan} onPlan={setPlan} sites={allSites.filter((s) => s.id !== siteId)} all={all}
                      onSeek={(x) => { setPlaying(false); setT(Math.max(range[0], Math.min(range[1], x))); }}
                      onCompare={(ids) => { setScenarios(ids.map((id) => ({ siteId: id, t }))); setMode('compare'); window.scrollTo({ top: 0 }); }}
                      onCalc={() => { setMode('calc'); window.scrollTo({ top: 0 }); }} /> : <Loading label="Computing mission" />
                  ) : (
                    <div className="numbers">
                      <ReadoutM r={res} />
                      <ExportM d={data} r={res} />
                    </div>
                  )}
                </section>
              </>
            ) : siteId ? <Loading label="Loading site" /> : (
              <>
                <div className="work-head">
                  <span className="overline">Landing site</span>
                  <h2>—</h2>
                  <p className="when"><span className="num">{when(t)} UTC</span><span>Click a site point on the 3D Moon or pick one from the list</span></p>
                </div>
                <div className="instrument">
                  <header className="pnl-h"><h3>Time</h3><p>The date and time being evaluated. Everything below updates to match.</p></header>
                  <TimeControls t={t} t0={range[0]} t1={range[1]} onChange={onT} playing={playing} onPlaying={setPlaying} speed={speed} onSpeed={setSpeed} />
                </div>
                <div className="instrument">
                  <header className="pnl-h"><h3>Conditions</h3><p>Sunlight and Earth visibility now, and the power and radio outlook for this lunar day.</p></header>
                  <section className="answer" aria-label="Status (no site selected)">
                    <div className="answer-now"><span className="answer-kind">At this time</span><p className="dash">Sunlight —</p><p className="dash">Earth —</p></div>
                    <div className="answer-card"><span className="answer-kind">Power</span><span className="answer-word">—</span></div>
                    <div className="answer-card"><span className="answer-kind">Radio to Earth</span><span className="answer-word">—</span></div>
                  </section>
                </div>
                {[['Horizon', 'The terrain skyline seen from the site, with the paths of the Sun and Earth.'],
                  ['Next 30 days', 'When the site is sunlit and when Earth is above the horizon.'],
                  ['Detailed analysis', 'Calendar, all figures and the mission plan for the selected site.']].map(([h, c]) => (
                  <div className="instrument" key={h}>
                    <header className="pnl-h"><h3>{h}</h3><p>{c}</p></header>
                    <p className="dash-block">—</p>
                  </div>
                ))}
              </>
            )}
          </section>
        </main>
      ) : mode === 'launch' ? (
        <main key="m1" className="compare-main wrap view-in">
          <LaunchPlanner doc={doc} sites={allSites} siteId={siteId} onSite={setSiteId} onCustom={addCustom} data={data} t={t} onTime={onT} range={range} target={launchTarget} />
        </main>
      ) : mode === 'calc' ? (
        <main key="m2" className="compare-main wrap view-in">
          <Calculator state={calc} onState={setCalc} sim={simSnapshot(data, res, mission)} simLabel={`${info?.name ?? 'the selected site'} at ${when(t)} UTC`} />
        </main>
      ) : (
        <main key="m3" className="compare-main wrap view-in">
          <Compare sites={allSites} scenarios={scenarios} onChange={setScenarios} range={range} />
        </main>
      )}
      <footer className="footer wrap">
        <span>Terrain: NASA LRO LOLA (PDS Geosciences). Ephemeris: astronomy-engine, validated against JPL Horizons.</span>
        <span className="num">{doc.range.start.slice(0, 10)} to {doc.range.end.slice(0, 10)} UTC</span>
      </footer>
      </div>
      {missionsOpen && <MissionCompare doc={doc} sites={allSites} pair={pair} onPair={setPair} onClose={() => setMissionsOpen(false)} onOpenSite={pickSite} onPlanLaunch={(id) => { setMissionsOpen(false); setSiteId(id); setMode('launch'); window.scrollTo({ top: 0 }); }} />}
      {about && <About doc={doc} onClose={() => setAbout(false)} />}
      {guide && <Guide onClose={closeGuide} />}
      {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
      <div className="action-bar">
        <span className="ab-ctx">
          <b>{mode === 'explore' ? info?.short ?? 'Site' : mode === 'compare' ? 'Compare' : mode === 'launch' ? 'Launch' : 'Calculator'}</b>
          <span className="num muted">{when(t)} UTC</span>
        </span>
      </div>
    </div>
  );
}
