import { CircleHelp, Contrast, Info } from './components/Icons';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import About from './components/About';
import Compare, { type Scenario } from './components/Compare';
import Calculator, { initialCalc, type CalcState } from './components/Calculator';
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
import { type SiteInfo, useAllSites, useSiteData, useSites } from './lib/data';
import { PRESETS, type Preset } from './lib/presets';
import { useTheme } from './lib/theme';
import { DEFAULT_PLAN, type MissionPlan } from './lib/mission';
import { simSnapshot, useMission } from './lib/useMission';
import { useScenario } from './lib/useScenario';

type Mode = 'explore' | 'compare' | 'calc';
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
  const [deep, setDeep] = useState<Deep>('calendar');
  const [view, setView] = useState<View>('panorama');
  const [customs, setCustoms] = useState<SiteInfo[]>([]);
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
    const p = new URLSearchParams({ site: siteId, t: String(Math.round(t)), mode });
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
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [range, closeGuide]);

  if (err) return <div className="fatal wrap">Couldn't load the site data ({err}). Reload the page; if it keeps failing, the data files are missing from the deploy.</div>;
  if (!doc) return <div className="fatal wrap"><Loading label="Loading site data" /></div>;
  const synthetic = doc.sites.some((s) => s.synthetic);

  return (
    <div className="app">
      {synthetic && <div className="banner" role="alert">Synthetic terrain: horizons are placeholders, not LOLA data. Run <code>python scripts/build_horizons.py</code> to replace them.</div>}
      <header className="masthead wrap">
        <h1 className="brand">Lunar Site Compare</h1>
        <nav className="tabs" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={mode === 'explore'} onClick={() => setMode('explore')}>Explore</button>
          <button role="tab" aria-selected={mode === 'compare'}
            onClick={() => { if (mode !== 'compare') setScenarios((s) => [{ siteId, t }, ...s.slice(1)]); setMode('compare'); }}>Compare</button>
          <button role="tab" aria-selected={mode === 'calc'} onClick={() => setMode('calc')}>Calculator</button>
        </nav>
        <label className="preset-pick">
          <span>Preset</span>
          <select id="preset" value="" onChange={(e) => { const p = PRESETS.find((x) => x.id === e.target.value); if (p) applyPreset(p); }}>
            <option value="">Select</option>
            {PRESETS.map((p) => <option key={p.id} value={p.id} title={p.blurb}>{p.title}</option>)}
          </select>
        </label>
        <div className="mast-tools">
          <button onClick={theme.toggle} aria-label={`Switch to ${theme.name === 'dark' ? 'light' : 'dark'} theme`} title="Light / dark"><Contrast size={15} /><span className="sr-only">Theme</span></button>
          <button onClick={() => setAbout(true)} aria-label="Data and method"><Info size={15} /> <span className="mast-label">Data &amp; method</span></button>
          <button onClick={() => setGuide(true)} aria-label="Help"><CircleHelp size={15} /> <span className="mast-label">Help</span></button>
        </div>
      </header>
      <div className="hero wrap">
        <Suspense fallback={<div className="moon moon-wait"><Loading label="Loading 3D view" /></div>}>
          <MoonView sites={allSites} selectedId={mode === 'compare' ? scenarios[0]?.siteId ?? siteId : siteId} t={mode === "compare" ? scenarios[0]?.t ?? t : t} onSelect={pickSite} />
        </Suspense>
      </div>

      {mode === 'explore' ? (
        <main className="explore wrap">
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
            <CustomSite doc={doc} onReady={(d) => { setCustoms((c) => [...c.filter((x) => x.id !== d.info.id), d.info]); setSiteId(d.info.id); }} />
          </aside>

          <section className="work" aria-label="Selected site">
            {data && res ? (
              <>
                <div className="work-head">
                  <h2>{data.info.name}</h2>
                  <p className="when"><span className="num">{when(t)} UTC</span><span className="num">{fmtLat(data.info.lat)}, {fmtLon(data.info.lon)}</span>{data.info.mission && <span>{data.info.mission}</span>}</p>
                </div>

                <TimeControls t={t} t0={range[0]} t1={range[1]} onChange={onT} playing={playing} onPlaying={setPlaying} speed={speed} onSpeed={setSpeed} />
                <Summary r={res} />

                <div className="instrument">
                  <div className="view-head">
                    <h3 className="sec-h">Horizon</h3>
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
                  <div className="view-head">
                    <h3 className="sec-h">Next 30 days</h3>
                    <ul className="chart-legend" aria-label="Legend">
                      <li><span className="swatch" style={{ background: 'var(--sun)' }} aria-hidden /> Sunlit</li>
                      <li><span className="swatch" style={{ background: 'var(--earth)' }} aria-hidden /> Earth in view</li>
                      <li><span className="swatch swatch-line" aria-hidden /> Now</li>
                    </ul>
                  </div>
                  <Timeline data={data} t={t} onSeek={onT} />
                </div>

                <section className="deep" aria-label="Detail">
                  <div className="seg" role="tablist" aria-label="Detail panels">
                    <button role="tab" aria-selected={deep === 'calendar'} onClick={() => setDeep('calendar')}>Calendar</button>
                    <button role="tab" aria-selected={deep === 'numbers'} onClick={() => setDeep('numbers')}>Readout</button>
                    <button role="tab" aria-selected={deep === 'mission'} onClick={() => setDeep('mission')}>Mission variables</button>
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
            ) : <Loading label="Loading site" />}
          </section>
        </main>
      ) : mode === 'calc' ? (
        <main className="compare-main wrap">
          <Calculator state={calc} onState={setCalc} sim={simSnapshot(data, res, mission)} simLabel={`${info?.name ?? 'the selected site'} at ${when(t)} UTC`} />
        </main>
      ) : (
        <main className="compare-main wrap">
          <Compare sites={allSites} scenarios={scenarios} onChange={setScenarios} range={range} />
        </main>
      )}
      <footer className="footer wrap">
        <span>Terrain: NASA LRO LOLA (PDS Geosciences). Ephemeris: astronomy-engine, validated against JPL Horizons.</span>
        <span className="num">{doc.range.start.slice(0, 10)} to {doc.range.end.slice(0, 10)} UTC</span>
      </footer>
      {about && <About doc={doc} onClose={() => setAbout(false)} />}
      {guide && <Guide onClose={closeGuide} />}
    </div>
  );
}
