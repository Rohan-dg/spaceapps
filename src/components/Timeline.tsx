import { useEffect, useRef, useState } from 'react';
import type { SiteData } from '../lib/data';
import { indexAt, timeAt } from '../lib/series';
import { COLORS } from './Panorama';

interface Props { data: SiteData; t: number; days?: number; onSeek?: (t: number) => void }

/** Two bars (sunlit / Earth visible) for the next `days` days with a cursor. Click to jump. */
export default function Timeline({ data, t, days = 30, onSeek }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(800);
  const H = 64, padL = 92, padR = 10;
  // Window starts at the beginning of the current UTC day for a stable strip while playing.
  const day0 = Math.floor(t / 86400000) * 86400000 - 86400000;
  const t1 = day0 + days * 86400000;

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = H * dpr;
    const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, H);
    const s = data.series;
    const pw = w - padL - padR;
    const X = (tt: number) => padL + ((tt - day0) / (t1 - day0)) * pw;
    const rows: [string, number[], string][] = [['Sunlit', s.sunUp, COLORS.sun], ['Earth in view', s.earthUp, COLORS.earth]];
    const i0 = indexAt(s, day0), i1 = indexAt(s, t1);
    rows.forEach(([name, runs, color], r) => {
      const y = 6 + r * 24;
      g.fillStyle = '#121826'; g.fillRect(padL, y, pw, 16);
      g.fillStyle = color;
      for (let k = 0; k < runs.length; k += 2) {
        if (runs[k + 1] < i0 || runs[k] > i1) continue;
        const a = X(timeAt(s, runs[k])), b = X(timeAt(s, runs[k + 1]));
        g.fillRect(Math.max(padL, a), y, Math.min(padL + pw, b) - Math.max(padL, a), 16);
      }
      // out-of-range hatch
      if (i1 > s.n) { g.fillStyle = 'rgba(255,255,255,0.08)'; const a = X(timeAt(s, s.n)); g.fillRect(a, y, padL + pw - a, 16); }
      g.fillStyle = '#c7d0e0'; g.font = '11px ui-sans-serif, system-ui'; g.textAlign = 'right';
      g.fillText(name, padL - 6, y + 12);
    });
    // day ticks
    g.fillStyle = '#7d8aa3'; g.textAlign = 'center'; g.font = '10px ui-sans-serif, system-ui';
    for (let d = 0; d <= days; d++) {
      const x = X(day0 + d * 86400000);
      g.fillStyle = 'rgba(160,175,200,0.25)'; g.fillRect(x, 4, 1, d % 5 === 0 ? 48 : 4);
      if (d % 5 === 0) { g.fillStyle = '#7d8aa3'; const dt = new Date(day0 + d * 86400000); g.fillText(`${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`, x, 62); }
    }
    // cursor
    const cx = X(t);
    g.fillStyle = '#ffffff'; g.fillRect(cx - 1, 2, 2, 50);
  }, [w, data, t, day0, t1, days]);

  return (
    <div className="timeline" ref={wrap}>
      <canvas
        ref={cv}
        style={{ width: '100%', height: H, cursor: onSeek ? 'pointer' : 'default' }}
        role="img"
        aria-label={`Timeline of sunlight and Earth visibility for the next ${days} days`}
        onClick={(e) => {
          if (!onSeek) return;
          const r = e.currentTarget.getBoundingClientRect();
          const f = (e.clientX - r.left - padL) / (r.width - padL - padR);
          if (f >= 0 && f <= 1) onSeek(day0 + f * (t1 - day0));
        }}
      />
    </div>
  );
}
