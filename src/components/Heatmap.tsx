import { useMemo, useState } from 'react';
import { bestWindows, dailyStats, type DayStat, type Metric } from '../lib/calendar';
import type { SiteData } from '../lib/data';
import { mix, useTheme } from '../lib/theme';
import { CAL_SYMBOLS } from './calSymbols';

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_INITIAL = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
/** True when an rgb() colour is light enough to need dark text. */
const light = (rgb: string) => { const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140; };
const LABEL: Record<Metric, string> = { sun: 'Sunlight', earth: 'Earth in view', both: 'Both at once' };
const pct = (f: number) => `${Math.round(f * 100)}%`;
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

interface Props { data: SiteData; t: number; onPick: (t: number) => void }

export default function Heatmap({ data, t, onPick }: Props) {
  const { c } = useTheme();
  const [metric, setMetric] = useState<Metric>('both');
  const [winLen, setWinLen] = useState(14);
  const [hover, setHover] = useState<DayStat | null>(null);
  // 'grid': every month side by side (columns) by day of month (rows), so the whole range fits without scrolling
  const [view, setView] = useState<'grid' | 'months'>('grid');
  const days = useMemo(() => dailyStats(data.series), [data]);
  const best = useMemo(() => bestWindows(days, metric, winLen, 5), [days, metric, winLen]);
  const months = useMemo(() => {
    const m = new Map<string, DayStat[]>();
    for (const d of days) { const k = fmt(d.t).slice(0, 7); if (!m.has(k)) m.set(k, []); m.get(k)!.push(d); }
    return [...m.entries()];
  }, [days]);
  // One hue per metric, from the page background to the full data colour. "Both" uses ink.
  const hue = metric === 'sun' ? c.sun : metric === 'earth' ? c.earth : c.ink;
  const color = (f: number) => (f <= 0 ? 'transparent' : mix(c.bg, hue, 0.12 + 0.78 * Math.min(1, f)));
  const today = fmt(t);
  const shown = hover ?? days.find((d) => fmt(d.t) === today) ?? null;
  const inBest = (d: DayStat) => best.some((w) => d.t >= w.start && d.t < w.start + w.days * 86400000);

  return (
    <section className="calendar" aria-labelledby="hm-h">
      <div className="cal-head">
        <h2 id="hm-h">Daily visibility</h2>
        <div className="seg" role="radiogroup" aria-label="Calendar layout">
          <button role="radio" aria-checked={view === 'grid'} onClick={() => setView('grid')}>Grid</button>
          <button role="radio" aria-checked={view === 'months'} onClick={() => setView('months')}>Months</button>
        </div>
        <div className="seg" role="radiogroup" aria-label="Colour the calendar by">
          {(['sun', 'earth', 'both'] as Metric[]).map((m) => (
            <button key={m} role="radio" aria-checked={metric === m} onClick={() => setMetric(m)}>
              <svg className="cal-sym" viewBox={CAL_SYMBOLS[m].vb} style={{ color: m === 'sun' ? c.sun : m === 'earth' ? c.earth : c.ink }} aria-hidden>{CAL_SYMBOLS[m].d.map((d, i) => <path key={i} d={d} fill="currentColor" />)}</svg> {LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="cal-body">
        {view === 'grid' ? (
          <div className="hm-h-wrap">
            <div className="hm-h" role="grid" aria-describedby="hm-legend" aria-label="Days of the month (rows) by month (columns)"
              style={{ gridTemplateColumns: `22px repeat(${months.length}, minmax(11px, 1fr))` }}>
              <span className="hm-h-corner" />
              {months.map(([k], j) => {
                const mo = Number(k.slice(5)) - 1;
                return (j === 0 || mo === 0) ? <span key={`y${k}`} className="hm-h-year num" style={{ gridColumn: `${j + 2} / span ${Math.min(12 - mo, months.length - j)}` }}>{k.slice(0, 4)}</span> : null;
              })}
              <span className="hm-h-corner" />
              {months.map(([k]) => <span key={`m${k}`} className="hm-h-mon" title={`${MONTH_FULL[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`}>{MONTH_INITIAL[Number(k.slice(5)) - 1]}</span>)}
              {Array.from({ length: 31 }, (_, i) => (
                <div key={i} className="hm-h-row" role="row">
                  <span className="hm-h-day num">{i === 0 || (i + 1) % 5 === 0 ? i + 1 : ''}</span>
                  {months.map(([k, ds]) => {
                    const d = ds.find((x) => new Date(x.t).getUTCDate() === i + 1);
                    if (!d) return <span key={k} className="hm-h-cell empty" role="gridcell" />;
                    const iso = fmt(d.t), f = d[metric];
                    return (
                      <button key={k} role="gridcell" className={`hm-h-cell${iso === today ? ' current' : ''}${inBest(d) ? ' best' : ''}`}
                        style={{ background: f <= 0 ? mix(c.bg, c.ink, 0.07) : color(f) }}
                        aria-label={`${iso}: sunlight ${pct(d.sun)}, Earth ${pct(d.earth)}, both ${pct(d.both)}`}
                        onMouseEnter={() => setHover(d)} onFocus={() => setHover(d)} onMouseLeave={() => setHover(null)}
                        onClick={() => onPick(d.t)} />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
        <div className="cal-months" aria-describedby="hm-legend">
          {months.map(([k, ds]) => {
            const y = Number(k.slice(0, 4)), mo = Number(k.slice(5)) - 1;
            const lead = (new Date(Date.UTC(y, mo, 1)).getUTCDay() + 6) % 7; // Monday first
            const n = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
            return (
              <section key={k} className="cal-month" aria-label={`${MONTH_FULL[mo]} ${y}`}>
                <h4><span>{MONTH_FULL[mo]}</span><span className="num">{y}</span></h4>
                <div className="cal-wk" aria-hidden>{WEEK.map((w, i) => <span key={i}>{w}</span>)}</div>
                <div className="cal-days">
                  {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
                  {Array.from({ length: n }, (_, i) => {
                    const d = ds.find((x) => new Date(x.t).getUTCDate() === i + 1);
                    if (!d) return <span key={i} className="cell none">{i + 1}</span>;
                    const iso = fmt(d.t), bg = color(d[metric]);
                    return (
                      <button key={i} className={`cell${iso === today ? ' current' : ''}${inBest(d) ? ' best' : ''}`} style={{ background: bg, color: bg === 'transparent' ? 'var(--ink-2)' : light(bg) ? '#111' : '#f4f4f4' }}
                        aria-label={`${iso}: sunlight ${pct(d.sun)}, Earth ${pct(d.earth)}, both ${pct(d.both)}`}
                        onMouseEnter={() => setHover(d)} onFocus={() => setHover(d)} onMouseLeave={() => setHover(null)}
                        onClick={() => onPick(d.t)}>{i + 1}</button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        )}
        <aside className="cal-side">
          <div className="readout-box" aria-live="polite">
            {shown ? (
              <>
                <span className="date">{fmt(shown.t)}</span>
                <span>Sunlight</span><span className="num">{pct(shown.sun)}</span>
                <span>Earth in view</span><span className="num">{pct(shown.earth)}</span>
                <span>Both at once</span><span className="num">{pct(shown.both)}</span>
              </>
            ) : <span className="date">No data</span>}
          </div>
          <div id="hm-legend" className="legend">
            <span className="num">0%</span>
            <span className="ramp" style={{ background: `linear-gradient(90deg, ${mix(c.bg, hue, 0.12)}, ${color(1)})` }} />
            <span className="num">100%</span>
          </div>
          <div className="best">
            <div className="best-head">
              <h3>Best windows, {LABEL[metric].toLowerCase()}</h3>
              <select id="win-len" aria-label="Window length" value={winLen} onChange={(e) => setWinLen(Number(e.target.value))}>
                {[3, 7, 14, 28].map((n) => <option key={n} value={n}>{n} days</option>)}
              </select>
            </div>
            <div className="bw-head" aria-hidden><span>#</span><span>Start</span><span className="bw-vals"><span>Sun</span><span>Earth</span></span></div>
            <ol>
              {best.map((w) => (
                <li key={w.start}>
                  <button onClick={() => onPick(w.start)} aria-label={`Jump to ${fmt(w.start)}: sunlight ${pct(w.sun)}, Earth ${pct(w.earth)}`}>
                    <span>{fmt(w.start)}</span>
                    <span className="bw-vals"><span className="t-sun">{pct(w.sun)}</span><span className="t-earth">{pct(w.earth)}</span></span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </section>
  );
}
