/**
 * First-person site view: standing on a 2 m mast at the site and looking around. The skyline is the same
 * 360-degree horizon profile the ratings use; the Sun and Earth are drawn at their true direction and
 * angular size for the selected time, and the terrain is painted over them, so a partly hidden Sun is
 * clipped exactly where the profile says. The sky is black: there is no atmosphere.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SiteData } from '../lib/data';
import { skyAt } from '../lib/ephemeris';
import { azAt, compassShort, earthPhase, pxPerDeg, wrapDelta, xOf, yOf, type View } from '../lib/firstPerson';
import { diskVisibleFraction, horizonAt } from '../lib/horizon';
import { useTheme } from '../lib/theme';
import { siteOf } from '../lib/useScenario';
import { fitCanvas, useDpr } from './useDpr';

const FOVS = [30, 60, 120] as const;
const STRETCH = [1, 3] as const;

interface Props { data: SiteData; t: number; height?: number }

export default function FirstPerson({ data, t, height = 300 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const [width, setWidth] = useState(800);
  const [fov, setFov] = useState<(typeof FOVS)[number]>(30);
  const [vScale, setVScale] = useState<(typeof STRETCH)[number]>(1);
  const { c } = useTheme();
  const dpr = useDpr();
  const site = useMemo(() => siteOf(data), [data]);
  const hz = data.horizon.horizonDeg;
  const sky = useMemo(() => skyAt(site, new Date(t)), [site, t]);

  // Start facing the Sun when it is above the skyline, else Earth, else the Sun anyway. Re-aim on a new site.
  const initialYaw = () => {
    const sunUp = sky.sun.el > horizonAt(hz, sky.sun.az);
    const earthUp = sky.earth.el > horizonAt(hz, sky.earth.az);
    return Math.round(sunUp || !earthUp ? sky.sun.az : sky.earth.az);
  };
  const [yaw, setYaw] = useState(initialYaw);
  // Pitch that shows a body and the skyline under it; when they are too far apart for the view, centre the body.
  const frame = (az: number, el: number, f: number = fov, v: number = vScale) => {
    const h = horizonAt(hz, az), span = (height * 0.7) / ((width / f) * v);
    return el - h > span ? el : (Math.max(el, h) + h) / 2 + 0.3;
  };
  const [pitch, setPitch] = useState(() => frame(yaw, sky.sun.az === yaw ? sky.sun.el : sky.earth.el));
  const aim = (az: number, el: number) => { setYaw(Math.round(az)); setPitch(frame(az, el)); };
  const siteKey = data.info.id;
  const lastSite = useRef(siteKey);
  useEffect(() => {
    if (lastSite.current !== siteKey) { lastSite.current = siteKey; const y = initialYaw(); setYaw(y); setPitch(frame(y, Math.abs(wrapDelta(y, sky.sun.az)) < 1 ? sky.sun.el : sky.earth.el)); }
  }, [siteKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Vertical placement: the pitch elevation sits 55% of the way down the view.
  const view = useMemo<View>(() => ({ yaw, fov, width, height, vScale, horizonY: height * 0.55 + pitch * (width / fov) * vScale }), [yaw, pitch, fov, width, height, vScale]);

  const sunHz = horizonAt(hz, sky.sun.az), earthHz = horizonAt(hz, sky.earth.az);
  const sunFrac = diskVisibleFraction(sky.sun.el, sky.sun.radiusDeg, sunHz);
  const earthFrac = diskVisibleFraction(sky.earth.el, sky.earth.radiusDeg, earthHz);
  const phase = earthPhase(sky.sun.az, sky.sun.el, sky.earth.az, sky.earth.el);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const g = fitCanvas(cv, width, height, dpr);
    const px = pxPerDeg(view);
    const ink = 'rgba(246, 247, 249, 0.92)', ink2 = 'rgba(197, 203, 211, 0.75)', grid = 'rgba(255, 255, 255, 0.07)';

    // Airless sky
    g.fillStyle = '#05070a'; g.fillRect(0, 0, width, height);

    // Elevation grid, one line per degree (or per 5 degrees when zoomed out), and the level line
    const stepEl = px * view.vScale >= 18 ? 1 : 5;
    const elTop = (view.horizonY) / (px * view.vScale), elBot = (view.horizonY - height) / (px * view.vScale);
    g.lineWidth = 1; g.font = `400 10px ${c.font}`; g.textBaseline = 'middle';
    for (let e = Math.ceil(elBot / stepEl) * stepEl; e <= elTop; e += stepEl) {
      const y = Math.round(yOf(view, e)) + 0.5;
      if (y > height - 26) continue; // keep the scale off the compass strip
      g.strokeStyle = e === 0 ? 'rgba(255, 255, 255, 0.28)' : grid;
      g.setLineDash(e === 0 ? [5, 4] : []);
      g.beginPath(); g.moveTo(0, y); g.lineTo(width, y); g.stroke();
      g.fillStyle = ink2; g.textAlign = 'left'; g.fillText(`${e > 0 ? '+' : ''}${e}°`, 6, y - 7);
    }
    g.setLineDash([]);

    // Bodies first, terrain on top: the profile clips them exactly
    // Discs use the same scale as the terrain: true angular size, stretched vertically with the height stretch
    const disc = (az: number, el: number, r: number, paint: (x: number, y: number, rr: number) => void) => {
      const d = wrapDelta(az, view.yaw);
      if (Math.abs(d) > view.fov / 2 + r * 2) return;
      const x = width / 2 + d * px, y = yOf(view, el), rr = Math.max(2.5, r * px);
      g.save(); g.translate(x, y); g.scale(1, view.vScale); paint(0, 0, rr); g.restore();
    };
    disc(sky.sun.az, sky.sun.el, sky.sun.radiusDeg, (x, y, r) => {
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    });
    disc(sky.earth.az, sky.earth.el, sky.earth.radiusDeg, (x, y, r) => {
      g.fillStyle = '#1b1f25'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      // lit part, turned toward the Sun's direction (measured in unstretched sky angles)
      const ang = Math.atan2(-(sky.sun.el - sky.earth.el), wrapDelta(sky.sun.az, sky.earth.az) * Math.cos(sky.earth.el * Math.PI / 180));
      const a = r * Math.abs(Math.cos(phase.phaseDeg * Math.PI / 180));
      g.save(); g.rotate(ang); g.fillStyle = c.earth;
      g.beginPath(); g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
      g.ellipse(0, 0, a, r, 0, Math.PI / 2, -Math.PI / 2, phase.phaseDeg > 90);
      g.closePath(); g.fill(); g.restore();
    });

    // Terrain silhouette from the horizon profile, shaded by ridge distance (near ridges lighter)
    const dist = data.horizon.horizonDistKm;
    const maxD = dist ? Math.max(...dist, 1) : 1;
    const top: number[] = [];
    for (let x = 0; x <= width; x += 2) top.push(yOf(view, horizonAt(hz, azAt(view, x))));
    g.fillStyle = '#25292f'; g.beginPath(); g.moveTo(0, height);
    top.forEach((y, i) => g.lineTo(i * 2, y)); g.lineTo(width, height); g.closePath(); g.fill();
    for (let i = 1; i < top.length; i++) {
      const az = azAt(view, i * 2);
      const k = dist ? 1 - Math.min(1, (dist[Math.round(az) % 360] ?? maxD) / maxD) : 0.5;
      g.strokeStyle = `rgba(214, 220, 228, ${0.35 + 0.5 * k})`; g.lineWidth = 1.25;
      g.beginPath(); g.moveTo((i - 1) * 2, top[i - 1]); g.lineTo(i * 2, top[i]); g.stroke();
    }

    // Compass along the bottom
    g.fillStyle = 'rgba(5, 7, 10, 0.55)'; g.fillRect(0, height - 22, width, 22);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const tick = view.fov <= 30 ? 5 : view.fov <= 60 ? 10 : 15;
    for (let a = 0; a < 360; a += tick) {
      const x = xOf(view, a);
      if (x === null) continue;
      const major = a % 45 === 0;
      g.strokeStyle = major ? ink : ink2; g.beginPath(); g.moveTo(x, height - 22); g.lineTo(x, height - (major ? 14 : 18)); g.stroke();
      if (major) { g.fillStyle = ink; g.font = `600 11px ${c.font}`; g.fillText(compassShort(a), x, height - 7); }
      else if (view.fov <= 60) { g.fillStyle = ink2; g.font = `400 10px ${c.font}`; g.fillText(`${a}°`, x, height - 7); }
    }

    // Labels for the bodies, or edge pointers when they are out of view
    const label = (name: string, az: number, el: number, r: number, frac: number, color: string) => {
      const x = xOf(view, az), y = yOf(view, el);
      const state = frac >= 0.999 ? 'clear of the skyline' : frac <= 0.001 ? 'hidden by terrain' : `${Math.round(frac * 100)}% visible`;
      const text = `${name} ${el >= 0 ? '+' : ''}${el.toFixed(2)}° · ${state}`;
      g.font = `500 11px ${c.font}`; g.textBaseline = 'middle';
      if (x !== null && y > 8 && y < height - 30) {
        const right = x < width - 200;
        g.fillStyle = color; g.textAlign = right ? 'left' : 'right';
        const ly = y - r * px * view.vScale - 8 < 12 ? y + r * px * view.vScale + 12 : y - 12; // below the disc near the top edge
        g.fillText(text, x + (right ? 1 : -1) * (r * px + 8), Math.min(height - 34, ly));
        return;
      }
      const d = wrapDelta(az, view.yaw);
      const yy = Math.max(16, Math.min(height - 34, y));
      const left = d < 0 && Math.abs(d) > view.fov / 2;
      const xx = x === null ? (left ? 46 : width - 10) : x; // left pointers clear the elevation scale
      g.fillStyle = color; g.textAlign = x === null ? (left ? 'left' : 'right') : 'center';
      const arrow = x === null ? (left ? '‹ ' : '') : (y <= 8 ? '↑ ' : '↓ ');
      const tail = x === null && !left ? ' ›' : '';
      g.fillText(`${arrow}${name} ${Math.round(((az % 360) + 360) % 360)}°${tail}`, xx, x === null ? yy : (y <= 8 ? 12 : height - 34));
    };
    label('Earth', sky.earth.az, sky.earth.el, sky.earth.radiusDeg, earthFrac, c.earth);
    label('Sun', sky.sun.az, sky.sun.el, sky.sun.radiusDeg, sunFrac, ink);
  }, [view, sky, hz, data, dpr, width, height, c, phase.phaseDeg, sunFrac, earthFrac]);

  const turn = (deg: number) => setYaw((y) => ((y + deg) % 360 + 360) % 360);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault(); e.stopPropagation(); // keep the global time-step shortcut out of it while looking around
      turn((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 30 : 5));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation();
      setPitch((p) => Math.max(-30, Math.min(90, p + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 5 : 0.5))));
    }
  };
  const describe = (name: string, el: number, frac: number) =>
    `${name} ${Math.abs(el).toFixed(2)} degrees ${el >= 0 ? 'above' : 'below'} level, ${frac >= 0.999 ? 'clear of the skyline' : frac <= 0.001 ? 'hidden by terrain' : `${Math.round(frac * 100)} percent visible`}`;

  return (
    <div className="fp" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="fp-canvas"
        style={{ width, height }}
        tabIndex={0}
        role="img"
        aria-label={`First-person view from ${data.info.name}, facing ${Math.round(yaw)} degrees (${compassShort(yaw)}). ${describe('Sun', sky.sun.el, sunFrac)}. ${describe('Earth', sky.earth.el, earthFrac)}. Drag or use the arrow keys to look around and up or down.`}
        title="Drag to look around (or focus and use the arrow keys)"
        onKeyDown={onKey}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, yaw, pitch }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; setYaw((((d.yaw - (e.clientX - d.x) * fov / width) % 360) + 360) % 360); if (e.pointerType === 'mouse') setPitch(Math.max(-30, Math.min(90, d.pitch + (e.clientY - d.y) * fov / width / vScale))); }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}
      />
      <div className="fp-bar">
        <span className="fp-heading num">Facing {Math.round(yaw)}° {compassShort(yaw)}</span>
        <button onClick={() => aim(sky.sun.az, sky.sun.el)}>Face Sun</button>
        <button onClick={() => aim(sky.earth.az, sky.earth.el)}>Face Earth</button>
        <div className="seg" role="radiogroup" aria-label="Field of view">
          {FOVS.map((f) => <button key={f} role="radio" aria-checked={fov === f} onClick={() => setFov(f)}>{f}°</button>)}
        </div>
        <div className="seg" role="radiogroup" aria-label="Height stretch">
          {STRETCH.map((s) => <button key={s} role="radio" aria-checked={vScale === s} onClick={() => setVScale(s)}>{s === 1 ? 'True height' : `Height ×${s}`}</button>)}
        </div>
        <span className="fp-note">Earth {Math.round(phase.lit * 100)}% lit</span>
      </div>
    </div>
  );
}
