import { useEffect, useMemo, useRef, useState } from 'react';
import type { SiteData } from '../lib/data';
import { skyAt } from '../lib/ephemeris';
import { horizonAt } from '../lib/horizon';
import { mix, useTheme } from '../lib/theme';
import { siteOf } from '../lib/useScenario';

/** Stable y-range for a site: covers terrain + typical Sun/Earth elevations. */
export function autoYRange(d: SiteData): [number, number] {
  const hz = d.horizon.horizonDeg;
  const hmin = Math.min(...hz), hmax = Math.max(...hz);
  const { sunEl, earthEl, n } = d.series;
  const vals: number[] = [];
  for (let i = 0; i < n; i += 8) vals.push(Math.max(sunEl[i], earthEl[i]) / 100);
  vals.sort((a, b) => a - b);
  const top = vals[Math.floor(vals.length * 0.98)];
  const lo = Math.floor(Math.min(hmin, -1) - 1.5);
  const hi = Math.min(90, Math.ceil(Math.max(hmax + 1.5, top + 1.5, 3)));
  return [lo, hi];
}

interface Props { data: SiteData; t: number; height?: number; yRange?: [number, number]; compact?: boolean; trailHours?: number }

export default function Panorama({ data, t, height = 300, yRange, compact = false, trailHours = 24 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ x: number } | null>(null);
  const { c } = useTheme();
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

  const padL = compact ? 34 : 44, padR = 8, padT = 8, padB = compact ? 20 : 24;
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
    const font = (px: number, w = 400, mono = true) => `${w} ${px}px ${mono ? c.mono : c.font}`;
    const grid = mix(c.sky, c.ink, 0.1);

    g.fillStyle = c.sky; g.fillRect(padL, padT, plotW, plotH);
    g.save();
    g.beginPath(); g.rect(padL, padT, plotW, plotH); g.clip();
    g.strokeStyle = grid; g.lineWidth = 1;
    for (let az = 0; az <= 360; az += compact ? 45 : 30) { g.beginPath(); g.moveTo(Math.round(X(az)) + 0.5, padT); g.lineTo(Math.round(X(az)) + 0.5, padT + plotH); g.stroke(); }
    const span = hi - lo;
    const elStep = span > 40 ? 10 : span > 16 ? 5 : span > 8 ? 2 : 1;
    for (let el = Math.ceil(lo / elStep) * elStep; el <= hi; el += elStep) { g.beginPath(); g.moveTo(padL, Math.round(Y(el)) + 0.5); g.lineTo(padL + plotW, Math.round(Y(el)) + 0.5); g.stroke(); }
    g.setLineDash([5, 4]); g.strokeStyle = mix(c.sky, c.ink, 0.45);
    g.beginPath(); g.moveTo(padL, Math.round(Y(0)) + 0.5); g.lineTo(padL + plotW, Math.round(Y(0)) + 0.5); g.stroke(); g.setLineDash([]);

    const drawTrail = (key: 'sun' | 'earth', color: string) => {
      g.strokeStyle = color; g.lineWidth = 1.5; g.setLineDash([2, 4]);
      g.beginPath();
      let prev: number | null = null;
      for (const p of trails) {
        const [az, el] = p[key];
        if (prev === null || Math.abs(az - prev) > 180) g.moveTo(X(az), Y(el)); else g.lineTo(X(az), Y(el));
        prev = az;
      }
      g.stroke(); g.setLineDash([]);
      g.fillStyle = color;
      trails.forEach((p, k) => { if (k > 0 && k % 12 === 0) g.fillRect(X(p[key][0]) - 2, Y(p[key][1]) - 2, 4, 4); });
    };
    drawTrail('sun', c.sun);
    drawTrail('earth', c.earth);

    const drawBody = (az: number, el: number, r: number, fill: string, ring: string) => {
      for (const off of [-360, 0, 360]) {
        g.beginPath(); g.ellipse(X(az + off), Y(el), Math.max(3, r * kx), Math.max(3, r * ky), 0, 0, Math.PI * 2);
        g.fillStyle = fill; g.fill(); g.lineWidth = 1.5; g.strokeStyle = ring; g.stroke();
      }
    };
    drawBody(sky.sun.az, sky.sun.el, sky.sun.radiusDeg, c.sunDisk, c.sun);
    drawBody(sky.earth.az, sky.earth.el, sky.earth.radiusDeg, c.earth, c.earth);

    // terrain silhouette (drawn over the bodies, so it hides them)
    const hz = data.horizon.horizonDeg;
    g.beginPath(); g.moveTo(X(0), padT + plotH);
    for (let az = 0; az <= 360; az += 0.5) g.lineTo(X(az), Y(horizonAt(hz, az)));
    g.lineTo(X(360), padT + plotH); g.closePath();
    g.fillStyle = c.terrain; g.fill();
    g.strokeStyle = c.terrainEdge; g.lineWidth = 1.25;
    g.beginPath();
    for (let az = 0; az <= 360; az += 0.5) { const y = Y(horizonAt(hz, az)); if (az === 0) g.moveTo(X(az), y); else g.lineTo(X(az), y); }
    g.stroke();
    const ghost = (az: number, el: number, r: number, color: string) => {
      if (el > horizonAt(hz, az)) return;
      g.strokeStyle = color; g.setLineDash([3, 3]); g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(X(az), Y(el), Math.max(3, r * kx), Math.max(3, r * ky), 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    };
    ghost(sky.sun.az, sky.sun.el, sky.sun.radiusDeg, c.sun);
    ghost(sky.earth.az, sky.earth.el, sky.earth.radiusDeg, c.earth);
    g.restore();

    // off-scale markers
    const edge = (az: number, el: number, color: string, label: string) => {
      if (el >= lo && el <= hi) return;
      const below = el < lo, y = below ? padT + plotH - 4 : padT + 4, x = X(az);
      g.fillStyle = color; g.beginPath();
      if (below) { g.moveTo(x - 5, y - 6); g.lineTo(x + 5, y - 6); g.lineTo(x, y); } else { g.moveTo(x - 5, y + 6); g.lineTo(x + 5, y + 6); g.lineTo(x, y); }
      g.fill();
      g.fillStyle = c.ink; g.font = font(11); g.textAlign = 'center';
      g.fillText(`${label} ${el.toFixed(1)}°`, x, below ? y - 10 : y + 18);
    };
    edge(sky.sun.az, sky.sun.el, c.sun, 'Sun');
    edge(sky.earth.az, sky.earth.el, c.earth, 'Earth');

    // axes
    g.fillStyle = c.ink3; g.font = font(compact ? 10 : 11); g.textAlign = 'center';
    const names: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W', 360: 'N' };
    for (let az = 0; az <= 360; az += compact ? 45 : 30) {
      g.fillStyle = names[az] ? c.ink : c.ink3;
      g.fillText(names[az] ?? `${az}°`, Math.min(Math.max(X(az), padL + 6), padL + plotW - 6), height - (compact ? 5 : 6));
    }
    g.textAlign = 'right'; g.fillStyle = c.ink3;
    for (let el = Math.ceil(lo / elStep) * elStep; el <= hi; el += elStep) g.fillText(`${el}°`, padL - 6, Y(el) + 4);
    if (!compact) {
      g.textAlign = 'left'; g.font = font(12, 500, false); g.fillStyle = c.ink;
      const lab = (az: number, el: number, r: number, text: string) => {
        if (el < lo || el > hi) return;
        g.fillText(text, Math.min(X(az) + r * kx + 7, padL + plotW - 50), Y(el) - r * ky - 5);
      };
      lab(sky.sun.az, sky.sun.el, sky.sun.radiusDeg, 'Sun');
      lab(sky.earth.az, sky.earth.el, sky.earth.radiusDeg, 'Earth');
    }
    if (hover) {
      g.strokeStyle = c.ink; g.globalAlpha = 0.5; g.lineWidth = 1;
      g.beginPath(); g.moveTo(hover.x + 0.5, padT); g.lineTo(hover.x + 0.5, padT + plotH); g.stroke(); g.globalAlpha = 1;
    }
  }, [width, height, data, sky, trails, lo, hi, hover, compact, c]);

  const hoverInfo = (() => {
    if (!hover) return null;
    const az = (hover.x - padL) / kx;
    if (az < 0 || az > 360) return null;
    return { az, h: horizonAt(data.horizon.horizonDeg, az), dist: data.horizon.horizonDistKm?.[Math.round(az) % 360] };
  })();

  const label = `Skyline at ${data.info.name}. Sun at azimuth ${sky.sun.az.toFixed(1)}°, elevation ${sky.sun.el.toFixed(2)}°. Earth at azimuth ${sky.earth.az.toFixed(1)}°, elevation ${sky.earth.el.toFixed(2)}°.`;
  return (
    <>
      <div className="panorama" ref={wrapRef}>
        <canvas ref={canvasRef} style={{ width: '100%', height }} role="img" aria-label={label}
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover({ x: e.clientX - r.left }); }}
          onMouseLeave={() => setHover(null)} />
        {hoverInfo && (
          <div className="pano-tip" style={{ left: Math.min(hover!.x + 12, width - 230), top: 10 }}>
            az {hoverInfo.az.toFixed(1)}° · skyline {hoverInfo.h.toFixed(2)}°{hoverInfo.dist ? ` · ${hoverInfo.dist.toFixed(1)} km out` : ''}
          </div>
        )}
      </div>
      {!compact && (
        <p className="note">
          Height stretched {exaggeration.toFixed(1)}× so one-degree ridges show. Sun and Earth are drawn at their true angular size on the same axes.
          Dotted lines: their paths over the next {trailHours} h, with a square every 6 h. Dashed outline: hidden behind terrain. Dashed rule: 0°, the flat horizon.
        </p>
      )}
    </>
  );
}
