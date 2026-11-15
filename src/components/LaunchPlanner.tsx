import { useMemo, useState } from 'react';
import type { SiteData, SiteInfo } from '../lib/data';
import { NASA_SITES, goodDays, planLaunch } from '../lib/launch';
import { THRESHOLDS } from '../config/thresholds';
import FlightPath from './FlightPath';

const utc = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const eastern = (t: number) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(t));
  } catch { return ''; }
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

interface Props { sites: SiteInfo[]; siteId: string; onSite: (id: string) => void; data: SiteData | null; t: number; range: [number, number] }

export default function LaunchPlanner({ sites, siteId, onSite, data, t, range }: Props) {
  const [transit, setTransit] = useState('4.5');
  const [count, setCount] = useState(8);
  const [picked, setPicked] = useState(0);
  const transitDays = Number(transit);
  const transitOk = isFinite(transitDays) && transitDays >= 2 && transitDays <= 10;
  const from = Math.max(t, range[0]);
  const plans = useMemo(() => {
    if (!data || !transitOk) return null;
    // only days the craft can still launch for: landing at least the transit time after the data range starts
    return goodDays(data.series, from, count).map((d) => planLaunch(d, transitDays));
  }, [data, from, count, transitDays, transitOk]);
  const sel = plans && plans.length ? plans[Math.min(picked, plans.length - 1)] : null;
  const best = sel?.best ?? null;

  return (
    <div className="launch">
      <header className="launch-head">
        <div>
          <h2>Launch planner</h2>
          <p className="muted">Best launch times from NASA launch centres in the United States, for the next days with good sunlight and Earth contact at the landing site.</p>
        </div>
        <div className="launch-controls">
          <label>Landing site
            <select id="launch-site" value={siteId} onChange={(e) => onSite(e.target.value)}>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Earth to landing (days)
            <input id="launch-transit" inputMode="decimal" value={transit} onChange={(e) => setTransit(e.target.value)} aria-invalid={!transitOk} />
          </label>
        </div>
      </header>
      {!transitOk && <p className="err" role="alert">Enter a transfer time between 2 and 10 days. A direct transfer plus descent takes about 4 to 5 days.</p>}

      {best && plans && (
        <section className="launch-hero" aria-label="Next recommended launch">
          <span className="eyebrow">{picked === 0 ? 'Next recommended launch' : 'Selected launch'}</span>
          <p className="launch-when num">{utc(best.window!.t)} UTC</p>
          <p className="launch-sub">{eastern(best.window!.t)} · {best.site.name}, {best.site.state} · {best.site.pad}</p>
          <p className="muted">Lands {utc(best.arrival!)} UTC on a good day at {data?.info.name}: Sun up {pct(sel!.day.sun)} and Earth in view {pct(sel!.day.earth)} of that day.</p>
        </section>
      )}

      {plans && plans.length === 0 && (
        <p className="launch-empty">No day from {utc(from).slice(0, 10)} to the end of the data meets the bar at {data?.info.name} (Sun up at least {THRESHOLDS.power.greenPct}% and Earth in view at least {THRESHOLDS.comms.greenPct}% of the day).
          {data && data.info.stats.earthPct < 1 ? ' Earth is never in view from this site, so it cannot talk to Earth directly.' : ' Try a site on a ridge or crater rim.'}</p>
      )}
      {!data && <p className="muted">Loading the site…</p>}

      {plans && plans.length > 0 && (
        <div className="launch-table-wrap">
          <table className="launch-table">
            <thead>
              <tr><th>Good landing day</th><th>Sun · Earth</th><th>Recommended launch (UTC)</th><th>Eastern time</th><th>From</th><th>Other NASA centre</th></tr>
            </thead>
            <tbody>
              {plans.map((p, idx) => {
                const other = p.options.find((o) => o !== p.best);
                return (
                  <tr key={p.day.t} className={idx === Math.min(picked, plans.length - 1) ? 'picked' : ''} onClick={() => setPicked(idx)}
                    tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked(idx); } }} aria-selected={idx === picked}>
                    <td className="num">{utc(p.day.landing)}</td>
                    <td className="num">{pct(p.day.sun)} · {pct(p.day.earth)}</td>
                    <td className="num"><b>{p.best ? utc(p.best.window!.t) : 'No window'}</b></td>
                    <td className="num">{p.best ? eastern(p.best.window!.t) : ''}</td>
                    <td>{p.best ? <>{p.best.site.short}<br /><span className="muted small num">az {p.best.window!.azimuth.toFixed(1)}° · {p.best.window!.inclination.toFixed(1)}° orbit</span></> : ''}</td>
                    <td>{other?.window ? <>{other.site.short} <span className="num">{utc(other.window.t).slice(5)}</span><br /><span className="muted small num">az {other.window.azimuth.toFixed(1)}° · {Math.round(p.best!.window!.boostMs - other.window.boostMs)} m/s less boost</span></> : other ? <span className="muted">{other.site.short}: no window</span> : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="launch-table-foot">
            <span className="muted small">Select a row to see its flight path.</span>
            {plans.length === count && <button onClick={() => setCount((c) => c + 8)}>Show more days</button>}
          </div>
        </div>
      )}

      {best && sel && <FlightPath option={best} landing={sel.day.landing} />}

      <section className="launch-sites" aria-label="NASA launch centres">
        {NASA_SITES.map((s) => (
          <article key={s.id} className="launch-site">
            <h3>{s.name}</h3>
            <p className="muted small">{s.state} · {s.pad} · {s.lat.toFixed(2)}° N, {Math.abs(s.lon).toFixed(2)}° W</p>
            <p className="small">{s.vehicles}. Orbit inclinations about {s.minIncl}° to {s.maxIncl}°.</p>
          </article>
        ))}
      </section>

      <p className="launch-note small muted">
        How this works: a good landing day has the Sun up at least {THRESHOLDS.power.greenPct}% and Earth in view at least {THRESHOLDS.comms.greenPct}% of the day, from the same terrain data as the rest of the app.
        The craft lands at the first moment that day with both in view. The launch is the transfer time earlier, moved to the nearest moment when Earth's rotation carries the pad into an orbit plane that contains the Moon's position at arrival.
        The recommended centre gets the most speed from Earth's rotation. This is a first-order planning estimate, not a trajectory design: real windows also depend on the rocket, the parking-orbit coast and range availability.
      </p>
    </div>
  );
}
