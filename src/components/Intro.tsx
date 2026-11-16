import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { setIntroActive } from '../lib/intro';

/**
 * Opening sting, on black: the full Sol Teris emblem draws itself line by line, like an instrument being sketched.
 * Dial and azimuth ticks, an elevation grid, the Sun's path, the Sun, a lunar skyline and Earth are stroked in;
 * then the Sun fills, the ridge fills and covers the Sun's lower half (the half-risen Sun of the small logo),
 * craters and a landing-site marker go down, and "Sol Teris" slides in before the overlay fades to the app,
 * which loads underneath throughout. Silent, about 4 s, skipped by any click or key, and not shown at all when
 * the OS asks for reduced motion. The draw uses pathLength="1" so every stroke animates the same way (index.css,
 * "opening sting"); the per-element start and duration come from the d() helper below.
 */
const LEAVE_MS = 3700;
const C = 200; // centre of the 400 x 400 drawing
const R_DIAL = 182, R_IN = 150;

/** circle as a path starting at the top, so pathLength and the draw direction are the same in every browser */
const ring = (r: number, cw = true) => `M ${C} ${C - r} a ${r} ${r} 0 1 ${cw ? 1 : 0} 0 ${2 * r} a ${r} ${r} 0 1 ${cw ? 1 : 0} 0 ${-2 * r}`;
const ellipse = (x: number, y: number, rx: number, ry: number) => `M ${x - rx} ${y} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
/** stroke timing for one element: start and duration in seconds */
const d = (at: number, dur: number) => ({ '--at': `${at}s`, '--dur': `${dur}s` }) as CSSProperties;

function emblem() {
  // azimuth ticks every 5 degrees, long ones every 30
  let ticks = '';
  for (let i = 0; i < 72; i++) {
    const a = (i * 5 * Math.PI) / 180, len = i % 6 === 0 ? 16 : 7;
    const s = Math.sin(a), c = -Math.cos(a);
    ticks += `M ${(C + R_DIAL * s).toFixed(2)} ${(C + R_DIAL * c).toFixed(2)} L ${(C + (R_DIAL - len) * s).toFixed(2)} ${(C + (R_DIAL - len) * c).toFixed(2)} `;
  }
  // elevation grid: chords of the inner ring, drawn alternately left-to-right and right-to-left
  const grid: string[] = [];
  for (let y = 80; y <= 320; y += 20) {
    const h = Math.sqrt(Math.max(0, R_IN * R_IN - (y - C) ** 2));
    if (h < 8) continue;
    grid.push(grid.length % 2 ? `M ${C + h} ${y} L ${C - h} ${y}` : `M ${C - h} ${y} L ${C + h} ${y}`);
  }
  // lunar skyline: a fixed jagged profile (no randomness, so every load draws the same emblem)
  const pts: [number, number][] = [];
  let peak: [number, number] = [0, 999];
  // a triangle wave gives straight, rocky facets instead of rounded bumps
  const tri = (v: number) => 2 * Math.abs(2 * (v - Math.floor(v + 0.5))) - 1;
  for (let i = 0; i <= 58; i++) {
    const x = 36 + i * (328 / 58);
    const u = (x - 36) / 328;
    const y = 252 - 28 * Math.exp(-((u - 0.62) ** 2) / 0.006) - 15 * Math.exp(-((u - 0.25) ** 2) / 0.01)
      + 6 * Math.sin(u * 31) + 5 * tri(u * 13.7 + 0.2) + 2.5 * tri(u * 41);
    pts.push([x, y]);
    if (y < peak[1]) peak = [x, y];
  }
  const ridge = 'M ' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ');
  const ground = `${ridge} L 364 380 L 36 380 Z`;
  return { ticks, grid, ridge, ground, peak };
}

export default function Intro() {
  const [show, setShow] = useState(() => {
    const on = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setIntroActive(on); // the 3D Moon holds its rendering until this clears
    return on;
  });
  const [leaving, setLeaving] = useState(false);
  const e = useMemo(emblem, []);

  // the page starts to show through as the fade begins, so let the 3D Moon start then
  useEffect(() => { if (leaving || !show) setIntroActive(false); }, [leaving, show]);
  useEffect(() => () => setIntroActive(false), []);

  useEffect(() => {
    if (!show) return;
    const out = window.setTimeout(() => setLeaving(true), LEAVE_MS);
    const skip = () => setLeaving(true);
    window.addEventListener('keydown', skip, { once: true });
    return () => { window.clearTimeout(out); window.removeEventListener('keydown', skip); };
  }, [show]);

  if (!show) return null;
  const [px, py] = e.peak;
  return (
    <div className={`intro${leaving ? ' out' : ''}`} aria-hidden onClick={() => setLeaving(true)}
      onAnimationEnd={(ev) => { if (ev.target === ev.currentTarget && leaving) setShow(false); }}>
      <div className="emb">
        <svg className="emb-svg" viewBox="0 0 400 400">
          <defs><clipPath id="emb-clip"><circle cx={C} cy={C} r={R_IN} /></clipPath></defs>
          {/* instrument dial */}
          <g className="emb-dial">
            <path className="draw faint" d={ring(R_DIAL)} pathLength={1} style={d(0, 0.9)} />
            <path className="draw" d={e.ticks} pathLength={1} style={d(0.15, 1.1)} />
          </g>
          <path className="draw dim" d={ring(R_IN, false)} pathLength={1} style={d(0.45, 0.8)} />
          {['N', 'E', 'S', 'W'].map((t, i) => (
            <text key={t} className="emb-label" style={d(1.0 + i * 0.08, 0.3)} x={C + [0, 1, 0, -1][i] * 166} y={C + [-1, 0, 1, 0][i] * 166 + 4}>{t}</text>
          ))}
          {/* sky: elevation grid and the Sun's path, inside the inner ring */}
          <g clipPath="url(#emb-clip)">
            {e.grid.map((g, i) => <path key={i} className="draw faint" d={g} pathLength={1} style={d(0.6 + i * 0.05, 0.5)} />)}
            <path className="draw blue thin" d="M 40 262 Q 200 40 360 262" pathLength={1} style={d(0.95, 0.9)} />
            {/* the Sun: outline, inner ring, then the fill */}
            <circle className="fill sun" cx="188" cy="236" r="50" style={d(2.15, 0.35)} />
            <path className="draw blue" d="M 188 186 a 50 50 0 1 1 0 100 a 50 50 0 1 1 0 -100" pathLength={1} style={d(1.15, 0.75)} />
            <path className="draw blue thin" d="M 188 200 a 36 36 0 1 0 0 72 a 36 36 0 1 0 0 -72" pathLength={1} style={d(1.35, 0.6)} />
            {/* ground: the skyline strokes in, then fills and hides the Sun's lower half */}
            <path className="fill ground" d={e.ground} style={d(2.25, 0.35)} />
            <path className="draw bright" d={e.ridge} pathLength={1} style={d(1.4, 0.9)} />
            {/* craters etched into the ground */}
            <path className="draw etch" d={ellipse(104, 300, 20, 5)} pathLength={1} style={d(2.5, 0.35)} />
            <path className="draw etch" d={ellipse(252, 322, 28, 7)} pathLength={1} style={d(2.58, 0.4)} />
            <path className="draw etch" d={ellipse(306, 286, 12, 3.5)} pathLength={1} style={d(2.66, 0.3)} />
            <path className="draw etch" d={ellipse(168, 344, 16, 4)} pathLength={1} style={d(2.72, 0.3)} />
          </g>
          {/* Earth, low in the sky, with its lit crescent */}
          <path className="draw" d="M 300 108 a 14 14 0 1 1 0 28 a 14 14 0 1 1 0 -28" pathLength={1} style={d(1.7, 0.5)} />
          <path className="fill earth" d="M 300 108 a 14 14 0 0 1 0 28 a 9 14 0 0 0 0 -28 Z" style={d(2.2, 0.3)} />
          {/* landing site on the highest peak */}
          <path className="draw blue" d={`M ${px - 6} ${py} a 6 6 0 1 0 12 0 a 6 6 0 1 0 -12 0`} pathLength={1} style={d(2.55, 0.25)} />
          <path className="draw blue" d={`M ${px} ${py - 6} L ${px} ${py - 30}`} pathLength={1} style={d(2.6, 0.25)} />
          <path className="draw blue" d={`M ${px} ${py - 30} L ${px + 14} ${py - 25} L ${px} ${py - 20}`} pathLength={1} style={d(2.8, 0.2)} />
        </svg>
        <span className="intro-word">Sol Teris</span>
      </div>
    </div>
  );
}
