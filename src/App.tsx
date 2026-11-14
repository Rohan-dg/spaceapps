import { ChevronRight, CircleHelp, Contrast, Info, Sparkles } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import About, { Explainer } from './components/About';
import Compare, { type Scenario } from './components/Compare';
import CustomSite from './components/CustomSite';
import Export from './components/Export';
import Guide from './components/Guide';
import { HelpTip, Loading, Step } from './components/Help';
import Heatmap from './components/Heatmap';
import { Readout, Summary } from './components/Metrics';
import Panorama from './components/Panorama';
import SiteList from './components/SiteList';
import SkyPlot from './components/SkyPlot';
import TimeControls from './components/TimeControls';
import Timeline from './components/Timeline';
import { type SiteInfo, useAllSites, useSiteData, useSites } from './lib/data';
import { PRESETS, type Preset } from './lib/presets';
import { useTheme } from './lib/theme';
import { useScenario } from './lib/useScenario';

type Mode = 'explore' | 'compare';
type View = 'panorama' | 'sky' | '3d';
type Deep = 'calendar' | 'numbers';
const VIEWS: { id: View; label: string; caption: string }[] = [
  { id: 'panorama', label: 'Horizon view', caption: 'A 360° view of the horizon from the site, as if you turned around once. Anything below the grey mountain line is blocked from view.' },
  { id: 'sky', label: 'Sky from above', caption: 'The whole sky as a circle: the centre is straight overhead and the edge is the horizon. Useful for seeing which direction the Sun and Earth are in.' },
  { id: '3d', label: '3D landscape', caption: 'The real ground around the site, lit by the Sun at this exact moment. Drag to rotate.' },
];
const GUIDE_KEY = 'lsc-guide-seen';
const seenGuide = () => { try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch { return true; } };
const Terrain3D = lazy(() => import('./components/Terrain3D'));
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

export function Mark({ className }: { className?: string }) {
  // Half-lit disc over a ridge line: the whole problem in one glyph.
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="18" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M20 7a11 11 0 0 1 0 22z" fill="currentColor" />
      <path d="M2 31l9-6 6 4 8-7 13 9v9H2z" fill="var(--accent)" />
    </svg>
  );
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
  // First-time visitors without a shared link get the guide; shared links go straight to the scene.
  const [guide, setGuide] = useState(() => !location.hash && !seenGuide());
  const [firstVisit] = useState(guide);
  const [deep, setDeep] = useState<Deep>('calendar');
  const [factsOpen, setFactsOpen] = useState(false);
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

  useEffect(() => {
    if (playing) return;
    const p = new URLSearchParams({ site: siteId, t: String(Math.round(t)), mode });
    if (mode === 'compare') p.set('cmp', scenarios.map((s) => `${s.siteId}@${Math.round(s.t)}`).join('|'));
    try { history.replaceState(null, '', `#${p}`); } catch { /* sandboxed host */ }
  }, [siteId, t, mode, scenarios, playing]);

  const onT = useCallback((x: number) => setT(x), []);
  const closeGuide = useCallback(() => {
    setGuide(false);
    try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* storage blocked */ }
  }, []);
  const applyPreset = useCallback((p: Preset) => {
    setPlaying(false);
    setSiteId(p.siteId);
    setT(p.t);
    setView('panorama');
    if (p.compare) setScenarios(p.compare.map((id) => ({ siteId: id, t: p.t })));
    setMode(p.mode);
    closeGuide();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [closeGuide]);
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
  if (!doc) return <div className="fatal wrap"><Loading label="Loading NASA terrain data and Sun and Earth positions…" /></div>;
  const synthetic = doc.sites.some((s) => s.synthetic);
  const yr = (s: string) => s.slice(0, 4);
  const viewDef = VIEWS.find((v) => v.id === view)!;

  return (
    <div className="app">
      {synthetic && <div className="banner" role="alert">Synthetic terrain. These horizons are placeholders, not LOLA data. Run <code>python scripts/build_horizons.py</code> with network access to replace them.</div>}
      <header className="masthead wrap">
        <div className="brand">
          <Mark className="brand-mark" />
          <div>
            <h1>Lunar Site Compare</h1>
            <p>Can a lander at the Moon's south pole get sunlight for power <i>and</i> see Earth to radio home? Pick a site and a date ({yr(doc.range.start)}–{yr(doc.range.end)}) to find out, using real NASA terrain.</p>
          </div>
        </div>
        <nav className="tabs" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={mode === 'explore'} onClick={() => setMode('explore')}>Explore a site</button>
          <button role="tab" aria-selected={mode === 'compare'}
            onClick={() => { if (mode !== 'compare') setScenarios((s) => [{ siteId, t }, ...s.slice(1)]); setMode('compare'); }}>Compare sites</button>
        </nav>
        <div className="mast-tools">
          <button onClick={theme.toggle} aria-label={`Switch to ${theme.name === 'dark' ? 'light' : 'dark'} theme`} title="Light / dark"><Contrast size={16} /><span className="sr-only">Theme</span></button>
          <button onClick={() => setAbout(true)} aria-label="Method and sources"><Info size={16} /> <span className="mast-label">Data &amp; method</span></button>
          <button className="btn-primary" onClick={() => setGuide(true)} aria-label="How to use this app"><CircleHelp size={16} /> <span className="lbl-long">How to use</span><span className="lbl-short">Help</span></button>
        </div>
      </header>
      <div className="try-bar wrap" role="region" aria-label="Examples">
        <span className="try-label"><Sparkles size={14} aria-hidden /> Try an example:</span>
        <div className="try-chips">
          {PRESETS.slice(0, 4).map((p) => <button key={p.id} className="chip" title={p.blurb} onClick={() => applyPreset(p)}>{p.title}</button>)}
          <button className="chip chip-more" onClick={() => setGuide(true)}>More examples <ChevronRight size={14} aria-hidden /></button>
        </div>
      </div>

      {mode === 'explore' ? (
        <main className="explore wrap">
          <aside className="rail">
            <div className="rail-step">
              <Step n={1} title="Pick a landing site" hint="Twelve real sites. Icons show conditions right now and the rating for the next month." />
              <SiteList sites={allSites} all={all} t={t} selected={siteId} onSelect={setSiteId} />
            </div>
            {info && (
              <section className="site-info" aria-label="Site details">
                <span className="eyebrow">About this site</span>
                <h2>{info.name}</h2>
                {info.approximate && <span><span className="flag flag-approx">approximate</span> horizon from 400 m terrain, computed in your browser</span>}
                <p>{info.description}</p>
                <details className="disclosure facts-wrap" open={factsOpen} onToggle={(e) => setFactsOpen(e.currentTarget.open)}>
                  <summary>Coordinates and data source</summary>
                  <dl className="facts">
                    <dt>Position</dt><dd className="num">{fmtLat(info.lat)}, {fmtLon(info.lon)}</dd>
                    <dt>Elevation</dt><dd className="num">{info.siteHeightM.toFixed(0)} m</dd>
                    {info.snappedM > 0 && <><dt>Adjusted</dt><dd>{info.snappedM} m from the cited point, onto the local high ground</dd></>}
                    <dt>Terrain</dt><dd>{info.dem}{info.demResolutionM ? `, ${info.demResolutionM} m/px` : ''}</dd>
                    <dt>Source</dt><dd>{info.source}</dd>
                    {info.verify && <><dt>Status</dt><dd><span className="flag flag-verify">verify</span> Coordinate not yet checked against the source</dd></>}
                  </dl>
                </details>
              </section>
            )}
            <CustomSite doc={doc} onReady={(d) => { setCustoms((c) => [...c.filter((x) => x.id !== d.info.id), d.info]); setSiteId(d.info.id); }} />
          </aside>

          <section className="work" aria-label="Selected site">
            {data && res ? (
              <>
                <div className="work-head">
                  <span className="eyebrow">{data.info.mission}</span>
                  <h2>{data.info.name}</h2>
                  <p className="when"><span className="num">{when(t)}</span> UTC · <span className="num">{fmtLat(data.info.lat)}</span></p>
                </div>

                <div className="step-block">
                  <Step n={2} title="Pick a moment" hint="Press Play to watch the Sun circle the horizon, or drag the slider to any date." />
                  <TimeControls t={t} t0={range[0]} t1={range[1]} onChange={onT} playing={playing} onPlaying={setPlaying} speed={speed} onSpeed={setSpeed} />
                </div>

                <div className="step-block">
                  <Step n={3} title="Read the answer" hint="Green is good, amber is marginal, red is poor." />
                  <Summary r={res} />
                </div>

                <div className="instrument">
                  <div className="view-head">
                    <h3>See why <HelpTip label="About these views">All three views show the same moment. The Horizon view is the main one: it shows exactly which mountain blocks the Sun or Earth.</HelpTip></h3>
                    <div className="seg" role="radiogroup" aria-label="Choose a view">
                      {VIEWS.map((v) => (
                        <button key={v.id} role="radio" aria-checked={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>
                      ))}
                    </div>
                  </div>
                  <p className="view-caption">{viewDef.caption}</p>
                  {view === 'panorama' ? <Panorama data={data} t={t} height={330} />
                    : view === 'sky' ? <SkyPlot data={data} t={t} />
                    : <Suspense fallback={<Loading label="Loading the 3D landscape…" />}><Terrain3D data={data} t={t} /></Suspense>}
                </div>

                <div className="instrument">
                  <div className="view-head">
                    <h3>The next 30 days</h3>
                  </div>
                  <p className="view-caption">Coloured bars mark when the site is <b className="t-sun">sunlit</b> and when <b className="t-earth">Earth is in view</b>. The orange line is now. Click anywhere on the strip to jump there.</p>
                  <Timeline data={data} t={t} onSeek={onT} />
                </div>

                <section className="deep" aria-label="Go deeper">
                  <div className="deep-head">
                    <h3>Go deeper</h3>
                    <div className="seg" role="tablist" aria-label="Detail panels">
                      <button role="tab" aria-selected={deep === 'calendar'} onClick={() => setDeep('calendar')}>Best landing dates</button>
                      <button role="tab" aria-selected={deep === 'numbers'} onClick={() => setDeep('numbers')}>Exact numbers &amp; download</button>
                    </div>
                  </div>
                  {deep === 'calendar' ? (
                    <Heatmap data={data} t={t} onPick={(x) => { setPlaying(false); setT(Math.max(range[0], Math.min(range[1], x))); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                  ) : (
                    <div className="numbers">
                      <Readout r={res} />
                      <Export d={data} r={res} />
                    </div>
                  )}
                </section>
              </>
            ) : <Loading label="Loading this site's terrain and timeline…" />}
            <Explainer />
          </section>
        </main>
      ) : (
        <main className="compare-main wrap">
          <Compare sites={allSites} scenarios={scenarios} onChange={setScenarios} range={range} />
          <Explainer />
        </main>
      )}
      <footer className="footer wrap">
        <span>Terrain: NASA LRO LOLA, PDS Geosciences Node. Positions: astronomy-engine, checked against JPL Horizons.</span>
        <span>Covers {doc.range.start.slice(0, 10)} to {doc.range.end.slice(0, 10)} UTC. Not a NASA product.</span>
      </footer>
      {about && <About doc={doc} onClose={() => setAbout(false)} />}
      {guide && <Guide onClose={closeGuide} onPreset={applyPreset} firstVisit={firstVisit} />}
    </div>
  );
}
