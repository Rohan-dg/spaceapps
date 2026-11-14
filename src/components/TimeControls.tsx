import { useEffect, useRef } from 'react';

export const toInput = (t: number) => new Date(t).toISOString().slice(0, 16);
export const fromInput = (s: string) => Date.parse(s + ':00Z');

export const SPEEDS = [
  { label: '1 h/s', hps: 1 },
  { label: '6 h/s', hps: 6 },
  { label: '1 d/s', hps: 24 },
  { label: '3 d/s', hps: 72 },
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
  return (
    <div className="time-controls">
      <div className="time-row">
        <label className="dt">
          <span className="sr-only">Date and time (UTC)</span>
          <input type="datetime-local" value={toInput(t)} min={toInput(t0)} max={toInput(t1)} step={60}
            onChange={(e) => { const v = fromInput(e.target.value); if (isFinite(v)) onChange(clamp(v)); }} />
          <span className="utc">UTC</span>
        </label>
        <div className="btn-group" role="group" aria-label="Step time">
          <button onClick={() => step(-24 * 10)} title="Back 10 days">−10 d</button>
          <button onClick={() => step(-24)} title="Back 1 day (Shift+←)">−1 d</button>
          <button onClick={() => step(-1)} title="Back 1 hour (←)">−1 h</button>
          <button className="play" onClick={() => onPlaying(!playing)} aria-pressed={playing} title="Play / pause (Space)">
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button onClick={() => step(1)} title="Forward 1 hour (→)">+1 h</button>
          <button onClick={() => step(24)} title="Forward 1 day (Shift+→)">+1 d</button>
          <button onClick={() => step(24 * 10)} title="Forward 10 days">+10 d</button>
        </div>
        <label className="speed">
          <span>Speed</span>
          <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
            {SPEEDS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
          </select>
        </label>
      </div>
      <input className="scrubber" type="range" min={t0} max={t1} step={1800000} value={t}
        aria-label="Time scrubber" aria-valuetext={new Date(t).toUTCString()}
        onChange={(e) => onChange(Number(e.target.value))} />
      <div className="scrub-labels"><span>{toInput(t0).slice(0, 10)}</span><span>Precomputed range (UTC)</span><span>{toInput(t1).slice(0, 10)}</span></div>
    </div>
  );
}
