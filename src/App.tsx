import { CalendarSync, Calculator as CalcIcon, CircleHelp, Columns2, Contrast, Globe, Info, Pause, Play, Search, Sparkles, SlidersHorizontal } from './components/Icons';
import CommandPalette, { type Command, ModKey } from './components/CommandPalette';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import About from './components/About';
import Compare, { type Scenario } from './components/Compare';
import Calculator, { initialCalc, type CalcState } from './components/Calculator';
import LaunchPlanner, { type LaunchTarget } from './components/LaunchPlanner';
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
import TimeControls from './components/TimeControls';
import Timeline from './components/Timeline';
import { type SiteData, type SiteInfo, useAllSites, useSiteData, useSites } from './lib/data';
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
type View = 'panorama' | 'sky';
type Deep = 'calendar' | 'numbers' | 'mission';
const VIEWS: { id: View; label: string }[] = [
  { id: 'panorama', label: 'Panorama' },
  { id: 'sky', label: 'Sky plot' },
];
const MoonView = lazy(() => import('./components/MoonView'));
const DEFAULT_T = Date.parse('2027-07-08T00:00:00Z'); // opening scene of docs/DEMO.md

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const t = Number(p.get('t'));
  const cmp = p.get('cmp');
  return {
    site: p.get('site')?.startsWith('custom') ? 'connecting-ridge' : p.get('site') ?? 'connecting-ridge',
    t: isFinite(t) && t > 0 ? t : DEFAULT_T,
    mode: (p.get('mode') as Mode) ?? 'explore',
    scenarios: cmp && !cmp.includes('custom') ? cmp.split('|').map((x) => { const [siteId, tt] = x.split('@'); return { siteId, t: Number(tt) }; }) : null,
  };
}

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
  const data = useSiteData(siteId);
  const res = useScenario(data, t);
  const info = allSites.find((s) => s.id === siteId);
  const [plan, setPlan] = useState<MissionPlan>(() => loadPlan(init.t));
  useEffect(() => { try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch { /* storage blocked */ } }, [plan]);
  const mission = useMission(data, res, plan, t);
  const [calc, setCalc] = useState<CalcState>(initialCalc);

  useEffect(() => {
    if (playing) return;
    const p = new URLSearchParams({ t: String(Math.round(t)), mode });
    if (siteId) p.set('site', siteId);
    if (mode === 'compare') p.set('cmp', scenarios.map((s) => `${s.siteId}@${Math.round(s.t)}`).join('|'));
    try { history.replaceState(null, '', `#${p}`); } catch { /* sandboxed host */ }
  }, [siteId, t, mode, scenarios, playing]);

  const onT = useCallback((x: number) => setT(x), []);
  const pickSite = useCallback((id: string) => { setSiteId(id); if (mode !== 'explore') setMode('explore'); }, [mode]);
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
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4')) {
        document.querySelectorAll<HTMLButtonElement>('.masthead .tabs button')[Number(e.key) - 1]?.click();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [range, closeGuide]);
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
  }, [allSites, pickSite, applyPreset, goMode, playing, theme.name, theme.toggle]);

  if (err) return <div className="fatal wrap">Couldn't load the site data ({err}). Reload the page; if it keeps failing, the data files are missing from the deploy.</div>;
  if (!doc) return <div className="fatal wrap"><Loading label="Loading site data" /></div>;
  const synthetic = doc.sites.some((s) => s.synthetic);

  return (
    <div className="app">
      {synthetic && <div className="banner" role="alert">Synthetic terrain: horizons are placeholders, not LOLA data. Run <code>python scripts/build_horizons.py</code> to replace them.</div>}
      <header className="masthead wrap">
        <h1 className="brand"><span className="brand-mark" aria-hidden />Lunar Site Compare</h1>
        <nav className="tabs" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={mode === 'explore'} onClick={() => setMode('explore')}>Explore <kbd>1</kbd></button>
          <button role="tab" aria-selected={mode === 'compare'}
            onClick={() => { if (mode !== 'compare') setScenarios((s) => [{ siteId, t }, ...s.slice(1)]); setMode('compare'); }}>Compare <kbd>2</kbd></button>
          <button role="tab" aria-selected={mode === 'calc'} onClick={() => setMode('calc')}>Calculator <kbd>3</kbd></button>
          <button role="tab" aria-selected={mode === 'launch'} onClick={() => setMode('launch')}>Launch <kbd>4</kbd></button>
        </nav>
        <button className="cmdk-trigger" onClick={() => setPalette(true)} aria-label="Open command menu">
          <Search size={15} /><span>Search sites and actions…</span><span className="keys"><ModKey /><kbd>K</kbd></span>
        </button>
        <label className="preset-pick">
          <span>Preset</span>
          <select id="preset" value="" onChange={(e) => { const p = PRESETS.find((x) => x.id === e.target.value); if (p) applyPreset(p); }}>
            <option value="">Select</option>
            {PRESETS.map((p) => <option key={p.id} value={p.id} title={p.blurb}>{p.title}</option>)}
          </select>
        </label>
        <div className="mast-tools">
          <button onClick={theme.toggle} aria-label={`Switch to ${theme.name === 'dark' ? 'light' : 'dark'} theme`} title="Light / dark"><Contrast size={15} /><span className="sr-only">Theme</span></button>
          <button onClick={() => setAbout(true)} aria-label="About"><Info size={15} /> <span className="mast-label">About</span></button>
          <button onClick={() => setGuide(true)} aria-label="Help"><CircleHelp size={15} /> <span className="mast-label">Help</span></button>
        </div>
      </header>
      <div className="hero wrap">
        <Suspense fallback={<div className="moon moon-wait"><Loading label="Loading 3D view" /></div>}>
          <MoonView sites={allSites} selectedId={mode === 'compare' ? scenarios[0]?.siteId ?? siteId : siteId} t={mode === "compare" ? scenarios[0]?.t ?? t : t} onSelect={pickSite} onPlanLaunch={planLaunchTo} />
        </Suspense>
      </div>

      {mode === 'explore' ? (
        <main key="explore" className="explore wrap view-in">
          <aside className="rail">
            <SiteList sites={allSites} all={all} t={t} selected={siteId} onSelect={setSiteId} />
            {info && (
              <section className="site-info" aria-labelledby="site-info-h">
                <h3 id="site-info-h" className="sec-h">{info.name}{info.approximate && <span className="flag flag-approx">approximate</span>}</h3>
                <table className="facts">
                  <tbody>
                    <tr><th scope="row">Position</th><td className="num">{fmtLat(info.lat)}, {fmtLon(info.lon)}</td></tr>
                    <tr><th scope="row">Elevation</th><td className="num">{info.siteHeightM.toFixed(0)} m</td></tr>
                    {info.snappedM > 0 && <tr><th scope="row">Snapped</th><td className="num">{info.snappedM} m from cited point</td></tr>}
                    <tr><th scope="row">DEM</th><td>{info.dem}{info.demResolutionM ? `, ${info.demResolutionM} m/px` : ''}</td></tr>
                    <tr><th scope="row">Source</th><td>{info.source}</td></tr>
                    {info.verify && <tr><th scope="row">Status</th><td><span className="flag flag-verify">verify</span> coordinate unchecked</td></tr>}
                  </tbody>
                </table>
              </section>
            )}
            <CustomSite doc={doc} onReady={addCustom} />
          </aside>

          <section className="work" aria-label="Selected site">
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
                  <Summary r={res} />
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
                  {view === 'panorama' ? <Panorama data={data} t={t} height={300} />
                    : <SkyPlot data={data} t={t} />}
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
                  <Timeline data={data} t={t} onSeek={onT} />
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
                    <Heatmap data={data} t={t} onPick={(x) => { setPlaying(false); setT(Math.max(range[0], Math.min(range[1], x))); }} />
                  ) : deep === 'mission' ? (
                    mission ? <MissionPanel d={data} r={res} m={mission} t={t} plan={plan} onPlan={setPlan} sites={allSites.filter((s) => s.id !== siteId)} all={all}
                      onSeek={(x) => { setPlaying(false); setT(Math.max(range[0], Math.min(range[1], x))); }}
                      onCompare={(ids) => { setScenarios(ids.map((id) => ({ siteId: id, t }))); setMode('compare'); window.scrollTo({ top: 0 }); }}
                      onCalc={() => { setMode('calc'); window.scrollTo({ top: 0 }); }} /> : <Loading label="Computing mission" />
                  ) : (
                    <div className="numbers">
                      <Readout r={res} />
                      <Export d={data} r={res} />
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
      {about && <About doc={doc} onClose={() => setAbout(false)} />}
      {guide && <Guide onClose={closeGuide} />}
      {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
      <div className="action-bar" role="toolbar" aria-label="Quick actions">
        <span className="ab-ctx">
          <span className="brand-mark" aria-hidden />
          <b>{mode === 'explore' ? info?.short ?? 'Site' : mode === 'compare' ? 'Compare' : mode === 'launch' ? 'Launch' : 'Calculator'}</b>
          <span className="num muted">{when(t)} UTC</span>
        </span>
        <span className="ab-actions">
          <button className="ab-btn" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'} <kbd>Space</kbd></button>
          <span className="ab-sep" aria-hidden />
          <button className="ab-btn" onClick={() => setPalette(true)}>Actions <ModKey /><kbd>K</kbd></button>
        </span>
      </div>
    </div>
  );
}
