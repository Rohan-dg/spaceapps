import { useEffect, useMemo, useRef, useState } from 'react';
import type { SiteData } from '../lib/data';
import { indexAt, timeAt } from '../lib/series';
import { mix, useTheme } from '../lib/theme';
import { fitCanvas, useDpr } from './useDpr';
import { fmtMonth } from '../lib/fmt';

interface Props { data: SiteData; t: number; days?: number; onSeek?: (t: number) => void; fill?: boolean }

/** Two bars (sunlit / Earth in view) for the next `days` days with a cursor. Click to jump. */
/** Sample-index runs where both the Sun and Earth are up. */
function overlap(a: number[], b: number[]): number[] {
  const out: number[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i], b[j]), e = Math.min(a[i + 1], b[j + 1]);
    if (e > s) out.push(s, e);
    if (a[i + 1] < b[j + 1]) i += 2; else j += 2;
  }
  return out;
}
const upAt = (runs: number[], i: number) => { for (let k = 0; k < runs.length; k += 2) { if (i < runs[k]) return false; if (i < runs[k + 1]) return true; } return false; };

export default function Timeline({ data, t, days = 30, onSeek, fill = false }: Props) {
  if (fill) return <TimelineFill data={data} t={t} days={days} onSeek={onSeek} />;
  return <TimelineStrip data={data} t={t} days={days} onSeek={onSeek} />;
}

function TimelineStrip({ data, t, days = 30, onSeek }: Props) {
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

/**
 * The same 30 days drawn to fill a whole panel: a date for every day, tall Sunlit and Earth-in-view bands, a
 * "Both" band (sunlight and a direct link to Earth at once: the windows that matter for a solar rover that
 * reports home), a labelled now line, and a hover readout of the exact time and state.
 */
function TimelineFill({ data, t, days = 30, onSeek }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 320 });
  const [hover, setHover] = useState<number | null>(null);
  const { c } = useTheme();
  const dpr = useDpr();
  const { w, h } = size, padL = 118, padR = 14, top = 44, bottom = 30;
  const day0 = Math.floor(t / 86400000) * 86400000 - 86400000;
  const t1 = day0 + days * 86400000;
  const s = data.series;
  const both = useMemo(() => overlap(s.sunUp, s.earthUp), [s]);
  const X = (tt: number) => padL + ((tt - day0) / (t1 - day0)) * (w - padL - padR);
  const T = (x: number) => day0 + ((x - padL) / (w - padL - padR)) * (t1 - day0);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(320, Math.floor(e.contentRect.width)), h: Math.max(240, Math.floor(e.contentRect.height)) }));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cnv = cv.current; if (!cnv) return;
    const g = fitCanvas(cnv, w, h, dpr);
    g.clearRect(0, 0, w, h);
    const pw = w - padL - padR, gap = 14, rowH = (h - top - bottom - gap * 2) / 3;
    const i0 = indexAt(s, day0), i1 = indexAt(s, t1);
    // a column per day, weekends no different on the Moon, so just alternate faintly for reading across
    for (let d = 0; d < days; d++) {
      const a = X(day0 + d * 86400000), b = X(day0 + (d + 1) * 86400000);
      if (d % 2) { g.fillStyle = mix(c.surface, c.ink, 0.025); g.fillRect(a, top - 6, b - a, h - top - bottom + 12); }
    }
    const rows: [string, string, number[], string][] = [
      ['Sunlit', 'power', s.sunUp, c.sun], ['Earth in view', 'radio link', s.earthUp, c.earth], ['Both', 'sun + Earth', both, mix(c.sun, c.earth, 0.5)],
    ];
    rows.forEach(([name, sub, runs, color], r) => {
      const y = top + r * (rowH + gap);
      g.fillStyle = mix(c.surface, c.ink, 0.07); g.beginPath(); g.roundRect(padL, y, pw, rowH, 8); g.fill();
      g.save(); g.beginPath(); g.roundRect(padL, y, pw, rowH, 8); g.clip();
      g.fillStyle = color;
      let total = 0;
      for (let k = 0; k < runs.length; k += 2) {
        if (runs[k + 1] < i0 || runs[k] > i1) continue;
        const ta = Math.max(day0, timeAt(s, runs[k])), tb = Math.min(t1, timeAt(s, runs[k + 1]));
        const a = X(ta), b = X(tb);
        if (b - a > 0.5) { g.fillRect(a, y, b - a, rowH); total += tb - ta; }
      }
      if (i1 > s.n) { g.fillStyle = mix(c.surface, c.ink, 0.16); const a = X(timeAt(s, s.n)); g.fillRect(a, y, padL + pw - a, rowH); }
      g.restore();
      g.textAlign = 'right'; g.fillStyle = c.ink; g.font = `600 14px ${c.font}`; g.fillText(name, padL - 14, y + rowH / 2 - 3);
      g.fillStyle = c.ink2; g.globalAlpha = 0.6; g.font = `400 11.5px ${c.font}`; g.fillText(`${sub} · ${Math.round((100 * total) / (t1 - day0))}%`, padL - 14, y + rowH / 2 + 14); g.globalAlpha = 1;
    });
    // dates: every day when there is room, the month name at each 1st, ticks along the bottom
    const every = pw / days > 34 ? 1 : pw / days > 18 ? 2 : 5;
    g.textAlign = 'center';
    for (let d = 0; d <= days; d++) {
      const tt = day0 + d * 86400000, x = Math.round(X(tt)) + 0.5, dt = new Date(tt);
      g.fillStyle = c.line; g.fillRect(x, h - bottom + 4, 1, d % 5 === 0 ? 7 : 4);
      if (d < days && d % every === 0) {
        const mid = X(tt + 43200000);
        g.fillStyle = c.ink2; g.globalAlpha = 0.75; g.font = `500 11.5px ${c.font}`; g.fillText(String(dt.getUTCDate()), mid, top - 14);
        if (d === 0 || dt.getUTCDate() === 1) { g.globalAlpha = 1; g.fillStyle = c.ink; g.font = `600 11.5px ${c.font}`; g.textAlign = 'left'; g.fillText(fmtMonth(tt), X(tt) + 2, top - 30); g.textAlign = 'center'; }
        g.globalAlpha = 1;
      }
    }
    g.fillStyle = c.ink2; g.globalAlpha = 0.6; g.font = `400 11px ${c.font}`; g.textAlign = 'left'; g.fillText('UTC days', 8, h - 10); g.globalAlpha = 1;
    // now
    const xn = Math.round(X(t));
    g.fillStyle = c.ink; g.fillRect(xn - 1, top - 6, 2, h - top - bottom + 12);
    g.font = `700 11px ${c.font}`; const lw = g.measureText('Now').width + 14;
    g.beginPath(); g.roundRect(Math.min(w - padR - lw, Math.max(padL, xn - lw / 2)), h - bottom + 8, lw, 18, 9); g.fill();
    g.fillStyle = c.surface; g.textAlign = 'center'; g.fillText('Now', Math.min(w - padR - lw / 2, Math.max(padL + lw / 2, xn)), h - bottom + 21);
    // hover
    if (hover !== null && hover >= padL && hover <= w - padR) { g.fillStyle = c.ink; g.globalAlpha = 0.45; g.fillRect(Math.round(hover), top - 6, 1, h - top - bottom + 12); g.globalAlpha = 1; }
  }, [w, h, dpr, s, both, t, day0, t1, days, c, hover]); // eslint-disable-line react-hooks/exhaustive-deps

  const ht = hover !== null && hover >= padL && hover <= w - padR ? T(hover) : null;
  const hi = ht !== null ? Math.floor(indexAt(s, ht)) : -1;
  const sunUp = hi >= 0 && upAt(s.sunUp, hi), earthUp = hi >= 0 && upAt(s.earthUp, hi);
  return (
    <div className="timeline fill" ref={wrap}>
      <canvas ref={cv} style={{ width: w, height: h, cursor: onSeek ? 'pointer' : 'default' }} role="img"
        aria-label={`Sunlight and Earth visibility for the next ${days} days`}
        onPointerMove={(e) => setHover(e.clientX - e.currentTarget.getBoundingClientRect().left)} onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          if (!onSeek) return;
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
          if (x >= padL && x <= w - padR) onSeek(T(x));
        }} />
      {ht !== null && hi < s.n && (
        <div className="tl-tip" style={{ left: Math.min(w - 190, Math.max(0, (hover as number) + 12)) }}>
          <b className="num">{new Date(ht).toISOString().slice(0, 16).replace('T', ' ')} UTC</b>
          <span>{sunUp ? 'Sunlit' : 'In shadow'} · {earthUp ? 'Earth in view' : 'Earth hidden'}</span>
          {onSeek && <small>Click to go to this time</small>}
        </div>
      )}
    </div>
  );
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 7 commits), under the team's direction. Attribution from the commit history.
