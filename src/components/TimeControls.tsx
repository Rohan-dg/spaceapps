import { Pause, Play } from './Icons';

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

/** Date, step and play controls. The play loop itself runs in App, so Play works the same in Normal mode. */
export default function TimeControls({ t, t0, t1, onChange, playing, onPlaying, speed, onSpeed }: Props) {
  const clamp = (x: number) => Math.max(t0, Math.min(t1, x));
  const step = (h: number) => onChange(clamp(t + h * 3600000));
  return (
    <div className="time-controls" role="group" aria-label="Time">
      <div className="time-main">
        <button className="btn-primary play" onClick={() => onPlaying(!playing)} aria-pressed={playing} title="Play or pause (Space)">
          {playing ? <><Pause size={14} aria-hidden /> Pause</> : <><Play size={14} aria-hidden /> Play</>}
        </button>
        <div className="btn-group" role="group" aria-label="Step time">
          <button onClick={() => step(-240)} title="Back 10 days">−10 d</button>
          <button onClick={() => step(-24)} title="Back 1 day (Shift + ←)">−1 d</button>
          <button onClick={() => step(-1)} title="Back 1 hour (←)">−1 h</button>
          <button onClick={() => step(1)} title="Forward 1 hour (→)">+1 h</button>
          <button onClick={() => step(24)} title="Forward 1 day (Shift + →)">+1 d</button>
          <button onClick={() => step(240)} title="Forward 10 days">+10 d</button>
        </div>
        <label className="dt">
          <span className="sr-only">Date and time, UTC</span>
          <input id="main-time" type="datetime-local" value={toInput(t)} min={toInput(t0)} max={toInput(t1)} step={60}
            onChange={(e) => { const v = fromInput(e.target.value); if (isFinite(v)) onChange(clamp(v)); }} />
          <span className="utc">UTC</span>
        </label>
        <label className="speed">
          <span>Speed</span>
          <select id="speed" value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
            {SPEEDS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
          </select>
        </label>
      </div>
      <div className="scrub">
        <input className="scrubber" type="range" min={t0} max={t1} step={1800000} value={t}
          aria-label="Time" aria-valuetext={new Date(t).toUTCString()}
          onChange={(e) => onChange(Number(e.target.value))} />
        <div className="scrub-labels"><span>{toInput(t0).slice(0, 10)}</span><span>{toInput(t1).slice(0, 10)}</span></div>
      </div>
    </div>
  );
}
