import { useEffect, useRef, useState } from 'react';
import type { SiteData } from '../lib/data';
import { indexAt, timeAt } from '../lib/series';
import { mix, useTheme } from '../lib/theme';
import { fitCanvas, useDpr } from './useDpr';

interface Props { data: SiteData; t: number; days?: number; onSeek?: (t: number) => void }

/** Two bars (sunlit / Earth in view) for the next `days` days with a cursor. Click to jump. */
export default function Timeline({ data, t, days = 30, onSeek }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(800);
  const { c } = useTheme();
  const dpr = useDpr();
  const H = 70, padL = 96, padR = 10;
  const day0 = Math.floor(t / 86400000) * 86400000 - 86400000; // stable while playing
  const t1 = day0 + days * 86400000;

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cnv = cv.current; if (!cnv) return;
    const g = fitCanvas(cnv, w, H, dpr);
    g.clearRect(0, 0, w, H);
    const s = data.series;
    const pw = w - padL - padR;
    const X = (tt: number) => padL + ((tt - day0) / (t1 - day0)) * pw;
    const rows: [string, number[], string][] = [['Sunlit', s.sunUp, c.sun], ['Earth in view', s.earthUp, c.earth]];
    const i0 = indexAt(s, day0), i1 = indexAt(s, t1);
    rows.forEach(([name, runs, color], r) => {
      const y = 8 + r * 24;
      g.fillStyle = mix(c.surface, c.ink, 0.06); g.fillRect(padL, y, pw, 16);
      g.fillStyle = color;
      for (let k = 0; k < runs.length; k += 2) {
        if (runs[k + 1] < i0 || runs[k] > i1) continue;
        const a = Math.max(padL, X(timeAt(s, runs[k]))), b = Math.min(padL + pw, X(timeAt(s, runs[k + 1])));
        if (b - a > 0.5) g.fillRect(a, y, b - a, 16);
      }
      if (i1 > s.n) { g.fillStyle = mix(c.surface, c.ink, 0.15); const a = X(timeAt(s, s.n)); g.fillRect(a, y, padL + pw - a, 16); }
      g.fillStyle = c.ink2; g.font = `400 12px ${c.font}`; g.textAlign = 'right';
      g.fillText(name, padL - 8, y + 12);
    });
    g.textAlign = 'center'; g.font = `400 10px ${c.font}`;
    for (let d = 0; d <= days; d++) {
      const x = Math.round(X(day0 + d * 86400000)) + 0.5;
      g.fillStyle = c.line; g.fillRect(x, 54, 1, d % 5 === 0 ? 5 : 3);
      if (d % 5 === 0) { g.fillStyle = c.ink3; const dt = new Date(day0 + d * 86400000); g.fillText(`${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`, Math.min(x, w - 16), 68); }
    }
    g.fillStyle = c.ink; g.fillRect(Math.round(X(t)) - 1, 2, 2, 52);
  }, [w, dpr, data, t, day0, t1, days, c]);

  return (
    <div className="timeline" ref={wrap}>
      <canvas ref={cv} style={{ width: w, height: H, cursor: onSeek ? 'pointer' : 'default' }} role="img"
        aria-label={`Sunlight and Earth visibility for the next ${days} days`}
        onClick={(e) => {
          if (!onSeek) return;
          const r = e.currentTarget.getBoundingClientRect();
          const f = (e.clientX - r.left - padL) / (r.width - padL - padR);
          if (f >= 0 && f <= 1) onSeek(day0 + f * (t1 - day0));
        }} />
    </div>
  );
}
