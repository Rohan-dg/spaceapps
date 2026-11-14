import { useEffect, useMemo, useRef, useState } from 'react';
import type { SiteData } from '../lib/data';
import { skyAt } from '../lib/ephemeris';
import { horizonAt } from '../lib/horizon';
import { siteOf } from '../lib/useScenario';
import { COLORS } from './Panorama';

/**
 * Top-down sky plot: zenith at centre, azimuth around the circle (north up, east right as on a map).
 * Piecewise-linear radius so the few degrees around the horizon get most of the space:
 * the outer 80% of the radius spans [lo, 10°], the inner 20% spans [10°, 90°].
 */
const KNEE = 10;

export default function SkyPlot({ data, t, trailHours = 24 }: { data: SiteData; t: number; trailHours?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(420);
  const site = useMemo(() => siteOf(data), [data]);
  const sky = useMemo(() => skyAt(site, new Date(t)), [site, t]);
  const trail = useMemo(() => {
    const out: { sun: [number, number]; earth: [number, number] }[] = [];
    for (let k = 0; k <= trailHours * 2; k++) {
      const s = skyAt(site, new Date(t + k * 1800000));
      out.push({ sun: [s.sun.az, s.sun.el], earth: [s.earth.az, s.earth.el] });
    }
    return out;
  }, [site, t, trailHours]);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.min(520, Math.floor(e.contentRect.width)))));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1, H = w;
    c.width = w * dpr; c.height = H * dpr;
    const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, H);
    const cx = w / 2, cy = H / 2, R = w / 2 - 26;
    const LO = Math.floor(Math.min(-2, ...data.horizon.horizonDeg.filter((v) => v < KNEE)) - 1);
    const rad = (el: number) => {
      const e = Math.max(LO, el);
      return e <= KNEE ? R * (0.2 + (0.8 * (KNEE - e)) / (KNEE - LO)) : R * 0.2 * ((90 - e) / (90 - KNEE));
    };
    const P = (az: number, el: number): [number, number] => {
      const r = rad(el), a = (az * Math.PI) / 180;
      return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    };
    // sky disk
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, '#0b1222'); grad.addColorStop(1, '#03050b');
    g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    // rings
    g.strokeStyle = COLORS.grid; g.fillStyle = COLORS.gridText; g.font = '10px ui-sans-serif, system-ui'; g.textAlign = 'left';
    for (const e of [45, 10, 5, 2, -2, -5, -10].filter((x) => x > LO)) { g.beginPath(); g.arc(cx, cy, rad(e), 0, 7); g.stroke(); g.fillText(`${e}°`, cx + 3, cy - rad(e) + 11); }
    g.strokeStyle = COLORS.horizontal; g.setLineDash([4, 4]); g.beginPath(); g.arc(cx, cy, rad(0), 0, 7); g.stroke(); g.setLineDash([]);
    g.fillStyle = COLORS.gridText; g.fillText('0°', cx + 3, cy - rad(0) + 11);
    for (let az = 0; az < 360; az += 30) { const [x, y] = P(az, LO); g.strokeStyle = COLORS.grid; g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke(); }
    // terrain: fill between rim (LO) and horizon line
    const hz = data.horizon.horizonDeg;
    g.beginPath();
    for (let az = 0; az <= 360; az += 1) { const [x, y] = P(az, horizonAt(hz, az)); if (az === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.closePath();
    g.arc(cx, cy, R, 0, Math.PI * 2, true);
    g.fillStyle = 'rgba(58,66,82,0.92)'; g.fill('evenodd');
    g.strokeStyle = COLORS.terrainEdge; g.lineWidth = 1.2; g.beginPath();
    for (let az = 0; az <= 360; az += 1) { const [x, y] = P(az, horizonAt(hz, az)); if (az === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    // trails
    const drawTrail = (k: 'sun' | 'earth', col: string) => {
      g.strokeStyle = col; g.globalAlpha = 0.55; g.setLineDash([2, 3]); g.lineWidth = 1.5; g.beginPath();
      trail.forEach((p, i) => { const [x, y] = P(p[k][0], p[k][1]); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    };
    drawTrail('sun', COLORS.sun); drawTrail('earth', COLORS.earth);
    // bodies (fixed marker size; this view is for direction, not angular size)
    const body = (az: number, el: number, col: string, label: string, hidden: boolean) => {
      if (el < -89) return;
      const [x, y] = P(az, el);
      g.beginPath(); g.arc(x, y, 7, 0, 7);
      if (hidden) { g.strokeStyle = col; g.setLineDash([3, 2]); g.lineWidth = 2; g.stroke(); g.setLineDash([]); }
      else { g.fillStyle = col; g.shadowColor = col; g.shadowBlur = label === 'Sun' ? 14 : 0; g.fill(); g.shadowBlur = 0; }
      g.fillStyle = col; g.font = '12px ui-sans-serif, system-ui'; g.textAlign = 'left'; g.fillText(label, x + 10, y + 4);
    };
    body(sky.sun.az, sky.sun.el, COLORS.sun, 'Sun', sky.sun.el <= horizonAt(hz, sky.sun.az));
    body(sky.earth.az, sky.earth.el, COLORS.earth, 'Earth', sky.earth.el <= horizonAt(hz, sky.earth.az));
    // compass
    g.fillStyle = '#c7d0e0'; g.font = 'bold 12px ui-sans-serif, system-ui'; g.textAlign = 'center';
    ([[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']] as [number, string][]).forEach(([az, s]) => {
      const a = (az * Math.PI) / 180; g.fillText(s, cx + (R + 14) * Math.sin(a), cy - (R + 14) * Math.cos(a) + 4);
    });
  }, [w, data, sky, trail]);

  return (
    <div className="skyplot" ref={wrap}>
      <canvas ref={cv} style={{ width: w, height: w }} role="img"
        aria-label={`Top-down sky plot. Sun azimuth ${sky.sun.az.toFixed(0)}°, elevation ${sky.sun.el.toFixed(1)}°. Earth azimuth ${sky.earth.az.toFixed(0)}°, elevation ${sky.earth.el.toFixed(1)}°.`} />
      <p className="pano-note">Seen from above: zenith at the centre, horizon toward the rim, north up and east right. The radial scale is stretched: the outer 80% covers the lowest terrain up to 10°, so the horizon band is readable (rings are labelled). Grey is terrain; the dashed ring is the 0° local horizontal. Bodies below the plot edge are pinned to the rim. Markers show direction only, not size.</p>
    </div>
  );
}
