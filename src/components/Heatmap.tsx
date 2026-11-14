import { useMemo, useState } from 'react';
import { bestWindows, dailyStats, type DayStat, type Metric } from '../lib/calendar';
import type { SiteData } from '../lib/data';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LABEL: Record<Metric, string> = { sun: 'Sunlight', earth: 'Earth in view', both: 'Sun and Earth together' };
// Single-hue sequential ramps on the dark surface: dim → bright.
const RAMP: Record<Metric, [number, number, number]> = { sun: [255, 201, 77], earth: [92, 200, 255], both: [61, 220, 151] };
const BASE: [number, number, number] = [20, 27, 43];

function color(m: Metric, f: number) {
  const k = Math.pow(Math.max(0, Math.min(1, f)), 0.8);
  const c = RAMP[m].map((v, i) => Math.round(BASE[i] + (v - BASE[i]) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const pct = (f: number) => `${Math.round(f * 100)}%`;
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

interface Props { data: SiteData; t: number; onPick: (t: number) => void }

export default function Heatmap({ data, t, onPick }: Props) {
  const [metric, setMetric] = useState<Metric>('both');
  const [winLen, setWinLen] = useState(14);
  const [hover, setHover] = useState<DayStat | null>(null);
  const days = useMemo(() => dailyStats(data.series), [data]);
  const best = useMemo(() => bestWindows(days, metric, winLen, 5), [days, metric, winLen]);
  // group by year-month
  const months = useMemo(() => {
    const m = new Map<string, DayStat[]>();
    for (const d of days) { const k = fmt(d.t).slice(0, 7); if (!m.has(k)) m.set(k, []); m.get(k)!.push(d); }
    return [...m.entries()];
  }, [days]);
  const today = fmt(t);
  const inBest = (d: DayStat) => best.some((w) => d.t >= w.start && d.t < w.start + w.days * 86400000);

  return (
    <section className="heatmap-panel" aria-labelledby="hm-h">
      <div className="hm-head">
        <h2 id="hm-h">Calendar: {LABEL[metric].toLowerCase()} per day</h2>
        <div className="seg" role="radiogroup" aria-label="Heatmap metric">
          {(['sun', 'earth', 'both'] as Metric[]).map((m) => (
            <button key={m} role="radio" aria-checked={metric === m} className={metric === m ? 'active' : ''} onClick={() => setMetric(m)}>
              <span className={`swatch sw-${m}`} aria-hidden /> {LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="hm-body">
        <div className="hm-grid-wrap">
          <table className="hm-grid" aria-describedby="hm-legend">
            <thead><tr><th />{Array.from({ length: 31 }, (_, i) => <th key={i} scope="col">{(i + 1) % 5 === 0 || i === 0 ? i + 1 : ''}</th>)}</tr></thead>
            <tbody>
              {months.map(([k, ds]) => (
                <tr key={k}>
                  <th scope="row">{MONTHS[Number(k.slice(5)) - 1]} {k.slice(2, 4)}</th>
                  {Array.from({ length: 31 }, (_, i) => {
                    const d = ds.find((x) => new Date(x.t).getUTCDate() === i + 1);
                    if (!d) return <td key={i} className="empty" />;
                    const iso = fmt(d.t);
                    return (
                      <td key={i}>
                        <button
                          className={`cell${iso === today ? ' current' : ''}${inBest(d) ? ' best' : ''}`}
                          style={{ background: color(metric, d[metric]) }}
                          aria-label={`${iso}: sunlight ${pct(d.sun)}, Earth ${pct(d.earth)}, both ${pct(d.both)}`}
                          onMouseEnter={() => setHover(d)} onFocus={() => setHover(d)} onMouseLeave={() => setHover(null)}
                          onClick={() => onPick(d.t)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside className="hm-side">
          <div className="hm-readout" aria-live="polite">
            {hover ? (
              <>
                <b>{fmt(hover.t)}</b>
                <span>Sunlight <b>{pct(hover.sun)}</b></span>
                <span>Earth in view <b>{pct(hover.earth)}</b></span>
                <span>Both <b>{pct(hover.both)}</b></span>
              </>
            ) : <span className="muted">Hover a day for values. Click it to jump there.</span>}
          </div>
          <div id="hm-legend" className="hm-legend">
            <span>0%</span>
            <span className="ramp" style={{ background: `linear-gradient(90deg, ${color(metric, 0)}, ${color(metric, 0.5)}, ${color(metric, 1)})` }} />
            <span>100% of the day</span>
          </div>
          <div className="best">
            <div className="best-head">
              <h3>Best {winLen}-day windows</h3>
              <select aria-label="Window length" value={winLen} onChange={(e) => setWinLen(Number(e.target.value))}>
                {[3, 7, 14, 28].map((n) => <option key={n} value={n}>{n} days</option>)}
              </select>
            </div>
            <p className="muted small">Ranked by mean daily {LABEL[metric].toLowerCase()}. They are outlined on the calendar.</p>
            <ol>
              {best.map((w) => (
                <li key={w.start}>
                  <button onClick={() => onPick(w.start)}>
                    <span className="bw-date">{fmt(w.start).slice(2)} → {fmt(w.start + (w.days - 1) * 86400000).slice(5)}</span>
                    <span className="bw-vals"><span className="sun-txt">☀ {pct(w.sun)}</span> <span className="earth-txt">◉ {pct(w.earth)}</span></span>
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
