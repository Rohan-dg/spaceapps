import { Contrast, Info } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import About, { Explainer } from './components/About';
import Compare, { type Scenario } from './components/Compare';
import CustomSite from './components/CustomSite';
import Export from './components/Export';
import Heatmap from './components/Heatmap';
import { Readout, Verdicts } from './components/Metrics';
import Panorama from './components/Panorama';
import SiteList from './components/SiteList';
import SkyPlot from './components/SkyPlot';
import TimeControls from './components/TimeControls';
import Timeline from './components/Timeline';
import { type SiteInfo, useAllSites, useSiteData, useSites } from './lib/data';
import { useTheme } from './lib/theme';
import { useScenario } from './lib/useScenario';

type Mode = 'explore' | 'compare';
type View = 'panorama' | 'sky' | '3d';
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
      if (e.key === 'Escape') setAbout(false);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [range]);

  if (err) return <div className="fatal wrap">Couldn't load the site data ({err}). Reload the page; if it keeps failing, the data files are missing from the deploy.</div>;
  if (!doc) return <div className="fatal wrap">Loading terrain and ephemeris tables…</div>;
  const synthetic = doc.sites.some((s) => s.synthetic);
  const yr = (s: string) => s.slice(0, 4);

  return (
    <div className="app">
      {synthetic && <div className="banner" role="alert">Synthetic terrain. These horizons are placeholders, not LOLA data. Run <code>python scripts/build_horizons.py</code> with network access to replace them.</div>}
      <header className="masthead wrap">
        <div className="brand">
          <Mark className="brand-mark" />
          <div>
            <h1>Lunar Site Compare</h1>
            <p>When the Sun clears the ridge and when Earth is in view, for Moon south-pole landing sites, {yr(doc.range.start)}–{yr(doc.range.end)}.</p>
          </div>
        </div>
        <nav className="tabs" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={mode === 'explore'} onClick={() => setMode('explore')}>One site</button>
          <button role="tab" aria-selected={mode === 'compare'}
            onClick={() => { if (mode !== 'compare') setScenarios((s) => [{ siteId, t }, ...s.slice(1)]); setMode('compare'); }}>Side by side</button>
        </nav>
        <div className="mast-tools">
          <button onClick={theme.toggle} aria-label={`Switch to ${theme.name === 'dark' ? 'light' : 'dark'} theme`} title="Light / dark"><Contrast size={16} /><span className="sr-only">Theme</span></button>
          <button onClick={() => setAbout(true)} aria-label="Method and sources"><Info size={16} /> <span className="mast-label">Method &amp; sources</span></button>
        </div>
      </header>

      {mode === 'explore' ? (
        <main className="explore wrap">
          <aside className="rail">
            <SiteList sites={allSites} all={all} t={t} selected={siteId} onSelect={setSiteId} />
            {info && (
              <section className="site-info" aria-label="Site details">
                <span className="eyebrow">{info.mission}</span>
                <h2>{info.name}</h2>
                {info.approximate && <span><span className="flag flag-approx">approximate</span> horizon from 400 m terrain, computed in your browser</span>}
                <p>{info.description}</p>
                <dl className="facts">
                  <dt>Position</dt><dd className="num">{fmtLat(info.lat)}, {fmtLon(info.lon)}</dd>
                  <dt>Height</dt><dd className="num">{info.siteHeightM.toFixed(0)} m</dd>
                  {info.snappedM > 0 && <><dt>Moved</dt><dd>{info.snappedM} m from the cited point, onto the local high ground</dd></>}
                  <dt>Terrain</dt><dd>{info.dem}{info.demResolutionM ? `, ${info.demResolutionM} m/px` : ''}</dd>
                  <dt>Source</dt><dd>{info.source}</dd>
                  {info.verify && <><dt>Status</dt><dd><span className="flag flag-verify">verify</span> Coordinate not yet checked against the source</dd></>}
                </dl>
              </section>
            )}
            <CustomSite doc={doc} onReady={(d) => { setCustoms((c) => [...c.filter((x) => x.id !== d.info.id), d.info]); setSiteId(d.info.id); }} />
          </aside>

          <section className="work" aria-label="Selected site">
            {data && res ? (
              <>
                <div className="work-head">
                  <div>
                    <h2>{data.info.name}</h2>
                    <p className="when"><span className="num">{when(t)}</span> UTC</p>
                  </div>
                  <div className="seg" role="radiogroup" aria-label="Sky view">
                    {([['panorama', 'Skyline'], ['sky', 'Overhead'], ['3d', '3D terrain']] as [View, string][]).map(([v, label]) => (
                      <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)}>{label}</button>
                    ))}
                  </div>
                </div>
                <TimeControls t={t} t0={range[0]} t1={range[1]} onChange={onT} playing={playing} onPlaying={setPlaying} speed={speed} onSpeed={setSpeed} />
                <div className="instrument">
                  {view === 'panorama' ? <Panorama data={data} t={t} height={330} />
                    : view === 'sky' ? <SkyPlot data={data} t={t} />
                    : <Suspense fallback={<div className="loading">Loading the 3D view…</div>}><Terrain3D data={data} t={t} /></Suspense>}
                </div>
                <div className="instrument">
                  <Timeline data={data} t={t} onSeek={onT} />
                  <p className="note">Next 30 days. Click the strip to jump to a moment.</p>
                </div>
                <div className="assess">
                  <Verdicts r={res} />
                  <Readout r={res} />
                </div>
                <Export d={data} r={res} />
                <Heatmap data={data} t={t} onPick={(x) => { setPlaying(false); setT(Math.max(range[0], Math.min(range[1], x))); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
              </>
            ) : <div className="loading">Loading terrain and time series…</div>}
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
    </div>
  );
}
