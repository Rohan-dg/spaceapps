import { ChevronLeft, ChevronRight, Pause, Play, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { HelpTip } from './Help';

export const toInput = (t: number) => new Date(t).toISOString().slice(0, 16);
export const fromInput = (s: string) => Date.parse(s + ':00Z');

export const SPEEDS = [
  { label: '1 hour / s', hps: 1 },
  { label: '6 hours / s', hps: 6 },
  { label: '1 day / s', hps: 24 },
  { label: '3 days / s', hps: 72 },
];

interface Props {
  t: number; t0: number; t1: number; onChange: (t: number) => void;
  playing: boolean; onPlaying: (p: boolean) => void; speed: number; onSpeed: (s: number) => void;
}

export default function TimeControls({ t, t0, t1, onChange, playing, onPlaying, speed, onSpeed }: Props) {
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      const next = tRef.current + dt * SPEEDS[speed].hps * 3600000;
      if (next >= t1) { onChange(t1); onPlaying(false); return; }
      onChange(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, t1, onChange, onPlaying]);

  const clamp = (x: number) => Math.max(t0, Math.min(t1, x));
  const step = (h: number) => onChange(clamp(t + h * 3600000));
  const [more, setMore] = useState(false);
  return (
    <div className="time-controls" role="group" aria-label="Time">
      <div className="time-main">
        <button className="btn-primary play" onClick={() => onPlaying(!playing)} aria-pressed={playing} title="Play or pause (Space)">
          {playing ? <><Pause size={16} aria-hidden /> Pause</> : <><Play size={16} aria-hidden /> Play</>}
        </button>
        <div className="btn-group" role="group" aria-label="Step one day">
          <button onClick={() => step(-24)} title="Back 1 day (Shift + ←)"><ChevronLeft size={15} aria-hidden /> 1 day</button>
          <button onClick={() => step(24)} title="Forward 1 day (Shift + →)">1 day <ChevronRight size={15} aria-hidden /></button>
        </div>
        <label className="dt">
          <span className="sr-only">Date and time, UTC</span>
          <input id="main-time" type="datetime-local" value={toInput(t)} min={toInput(t0)} max={toInput(t1)} step={60}
            onChange={(e) => { const v = fromInput(e.target.value); if (isFinite(v)) onChange(clamp(v)); }} />
          <span className="utc">UTC <HelpTip label="Why UTC?" align="right">All times are Coordinated Universal Time, the standard clock for spaceflight. The Moon has no time zones.</HelpTip></span>
        </label>
        <button className={`more-toggle${more ? ' on' : ''}`} onClick={() => setMore((x) => !x)} aria-expanded={more} aria-controls="time-more">
          <SlidersHorizontal size={14} aria-hidden /> {more ? 'Fewer' : 'More'} controls
        </button>
      </div>
      {more && (
        <div className="time-more" id="time-more">
          <div className="btn-row" role="group" aria-label="Fine steps">
            <button onClick={() => step(-240)} title="Back 10 days">−10 days</button>
            <button onClick={() => step(-1)} title="Back 1 hour (←)">−1 hour</button>
            <button onClick={() => step(1)} title="Forward 1 hour (→)">+1 hour</button>
            <button onClick={() => step(240)} title="Forward 10 days">+10 days</button>
          </div>
          <label className="speed">
            <span>Play speed</span>
            <select id="speed" value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
              {SPEEDS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
            </select>
          </label>
          <span className="muted small">Keys: <kbd>Space</kbd> play · <kbd>←</kbd> <kbd>→</kbd> 1 hour · <kbd>Shift</kbd> + arrows 1 day</span>
        </div>
      )}
      <div className="scrub">
        <input className="scrubber" type="range" min={t0} max={t1} step={1800000} value={t}
          aria-label="Drag to travel through time" aria-valuetext={new Date(t).toUTCString()}
          onChange={(e) => onChange(Number(e.target.value))} />
        <div className="scrub-labels"><span>{toInput(t0).slice(0, 4)}</span><span className="scrub-hint">Drag to travel through time</span><span>{toInput(t1).slice(0, 4)}</span></div>
      </div>
    </div>
  );
}
