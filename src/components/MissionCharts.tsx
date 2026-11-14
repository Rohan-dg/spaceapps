import { useEffect, useRef, useState } from 'react';
import type { MissionState } from '../lib/useMission';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(300);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const PAD = { l: 52, r: 12, t: 12, b: 26 };
const H = 170;

/** Elevation along the planned route, steep stretches marked, rover position as the cursor. */
export function RouteProfile({ m }: { m: MissionState }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pts = m.route.points.filter((p) => p.hM !== null);
  if (!m.route.terrain || pts.length < 2) return <div ref={ref} className="mchart empty">No terrain profile here: {m.route.note}</div>;
  const L = m.route.lengthKm || 1;
  const hs = pts.map((p) => p.hM!), lo = Math.min(...hs), hi = Math.max(...hs), span = Math.max(1, hi - lo);
  const x = (d: number) => PAD.l + (d / L) * (w - PAD.l - PAD.r);
  const y = (h: number) => PAD.t + (1 - (h - lo) / span) * (H - PAD.t - PAD.b);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.dKm).toFixed(1)},${y(p.hM!).toFixed(1)}`).join('');
  const steep = pts.slice(1).map((p, i) => ((p.slopeDeg ?? 0) > m.plan.maxSlopeDeg ? `M${x(pts[i].dKm)},${y(pts[i].hM!)}L${x(p.dKm)},${y(p.hM!)}` : '')).join('');
  const rx = x(m.rover.dKm);
  const hp = hover === null ? null : pts.reduce((a, p) => (Math.abs(p.dKm - hover) < Math.abs(a.dKm - hover) ? p : a));
  return (
    <div ref={ref} className="mchart">
      <svg width={w} height={H} role="img" aria-label={`Route elevation profile, ${L.toFixed(1)} km, from ${lo.toFixed(0)} to ${hi.toFixed(0)} m`}
        onMouseMove={(e) => { const b = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(L, ((e.clientX - b.left - PAD.l) / (w - PAD.l - PAD.r)) * L))); }}
        onMouseLeave={() => setHover(null)}>
        <line x1={PAD.l} x2={w - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--line)" />
        <text x={PAD.l - 6} y={y(hi) + 4} textAnchor="end" className="ax">{hi.toFixed(0)} m</text>
        <text x={PAD.l - 6} y={y(lo) + 4} textAnchor="end" className="ax">{lo.toFixed(0)} m</text>
        <text x={PAD.l} y={H - 8} className="ax">0 km</text>
        <text x={w - PAD.r} y={H - 8} textAnchor="end" className="ax">{L.toFixed(1)} km</text>
        <path d={line} fill="none" stroke="var(--ink-2)" strokeWidth={2} strokeLinejoin="round" />
        {steep && <path d={steep} fill="none" stroke="var(--poor)" strokeWidth={4} strokeLinecap="round" />}
        {m.wp.map((p, i) => <circle key={i} cx={x(p.dKm)} cy={y(p.hM ?? lo)} r={4} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} />)}
        <line x1={rx} x2={rx} y1={PAD.t} y2={H - PAD.b} stroke="var(--accent)" strokeWidth={2} />
        <circle cx={rx} cy={y(m.rover.hM ?? pts[0].hM!)} r={6} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        {hp && <line x1={x(hp.dKm)} x2={x(hp.dKm)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-3)" strokeDasharray="3 3" />}
      </svg>
      {hp && (
        <div className="pano-tip" style={{ left: Math.min(w - 190, x(hp.dKm) + 8), top: 8 }}>
          {hp.dKm.toFixed(2)} km · {hp.hM!.toFixed(0)} m · slope {(hp.slopeDeg ?? 0).toFixed(1)}°
        </div>
      )}
    </div>
  );
}

/** Battery over the mission with sunlit stretches shaded; the cursor is the sim time. */
export function BatteryChart({ m, t, onSeek }: { m: MissionState; t: number; onSeek: (t: number) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const tl = m.tl, n = tl.n;
  const x = (i: number) => PAD.l + (i / (n - 1)) * (w - PAD.l - PAD.r);
  const y = (p: number) => PAD.t + (1 - p / 100) * (H - PAD.t - PAD.b);
  let line = '', bands = '';
  for (let i = 0; i < n; i++) line += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(tl.battPct[i]).toFixed(1)}`;
  for (let i = 0; i < n; ) {
    if (!tl.sunUp[i]) { i++; continue; }
    let j = i; while (j < n && tl.sunUp[j]) j++;
    bands += `M${x(i)},${PAD.t}H${x(Math.min(n - 1, j))}V${H - PAD.b}H${x(i)}Z`;
    i = j;
  }
  const ci = (t - tl.t0) / tl.stepMs;
  const day = (i: number) => new Date(tl.t0 + i * tl.stepMs).toISOString().slice(0, 16).replace('T', ' ');
  const idx = (e: React.MouseEvent<SVGSVGElement>) => { const b = e.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(n - 1, Math.round(((e.clientX - b.left - PAD.l) / (w - PAD.l - PAD.r)) * (n - 1)))); };
  return (
    <div ref={ref} className="mchart">
      <svg width={w} height={H} role="img" aria-label={`Battery over the mission: lowest ${tl.minPct.toFixed(0)}%, ends at ${tl.endPct.toFixed(0)}%`}
        onMouseMove={(e) => setHover(idx(e))} onMouseLeave={() => setHover(null)} onClick={(e) => onSeek(tl.t0 + idx(e) * tl.stepMs)} style={{ cursor: 'pointer' }}>
        <path d={bands} fill="var(--sun)" opacity={0.16} />
        {[0, 50, 100].map((p) => <g key={p}><line x1={PAD.l} x2={w - PAD.r} y1={y(p)} y2={y(p)} stroke="var(--line)" /><text x={PAD.l - 6} y={y(p) + 4} textAnchor="end" className="ax">{p}%</text></g>)}
        <line x1={PAD.l} x2={w - PAD.r} y1={y(m.plan.reservePct)} y2={y(m.plan.reservePct)} stroke="var(--poor)" strokeDasharray="5 4" />
        <text x={w - PAD.r} y={y(m.plan.reservePct) - 4} textAnchor="end" className="ax">reserve</text>
        <path d={line} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />
        <text x={PAD.l} y={H - 8} className="ax">depart</text>
        <text x={w - PAD.r} y={H - 8} textAnchor="end" className="ax">+{m.plan.durationDays} d</text>
        {ci >= 0 && ci <= n - 1 && <line x1={x(ci)} x2={x(ci)} y1={PAD.t} y2={H - PAD.b} stroke="var(--accent)" strokeWidth={2} />}
        {hover !== null && <><line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-3)" strokeDasharray="3 3" /><circle cx={x(hover)} cy={y(tl.battPct[hover])} r={4} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2} /></>}
      </svg>
      {hover !== null && (
        <div className="pano-tip" style={{ left: Math.min(w - 300, x(hover) + 8), top: 8 }}>
          {day(hover)} · {tl.battPct[hover].toFixed(0)}% · solar {tl.powerW[hover].toFixed(0)} W · load {tl.loadW[hover].toFixed(0)} W
        </div>
      )}
    </div>
  );
}
