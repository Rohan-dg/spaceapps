import { useEffect, useMemo, useRef, useState } from 'react';
import type { SiteData } from '../lib/data';
import { skyAt } from '../lib/ephemeris';
import { horizonAt } from '../lib/horizon';
import { siteOf } from '../lib/useScenario';

export const COLORS = {
  sky: '#060a14', grid: 'rgba(160,175,200,0.12)', gridText: '#7d8aa3', terrain: '#262c38', terrainEdge: '#a3adbf',
  sun: '#ffc94d', earth: '#5cc8ff', horizontal: 'rgba(255,255,255,0.35)',
};

/** Stable y-range for a site: covers terrain + typical Sun/Earth elevations. */
export function autoYRange(d: SiteData): [number, number] {
  const hz = d.horizon.horizonDeg;
  const hmin = Math.min(...hz), hmax = Math.max(...hz);
  const { sunEl, earthEl, n } = d.series;
  let top = -90;
  // 98th percentile of the higher of Sun/Earth elevations, coarse sampled
  const vals: number[] = [];
  for (let i = 0; i < n; i += 8) vals.push(Math.max(sunEl[i], earthEl[i]) / 100);
  vals.sort((a, b) => a - b);
  top = vals[Math.floor(vals.length * 0.98)];
  const lo = Math.floor(Math.min(hmin, -1) - 1.5);
  const hi = Math.min(90, Math.ceil(Math.max(hmax + 1.5, top + 1.5, 3)));
  return [lo, hi];
}

interface Props {
  data: SiteData;
  t: number;
  height?: number;
  yRange?: [number, number];
  compact?: boolean;
  trailHours?: number;
}

export default function Panorama({ data, t, height = 300, yRange, compact = false, trailHours = 24 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const site = useMemo(() => siteOf(data), [data]);
  const range = useMemo(() => yRange ?? autoYRange(data), [data, yRange]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sky = useMemo(() => skyAt(site, new Date(t)), [site, t]);
  const trails = useMemo(() => {
    const pts: { sun: [number, number]; earth: [number, number] }[] = [];
    const step = 30 * 60000;
    for (let k = 0; k <= (trailHours * 3600000) / step; k++) {
      const s = skyAt(site, new Date(t + k * step));
      pts.push({ sun: [s.sun.az, s.sun.el], earth: [s.earth.az, s.earth.el] });
    }
    return pts;
  }, [site, t, trailHours]);

  const padL = compact ? 30 : 40, padR = 10, padT = 10, padB = compact ? 20 : 26;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const [lo, hi] = range;
  const kx = plotW / 360, ky = plotH / (hi - lo);
  const exaggeration = ky / kx;
  const X = (az: number) => padL + az * kx;
  const Y = (el: number) => padT + (hi - el) * ky;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr; cv.height = height * dpr;
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    // sky
    const grad = g.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, '#03050b'); grad.addColorStop(1, '#0b1222');
    g.fillStyle = grad; g.fillRect(padL, padT, plotW, plotH);

    g.save();
    g.beginPath(); g.rect(padL, padT, plotW, plotH); g.clip();
    // grid
    g.strokeStyle = COLORS.grid; g.lineWidth = 1;
    for (let az = 0; az <= 360; az += compact ? 45 : 30) { g.beginPath(); g.moveTo(X(az), padT); g.lineTo(X(az), padT + plotH); g.stroke(); }
    const span = hi - lo;
    const elStep = span > 40 ? 10 : span > 16 ? 5 : span > 8 ? 2 : 1;
    for (let el = Math.ceil(lo / elStep) * elStep; el <= hi; el += elStep) { g.beginPath(); g.moveTo(padL, Y(el)); g.lineTo(padL + plotW, Y(el)); g.stroke(); }
    // local horizontal (0°)
    g.setLineDash([4, 4]); g.strokeStyle = COLORS.horizontal;
    g.beginPath(); g.moveTo(padL, Y(0)); g.lineTo(padL + plotW, Y(0)); g.stroke(); g.setLineDash([]);

    // trails (drawn before terrain so terrain occludes them)
    const drawTrail = (key: 'sun' | 'earth', color: string) => {
      g.strokeStyle = color; g.globalAlpha = 0.45; g.lineWidth = 1.5; g.setLineDash([2, 3]);
      g.beginPath();
      let prev: number | null = null;
      for (const p of trails) {
        const [az, el] = p[key];
        if (prev !== null && Math.abs(az - prev) > 180) g.moveTo(X(az), Y(el)); else if (prev === null) g.moveTo(X(az), Y(el)); else g.lineTo(X(az), Y(el));
        prev = az;
      }
      g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      // hour ticks every 6 h
      g.fillStyle = color; g.globalAlpha = 0.6;
      trails.forEach((p, k) => { if (k > 0 && k % 12 === 0) { g.beginPath(); g.arc(X(p[key][0]), Y(p[key][1]), 1.8, 0, 7); g.fill(); } });
      g.globalAlpha = 1;
    };
    drawTrail('sun', COLORS.sun);
    drawTrail('earth', COLORS.earth);

    // bodies at true angular size (in the same exaggerated axes)
    const drawBody = (az: number, el: number, r: number, color: string, glow: boolean) => {
      for (const off of [-360, 0, 360]) {
        const cx = X(az + off), cy = Y(el);
        if (glow) { g.shadowColor = color; g.shadowBlur = 18; }
        g.fillStyle = color;
        g.beginPath(); g.ellipse(cx, cy, Math.max(2, r * kx), Math.max(2, r * ky), 0, 0, Math.PI * 2); g.fill();
        g.shadowBlur = 0;
      }
    };
    drawBody(sky.sun.az, sky.sun.el, sky.sun.radiusDeg, COLORS.sun, true);
    drawBody(sky.earth.az, sky.earth.el, sky.earth.radiusDeg, COLORS.earth, false);
    // Earth's terminator hint: shade the half facing away from the Sun? keep simple; draw ring
    // terrain silhouette (occludes bodies behind it)
    const hz = data.horizon.horizonDeg;
    g.beginPath(); g.moveTo(X(0), padT + plotH);
    for (let az = 0; az <= 360; az += 0.5) g.lineTo(X(az), Y(horizonAt(hz, az)));
    g.lineTo(X(360), padT + plotH); g.closePath();
    const tg = g.createLinearGradient(0, Y(Math.max(...hz)), 0, padT + plotH);
    tg.addColorStop(0, '#3a4252'); tg.addColorStop(1, '#151a23');
    g.fillStyle = tg; g.fill();
    g.strokeStyle = COLORS.terrainEdge; g.lineWidth = 1.25;
    g.beginPath();
    for (let az = 0; az <= 360; az += 0.5) { const y = Y(horizonAt(hz, az)); if (az === 0) g.moveTo(X(az), y); else g.lineTo(X(az), y); }
    g.stroke();
    // occluded bodies: dashed outline on top of terrain
    const ghost = (az: number, el: number, r: number, color: string, hzEl: number) => {
      if (el > hzEl) return;
      g.strokeStyle = color; g.setLineDash([3, 3]); g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(X(az), Y(el), Math.max(3, r * kx), Math.max(3, r * ky), 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    };
    ghost(sky.sun.az, sky.sun.el, sky.sun.radiusDeg, COLORS.sun, horizonAt(hz, sky.sun.az));
    ghost(sky.earth.az, sky.earth.el, sky.earth.radiusDeg, COLORS.earth, horizonAt(hz, sky.earth.az));
    g.restore();

    // off-scale indicators
    const edge = (az: number, el: number, color: string, label: string) => {
      if (el >= lo && el <= hi) return;
      const y = el < lo ? padT + plotH - 6 : padT + 6;
      g.fillStyle = color; g.beginPath();
      if (el < lo) { g.moveTo(X(az) - 5, y - 5); g.lineTo(X(az) + 5, y - 5); g.lineTo(X(az), y + 2); }
      else { g.moveTo(X(az) - 5, y + 5); g.lineTo(X(az) + 5, y + 5); g.lineTo(X(az), y - 2); }
      g.fill();
      g.font = '11px ui-sans-serif, system-ui'; g.textAlign = 'center';
      g.fillText(`${label} ${el.toFixed(1)}°`, X(az), el < lo ? y - 9 : y + 17);
    };
    edge(sky.sun.az, sky.sun.el, COLORS.sun, 'Sun');
    edge(sky.earth.az, sky.earth.el, COLORS.earth, 'Earth');

    // axes labels
    g.fillStyle = COLORS.gridText; g.font = `${compact ? 10 : 11}px ui-sans-serif, system-ui`; g.textAlign = 'center';
    const names: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W', 360: 'N' };
    for (let az = 0; az <= 360; az += compact ? 45 : 30) g.fillText(names[az] ?? `${az}°`, X(az), height - (compact ? 6 : 8));
    g.textAlign = 'right';
    for (let el = Math.ceil(lo / elStep) * elStep; el <= hi; el += elStep) g.fillText(`${el}°`, padL - 5, Y(el) + 4);
    // body labels
    if (!compact) {
      g.textAlign = 'left'; g.font = '12px ui-sans-serif, system-ui';
      const lab = (az: number, el: number, r: number, color: string, text: string) => {
        if (el < lo || el > hi) return;
        g.fillStyle = color;
        const x = Math.min(X(az) + r * kx + 6, padL + plotW - 60);
        g.fillText(text, x, Y(el) - r * ky - 4);
      };
      lab(sky.sun.az, sky.sun.el, sky.sun.radiusDeg, COLORS.sun, 'Sun');
      lab(sky.earth.az, sky.earth.el, sky.earth.radiusDeg, COLORS.earth, 'Earth');
    }
    // hover crosshair
    if (hover) {
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(hover.x, padT); g.lineTo(hover.x, padT + plotH); g.stroke();
    }
  }, [width, height, data, sky, trails, lo, hi, hover, compact]);

  const hoverInfo = (() => {
    if (!hover) return null;
    const az = (hover.x - padL) / kx;
    if (az < 0 || az > 360) return null;
    const h = horizonAt(data.horizon.horizonDeg, az);
    const dist = data.horizon.horizonDistKm?.[Math.round(az) % 360];
    return { az, h, dist };
  })();

  const label = `Horizon panorama for ${data.info.name}. Sun at azimuth ${sky.sun.az.toFixed(1)}°, elevation ${sky.sun.el.toFixed(2)}°; Earth at azimuth ${sky.earth.az.toFixed(1)}°, elevation ${sky.earth.el.toFixed(2)}°.`;
  return (
    <div className="panorama" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height }}
        role="img"
        aria-label={label}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
        onMouseLeave={() => setHover(null)}
      />
      {hoverInfo && (
        <div className="pano-tip" style={{ left: Math.min(hover!.x + 12, width - 190), top: 12 }}>
          Az {hoverInfo.az.toFixed(1)}° · terrain {hoverInfo.h.toFixed(2)}°{hoverInfo.dist ? ` · ${hoverInfo.dist.toFixed(1)} km away` : ''}
        </div>
      )}
      <div className="pano-note">
        Vertical scale exaggerated ×{exaggeration.toFixed(1)}. Disks are drawn at true angular size on the same axes. Dotted lines show the next {trailHours} h (dots every 6 h). Dashed outlines mark a body hidden behind terrain.
      </div>
    </div>
  );
}
