import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SiteInfo } from '../lib/data';
import { CAM_VIEWS, Game, type Hud, type Stats } from './engine';
import { MISSIONS, missionById, RATE, type MissionId, type Phase } from './sim';
import { ROVERS, roverById, type RoverDef, type RoverId } from './rovers';
import RoverPreview from './RoverPreview';
import './game.css';
import { fmtInt } from '../lib/fmt';

type Stage = 'loading' | 'brief' | 'play' | 'pause' | 'done' | 'frozen' | 'power' | 'time' | 'unavailable' | 'error';
type Message = { id: number; from: string; text: string };
interface Props { sites: SiteInfo[]; selectedId: string; t: number; tMax: number; onClose: () => void }
const SITES = ['mons-mouton', 'connecting-ridge', 'shackleton-rim', 'de-gerlache-rim', 'malapert', 'nobile-rim', 'faustini-rim', 'haworth'];
const utc = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}`;
const STEP_NAME: Record<Phase, string> = { charge: 'Charge', phone: 'Contact', ice: 'Sample', targets: 'Scan', uplink: 'Uplink', haven: 'Park', done: 'Done' };
const PICK_KEY = 'rover-pick', MISSION_KEY = 'rover-mission';
/** best score per rover and mission (the Ice Survey keeps the key it always had) */
const bestKey = (id: string, m: string) => (m === 'survey' ? `rover-best-${id}` : `rover-best-${id}-${m}`);
const stored = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const store = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const fmt = fmtInt;

/** A small set of original control glyphs, shared by mouse, keyboard, and touch controls. */
export function RoverGlyph({ kind = 'rover' }: { kind?: 'rover' | 'pause' | 'close' | 'play' | 'camera' | 'sun' | 'earth' | 'reset' }) {
  const shapes = {
    rover: <><path d="M5 14V8h10v6M5 8l3-3h7M15 10l5 3v3M4 14h13" /><circle cx="6" cy="17" r="2.5" /><circle cx="15" cy="17" r="2.5" /><path d="M10 5V2m0 0h4" /></>,
    pause: <><path d="M8 5v14M16 5v14" strokeWidth="4" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
    camera: <><path d="M3 8h5l2-3h5l2 3h4v12H3Z" /><circle cx="12" cy="13" r="3" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" /></>,
    earth: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
    reset: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></>,
  };
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[kind]}</svg>;
}


function Hold({ label, control, send, children, disabled = false, className = '' }: { label: string; control: string; send: (key: string, down: boolean) => void; children: ReactNode; disabled?: boolean; className?: string }) {
  const held = useRef(false);
  const release = useCallback(() => { if (held.current) send(control, false); held.current = false; }, [control, send]);
  useEffect(() => release, [release]);
  return <button className={className} aria-label={label} title={label} disabled={disabled}
    onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); held.current = true; send(control, true); }}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onBlur={release}
    onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); held.current = true; send(control, true); } }}
    onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } }}
  >{children}</button>;
}

export default function RoverGame({ sites, selectedId, t, tMax, onClose }: Props) {
  const available = sites.filter((s) => SITES.includes(s.id) && !s.synthetic);
  const [missionId, setMissionId] = useState<MissionId>(() => missionById(stored(MISSION_KEY) ?? 'survey').id);
  const mission = missionById(missionId);
  const missionRef = useRef(missionId);
  const [roverId, setRoverId] = useState(() => roverById(stored(PICK_KEY) ?? 'badger').id);
  const rover = roverById(roverId);
  const roverRef = useRef(roverId);
  const [best, setBest] = useState<number | null>(null);
  const [siteId, setSite] = useState(() => available.some((s) => s.id === selectedId) ? selectedId : 'mons-mouton');
  const site = available.find((s) => s.id === siteId) ?? available[0];
  const [run, setRun] = useState(0);
  const [stage, setStage] = useState<Stage>('loading');
  const [loading, setLoading] = useState('Loading the terrain');
  const [error, setError] = useState('');
  const [ready, setReady] = useState<{ t: number; movedDays: number } | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [help, setHelp] = useState(false);
  const [intro, setIntro] = useState(false);
  const [signalFlash, setSignalFlash] = useState(0);
  const [log, setLog] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const host = useRef<HTMLDivElement>(null), root = useRef<HTMLDivElement>(null);
  const sunTag = useRef<HTMLDivElement>(null), earthTag = useRef<HTMLDivElement>(null), goalTag = useRef<HTMLDivElement>(null);
  const engine = useRef<Game | null>(null), serial = useRef(0);
  const modelBase = new URL(import.meta.env.BASE_URL, location.href).href;
  const pickRover = (id: RoverId) => { setRoverId(id); roverRef.current = id; store(PICK_KEY, id); void engine.current?.setRover(id); };
  const pickMission = (id: MissionId) => { setMissionId(id); missionRef.current = id; store(MISSION_KEY, id); engine.current?.setMission(id); };
  const pickRoverRef = useRef(pickRover);
  useEffect(() => { pickRoverRef.current = pickRover; });
  const stageRef = useRef(stage);
  useEffect(() => { stageRef.current = stage; }, [stage]);
  const send = useCallback((key: string, down: boolean) => engine.current?.press(key, down), []);
  const pause = useCallback(() => { if (stageRef.current === 'play') { engine.current?.pause(true); setStage('pause'); } }, []);
  const resume = () => { setIntro(false); setHelp(false); setLog(false); setConfirmExit(false); engine.current?.pause(false); setStage('play'); root.current?.focus(); };
  const press = (key: string) => { engine.current?.press(key, true); engine.current?.press(key, false); };

  useEffect(() => {
    if (!host.current || !site) { setError('No supported terrain is available. Return to the map and reload the site data.'); setStage('error'); return; }
    let live = true;
    setStage('loading'); setHud(null); setReady(null); setStats(null); setMessages([]); setError(''); setHelp(false); setLog(false);
    const game = new Game({ host: host.current, base: new URL(import.meta.env.BASE_URL, location.href).href, siteId: site.id, lat: site.lat, lon: site.lon, t, tMax, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, roverId: roverRef.current, missionId: missionRef.current }, {
      onStage: (s) => { if (live) setLoading(s); },
      onReady: (r) => { if (live) { setReady(r); setStage(r ? 'brief' : 'unavailable'); } },
      onHud: (h) => { if (live) setHud(h); },
      onMessage: (m) => {
        if (!live) return;
        setMessages((a) => [...a.slice(-39), { ...m, id: ++serial.current }]);
        if (/no signal|signal lost/i.test(m.text)) setSignalFlash(Date.now());
      },
      onEnd: (kind, s) => {
        if (!live) return;
        setStats(s); setStage(kind);
        const prev = Number(stored(bestKey(roverRef.current, missionRef.current)) ?? 0);
        setBest(prev);
        if (kind === 'done' && s.score > prev) store(bestKey(roverRef.current, missionRef.current), String(s.score));
      },
      onError: (e) => { if (live) { setError(e); setStage('error'); } },
    });
    engine.current = game;
    if (sunTag.current && earthTag.current && goalTag.current) game.setTags({ sun: sunTag.current, earth: earthTag.current, goal: goalTag.current });
    return () => { live = false; game.dispose(); if (engine.current === game) engine.current = null; };
  }, [site, t, tMax, run]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; root.current?.focus();
    const visibility = () => { if (document.hidden) pause(); };
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (stageRef.current === 'play') pause(); else if (stageRef.current === 'pause') { engine.current?.pause(false); setStage('play'); setHelp(false); setLog(false); setConfirmExit(false); } }
      // Keep tab navigation inside this fullscreen workspace.
      if (e.key === 'Tab') {
        const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select, summary, a[href], [tabindex="0"]') ?? []).filter((el) => el.getClientRects().length && !el.closest('[inert]'));
        if (!nodes.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', keyboard, true); window.addEventListener('blur', pause); document.addEventListener('visibilitychange', visibility);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', keyboard, true); window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', visibility); };
  }, [pause]);

  // in the garage, the left and right arrow keys flip through the rovers too
  useEffect(() => {
    if (stage !== 'brief') return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tag = (e.target as HTMLElement).tagName; if (tag === 'SELECT' || tag === 'INPUT') return;
      e.preventDefault();
      const i = ROVERS.findIndex((x) => x.id === roverRef.current), next = ROVERS[(i + (e.key === 'ArrowRight' ? 1 : -1) + ROVERS.length) % ROVERS.length];
      pickRoverRef.current(next.id);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [stage]);
  useEffect(() => { if (stage !== 'play') root.current?.querySelector<HTMLButtonElement>('.rg-dialog .rg-primary, .rg-dialog button')?.focus(); }, [stage, confirmExit, help, log]);

  const close = () => { if (stage === 'play' || stage === 'pause') { pause(); setConfirmExit(true); } else onClose(); };
  const playing = stage === 'play', blocked = stage !== 'play';
  const transmit = hud?.phase === 'phone' || hud?.phase === 'uplink';
  const stopped = !!hud && Math.abs(hud.speed) < 0.3;
  const restart = () => { setConfirmExit(false); setRun((n) => n + 1); };
  const retry = () => { engine.current?.retry(); setStage('play'); setHelp(false); setLog(false); setConfirmExit(false); root.current?.focus(); };
  const last = messages[messages.length - 1];
  const complete = hud?.phase === 'done';

  function downloadLog() {
    const data = { mission: 'Rover education scenario', rover: `${rover.callsign} (${rover.basis})`, score: stats?.score ?? hud?.score, site: site?.name, latitude: site?.lat, longitude: site?.lon, startedUTC: ready ? new Date(ready.t).toISOString() : null, timeUTC: hud ? new Date(hud.t).toISOString() : null, stats, phase: hud?.phase, batteryPct: hud?.battPct, temperatureC: hud?.tempC, messages: messages.map(({ from, text }) => ({ from, text })), note: 'NASA terrain and ephemeris; fictional ice deposits, solar equipment, power, thermal and motion model.' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `rover-mission-${siteId}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="rg" ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="rg-title" data-stage={stage}>
    <div className="rg-world" ref={host} aria-label="Interactive lunar terrain. Drag to orbit the camera and scroll to zoom." />
    <header className="rg-bar">
      <div className="rg-identity"><RoverGlyph /><div><h1 id="rg-title">{rover.callsign}</h1><span>{site?.short || site?.name}</span></div></div>
      {hud && stage !== 'brief' && <div className="rg-stats" aria-label="Rover status">
        <span className={`rg-stat${hud.battPct < 20 ? ' danger' : ''}`} title={`Battery: ${signed(hud.netW)} W net`}><small>Battery</small><b>{hud.battPct.toFixed(0)}%</b><i className="rg-mini" aria-hidden="true"><u style={{ width: `${Math.max(0, Math.min(100, hud.battPct))}%` }} /></i></span>
        <span className={`rg-stat${hud.tempC < -25 ? ' danger' : ''}`} title={hud.heaterW > 0 ? `Heater on, ${hud.heaterW.toFixed(0)} W` : 'Heater standby'}><small>Temp</small><b>{signed(hud.tempC)} °C</b></span>
        <button className={`rg-stat ${hud.sunFrac > 0 ? 'solar' : 'danger'}`} onClick={() => engine.current?.pointCamera('sun')} title="Sun: tap to point the camera at it"><small>Sun</small><b>{hud.sunFrac > 0 ? `${hud.solarW.toFixed(0)} W` : 'No sun'}</b></button>
        <button className={`rg-stat ${hud.earthUp ? 'signal' : 'danger'}`} onClick={() => engine.current?.pointCamera('earth')} title="Earth: tap to point the camera at it"><small>Earth</small><b>{hud.earthUp ? 'Connected' : 'No signal'}</b></button>
        <span className="rg-stat" title={`${CAM_VIEWS.find((v) => v.id === hud.view)?.label ?? 'Chase'} camera`}><small>Speed</small><b>{Math.abs(hud.speed).toFixed(1)} m/s</b></span>
        <span className={`rg-stat score${hud.combo > 1 ? ' combo' : ''}`} aria-live="polite" title="Score and science targets scanned"><small>Score</small><b key={hud.score}>{fmt(hud.score)}</b>{hud.combo > 1 && <em>×{hud.combo}</em>}<small className="rg-targets">◆ {hud.bonus}/{hud.bonusTotal}</small></span>
      </div>}
      <div className="rg-clock"><strong>{utc(hud?.t ?? ready?.t ?? t)} UTC</strong><span>{hud?.rate ?? RATE}× time{stage === 'pause' ? ' · Paused' : ''}</span></div>
      <div className="rg-bar-actions"><button onClick={() => { pause(); setHelp(true); }} disabled={stage !== 'play' && stage !== 'pause'}>Controls</button><button onClick={playing ? pause : resume} disabled={stage !== 'play' && stage !== 'pause'} aria-label={playing ? 'Pause mission' : 'Resume mission'}><RoverGlyph kind={playing ? 'pause' : 'play'} /></button><button onClick={close} aria-label="Exit rover mission"><RoverGlyph kind="close" /></button></div>
    </header>

    <div className="rg-flight" inert={blocked} aria-hidden={blocked}>
      {hud && <div className="rg-goal" aria-label="Current objective" title={hud.obj.text}>
        <span className="rg-steps" aria-label="Mission progress">{hud.steps.map((step, i, all) => { const at = hud.phase === 'done' ? all.length : all.indexOf(hud.phase); return <span key={step} className={complete || at > i ? 'finished' : at === i ? 'current' : ''} title={STEP_NAME[step]}>{complete || at > i ? '✓' : i + 1}</span>; })}</span>
        <b>{hud.obj.title}</b>{hud.objDist != null && <em>{hud.objDist.toFixed(0)} m</em>}
        <span className="rg-goal-text">{hud.obj.text}</span>
        {hud.phase === 'charge' && stopped && hud.objDist !== null && hud.objDist < 21 && <span className="rg-goal-tip">Hold <kbd>F</kbd> to charge faster</span>}
        {hud.phase === 'ice' && <span className={`rg-goal-ice${hud.canDig ? ' locked' : ''}`}>Ice {hud.canDig ? 'found' : `${(hud.ice * 100).toFixed(0)}%`}<i aria-hidden="true"><u style={{ width: `${hud.ice * 100}%` }} /></i>{hud.found}/{hud.total}</span>}
      </div>}

      <div className="rg-tags" aria-hidden="true">
        <div ref={sunTag} className={`rg-tag ${hud && hud.sunFrac > 0 ? 'solar' : 'danger'}`}><span><RoverGlyph kind="sun" /><b>Sun</b><small>{hud && hud.sunFrac > 0 ? `${Math.round(hud.sunFrac * 100)}% visible` : 'No power received'}</small></span></div>
        <div ref={earthTag} className={`rg-tag ${hud?.earthUp ? 'signal' : 'danger'}`}><span><RoverGlyph kind="earth" /><b>Earth</b><small>{hud?.earthUp ? 'Connected' : 'No signal'}</small></span></div>
        <div ref={goalTag} className="rg-tag goal"><span><b>◇ {hud?.phase === 'ice' ? 'Survey area' : 'Objective'}</b><small>{hud?.objDist?.toFixed(0)} m</small></span></div>
      </div>

      {hud && !hud.earthUp && (transmit || Date.now() - signalFlash < 5000) && <div className="rg-alert" role="alert"><RoverGlyph kind="earth" /><span><b>No Earth signal</b> Earth is behind the terrain, so you can't transmit. Drive until Earth is in view, or hold <kbd>F</kbd> to wait for it.</span></div>}
      {hud?.gain && <div className="rg-gain" key={hud.gain.id}><b>+{fmt(hud.gain.pts)}</b><span>{hud.gain.label}</span></div>}
      {hud && hud.nearBonus !== null && hud.nearBonus < 40 && hud.nearBonus > 9 && <div className="rg-near">Science target {hud.nearBonus.toFixed(0)} m</div>}
      {last && <button className="rg-radio" onClick={() => { pause(); setLog(true); }} title="Open the mission log"><span>{last.from}<small>Mission log ↗</small></span><p key={last.id} role="status">{last.text}</p></button>}

      <footer className="rg-controls">
        <div className="rg-dpad" role="group" aria-label="Driving controls">
          <Hold send={send} control="w" label="Drive forward (W or up arrow)" className="forward">↑</Hold>
          <Hold send={send} control="a" label="Turn left (A or left arrow)">←</Hold>
          <Hold send={send} control="brake" label="Brake (Space)" className="brake">Stop</Hold>
          <Hold send={send} control="d" label="Turn right (D or right arrow)">→</Hold>
          <Hold send={send} control="s" label="Reverse (S or down arrow)" className="reverse">↓</Hold>
        </div>
        <div className="rg-actions">
          <span title={hud?.phase !== 'ice' ? 'Dig (E): collects an ice sample once you reach the survey area' : !stopped ? 'Dig (E): stop the rover first' : 'Dig (E): collect an ice sample here'}><button className={hud?.canDig ? 'rg-primary' : ''} disabled={!stopped || !!hud?.busy || hud?.phase !== 'ice' || hud?.dead} onClick={() => press('e')}><kbd>E</kbd> Dig</button></span>
          <span title={!transmit ? 'Transmit (T): sends your data to Earth when the mission asks for it' : !hud?.earthUp ? 'Transmit (T): no Earth signal here. Drive until Earth is in view' : !stopped ? 'Transmit (T): stop the rover first' : 'Transmit (T): send your data to Earth'}><button className={transmit && hud?.earthUp ? 'rg-primary' : ''} disabled={!stopped || !!hud?.busy || !transmit || !hud?.earthUp || hud?.dead} onClick={() => press('t')}><kbd>T</kbd> Transmit</button></span>
          <Hold send={send} control="f" label="Wait (hold F): time runs 1800× faster while parked, to charge or wait for Earth" disabled={!stopped || !!hud?.busy}><kbd>F</kbd> Wait</Hold>
          <button aria-pressed={!!hud?.lamp} onClick={() => press('l')} title="Lights (L): headlights on or off for driving in shadow"><kbd>L</kbd> Lights</button>
        </div>
        <div className="rg-camera-actions" role="group" aria-label="Camera controls">
          <div className="rg-views" role="radiogroup" aria-label="Camera position (C switches first / third person)">
            <RoverGlyph kind="camera" />
            {CAM_VIEWS.map((v) => <button key={v.id} role="radio" aria-checked={(hud?.view ?? 'chase') === v.id} onClick={() => engine.current?.setView(v.id)} title={v.id === 'mast' ? 'First person: the view from the rover mast (C)' : v.id === 'chase' ? 'Third person: right behind the rover (C)' : `${v.label} camera`}>{v.label}</button>)}
          </div>
          <button aria-pressed={hud?.tele} onClick={() => press('z')} title="Lens (Z): long lens, makes the hills, Sun and Earth look bigger">Lens</button>
          <button onClick={() => engine.current?.zoom(-0.3)} aria-label="Zoom in" title="Zoom in">+</button><button onClick={() => engine.current?.zoom(0.3)} aria-label="Zoom out" title="Zoom out">−</button>
          <button onClick={() => engine.current?.resetCamera()} aria-label="Reset camera" title="Put the camera back behind the rover"><RoverGlyph kind="reset" /></button>
        </div>
      </footer>
      {hud?.busy && <div className="rg-work" role="status"><b>{hud.busy.kind === 'dig' ? 'Collecting sample' : 'Transmitting to Earth'} · {Math.round(hud.busy.p * 100)}%</b><div><i style={{ width: `${hud.busy.p * 100}%` }} /></div></div>}
      {hud && hud.held > 0 && <div className="rg-wait" role="status">Waiting · 30 simulated minutes per second</div>}
    </div>

    {blocked && <div className="rg-scrim"><section className="rg-dialog" aria-labelledby="rg-dialog-title">
      {stage === 'loading' ? <><div className="rg-loader" aria-hidden="true" /><h2 id="rg-dialog-title">Preparing your rover</h2><p role="status">{loading}.</p><p>The route needs reachable sunlight, Earth contact and shadowed ground.</p><button onClick={onClose}>Cancel</button></>
        : stage === 'unavailable' || stage === 'error' ? <><h2 id="rg-dialog-title">{stage === 'error' ? 'The mission could not load' : 'No playable route here'}</h2><p role={stage === 'error' ? 'alert' : undefined}>{stage === 'error' ? error : 'This site and the next 30 days do not contain a reachable combination of sunlight, Earth contact and shadow. Try another site, or return to the map to choose an earlier date.'}</p><SiteSelect siteId={siteId} sites={available} onChange={setSite} /><div className="rg-dialog-actions"><button className="rg-primary" onClick={restart}>Try again</button><button onClick={onClose}>Return to map</button></div></>
          : stage === 'brief' ? <>
            <span className="rg-mission-no">Rover garage</span>
            <h2 id="rg-dialog-title">Pick your rover!</h2>
            <p className="rg-pick-lead">Every rover here is based on a real Moon rover. Each one is good at something different.</p>
            <RoverCard r={rover} base={modelBase} onStep={(d) => pickRover(ROVERS[(ROVERS.findIndex((x) => x.id === roverRef.current) + d + ROVERS.length) % ROVERS.length].id)} />
            <div className="rg-rovers" role="radiogroup" aria-label="Rover">
              {ROVERS.map((r) => <button key={r.id} role="radio" aria-checked={r.id === roverId} className={r.id === roverId ? 'on' : ''} onClick={() => pickRover(r.id)}>
                <i aria-hidden="true">{r.callsign[0]}</i><b>{r.callsign}</b><small>{r.tag}</small>{Number(stored(bestKey(r.id, missionId)) ?? 0) > 0 && <em>Best {fmt(Number(stored(bestKey(r.id, missionId))))}</em>}
              </button>)}
            </div>
            <h3 className="rg-pick-h">Pick a mission</h3>
            <div className="rg-missions" role="radiogroup" aria-label="Mission">
              {MISSIONS.map((m) => <button key={m.id} role="radio" aria-checked={m.id === missionId} className={m.id === missionId ? 'on' : ''} onClick={() => pickMission(m.id)}>
                <span className="rg-m-top"><b>{m.title}</b><i className={`lv-${m.level.toLowerCase()}`}>{m.level}</i></span>
                <small>{m.kid}</small>
                <span className="rg-m-meta"><span>About {m.minutes} min</span><span>{m.steps.length} step{m.steps.length === 1 ? '' : 's'}</span>{Number(stored(bestKey(roverId, m.id)) ?? 0) > 0 && <em>Best {fmt(Number(stored(bestKey(roverId, m.id))))}</em>}</span>
              </button>)}
            </div>
            <SiteSelect siteId={siteId} sites={available} onChange={setSite} />
            {!!ready?.movedDays && <p className="rg-date-note">The mission starts {ready.movedDays.toFixed(1)} days after your selected date, when the Sun is up.</p>}
            <p className="rg-input-note"><kbd>W A S D</kbd> or arrow keys to drive · drag to look around</p>
            <div className="rg-dialog-actions"><button className="rg-primary rg-launch" onClick={() => { engine.current?.begin(); engine.current?.pause(true); setIntro(true); setStage('pause'); }}><RoverGlyph kind="play" /> Launch {rover.callsign}!</button><button onClick={onClose}>Back to the map</button></div>
            <ScienceNote />
          </>
            : stage === 'pause' && intro ? <><span className="rg-mission-no">Before you drive</span><h2 id="rg-dialog-title">How to drive {rover.callsign}</h2><Controls /><div className="rg-dialog-actions"><button className="rg-primary" onClick={resume}><RoverGlyph kind="play" /> Start driving</button></div></>
            : stage === 'pause' ? <><h2 id="rg-dialog-title">{confirmExit ? 'Leave this mission?' : help ? 'Rover controls' : log ? 'Mission log' : 'Mission paused'}</h2>{confirmExit ? <p>Your current mission progress will be lost. You can stay here and resume from this position.</p> : help ? <Controls /> : log ? <ol className="rg-log">{messages.map((m) => <li key={m.id}><b>{m.from}</b><p>{m.text}</p></li>)}</ol> : <p>The rover and simulation clock are stopped. Completed objectives are saved as checkpoints for this mission.</p>}<div className="rg-dialog-actions"><button className="rg-primary" onClick={resume}><RoverGlyph kind="play" /> Resume mission</button>{confirmExit ? <button onClick={onClose}>Leave mission</button> : <button onClick={retry}>Retry checkpoint</button>}{log && <button onClick={downloadLog}>Download log</button>}</div>{!confirmExit && <ScienceNote />}</>
              : <><span className="rg-mission-no">{stage === 'done' ? `${mission.title} complete` : 'Mission interrupted'}</span><h2 id="rg-dialog-title">{stage === 'done' ? (mission.id === 'survey' ? 'Samples returned. Rover safe.' : `${mission.title}: done!`) : stage === 'frozen' ? 'The electronics froze.' : stage === 'power' ? 'The battery is depleted.' : 'The simulation window ended.'}</h2><p>{stage === 'done' ? mission.win : stage === 'frozen' ? 'The temperature fell below −40 °C. Spend less time in shadow and keep enough charge for the heaters.' : stage === 'power' ? 'The rover ran out of energy in shadow. Return to your last checkpoint and charge before going farther.' : 'Return to a checkpoint or choose an earlier date on the map.'}</p>{stats && stage === 'done' && <div className="rg-scorecard">
                <div className="rg-stars" aria-label={`${stats.stars} of 3 stars`}>{[1, 2, 3].map((i) => <span key={i} className={i <= stats.stars ? 'on' : ''}>★</span>)}</div>
                <div className="rg-total"><span>{rover.callsign} scored</span><strong>{fmt(stats.score)}</strong>{best !== null && stats.score > best ? <em>New best!</em> : best ? <small>Best {fmt(best)}</small> : null}</div>
                <ol>{stats.parts.map(([k, v], i) => <li key={i} style={{ animationDelay: `${i * 70}ms` }}><span>{k}</span><b>+{fmt(v)}</b></li>)}</ol>
              </div>}
              {stats && <div className="rg-results"><span>Distance <b>{stats.odo.toFixed(0)} m</b></span><span>Samples <b>{stats.found}</b></span><span>Targets <b>{stats.bonus}/{stats.bonusTotal}</b></span><span>Coldest <b>{stats.minTempC.toFixed(0)} °C</b></span></div>}<div className="rg-dialog-actions"><button className="rg-primary" onClick={stage === 'done' ? resume : retry}>{stage === 'done' ? 'Keep exploring' : 'Retry checkpoint'}</button><button onClick={restart}>New mission or rover</button><button onClick={downloadLog}>Download log</button><button onClick={onClose}>Return to map</button></div><ScienceNote /></>}
    </section></div>}
  </div>;
}

function RoverCard({ r, base, onStep }: { r: RoverDef; base: string; onStep: (d: number) => void }) {
  const bars: [string, number][] = [['Speed', r.bars.speed], ['Battery', r.bars.battery], ['Sun power', r.bars.solar], ['Stays warm', r.bars.cold], ['Science', r.bars.science]];
  return <div className="rg-rover-card">
    <div className="rg-stage">
      <RoverPreview id={r.id} base={base} />
      <button className="rg-step prev" onClick={() => onStep(-1)} aria-label="Previous rover">‹</button>
      <button className="rg-step next" onClick={() => onStep(1)} aria-label="Next rover">›</button>
      <span className="rg-nick">{r.tag}</span>
    </div>
    <div className="rg-rc-body" key={r.id}>
      <div className="rg-rc-head"><b>{r.callsign}</b><span>Real rover: <i>{r.basis}</i></span></div>
      <p>{r.kid}</p>
      <div className="rg-bars">{bars.map(([k, v]) => <div key={k}><span>{k}</span><i>{[0, 1, 2, 3, 4].map((n) => <u key={n} className={n < v ? 'on' : ''} />)}</i></div>)}</div>
      <div className="rg-perks"><div className="up"><b>Super power</b><span>{r.power}</span></div><div className="down"><b>Watch out</b><span>{r.watch}</span></div></div>
      <details className="rg-facts"><summary>Real facts about {r.basis}</summary><small>{r.origin}</small><dl>{r.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><p>{r.blurb}</p></details>
    </div>
  </div>;
}
function SiteSelect({ siteId, sites, onChange }: { siteId: string; sites: SiteInfo[]; onChange: (id: string) => void }) {
  return <label className="rg-site-select">Mission site<select value={siteId} onChange={(e) => onChange(e.target.value)}>{sites.map((s) => <option key={s.id} value={s.id}>{s.short || s.name}</option>)}</select></label>;
}
function ScienceNote() {
  return <details className="rg-science"><summary>What is real in this simulation?</summary><p>The surface uses NASA LOLA elevations. Sun and Earth positions follow the app's ephemeris and terrain horizon. Badger uses NASA's RASSOR 3D model; the other rovers are drawn from the published layout and dimensions of VIPER and the Apollo Lunar Roving Vehicle, and from the published concepts for NASA's Artemis Lunar Terrain Vehicle and MoonRanger.</p><p>Each rover's speed, battery, solar and heater figures keep its real character but are scaled for a short game. Ice locations, science targets, mission story, movement, battery and heat figures are fictional teaching models. Fine surface detail is illustrative. Solar collection assumes a Sun-tracking panel. This is not a flight simulation or a map of confirmed ice.</p><a href="https://github.com/nasa/NASA-3D-Resources" target="_blank" rel="noreferrer">NASA model source ↗</a></details>;
}
function Controls() {
  const rows = [['W / ↑', 'Drive forward'], ['S / ↓', 'Reverse'], ['A / ←', 'Turn left'], ['D / →', 'Turn right'], ['Space', 'Brake (Stop)'], ['E', 'Dig: collect ice, stopped near a deposit'], ['T', 'Transmit: send data, stopped with Earth in view'], ['F (hold)', 'Wait: time runs faster while parked'], ['L', 'Lights on or off'], ['C', 'Switch first person / third person'], ['Z', 'Lens: zoom the view'], ['Drag / scroll', 'Look around / zoom'], ['Esc', 'Pause']];
  return <div className="rg-key-list">{rows.map(([key, text]) => <div key={key}><kbd>{key}</kbd><span>{text}</span></div>)}<p>On touch screens, hold the arrow buttons to drive. Tap Sun or Earth in the telemetry strip to point the camera toward it.</p></div>;
}
