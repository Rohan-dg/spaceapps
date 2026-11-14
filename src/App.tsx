import { useCallback, useEffect, useMemo, useState } from 'react';
import About, { Explainer } from './components/About';
import Compare, { type Scenario } from './components/Compare';
import { MetricCards, VerdictBadge } from './components/Metrics';
import Heatmap from './components/Heatmap';
import Panorama from './components/Panorama';
import SkyPlot from './components/SkyPlot';
import SiteList from './components/SiteList';
import TimeControls from './components/TimeControls';
import Timeline from './components/Timeline';
import { useAllSites, useSiteData, useSites } from './lib/data';
import { useScenario } from './lib/useScenario';

type Mode = 'explore' | 'compare';
const DEFAULT_T = Date.parse('2027-01-03T00:00:00Z');

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const t = Number(p.get('t'));
  const cmp = p.get('cmp');
  return {
    site: p.get('site') ?? 'connecting-ridge',
    t: isFinite(t) && t > 0 ? t : DEFAULT_T,
    mode: (p.get('mode') as Mode) ?? 'explore',
    scenarios: cmp ? cmp.split('|').map((x) => { const [siteId, tt] = x.split('@'); return { siteId, t: Number(tt) }; }) : null,
  };
}

export default function App() {
  const init = useMemo(readHash, []);
  const { doc, err } = useSites();
  const [siteId, setSiteId] = useState(init.site);
  const [t, setT] = useState(init.t);
  const [mode, setMode] = useState<Mode>(init.mode);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [about, setAbout] = useState(false);
  const [view, setView] = useState<'panorama' | 'sky'>('panorama');
  const [scenarios, setScenarios] = useState<Scenario[]>(init.scenarios ?? [
    { siteId: 'connecting-ridge', t: init.t },
    { siteId: 'shackleton-floor', t: init.t },
  ]);

  const range = useMemo<[number, number]>(() => doc ? [Date.parse(doc.range.start), Date.parse(doc.range.end) - 1800000] : [0, 1], [doc]);
  const ids = useMemo(() => doc?.sites.map((s) => s.id) ?? [], [doc]);
  const all = useAllSites(ids);
  const data = useSiteData(siteId);
  const res = useScenario(data, t);
  const info = doc?.sites.find((s) => s.id === siteId);

  // keep URL in sync (shareable state); throttle while playing
  useEffect(() => {
    if (playing) return;
    const p = new URLSearchParams({ site: siteId, t: String(Math.round(t)), mode });
    if (mode === 'compare') p.set('cmp', scenarios.map((s) => `${s.siteId}@${Math.round(s.t)}`).join('|'));
    history.replaceState(null, '', `#${p}`);
  }, [siteId, t, mode, scenarios, playing]);

  const onT = useCallback((x: number) => setT(x), []);
  // keyboard: space play/pause, arrows step
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

  if (err) return <div className="fatal">Failed to load site data: {err}</div>;
  if (!doc) return <div className="fatal">Loading lunar data…</div>;
  const synthetic = doc.sites.some((s) => s.synthetic);

  return (
    <div className="app">
      {synthetic && <div className="banner warn" role="alert">⚠ SYNTHETIC TERRAIN: horizon profiles are placeholders, not real LOLA data. Run <code>python scripts/build_horizons.py</code> with network access.</div>}
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>◐</span>
          <div>
            <h1>Lunar Site Compare</h1>
            <p className="tagline">Sunlight and Earth visibility at Moon landing sites</p>
          </div>
        </div>
        <div className="mode-switch" role="tablist" aria-label="View mode">
          <button role="tab" aria-selected={mode === 'explore'} className={mode === 'explore' ? 'active' : ''} onClick={() => setMode('explore')}>Explore</button>
          <button role="tab" aria-selected={mode === 'compare'} className={mode === 'compare' ? 'active' : ''}
            onClick={() => { if (mode !== 'compare') setScenarios((s) => [{ siteId, t }, ...s.slice(1)]); setMode('compare'); }}>Compare</button>
        </div>
        <button className="about-btn" onClick={() => setAbout(true)}>About &amp; data</button>
      </header>

      {mode === 'explore' ? (
        <main className="explore">
          <aside className="sidebar">
            <SiteList sites={doc.sites} all={all} t={t} selected={siteId} onSelect={setSiteId} />
            {info && (
              <div className="site-info">
                <h2>{info.name}</h2>
                <p className="mission">{info.mission}</p>
                <p>{info.description}</p>
                <p className="coords">
                  {Math.abs(info.lat).toFixed(4)}°{info.lat < 0 ? 'S' : 'N'}, {((info.lon % 360) + 360) % 360 > 180 ? `${(360 - (((info.lon % 360) + 360) % 360)).toFixed(3)}°W` : `${(((info.lon % 360) + 360) % 360).toFixed(3)}°E`} · height {info.siteHeightM.toFixed(0)} m
                  {info.snappedM > 0 && <><br /><span className="muted">Moved {info.snappedM} m from the cited point to the local high point</span></>}
                  {info.verify && <><br /><span className="verify-tag">verify</span> coordinate is approximate; check it against the source</>}
                </p>
                <p className="source muted">Source: {info.source}</p>
                <p className="muted">Terrain: {info.dem}{info.demResolutionM ? `, ${info.demResolutionM} m/px` : ''}</p>
              </div>
            )}
          </aside>
          <section className="main-col">
            <TimeControls t={t} t0={range[0]} t1={range[1]} onChange={onT} playing={playing} onPlaying={setPlaying} speed={speed} onSpeed={setSpeed} />
            {data && res ? (
              <>
                <div className="pano-head">
                  <h2>{data.info.name}</h2>
                  <span className="muted">{new Date(t).toUTCString().replace('GMT', 'UTC')}</span>
                  <div className="seg" role="radiogroup" aria-label="Sky view">
                    <button role="radio" aria-checked={view === 'panorama'} className={view === 'panorama' ? 'active' : ''} onClick={() => setView('panorama')}>Horizon panorama</button>
                    <button role="radio" aria-checked={view === 'sky'} className={view === 'sky' ? 'active' : ''} onClick={() => setView('sky')}>Sky from above</button>
                  </div>
                </div>
                {view === 'panorama' ? <Panorama data={data} t={t} height={320} /> : <SkyPlot data={data} t={t} />}
                <Timeline data={data} t={t} onSeek={onT} />
                <div className="verdicts">
                  <VerdictBadge kind="Power" v={res.power} />
                  <VerdictBadge kind="Comms" v={res.comms} />
                </div>
                <MetricCards r={res} />
                <Heatmap data={data} t={t} onPick={(x) => { setPlaying(false); setT(Math.max(range[0], Math.min(range[1], x))); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
              </>
            ) : <div className="loading">Loading terrain and time series…</div>}
            <Explainer />
          </section>
        </main>
      ) : (
        <main className="compare-main">
          <Compare sites={doc.sites} scenarios={scenarios} onChange={setScenarios} range={range} />
          <Explainer />
        </main>
      )}
      <footer className="footer">
        <span>Data: NASA LRO/LOLA (PDS Geosciences Node). Ephemeris: astronomy-engine, validated against JPL Horizons.</span>
        <span>Range {doc.range.start.slice(0, 10)} to {doc.range.end.slice(0, 10)} UTC · Not an official NASA product.</span>
      </footer>
      {about && <About doc={doc} onClose={() => setAbout(false)} />}
    </div>
  );
}
