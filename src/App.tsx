import { CalendarSync, Calculator as CalcIcon, CircleHelp, Columns2, Contrast, Earth, Globe, Info, Pause, Play, Satellite, Search, Sparkles, SlidersHorizontal } from './components/Icons';
import CommandPalette, { type Command } from './components/CommandPalette';
import { LogoMark } from './components/Logo';
import { lazy, memo, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import About from './components/About';
import Compare, { type Scenario } from './components/Compare';
import Calculator, { initialCalc, type CalcState } from './components/Calculator';
import LaunchPlanner, { type LaunchTarget } from './components/LaunchPlanner';
import MissionCompare, { type MissionPair } from './components/MissionCompare';
import AssistantChat, { type HelpContext } from './components/AssistantChat';
import { eventText } from './components/Metrics';
import type { Action as HelpAction } from './lib/assistant';
import CustomSite from './components/CustomSite';
import ModeChooser, { type Ui } from './components/ModeChooser';
import { computeSite } from './lib/customSite';
import Countdown from './components/Countdown';
import SlipPanel from './components/SlipPanel';
import MoonEarth from './components/MoonEarth';
import SimpleView from './components/SimpleView';
import TimeLeft from './components/TimeLeft';
import Term from './components/Term';
import { sphereHorizonDeg } from './lib/geometry';
import ShadowMap from './components/ShadowMap';
import Export from './components/Export';
import Guide from './components/Guide';
import { Loading } from './components/Help';
import Heatmap from './components/Heatmap';
import PairCompare from './components/PairCompare';
import MissionPanel from './components/MissionPanel';
import { Summary } from './components/Metrics';
import LibrationTool from './components/LibrationTool';
import Panorama from './components/Panorama';
import SiteList, { isAttempt } from './components/SiteList';
import SkyPlot from './components/SkyPlot';
import FirstPerson from './components/FirstPerson';
import TimeControls, { SPEEDS } from './components/TimeControls';
import Timeline from './components/Timeline';
import { type SiteData, type SiteInfo, useAllSites, useSiteData, useSites } from './lib/data';
import { findRun, indexAt, type Runs, type Series } from './lib/series';
import { PRESETS, type Preset } from './lib/presets';
import { useTheme } from './lib/theme';
import { DEFAULT_PLAN, type MissionPlan } from './lib/mission';
import { simSnapshot, useMission } from './lib/useMission';
import { scenarioFor, useScenario } from './lib/useScenario';

type Mode = 'explore' | 'compare' | 'calc' | 'launch';
/** Normal: plain-language screen for a general audience. Expert: the full mission-planning workspace. */
const UI_KEY = 'lsc-ui';
/** The mode from a shared link, else the last one chosen on this device, else none (the chooser decides). */
function savedUi(fromHash: string | null): Ui | null {
  if (fromHash === 'normal' || fromHash === 'expert') return fromHash;
  try { const s = localStorage.getItem(UI_KEY); if (s === 'normal' || s === 'expert') return s; } catch { /* storage blocked */ }
  return null;
}
const PLAN_KEY = 'lsc-mission-plan';
function loadPlan(t: number): MissionPlan {
  try { const s = localStorage.getItem(PLAN_KEY); if (s) return { ...DEFAULT_PLAN, departure: t, ...JSON.parse(s) }; } catch { /* storage blocked */ }
  return { ...DEFAULT_PLAN, departure: t };
}
type View = 'panorama' | 'sky' | 'first' | 'shadow';
type Deep = 'libration' | 'calendar' | 'mission' | 'compare';
const VIEWS: { id: View; label: string }[] = [
  { id: 'panorama', label: 'Panorama' },
  { id: 'sky', label: 'Sky plot' },
  { id: 'first', label: 'First person' },
  { id: 'shadow', label: 'Shadow map' },
];
/** Words for each interface mode. Same tools and data in both; Normal says it in everyday language. */
const COPY = {
  expert: {
    tabs: { explore: 'Explore', compare: 'Compare', calc: 'Calculator', launch: 'Launch', missions: 'Missions' },
    kpi: {
      title: 'Now, all sites', cap: (n: number) => `of ${n} active sites (crash and impact points excluded)`,
      state: { both: 'sunlit + Earth', sun: 'sunlit only', earth: 'Earth only', dark: 'dark' },
      good: 'Good power, next lunar day', none: 'None in this window',
    },
    sites: 'Landing sites', review: 'Review site', pick2: 'Click a second site to compare', plan: 'Plan launch', logic: 'Show logic', explain: 'Explain',
    fPos: 'Position', fElev: 'Elevation', fDem: 'Terrain model', fNow: 'Now', fSrc: 'Source', empty: 'Select a site in the table or on the Moon.',
    views: { panorama: 'Panorama', sky: 'Sky plot', first: 'First person', shadow: 'Shadow map' } as Record<string, string>,
    hz: ['Horizon', 'The terrain skyline seen from the site, with the paths of the Sun and Earth. No air means no refraction: the skyline is pure geometry, the highest terrain in each direction with the Moon\'s curvature.'],
    next: ['Next 30 days', 'When the site is sunlit and when Earth is above the horizon. Click to jump to a time.'],
    slip: ['If the landing date slips', 'The same site at earlier and later landing dates: how far the date can move before the power or radio rating changes.'],
    me: ['Moon vs Earth', 'This site next to the same latitude on Earth: why lunar days, shadows and sunsets need different planning.'],
    deep: 'Detailed analysis', deepTabs: { libration: 'Libration & orbit', compare: 'Compare', calendar: 'Calendar', mission: 'Mission plan' },
    deepText: {
      compare: 'The two picked sites side by side: conditions now, the next lunar day, the long run and an overall success score.',
      calendar: 'Sunlight and Earth visibility for every day in the data range. Click a day to jump to it.',
      libration: 'Earth\'s wobble and the Moon\'s orbital variation, and what they do to Earth contact here. CSV and JSON export below.',
      mission: 'Mission inputs and the resulting power, communications and rover estimates.',
    },
    intro: { compare: '', calc: '', launch: '' },
  },
  normal: {
    tabs: { explore: 'Explore', compare: 'Compare places', calc: 'How it works', launch: 'Plan a launch', missions: 'All missions' },
    kpi: {
      title: 'Right now, every place', cap: (n: number) => `out of ${n} places (crash sites not counted)`,
      state: { both: 'sunny and can call Earth', sun: 'sunny only', earth: 'can call Earth only', dark: 'dark' },
      good: 'Sunniest over the next month', none: 'None at the moment',
    },
    sites: 'Places to land', review: 'About this place', pick2: 'Pick a second place to compare', plan: 'Plan a trip here', logic: 'How it works', explain: 'About the app',
    fPos: 'Where it is', fElev: 'Height', fDem: 'Map used', fNow: 'Right now', fSrc: 'Where this comes from', empty: 'Pick a place from the list or click a dot on the Moon.',
    views: { panorama: 'Skyline', sky: 'Sky map', first: 'Stand here', shadow: 'Shadows nearby' } as Record<string, string>,
    hz: ['What the sky looks like from here', 'The hills around this spot and where the Sun and Earth are. When the Sun is above the hills, it is sunny. There is no air on the Moon, so light is not bent: what you see is exactly what you get.'],
    next: ['The next 30 days', 'Coloured stretches show when this spot is sunny and when Earth is in view. Click to jump to a day.'],
    slip: ['What if the landing is delayed?', 'Rockets often launch late. See how landing a few days earlier or later changes sunlight and contact with Earth.'],
    me: ['How is this different from Earth?', 'This spot next to the same place on Earth: a day lasts a month, sunrises take hours, and there is no air.'],
    deep: 'More detail', deepTabs: { libration: 'Earth\'s wobble', compare: 'Side by side', calendar: 'Best days', mission: 'Plan a mission' },
    deepText: {
      compare: 'Your two picked places side by side. A score sums up which one would do better over the long run.',
      calendar: 'Every day for three years: bright days are sunny, blue means Earth is in view. Click a day to jump to it.',
      libration: 'Earth seems to wobble a little in the Moon\'s sky, and the Moon\'s distance changes. Here is what that does to contact with Earth from this spot. You can download the numbers below.',
      mission: 'Try a lander or rover design: solar panels, battery, radio. See whether it would survive the nights here.',
    },
    intro: {
      compare: 'Put up to four places and dates side by side. The better value in each row is marked, so you can see at a glance which spot wins.',
      calc: 'Every number in the app comes from a formula. Here you can see each one, change the inputs and watch the answer change.',
      launch: 'Pick a place to land and find good days to launch a rocket from Earth to get there, with the time of day and the direction to fly.',
    },
  },
};
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
    ui: p.get('ui'),
    scenarios: cmp && !cmp.includes('custom') ? cmp.split('|').map((x) => { const [siteId, tt] = x.split('@'); return { siteId, t: Number(tt) }; }) : null,
  };
}

// Panels below the 3D view are memoised and fed a deferred time, so time playback and the 3D view stay smooth:
// React draws the urgent parts (time controls, 3D view) first and catches the panels up when it has room.
const SiteListM = memo(SiteList), HeatmapM = memo(Heatmap), PanoramaM = memo(Panorama), SkyPlotM = memo(SkyPlot);
const SlipPanelM = memo(SlipPanel), MoonEarthM = memo(MoonEarth);
const TimelineM = memo(Timeline), SummaryM = memo(Summary), ExportM = memo(Export);
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
  const lastUi = useMemo(() => savedUi(init.ui), [init.ui]);
  const [ui, setUiState] = useState<Ui>(lastUi ?? 'normal');
  // every load starts by asking which mode to use (components/ModeChooser.tsx)
  const [choosing, setChoosing] = useState(true);
  const expert = ui === 'expert';
  const L = COPY[ui];
  const [mode, setMode] = useState<Mode>(init.mode);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(ui === 'normal' ? 2 : 1);
  // Switching between Normal and Expert re-renders the whole page from scratch: the app's root is keyed on the
  // mode, so every component (the 3D Moon included) unmounts and mounts fresh. Selection and time are kept.
  // one-shot camera requests to the 3D view (a site close-up, the home view); cleared on a mode switch
  const [closeUp, setCloseUp] = useState<{ id: string; n: number } | null>(null);
  const [homeSignal, setHomeSignal] = useState(0);
  const uiRef = useRef(ui);
  useEffect(() => { uiRef.current = ui; }, [ui]);
  const setUi = useCallback((u: Ui, alsoInside?: () => void) => {
    const changed = u !== uiRef.current;
    setUiState(u);
    try { localStorage.setItem(UI_KEY, u); } catch { /* storage blocked */ }
    if (u === 'normal') setMode('explore'); // the other modes are Expert tools
    if (changed) {
      // one-shot camera requests belong to the old 3D view; the new one starts from its own opening view
      setCloseUp(null); setHomeSignal(0);
      window.scrollTo({ top: 0 });
    }
    alsoInside?.();
  }, []);
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
  const [deep, setDeep] = useState<Deep>('libration');
  const [view, setView] = useState<View>('panorama');
  const [customs, setCustoms] = useState<SiteInfo[]>([]);
  const [launchTarget, setLaunchTarget] = useState<LaunchTarget | null>(null);
  // a computed point joins the list and becomes the current site; the previous site stays as the comparison partner
  // your points are lettered A, B, C ... in the order you make them (Z then wraps to AA, AB ...)
  const letterSeq = useRef(0);
  const nextLetter = () => { const k = letterSeq.current++; return k < 26 ? String.fromCharCode(65 + k) : `A${String.fromCharCode(65 + ((k - 26) % 26))}`; };
  const letterPoint = (d: SiteData, letter: string) => {
    const where = d.info.name.replace(/^Point\s+/, '');
    d.info.short = `Point ${letter}`; d.info.name = `Point ${letter} (${where})`;
  };
  const removePoint = useCallback((id: string) => {
    setCustoms((c) => c.filter((x) => x.id !== id));
    setSiteId((cur) => (cur === id ? '' : cur));
    setPartner((p) => (p === id ? null : p));
  }, []);
  const clearPoints = useCallback(() => {
    setCustoms([]); letterSeq.current = 0;
    setSiteId((cur) => (cur.startsWith('custom') ? '' : cur));
    setPartner((p) => (p && p.startsWith('custom') ? null : p));
  }, []);
  const addCustom = useCallback((d: SiteData) => {
    if (d.info.id.startsWith('custom') && !/^Point [A-Z]+$/.test(d.info.short)) letterPoint(d, nextLetter());
    setCustoms((c) => [...c.filter((x) => x.id !== d.info.id), d.info]);
    setSiteId((cur) => { if (cur && cur !== d.info.id) setPartner(cur); return d.info.id; });
  }, []);
  const [pointBusy, setPointBusy] = useState<string | null>(null);
  const planLaunchTo = useCallback((lat: number, lon: number) => { setLaunchTarget({ lat, lon, nonce: Date.now() }); setMode('launch'); window.scrollTo({ top: 0 }); }, []);
  const [scenarios, setScenarios] = useState<Scenario[]>(init.scenarios ?? [
    { siteId: 'connecting-ridge', t: init.t },
    { siteId: 'de-gerlache-rim', t: init.t },
  ]);

  const range = useMemo<[number, number]>(() => doc ? [Date.parse(doc.range.start), Date.parse(doc.range.end) - 1800000] : [0, 1], [doc]);
  const allSites = useMemo(() => [...(doc?.sites ?? []), ...(expert ? customs : [])], [doc, customs, expert]);
  // switching to Normal drops any custom point from the selection (it stays saved for Expert)
  useEffect(() => {
    if (expert) return;
    setSiteId((cur) => (cur.startsWith('custom') ? '' : cur));
    setPartner((p) => (p && p.startsWith('custom') ? null : p));
  }, [expert]);
  const ids = useMemo(() => allSites.map((s) => s.id), [allSites]);
  // crash and impact sites load only when their (collapsed) group in the site list is opened
  const lazyIds = useMemo(() => new Set(allSites.filter(isAttempt).map((s) => s.id)), [allSites]);
  const all = useAllSites(ids, lazyIds);
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
  // counted over the active sites only (crash and impact points are excluded), so the total stays fixed
  const active = useMemo(() => all.filter((d, i): d is SiteData => !!d && !lazyIds.has(ids[i])), [all, ids, lazyIds]);
  // one mark per active site, grouped by state now (sunlit + Earth, sunlit only, Earth only, dark), south to north
  const kpi = useMemo(() => {
    const ORDER = { both: 0, sun: 1, earth: 2, dark: 3 } as const;
    const marks = active.map((d) => {
      const su = upAt(d.series.sunUp, d.series, tq), eu = upAt(d.series.earthUp, d.series, tq);
      const state: keyof typeof ORDER = su && eu ? 'both' : su ? 'sun' : eu ? 'earth' : 'dark';
      return { id: d.info.id, name: d.info.short || d.info.name, lat: d.info.lat, state };
    }).sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.lat - b.lat);
    const count = { both: 0, sun: 0, earth: 0, dark: 0 };
    marks.forEach((m) => count[m.state]++);
    return { n: marks.length, marks, count };
  }, [active, tq]);
  // "good for power" needs the full verdict, which covers the next lunar day, so a 6-hour step is plenty and cheap
  const t6 = Math.floor(tl / 21600000) * 21600000;
  const goodSites = useMemo(() => active
    .map((d) => ({ d, r: scenarioFor(d, t6) }))
    .filter((x) => x.r.power.level === 'green')
    .sort((a, b) => b.r.metrics.sunPct - a.r.metrics.sunPct), [active, t6]);
  const [plan, setPlan] = useState<MissionPlan>(() => loadPlan(init.t));
  useEffect(() => { try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch { /* storage blocked */ } }, [plan]);
  const mission = useMission(data, res, plan, tl);
  const readoutHz = useMemo(() => (data ? { profile: data.horizon.horizonDeg, observerM: data.horizon.observerHeightM } : undefined), [data]);
  const [calc, setCalc] = useState<CalcState>(initialCalc);

  useEffect(() => {
    if (playing) return;
    const p = new URLSearchParams({ t: String(Math.round(t)), mode });
    if (siteId) p.set('site', siteId);
    if (!expert) p.set('ui', 'normal');
    if (mode === 'compare') p.set('cmp', scenarios.map((s) => `${s.siteId}@${Math.round(s.t)}`).join('|'));
    try { history.replaceState(null, '', `#${p}`); } catch { /* sandboxed host */ }
  }, [siteId, t, mode, scenarios, playing, expert]);

  const onT = useCallback((x: number) => setT(x), []);
  // Play: advance time here, in both modes, so the 3D Moon and every panel follow it
  const playT = useRef(t);
  playT.current = t;
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      const next = playT.current + dt * SPEEDS[speed].hps * 3600000;
      if (next >= range[1]) { setT(range[1]); setPlaying(false); return; }
      playT.current = next; setT(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, range]);
  const pickDay = useCallback((x: number) => { setPlaying(false); setT(Math.max(range[0], Math.min(range[1], x))); }, [range]);
  // "Compare with another site": the next site picked (3D Moon or list) becomes the second column in Compare
  // Two points at a time: picking a different site keeps the previous one as the second site (B), so any two
  // clicks on the 3D Moon or the list give a pair, and Compare lights up
  const [partner, setPartner] = useState<string | null>(null);
  // bumped by every site the user picks, so a clicked point that finishes computing later never steals the selection
  const pickGen = useRef(0);
  const chooseSite = useCallback((id: string) => {
    pickGen.current++;
    setSiteId((cur) => { if (cur && cur !== id) setPartner(cur); return id; });
  }, []);
  const pickSite = useCallback((id: string) => { chooseSite(id); if (mode !== 'explore') setMode('explore'); }, [chooseSite, mode]);
  const partnerData = useSiteData(partner && partner !== siteId ? partner : null);
  // Normal mode shows the detail panel only for Side by side (when two places are picked)
  const dv: Deep = expert ? deep : 'compare';
  const openCompare = () => { setDeep('compare'); requestAnimationFrame(() => document.querySelector('.deep')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
  // with the mission sidebar open, a site clicked on the 3D Moon fills the active A/B slot
  const onMoonSelect = useCallback((id: string) => {
    if (missionsOpen) setPair((p) => (p.active === 'a' ? { a: id, b: p.b, active: 'b' } : { a: p.a, b: id, active: 'a' }));
    pickSite(id);
  }, [missionsOpen, pickSite]);
  // the logo: back to Explore with nothing selected, the 3D Moon on its home view, top of the page
  const goHome = useCallback(() => {
    setMode('explore'); setSiteId(''); setPartner(null); setHomeSignal((n) => n + 1);
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
      if (document.querySelector('.chooser-backdrop')) return; // the mode chooser owns the keyboard
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
    if (m !== 'explore' && !expert) setUi('expert'); // calculators, launch planning and the scenario editor are Expert tools
    setMode(m);
    window.scrollTo({ top: 0 });
  }, [mode, siteId, t, expert, setUi]);
  const commands = useMemo<Command[]>(() => {
    const showDeep = (d: Deep) => () => { setMode('explore'); setDeep(d); requestAnimationFrame(() => document.querySelector('.deep')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
    const list: Command[] = [
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
      { id: 'ui-toggle', group: 'Actions', title: expert ? 'Switch to Normal mode (simpler view)' : 'Switch to Expert mode (all tools)', keywords: 'simple normal expert advanced beginner mode', icon: <SlidersHorizontal size={16} />, run: () => setUi(expert ? 'normal' : 'expert') },
      { id: 'deep-libration', group: 'Views', title: 'Libration and orbital variation', keywords: 'wobble libration orbit perigee apogee earth distance season export csv json', icon: <Earth size={16} />, run: showDeep('libration') },
      { id: 'act-play', group: 'Actions', title: playing ? 'Pause time' : 'Play time', icon: playing ? <Pause size={15} /> : <Play size={15} />, accessory: <kbd>Space</kbd>, run: () => setPlaying((p) => !p) },
      { id: 'act-theme', group: 'Actions', title: `Switch to ${theme.name === 'dark' ? 'light' : 'dark'} theme`, keywords: 'appearance dark light', icon: <Contrast size={16} />, run: theme.toggle },
      { id: 'act-about', group: 'Actions', title: 'About', keywords: 'about data method sources lola nasa', icon: <Info size={16} />, run: () => setAbout(true) },
      { id: 'act-help', group: 'Actions', title: 'How to use', keywords: 'help guide shortcuts', icon: <CircleHelp size={16} />, accessory: <kbd>?</kbd>, run: () => setGuide(true) },
    ];
    // Normal mode leaves out the Expert-only tools (scenario editor, calculator, launch planner, mission inputs, libration data)
    const EXPERT_ONLY = new Set(['mode-compare', 'mode-calc', 'mode-launch', 'deep-mission', 'deep-libration']);
    return expert ? list : list.filter((c) => !EXPERT_ONLY.has(c.id) && !(c.id.startsWith('preset-') && PRESETS.find((p) => `preset-${p.id}` === c.id)?.mode === 'compare'));
  }, [allSites, pickSite, applyPreset, goMode, playing, theme.name, theme.toggle, toggleMissions, expert, setUi]);

  // what the help chat knows about the screen, so its answers can use the live numbers for the site in view
  const helpContext = useMemo<HelpContext>(() => {
    const m = res?.metrics;
    const pInfo = partner ? allSites.find((s) => s.id === partner) : null;
    return {
      mode, when: `${when(tl)} UTC`,
      site: info ? { name: info.name, short: info.short, lat: info.lat, lon: info.lon, heightM: info.siteHeightM } : null,
      now: m ? {
        sunUp: m.sunUp, sunEl: m.sky.sun.el, earthUp: m.earthUp, earthEl: m.sky.earth.el,
        sunNext: `the Sun ${m.sunUp ? 'sets' : 'rises'} ${eventText(m.sunUp ? m.nextSunset : m.nextSunrise, m.t)}`,
        earthNext: `Earth ${m.earthUp ? 'sets' : 'rises'} ${eventText(m.earthUp ? m.nextEarthset : m.nextEarthrise, m.t)}`,
      } : null,
      ratings: res && m ? { power: { green: 'good', amber: 'marginal', red: 'poor' }[res.power.level], comms: { green: 'good', amber: 'marginal', red: 'poor' }[res.comms.level], sunPct: m.sunPct, earthPct: m.earthPct, longestDarkH: m.longestDarkH } : null,
      partner: pInfo && pInfo.id !== siteId ? pInfo.short || pInfo.name : null,
    };
  }, [res, info, partner, allSites, siteId, mode, tl]);
  // "Compare this point" on the 3D Moon: compute any clicked point in the browser, then pair it with the current site
  // Any point on the Moon becomes a site: its skyline is traced from LOLA terrain and its Sun / Earth series computed
  // from the same ephemeris as the listed sites, in a Web Worker. Only the latest click is kept if clicks overlap.
  const pointSeq = useRef(0);
  const comparePoint = useCallback((lat: number, lon: number, mastM = 2, slot?: 'A' | 'B') => {
    if (!doc) return;
    const n = ++pointSeq.current;
    // a fresh click shows its lettered point on the Moon at once, while the terrain and Sun / Earth series are computed;
    // every click is kept (computations queue), so a second click never hides or cancels the first
    let pendingId: string | null = null, letter: string | null = null;
    if (!slot) {
      letter = nextLetter(); pendingId = `pending_${n}`;
      const l = ((lon % 360) + 360) % 360;
      const pending = { id: pendingId, name: `Point ${letter} (computing)`, short: `Point ${letter}`, lat, lon: l, region: lat < -80.5 ? 'south-pole' : 'global',
        approximate: true, siteHeightM: 0, dem: '', source: 'User input', mission: 'Computing…' } as unknown as SiteInfo;
      setCustoms((c) => [...c, pending]);
    }
    setPointBusy('Computing the point…');
    const gen = pickGen.current;
    computeSite(doc, lat, lon, (m) => { if (n === pointSeq.current) setPointBusy(m); }, mastM)
      .then((d) => {
        if (slot) {
          // recalculating a point in the comparison replaces it in place and keeps its letter
          const old = customs.find((c) => c.id === (slot === 'A' ? partner : siteId));
          const L = old?.short.match(/^Point ([A-Z]+)$/)?.[1];
          letterPoint(d, L ?? nextLetter());
          setCustoms((c) => [...c.filter((x) => x.id !== d.info.id && x.id !== old?.id), d.info]);
          if (slot === 'A') setPartner(d.info.id); else setSiteId(d.info.id);
          return;
        }
        letterPoint(d, letter!);
        setCustoms((c) => [...c.filter((x) => x.id !== d.info.id).map((x) => (x.id === pendingId ? d.info : x))]);
        // select the point only if nothing else was picked while it computed; otherwise it just joins the list
        if (pickGen.current === gen) {
          setSiteId((cur) => { if (cur && cur !== d.info.id) setPartner(cur); return d.info.id; });
          setMode('explore');
        }
      })
      .catch((e) => { setCustoms((c) => c.filter((x) => x.id !== pendingId)); if (n === pointSeq.current) setPointBusy(`Could not compute that point (${String(e)})`); })
      .finally(() => { if (n === pointSeq.current) setTimeout(() => setPointBusy(null), 1200); });
  }, [doc, customs, partner, siteId]);
  if (err) return <div className="fatal wrap">Couldn't load the site data ({err}). Reload the page; if it keeps failing, the data files are missing from the deploy.</div>;
  if (!doc) return <div className="fatal wrap"><Loading label="Loading site data" /></div>;
  const synthetic = doc.sites.some((s) => s.synthetic);

  // the help assistant's buttons drive the app like the user would
  const onHelpAction = (a: HelpAction) => {
    if (a.type === 'mode') goMode(a.mode);
    else if (a.type === 'missions') { if (!missionsOpen) toggleMissions(); }
    else if (a.type === 'guide') setGuide(true);
    else if (a.type === 'about') setAbout(true);
    else if (a.type === 'palette') setPalette(true);
    else if (a.type === 'theme') theme.toggle();
    else if (a.type === 'home') goHome();
    else if (a.type === 'view') { setMode('explore'); setView(a.view); }
    else if (a.type === 'deep') { setMode('explore'); setDeep(a.deep); requestAnimationFrame(() => document.querySelector('.deep')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
    else if (a.type === 'site') pickSite(a.id);
  };

  return (
    <div key={ui} className={`app ${expert ? 'ui-expert' : 'ui-normal'}`}>
      {synthetic && <div className="banner" role="alert">Synthetic terrain: horizons are placeholders, not LOLA data. Run <code>python scripts/build_horizons.py</code> to replace them.</div>}
      <nav className="ct-rail" aria-label="Sections">
        <button className={mode === 'explore' ? 'on' : ''} aria-label="Explore" title="Explore" onClick={() => setMode('explore')}><Globe size={18} /></button>
        {expert && <>
        <button className={mode === 'compare' ? 'on' : ''} aria-label="Compare" title="Compare" onClick={() => setMode('compare')}><Columns2 size={18} /></button>
        <button className={mode === 'calc' ? 'on' : ''} aria-label="Calculator" title="Calculator" onClick={() => setMode('calc')}><CalcIcon size={18} /></button>
        <button className={mode === 'launch' ? 'on' : ''} aria-label="Launch" title="Launch" onClick={() => setMode('launch')}><CalendarSync size={18} /></button>
        </>}
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
        <div className="ui-toggle seg" role="radiogroup" aria-label="Interface">
          <button role="radio" aria-checked={!expert} onClick={() => setUi('normal')} title="Plain-language view for everyone">Normal</button>
          <button role="radio" aria-checked={expert} onClick={() => setUi('expert')} title="Full mission-planning tools">Expert</button>
        </div>
        <nav className="ct-tabs" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={mode === 'explore'} onClick={() => setMode('explore')}><Globe size={15} /> {L.tabs.explore}</button>
          {expert && <>
          <button role="tab" aria-selected={mode === 'compare'}
            onClick={() => { if (mode !== 'compare') setScenarios((s) => [{ siteId, t }, ...s.slice(1)]); setMode('compare'); }}><Columns2 size={15} /> {L.tabs.compare}</button>
          <button role="tab" aria-selected={mode === 'calc'} onClick={() => setMode('calc')}><CalcIcon size={15} /> {L.tabs.calc}</button>
          <button role="tab" aria-selected={mode === 'launch'} onClick={() => setMode('launch')}><CalendarSync size={15} /> {L.tabs.launch}</button>
          </>}
        </nav>
        <button className={`ct-missions${missionsOpen ? ' on' : ''}`} aria-pressed={missionsOpen} onClick={toggleMissions} title="Compare any two missions, past and future (M)"><Satellite size={15} /> {L.tabs.missions}</button>
      </header>
      <section className="kp" aria-label="All landing sites at the selected time">
        <div className="kp-now">
          <p className="kp-h"><span>{L.kpi.title}</span><span className="num">{when(tl)} UTC</span></p>
          <div className="kp-marks" role="list" aria-label={L.kpi.cap(kpi.n)}>
            {kpi.marks.map((m) => (
              <button key={m.id} role="listitem" className={`kp-m ${m.state}${m.id === siteId ? ' on' : ''}`} onClick={() => pickSite(m.id)}
                title={`${m.name}: ${L.kpi.state[m.state]}`} aria-label={`${m.name}: ${L.kpi.state[m.state]}`} />
            ))}
          </div>
          <p className="kp-legend">
            {(['both', 'sun', 'earth', 'dark'] as const).map((k) => (
              <span key={k} className={`kp-k ${k}`}><i aria-hidden /><b className="num">{kpi.count[k]}</b> {L.kpi.state[k]}</span>
            ))}
            <span className="kp-of">{L.kpi.cap(kpi.n)}</span>
          </p>
        </div>
        <div className="kp-good">
          <p className="kp-h"><span>{L.kpi.good}</span></p>
          {goodSites.length === 0 ? <p className="kp-none">{L.kpi.none}</p> : (
            <ol className="kp-list">
              {goodSites.slice(0, 4).map((x) => (
                <li key={x.d.info.id}><button className="kp-site" onClick={() => pickSite(x.d.info.id)}>{x.d.info.short || x.d.info.name}</button><span className="num">{x.r.metrics.sunPct.toFixed(0)}%</span></li>
              ))}
              {goodSites.length > 4 && <li className="kp-more">+{goodSites.length - 4} more</li>}
            </ol>
          )}
        </div>
      </section>
      <div className={mode === 'explore' ? 'ct-split' : 'hero'}>
        <div className="ct-map">
          <Suspense fallback={<div className="moon moon-wait"><Loading label="Loading 3D view" /></div>}>
            <MoonView sites={allSites} selectedId={mode === 'compare' ? scenarios[0]?.siteId ?? siteId : siteId} t={mode === "compare" ? scenarios[0]?.t ?? t : t} onSelect={onMoonSelect} onPlanLaunch={planLaunchTo} homeSignal={homeSignal} secondId={mode === 'explore' ? partner : null} onHome={goHome} onComparePoint={expert ? comparePoint : undefined} closeUp={closeUp} onPointClick={expert && mode === 'explore' ? comparePoint : undefined} expert={expert} />
          </Suspense>
        </div>
        {mode === 'explore' && (
          <aside className="ct-side">
            <section className="ct-panel">
              <header className="ct-panel-h"><h2>{L.sites}</h2><span className="ct-chip num">{allSites.length} sites</span>
                {expert && customs.length > 0 && <button className="ct-clear" onClick={clearPoints} title="Remove every point you made by clicking or by coordinates">Clear my points ({customs.length})</button>}</header>
              <SiteListM sites={allSites} all={all} t={tl} selected={siteId} onSelect={chooseSite} onRemove={removePoint} />
              {/* your own points (clicked or typed) are an expert tool; Normal mode works with the listed sites only */}
              {expert && <CustomSite doc={doc} onReady={addCustom} />}
            </section>
            <section className="ct-panel">
              <header className="ct-panel-h"><h2>{L.review}</h2></header>
              {pointBusy && <p className="ct-busy" role="status"><span className="loader" aria-hidden /> {pointBusy}</p>}
              {info && (
                <div className="ct-actions">
                  <button className="ct-primary" disabled={!partnerData} onClick={openCompare}
                    title={partnerData ? 'Open the side-by-side comparison' : 'Click a second site on the 3D Moon or in the list'}>
                    <Columns2 size={15} /> {partnerData ? <>Compare <b>{partnerData.info.short || partnerData.info.name}</b> and <b>{info.short || info.name}</b></> : L.pick2}
                  </button>
                  {expert && <button onClick={() => planLaunchTo(info.lat, info.lon)}><CalendarSync size={14} /> {L.plan}</button>}
                  {expert && <button onClick={() => setMode('calc')}><SlidersHorizontal size={14} /> {L.logic}</button>}
                  <button onClick={() => setAbout(true)}><Info size={14} /> {L.explain}</button>
                </div>
              )}
              {info ? (
                <div className="ct-review">
                  <p className="ct-from"><span className="ct-from-ico"><Sparkles size={16} /></span><span><b>{info.name}</b>{info.approximate && <span className="flag flag-approx">approximate</span>}<small>{info.mission ?? 'Landing site'}</small></span></p>
                  <div className="ct-fields">
                    <div><b className="num">{fmtLat(info.lat)}, {fmtLon(info.lon)}</b><small>{L.fPos}</small></div>
                    <div><b className="num">{info.siteHeightM.toFixed(0)} m</b><small>{L.fElev}</small></div>
                    {expert && <div><b>{info.dem}{info.demResolutionM ? `, ${info.demResolutionM} m/px` : ''}</b><small>{L.fDem}</small></div>}
                    <div><b>{res ? (res.metrics.sunUp ? 'Sunlit' : 'In shadow') : '-'} · {res ? (res.metrics.earthUp ? 'Earth in view' : 'Earth hidden') : '-'}</b><small>{L.fNow}</small></div>
                  </div>
                  <p className="ct-src"><small>{L.fSrc}</small>{info.source}{info.verify && <> <span className="flag flag-verify">verify</span> coordinate unchecked</>}</p>
                </div>
              ) : <p className="ct-empty">{L.empty}</p>}
            </section>
          </aside>
        )}
      </div>

      {mode === 'explore' ? (
        <main key="explore" className="explore wrap view-in">

          <section className={`work${updating ? ' updating' : ''}`} aria-label="Selected site" aria-busy={updating}>
            {data && res ? (
              <>
                {!expert ? (
                  <SimpleView data={data} r={res} t={tl} tLive={t} t0={range[0]} t1={range[1]} onT={pickDay} playing={playing} onPlaying={setPlaying} />
                ) : (<>
                <div className="work-head">
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
                  <TimeLeft s={data.series} m={res.metrics} t={tl} />
                </div>
                </>)}

                {expert && <>
                <div className="instrument">
                  <div className="view-head pnl-h">
                    <div><h3>{L.hz[0]}</h3><p>{L.hz[1]}</p></div>
                    <div className="seg" role="radiogroup" aria-label="View">
                      {VIEWS.map((v) => (
                        <button key={v.id} role="radio" aria-checked={view === v.id} onClick={() => setView(v.id)}>{L.views[v.id] ?? v.label}</button>
                      ))}
                    </div>
                  </div>
                  {view === 'panorama' ? <PanoramaM data={data} t={tl} height={300} />
                    : view === 'first' ? <FirstPerson data={data} t={tl} height={320} />
                    : view === 'shadow' ? <ShadowMap data={data} t={tl} mastPct={res.metrics.sunPct} plain={!expert} />
                    : <SkyPlotM data={data} t={tl} />}
                  {readoutHz && expert && (
                    <p className="hz-note">
                      <span>Skyline <b className="num">{Math.min(...readoutHz.profile).toFixed(2)}°</b> to <b className="num">{Math.max(...readoutHz.profile).toFixed(2)}°</b>; a smooth Moon would give <b className="num">{sphereHorizonDeg(readoutHz.observerM).toFixed(2)}°</b> all round ({readoutHz.observerM} m mast).</span>
                      <span><Term t="no-refraction">No refraction</Term>: with no air, the Sun or Earth is up exactly when it clears the terrain.</span>
                    </p>
                  )}
                </div>

                <div className="instrument">
                  <div className="view-head pnl-h">
                    <div><h3>{L.next[0]}</h3><p>{L.next[1]}</p></div>
                    <ul className="chart-legend" aria-label="Legend">
                      <li><span className="swatch" style={{ background: 'var(--sun)' }} aria-hidden /> {expert ? 'Sunlit' : 'Sunny'}</li>
                      <li><span className="swatch" style={{ background: 'var(--earth)' }} aria-hidden /> Earth in view</li>
                      <li><span className="swatch swatch-line" aria-hidden /> Now</li>
                    </ul>
                  </div>
                  <TimelineM data={data} t={tl} onSeek={onT} />
                </div>

                <div className="instrument">
                  <header className="pnl-h"><h3>{L.slip[0]}</h3><p>{L.slip[1]}</p></header>
                  <SlipPanelM data={data} t={tl} t0={range[0]} t1={range[1]} onSeek={pickDay} playing={playing} plain={!expert} />
                </div>

                <div className="instrument">
                  <header className="pnl-h"><h3>{L.me[0]}</h3><p>{L.me[1]}</p></header>
                  <MoonEarthM data={data} t={tl} m={res.metrics} />
                </div>

                </>}
                {(expert || partnerData) && <section className="deep" aria-label="Detail">
                  <div className="view-head pnl-h">
                    <div><h3>{L.deep}</h3><p>{L.deepText[dv === 'compare' && !partnerData ? 'libration' : deep]}</p></div>
                    <div className="seg" role="tablist" aria-label="Detail panels">
                      {expert && <button role="tab" className="seg-key" aria-selected={dv === 'libration'} onClick={() => setDeep('libration')}><Earth size={14} /> {L.deepTabs.libration}</button>}
                      {partnerData && <button role="tab" aria-selected={dv === 'compare'} onClick={() => setDeep('compare')}>{L.deepTabs.compare}</button>}
                      {expert && <button role="tab" aria-selected={dv === 'calendar'} onClick={() => setDeep('calendar')}>{L.deepTabs.calendar}</button>}
                      {expert && <button role="tab" aria-selected={dv === 'mission'} onClick={() => setDeep('mission')}>{L.deepTabs.mission}</button>}
                    </div>
                  </div>
                  {dv === 'compare' && partnerData ? (
                    <PairCompare a={partnerData} b={data} t={tl} expert={expert} range={doc.range} onRecompute={(lat, lon, mastM, slot) => comparePoint(lat, lon, mastM, slot)} busy={pointBusy}
                      onCloseUp={(id) => { setCloseUp((c) => ({ id, n: (c?.n ?? 0) + 1 })); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      onSwap={() => { const p = partner; setPartner(siteId); if (p) setSiteId(p); }} onClear={() => { setPartner(null); setDeep('libration'); }} />
                  ) : dv === 'calendar' ? (
                    <HeatmapM data={data} t={tl} onPick={pickDay} />
                  ) : dv === 'mission' ? (
                    mission ? <MissionPanel d={data} r={res} m={mission} t={t} plan={plan} onPlan={setPlan} sites={allSites.filter((s) => s.id !== siteId)} all={all}
                      onSeek={(x) => { setPlaying(false); setT(Math.max(range[0], Math.min(range[1], x))); }}
                      onCompare={(ids) => { setScenarios(ids.map((id) => ({ siteId: id, t }))); setMode('compare'); window.scrollTo({ top: 0 }); }}
                      onCalc={() => { setMode('calc'); window.scrollTo({ top: 0 }); }} /> : <Loading label="Computing mission" />
                  ) : (
                    <div className="numbers">
                      <LibrationTool data={data} t={tl} range={range} onSeek={pickDay} />
                      <ExportM d={data} r={res} />
                    </div>
                  )}
                </section>}
              </>
            ) : siteId ? <Loading label="Loading site" /> : !expert ? (
              <div className="simple-empty">
              <h2>Where would you land on the Moon?</h2>
              <p>Pick a place from the list or click a dot on the Moon. You'll see whether it's sunny, whether it can talk to Earth, and whether it's a good place for a spacecraft to land.</p>
              <div className="simple-picks">
                {['apollo-11', 'connecting-ridge', 'shackleton-floor', 'change-4'].map((id) => {
                  const s2 = allSites.find((x) => x.id === id);
                  return s2 ? <button key={id} onClick={() => chooseSite(id)}><b>{s2.short || s2.name}</b><small>{s2.mission}</small></button> : null;
                })}
              </div>
            </div>
            ) : (
              <>
                <div className="work-head">
                  <h2>-</h2>
                  <p className="when"><span className="num">{when(t)} UTC</span><span>Click a site point on the 3D Moon or pick one from the list</span></p>
                </div>
                <div className="instrument">
                  <header className="pnl-h"><h3>Time</h3><p>The date and time being evaluated. Everything below updates to match.</p></header>
                  <TimeControls t={t} t0={range[0]} t1={range[1]} onChange={onT} playing={playing} onPlaying={setPlaying} speed={speed} onSpeed={setSpeed} />
                </div>
                <div className="instrument">
                  <header className="pnl-h"><h3>Conditions</h3><p>Sunlight and Earth visibility now, and the power and radio outlook for this lunar day.</p></header>
                  <section className="answer" aria-label="Status (no site selected)">
                    <div className="answer-now"><span className="answer-kind">At this time</span><p className="dash">Sunlight -</p><p className="dash">Earth -</p></div>
                    <div className="answer-card"><span className="answer-kind">Power</span><span className="answer-word">-</span></div>
                    <div className="answer-card"><span className="answer-kind">Radio to Earth</span><span className="answer-word">-</span></div>
                  </section>
                </div>
                {[['Horizon', 'The terrain skyline seen from the site, with the paths of the Sun and Earth.'],
                  ['Next 30 days', 'When the site is sunlit and when Earth is above the horizon.'],
                  ['If the landing date slips', 'How far the landing date can move before the power or radio rating changes.'],
                  ['Moon vs Earth', 'The selected site next to the same latitude on Earth.'],
                  ['Detailed analysis', 'Calendar, all figures and the mission plan for the selected site.']].map(([h, c]) => (
                  <div className="instrument" key={h}>
                    <header className="pnl-h"><h3>{h}</h3><p>{c}</p></header>
                    <p className="dash-block">-</p>
                  </div>
                ))}
              </>
            )}
          </section>
        </main>
      ) : mode === 'launch' ? (
        <main key="m1" className="compare-main wrap view-in">
          {!expert && <p className="plain-intro">{L.intro.launch}</p>}
          <LaunchPlanner doc={doc} sites={allSites} siteId={siteId} onSite={setSiteId} onCustom={addCustom} data={data} t={t} onTime={onT} range={range} target={launchTarget} />
        </main>
      ) : mode === 'calc' ? (
        <main key="m2" className="compare-main wrap view-in">
          {!expert && <p className="plain-intro">{L.intro.calc}</p>}
          <Calculator state={calc} onState={setCalc} sim={simSnapshot(data, res, mission)} simLabel={`${info?.name ?? 'the selected site'} at ${when(t)} UTC`} />
        </main>
      ) : (
        <main key="m3" className="compare-main wrap view-in">
          {!expert && <p className="plain-intro">{L.intro.compare}</p>}
          <Compare sites={allSites} scenarios={scenarios} onChange={setScenarios} range={range} />
        </main>
      )}
      <footer className="footer wrap">
        <span>Terrain: NASA LRO LOLA (PDS Geosciences). Ephemeris: astronomy-engine, validated against JPL Horizons.</span>
        <span className="num">{doc.range.start.slice(0, 10)} to {doc.range.end.slice(0, 10)} UTC</span>
      </footer>
      </div>
      {missionsOpen && <MissionCompare doc={doc} sites={allSites} pair={pair} onPair={setPair} onClose={() => setMissionsOpen(false)} onOpenSite={pickSite} onPlanLaunch={(id) => { setMissionsOpen(false); setSiteId(id); setMode('launch'); window.scrollTo({ top: 0 }); }} />}
      <AssistantChat sites={allSites} onAction={onHelpAction} context={helpContext} />
      {about && <About doc={doc} onClose={() => setAbout(false)} />}
      {guide && <Guide onClose={closeGuide} />}
      {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
      {choosing && <ModeChooser last={lastUi} onChoose={(u) => setUi(u, () => setChoosing(false))} />}
      <div className="action-bar">
        {mode === 'explore' && res && info ? <Countdown m={res.metrics} t={t} name={info.short || info.name} simple={!expert} /> : (
        <span className="ab-ctx">
          <b>{mode === 'explore' ? info?.short ?? 'Site' : mode === 'compare' ? 'Compare' : mode === 'launch' ? 'Launch' : 'Calculator'}</b>
        </span>)}
        <span className="ab-time num muted">{when(t)} UTC</span>
      </div>
    </div>
  );
}
