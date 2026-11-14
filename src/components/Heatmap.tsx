import { useMemo, useState } from 'react';
import { bestWindows, dailyStats, type DayStat, type Metric } from '../lib/calendar';
import type { SiteData } from '../lib/data';
import { mix, useTheme } from '../lib/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LABEL: Record<Metric, string> = { sun: 'Sunlight', earth: 'Earth in view', both: 'Both at once' };
const pct = (f: number) => `${Math.round(f * 100)}%`;
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

interface Props { data: SiteData; t: number; onPick: (t: number) => void }

export default function Heatmap({ data, t, onPick }: Props) {
  const { c } = useTheme();
  const [metric, setMetric] = useState<Metric>('both');
  const [winLen, setWinLen] = useState(14);
  const [hover, setHover] = useState<DayStat | null>(null);
  const days = useMemo(() => dailyStats(data.series), [data]);
  const best = useMemo(() => bestWindows(days, metric, winLen, 5), [days, metric, winLen]);
  const months = useMemo(() => {
    const m = new Map<string, DayStat[]>();
    for (const d of days) { const k = fmt(d.t).slice(0, 7); if (!m.has(k)) m.set(k, []); m.get(k)!.push(d); }
    return [...m.entries()];
  }, [days]);
  // One hue per metric, from the page background to the full data colour. "Both" uses ink.
  const hue = metric === 'sun' ? c.sun : metric === 'earth' ? c.earth : c.ink;
  const color = (f: number) => (f <= 0 ? mix(c.bg, c.ink, 0.07) : mix(mix(c.bg, c.ink, 0.07), hue, 0.18 + 0.82 * Math.min(1, f)));
  const today = fmt(t);
  const shown = hover ?? days.find((d) => fmt(d.t) === today) ?? null;
  const inBest = (d: DayStat) => best.some((w) => d.t >= w.start && d.t < w.start + w.days * 86400000);

  return (
    <section className="calendar" aria-labelledby="hm-h">
      <div className="cal-head">
        <h2 id="hm-h">Daily visibility</h2>
        <div className="seg" role="radiogroup" aria-label="Colour the calendar by">
          {(['sun', 'earth', 'both'] as Metric[]).map((m) => (
            <button key={m} role="radio" aria-checked={metric === m} onClick={() => setMetric(m)}>
              <span className="swatch" style={{ background: m === 'sun' ? c.sun : m === 'earth' ? c.earth : c.ink }} aria-hidden /> {LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="cal-body">
        <div className="hm-grid-wrap">
          <table className="hm-grid" aria-describedby="hm-legend">
            <thead><tr><th />{Array.from({ length: 31 }, (_, i) => <th key={i} scope="col">{(i + 1) % 5 === 0 || i === 0 ? i + 1 : ''}</th>)}</tr></thead>
            <tbody>
              {months.map(([k, ds]) => (
                <tr key={k}>
                  <th scope="row">{MONTHS[Number(k.slice(5)) - 1]} {k.slice(0, 4)}</th>
                  {Array.from({ length: 31 }, (_, i) => {
                    const d = ds.find((x) => new Date(x.t).getUTCDate() === i + 1);
                    if (!d) return <td key={i} />;
                    const iso = fmt(d.t);
                    return (
                      <td key={i}>
                        <button className={`cell${iso === today ? ' current' : ''}${inBest(d) ? ' best' : ''}`} style={{ background: color(d[metric]) }}
                          aria-label={`${iso}: sunlight ${pct(d.sun)}, Earth ${pct(d.earth)}, both ${pct(d.both)}`}
                          onMouseEnter={() => setHover(d)} onFocus={() => setHover(d)} onMouseLeave={() => setHover(null)}
                          onClick={() => onPick(d.t)} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            <span className="ramp" style={{ background: `linear-gradient(90deg, ${color(0)}, ${color(0.01)}, ${color(1)})` }} />
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
