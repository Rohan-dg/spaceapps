import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { setIntroActive } from '../lib/intro';

/**
 * Opening sting, on black: the Sol Teris emblem draws itself like an instrument being sketched. The compass dial
 * turns in, stars come out, the Sun's path and the Sun are stroked in, a far mountain ridge rises in front of the
 * Sun, the plain runs from the horizon toward the viewer with craters foreshortened by distance, and a flag goes
 * up on the highest peak. Then the emblem and the name shrink into the logo in the page's top-left corner while
 * the black falls away, so the sting hands over to the app instead of just fading. Silent, about 4 s, skipped by
 * any click or key, and not shown at all when the OS asks for reduced motion. Strokes use pathLength="1" so every
 * line animates the same way (index.css, "opening sting"); each element's start and duration come from d().
 */
const LEAVE_MS = 3700, FLY_MS = 1050;
const C = 200; // centre of the 400 x 400 drawing
const R_DIAL = 182, R_IN = 150;
const SUN = { x: 186, y: 242, r: 48 };
const EARTH = { x: 296, y: 116, r: 14 };

/** circle as a path starting at the top, so pathLength and the draw direction are the same in every browser */
const ring = (r: number, cw = true) => `M ${C} ${C - r} a ${r} ${r} 0 1 ${cw ? 1 : 0} 0 ${2 * r} a ${r} ${r} 0 1 ${cw ? 1 : 0} 0 ${-2 * r}`;
/** stroke timing for one element: start and duration in seconds */
const d = (at: number, dur: number, extra: Record<string, string | number> = {}) => ({ '--at': `${at}s`, '--dur': `${dur}s`, ...extra }) as CSSProperties;

function emblem() {
  // azimuth ticks every 5 degrees, long ones every 30; none at N, E, S and W, where the letters sit
  let ticks = '';
  for (let i = 0; i < 72; i++) {
    if (i % 18 === 0) continue;
    const a = (i * 5 * Math.PI) / 180, len = i % 6 === 0 ? 14 : 7;
    const s = Math.sin(a), c = -Math.cos(a);
    ticks += `M ${(C + R_DIAL * s).toFixed(2)} ${(C + R_DIAL * c).toFixed(2)} L ${(C + (R_DIAL - len) * s).toFixed(2)} ${(C + (R_DIAL - len) * c).toFixed(2)} `;
  }
  // far ridge: a fixed jagged profile (no randomness, so every load draws the same emblem); the tallest peak is
  // well to the right of the Sun so the flag on it stands against black sky
  const pts: [number, number][] = [];
  const tri = (v: number) => 2 * Math.abs(2 * (v - Math.floor(v + 0.5))) - 1; // straight, rocky facets
  for (let i = 0; i <= 58; i++) {
    const x = 36 + i * (328 / 58), u = (x - 36) / 328;
    const y = 250 - 30 * Math.exp(-((u - 0.76) ** 2) / 0.005) - 14 * Math.exp(-((u - 0.2) ** 2) / 0.01)
      + 5 * Math.sin(u * 31) + 4.5 * tri(u * 13.7 + 0.2) + 2.2 * tri(u * 41);
    pts.push([x, y]);
  }
  let peak = pts[0];
  for (const p of pts) if (p[0] > 250 && p[0] < 330 && p[1] < peak[1]) peak = p;
  const horizon = Math.ceil(Math.max(...pts.map((p) => p[1]))) + 5;
  const ridge = 'M ' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ');
  const mountains = `${ridge} L 364 ${horizon} L 36 ${horizon} Z`;
  const plain = `M 36 ${horizon} L 364 ${horizon} L 364 380 L 36 380 Z`;
  // the Sun's path, from horizon to horizon across the inner ring
  const hx = Math.sqrt(R_IN * R_IN - (horizon - C) ** 2);
  const arc = `M ${C - hx} ${horizon} Q ${C} ${2 * 84 - horizon} ${C + hx} ${horizon}`;
  // receding contour lines on the plain, closer together toward the horizon
  const contours = [0.06, 0.16, 0.32, 0.56].map((t) => horizon + (350 - horizon) * t);
  // craters: rounder and larger the nearer they are (t = 0 at the horizon, 1 at the bottom of the ring)
  const craters = [[0.18, 132], [0.3, 300], [0.52, 96], [0.62, 250], [0.86, 168]].map(([t, x]) => {
    const y = horizon + (350 - horizon) * t, rx = 6 + 24 * t, ry = rx * (0.16 + 0.24 * t);
    return { x, y, rx, ry };
  });
  // stars: a fixed scatter in the sky, clear of the Sun, Earth and the ridge
  const stars: { x: number; y: number; r: number; o: number }[] = [];
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let n = 0; n < 400 && stars.length < 54; n++) {
    const x = C - R_IN + rnd() * 2 * R_IN, y = C - R_IN + rnd() * (horizon - (C - R_IN) - 40);
    if (Math.hypot(x - C, y - C) > R_IN - 6) continue;
    if (Math.hypot(x - SUN.x, y - SUN.y) < SUN.r + 16 || Math.hypot(x - EARTH.x, y - EARTH.y) < EARTH.r + 10) continue;
    if (Math.abs(x - peak[0]) < 22 && y > peak[1] - 44) continue;
    const big = rnd() < 0.14;
    stars.push({ x, y, r: big ? 1.3 + rnd() * 0.5 : 0.55 + rnd() * 0.5, o: big ? 0.95 : 0.35 + rnd() * 0.45 });
  }
  return { ticks, ridge, mountains, plain, horizon, hx, arc, contours, craters, stars, peak };
}

/** The app's own logo nearest the top-left corner of the screen, and the name next to it. */
function brandTarget(): { mark: Element; text: Element | null } | null {
  let best: { mark: Element; text: Element | null; k: number } | null = null;
  document.querySelectorAll('.logo-mark').forEach((mark) => {
    if (mark.closest('.intro')) return;
    const r = mark.getBoundingClientRect();
    if (r.width < 4 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return;
    const k = r.left + r.top;
    if (!best || k < best.k) best = { mark, text: mark.parentElement?.querySelector('span') ?? null, k };
  });
  return best;
}

export default function Intro() {
  const [show, setShow] = useState(() => {
    const on = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setIntroActive(on); // the 3D Moon holds its rendering until this clears
    return on;
  });
  const [leaving, setLeaving] = useState(false);
  const e = useMemo(emblem, []);
  const root = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), word = useRef<HTMLSpanElement>(null);

  // the page starts to show through as the hand-over begins, so let the 3D Moon start then
  useEffect(() => { if (leaving || !show) setIntroActive(false); }, [leaving, show]);
  useEffect(() => () => setIntroActive(false), []);

  useEffect(() => {
    if (!show) return;
    const out = window.setTimeout(() => setLeaving(true), LEAVE_MS);
    const skip = () => setLeaving(true);
    window.addEventListener('keydown', skip, { once: true });
    return () => { window.clearTimeout(out); window.removeEventListener('keydown', skip); };
  }, [show]);

  // hand-over: the emblem and the name fly into the logo in the top-left corner and melt into it as the black lifts
  useEffect(() => {
    if (!leaving || !root.current || !svg.current || !word.current) return;
    const el = root.current, anims: Animation[] = [];
    const ease = 'cubic-bezier(0.7, 0, 0.2, 1)';
    const target = brandTarget();
    if (target && typeof el.animate === 'function') {
      // Both pieces follow one shared progress p (same easing), computed as keyframes, so the name can slide up
      // beside the shrinking emblem instead of crossing it, and land next to the logo mark.
      const a = svg.current.getBoundingClientRect(), m = target.mark.getBoundingClientRect();
      const sEnd = (m.width * 1.25) / ((a.width * 2 * R_IN) / 400); // the inner ring (the sky) lands on the mark
      const c0 = { x: a.left + a.width / 2, y: a.top + a.height / 2 }, c1 = { x: m.left + m.width / 2, y: m.top + m.height / 2 };
      const rDial = (a.width * R_DIAL) / 400;
      const lerp = (u: number, v: number, t: number) => u + (v - u) * t;
      const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t / 0.6)); return x * x * (3 - 2 * x); };
      const P = Array.from({ length: 11 }, (_, i) => i / 10);
      const at = (p: number) => ({ s: lerp(1, sEnd, p), x: lerp(c0.x, c1.x, p), y: lerp(c0.y, c1.y, p) });
      const fade = (p: number, from: number) => (p <= from ? 1 : 1 - (p - from) / (1 - from));
      anims.push(svg.current.animate(P.map((p) => {
        const e = at(p);
        return { offset: p, transform: `translate(${(e.x - c0.x).toFixed(2)}px, ${(e.y - c0.y).toFixed(2)}px) scale(${e.s.toFixed(4)})`, opacity: fade(p, 0.55), filter: `blur(${(p > 0.55 ? (p - 0.55) * 4 : 0).toFixed(2)}px)` };
      }), { duration: FLY_MS, easing: ease, fill: 'forwards' }));
      const w = word.current, wr = w.getBoundingClientRect(), op = Number(getComputedStyle(w).opacity);
      const tr = target.text?.getBoundingClientRect();
      if (tr && tr.width > 0) {
        const wsEnd = parseFloat(getComputedStyle(target.text!).fontSize) / parseFloat(getComputedStyle(w).fontSize);
        const gapEnd = tr.left - (c1.x + rDial * sEnd); // so the name ends exactly where the page's own name sits
        const below = wr.top - (c0.y + a.height / 2); // the name's distance under the emblem at the start
        w.style.transformOrigin = '0 0';
        anims.push(w.animate(P.map((p) => {
          const e = at(p), ws = lerp(1, wsEnd, p), q = smooth(p);
          const bx = e.x - (wr.width * ws) / 2, by = e.y + (a.height / 2) * e.s + below * e.s; // under the emblem
          const sx = e.x + rDial * e.s + lerp(24, gapEnd, p), sy = e.y - (wr.height * ws) / 2; // beside it
          const x = lerp(bx, sx, q), y = lerp(by, sy, q);
          return { offset: p, transform: `translate(${(x - wr.left).toFixed(2)}px, ${(y - wr.top).toFixed(2)}px) scale(${ws.toFixed(4)})`, opacity: op * fade(p, 0.6) };
        }), { duration: FLY_MS, easing: ease, fill: 'forwards' }));
      } else {
        anims.push(w.animate([{ opacity: op }, { opacity: 0 }], { duration: FLY_MS * 0.5, fill: 'forwards' }));
      }
      anims.push(el.animate([{ backgroundColor: '#000' }, { backgroundColor: 'rgba(0, 0, 0, 0)' }], { duration: FLY_MS * 0.8, delay: FLY_MS * 0.12, easing: 'ease-in-out', fill: 'forwards' }));
    } else if (typeof el.animate === 'function') {
      anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' }));
    }
    let gone = false;
    const finish = () => { if (!gone) { gone = true; setShow(false); } };
    Promise.all(anims.map((x) => x.finished)).then(finish, finish);
    const guard = window.setTimeout(finish, FLY_MS + 600); // never leave a covering layer behind
    return () => window.clearTimeout(guard);
  }, [leaving]);

  if (!show) return null;
  const [px, py] = e.peak;
  const H = e.horizon;
  return (
    <div ref={root} className={`intro${leaving ? ' leaving' : ''}`} aria-hidden onClick={() => setLeaving(true)}>
      <div className="emb">
        <svg ref={svg} className="emb-svg" viewBox="0 0 400 400">
          <defs>
            <clipPath id="emb-clip"><circle cx={C} cy={C} r={R_IN} /></clipPath>
            <linearGradient id="emb-plain" x1="0" y1={H} x2="0" y2="350" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#8e949c" /><stop offset="0.35" stopColor="#c9ccd2" /><stop offset="1" stopColor="#f4f5f7" />
            </linearGradient>
            <linearGradient id="emb-mtn" x1="0" y1={py} x2="0" y2={H} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#5d636c" /><stop offset="1" stopColor="#3b4047" />
            </linearGradient>
            <radialGradient id="emb-glow"><stop offset="0" stopColor="#63a1ff" stopOpacity="0.45" /><stop offset="1" stopColor="#63a1ff" stopOpacity="0" /></radialGradient>
          </defs>
          {/* instrument dial */}
          <g className="emb-dial">
            <path className="draw faint" d={ring(R_DIAL)} pathLength={1} style={d(0, 0.9)} />
            <path className="draw" d={e.ticks} pathLength={1} style={d(0.15, 1.1)} />
            {['N', 'E', 'S', 'W'].map((t, i) => (
              <text key={t} className="emb-label" style={d(1.0 + i * 0.08, 0.3)} x={C + [0, 1, 0, -1][i] * (R_DIAL - 9)} y={C + [-1, 0, 1, 0][i] * (R_DIAL - 9)} dominantBaseline="central">{t}</text>
            ))}
          </g>
          <path className="draw dim" d={ring(R_IN, false)} pathLength={1} style={d(0.45, 0.8)} />
          <g clipPath="url(#emb-clip)">
            {/* the sky: stars, the Sun's path, the Sun and its glow */}
            {e.stars.map((s, i) => <circle key={i} className="star" cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={s.r.toFixed(2)} style={d(0.55 + (i % 17) * 0.05, 0.6, { '--o': s.o, '--tw': `${1.6 + (i % 7) * 0.35}s` })} />)}
            <path className="draw blue thin" d={e.arc} pathLength={1} style={d(0.95, 0.9)} />
            <circle className="fill" cx={SUN.x} cy={SUN.y} r={SUN.r * 1.9} fill="url(#emb-glow)" style={d(2.1, 0.6)} />
            <circle className="fill sun" cx={SUN.x} cy={SUN.y} r={SUN.r} style={d(2.15, 0.35)} />
            <path className="draw blue" d={`M ${SUN.x} ${SUN.y - SUN.r} a ${SUN.r} ${SUN.r} 0 1 1 0 ${2 * SUN.r} a ${SUN.r} ${SUN.r} 0 1 1 0 ${-2 * SUN.r}`} pathLength={1} style={d(1.15, 0.75)} />
            {/* far ridge in front of the Sun, then the near plain from the horizon to the viewer */}
            <path className="fill" d={e.mountains} fill="url(#emb-mtn)" style={d(2.25, 0.35)} />
            <path className="draw bright" d={e.ridge} pathLength={1} style={d(1.4, 0.9)} />
            <path className="fill" d={e.plain} fill="url(#emb-plain)" style={d(2.3, 0.4)} />
            {e.contours.map((y, i) => <path key={i} className="draw contour" d={`M 36 ${y.toFixed(1)} L 364 ${y.toFixed(1)}`} pathLength={1} style={d(2.45 + i * 0.06, 0.45)} />)}
            <path className="draw horizon" d={`M ${C - e.hx} ${H} L ${C + e.hx} ${H}`} pathLength={1} style={d(1.6, 0.7)} />
            {/* craters: a shadowed far wall and a lit near rim, flatter toward the horizon */}
            {e.craters.map((c, i) => <g key={i}>
              <ellipse className="fill crater" cx={c.x} cy={c.y} rx={c.rx} ry={c.ry} style={d(2.6 + i * 0.07, 0.3)} />
              <path className="draw crater-wall" d={`M ${c.x - c.rx} ${c.y} A ${c.rx} ${c.ry} 0 0 1 ${c.x + c.rx} ${c.y}`} pathLength={1} style={d(2.6 + i * 0.07, 0.3)} />
              <path className="draw crater-rim" d={`M ${c.x - c.rx} ${c.y} A ${c.rx} ${c.ry} 0 0 0 ${c.x + c.rx} ${c.y}`} pathLength={1} style={d(2.68 + i * 0.07, 0.3)} />
            </g>)}
          </g>
          {/* Earth, high in the sky, with its lit crescent */}
          <path className="draw" d={`M ${EARTH.x} ${EARTH.y - EARTH.r} a ${EARTH.r} ${EARTH.r} 0 1 1 0 ${2 * EARTH.r} a ${EARTH.r} ${EARTH.r} 0 1 1 0 ${-2 * EARTH.r}`} pathLength={1} style={d(1.7, 0.5)} />
          <path className="fill earth" d={`M ${EARTH.x} ${EARTH.y - EARTH.r} a ${EARTH.r} ${EARTH.r} 0 0 1 0 ${2 * EARTH.r} a ${EARTH.r * 0.64} ${EARTH.r} 0 0 0 0 ${-2 * EARTH.r} Z`} style={d(2.2, 0.3)} />
          {/* landing flag on the tallest peak: a white pole against black sky, a coral flag */}
          <path className="draw pole" d={`M ${px} ${py + 1} L ${px} ${py - 30}`} pathLength={1} style={d(2.75, 0.25)} />
          <path className="fill flag" d={`M ${px + 1} ${py - 30} L ${px + 17} ${py - 25} L ${px + 1} ${py - 20} Z`} style={d(2.95, 0.25)} />
        </svg>
        <span ref={word} className="intro-word">Sol Teris</span>
      </div>
    </div>
  );
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 10 commits), under the team's direction. Attribution from the commit history.
