import { useEffect, useMemo, useRef, useState } from 'react';
import type { SiteData, SiteInfo, SitesDoc } from '../lib/data';
import { computeSite, validateLatLon } from '../lib/customSite';
import { NASA_SITES, goodDays, planLaunch, type GoodDayRule } from '../lib/launch';
import { THRESHOLDS } from '../config/thresholds';
import FlightPath from './FlightPath';

const utc = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const eastern = (t: number) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(t));
  } catch { return ''; }
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

export interface LaunchTarget { lat: number; lon: number; nonce: number }
interface Props {
  doc: SitesDoc; sites: SiteInfo[]; siteId: string; onSite: (id: string) => void; onCustom: (d: SiteData) => void;
  data: SiteData | null; t: number; onTime: (t: number) => void; range: [number, number]; target: LaunchTarget | null;
}

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function LaunchPlanner({ doc, sites, siteId, onSite, onCustom, data, t, onTime, range, target }: Props) {
  const [rule, setRule] = useState<GoodDayRule>('sun-earth');
  const [pick, setPick] = useState<'list' | 'coords'>(siteId.startsWith('custom') ? 'coords' : 'list');
  const fpRef = useRef<HTMLDivElement>(null);
  // scroll so the flight path starts just below the sticky header (measured, so it works at every width)
  const showPath = () => {
    const el = fpRef.current; if (!el) return;
    const head = document.querySelector('.masthead')?.getBoundingClientRect().bottom ?? 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - Math.max(0, head) - 12, behavior: reduceMotion() ? 'auto' : 'smooth' });
  };
  const [pt, setPt] = useState({ lat: '', lon: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [ptErr, setPtErr] = useState<string | null>(null);
  const planPoint = (la: number, lo: number) => {
    const bad = validateLatLon(la, lo);
    setPtErr(bad);
    if (bad) return;
    setBusy('Starting…');
    computeSite(doc, la, lo, setBusy).then((d) => { setBusy(null); onCustom(d); }, (e) => { setBusy(null); setPtErr(String(e.message ?? e)); });
  };
  // a point sent from the 3D Moon ("Plan a launch to here")
  const lastTarget = useRef(0);
  useEffect(() => {
    if (!target || target.nonce === lastTarget.current) return;
    lastTarget.current = target.nonce;
    setPick('coords');
    setPt({ lat: target.lat.toFixed(4), lon: (((target.lon % 360) + 360) % 360).toFixed(4) });
    planPoint(target.lat, target.lon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  const [transit, setTransit] = useState('4.5');
  const [count, setCount] = useState(8);
  const [picked, setPicked] = useState(0);
  const transitDays = Number(transit);
  const transitOk = isFinite(transitDays) && transitDays >= 2 && transitDays <= 10;
  const from = Math.max(t, range[0]);
  const plans = useMemo(() => {
    if (!data || !transitOk) return null;
    // only days the craft can still launch for: landing at least the transit time after the data range starts
    return goodDays(data.series, from, count, rule).map((d) => planLaunch(d, transitDays));
  }, [data, from, count, transitDays, transitOk, rule]);
  const choose = (idx: number) => { setPicked(idx); setTimeout(showPath, 60); };
  const sel = plans && plans.length ? plans[Math.min(picked, plans.length - 1)] : null;
  const best = sel?.best ?? null;

  return (
    <div className="launch">
      <header className="launch-head">
        <div>
          <h2>Launch planner</h2>
          <p className="muted">Best launch times from NASA launch centres in the United States, for the next days with good sunlight and Earth contact at the landing site.</p>
        </div>
      </header>

      <div className="launch-setup">
        <section className="launch-card" aria-label="Landing site">
          <div className="launch-card-head">
            <span className="launch-card-title">Landing site</span>
            <div className="seg" role="radiogroup" aria-label="Choose the landing site by">
              <button role="radio" aria-checked={pick === 'list'} onClick={() => setPick('list')}>Listed site</button>
              <button role="radio" aria-checked={pick === 'coords'} onClick={() => setPick('coords')}>Any point</button>
            </div>
          </div>
          {pick === 'list' ? (
            <label className="launch-field">Site
              <select id="launch-site" value={siteId} onChange={(e) => onSite(e.target.value)}>
                {!siteId && <option value="" disabled>Choose a site…</option>}
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          ) : (
            <form className="launch-point" onSubmit={(e) => { e.preventDefault(); planPoint(pt.lat.trim() === '' ? NaN : Number(pt.lat), pt.lon.trim() === '' ? NaN : Number(pt.lon)); }}>
              <label className="launch-field">Latitude °<input id="launch-lat" inputMode="decimal" placeholder="e.g. 26.13" value={pt.lat} onChange={(e) => setPt({ ...pt, lat: e.target.value })} /></label>
              <label className="launch-field">Longitude ° E<input id="launch-lon" inputMode="decimal" placeholder="e.g. 3.63" value={pt.lon} onChange={(e) => setPt({ ...pt, lon: e.target.value })} /></label>
              <button type="submit" className="btn-primary" disabled={!!busy} aria-busy={!!busy}>{busy ? 'Computing…' : 'Plan launches'}</button>
            </form>
          )}
          <p className="muted small launch-card-foot" aria-live="polite">
            {busy ?? (pick === 'coords' ? 'Any latitude and longitude, or click the 3D Moon and choose "Plan a launch to here". Takes a few seconds.' : `Planning for ${data?.info.name ?? '…'}.`)}
          </p>
          {ptErr && <p className="err small" role="alert">{ptErr}</p>}
        </section>

        <section className="launch-card" aria-label="Plan settings">
          <span className="launch-card-title">Plan</span>
          <div className="launch-fields">
            <label className="launch-field">Landing from (UTC)
              <input id="launch-from" type="date" min={new Date(range[0]).toISOString().slice(0, 10)} max={new Date(range[1]).toISOString().slice(0, 10)}
                value={new Date(from).toISOString().slice(0, 10)}
                onChange={(e) => { const v = Date.parse(`${e.target.value}T00:00:00Z`); if (isFinite(v)) { setPicked(0); onTime(Math.max(range[0], Math.min(range[1], v))); } }} />
            </label>
            <label className="launch-field">Good day means
              <select id="launch-rule" value={rule} onChange={(e) => { setPicked(0); setRule(e.target.value as GoodDayRule); }}>
                <option value="sun-earth">Sunlight and Earth in view</option>
                <option value="sun">Sunlight only (e.g. far side)</option>
              </select>
            </label>
            <label className="launch-field">Earth to landing (days)
              <input id="launch-transit" inputMode="decimal" value={transit} onChange={(e) => setTransit(e.target.value)} aria-invalid={!transitOk} />
            </label>
          </div>
        </section>
      </div>
      {data?.info.approximate && <p className="small muted launch-approx">{data.info.description}</p>}
      {!transitOk && <p className="err" role="alert">Enter a transfer time between 2 and 10 days. A direct transfer plus descent takes about 4 to 5 days.</p>}

      {best && plans && (
        <section className="launch-hero" aria-label="Next recommended launch">
          <span className="eyebrow">{picked === 0 ? 'Next recommended launch' : 'Selected launch'}</span>
          <p className="launch-when num">{utc(best.window!.t)} UTC</p>
          <p className="launch-sub">{eastern(best.window!.t)} · {best.site.name}, {best.site.state} · {best.site.pad}</p>
          <div className="launch-hero-actions"><button className="btn-primary" onClick={showPath}>See flight path</button></div>
          <p className="muted">Lands {utc(best.arrival!)} UTC on a good day at {data?.info.name}: Sun up {pct(sel!.day.sun)} of that day{sel!.day.earth > 0.005 ? `, Earth in view ${pct(sel!.day.earth)}` : ', but Earth is not in view (no direct radio link)'}.</p>
        </section>
      )}

      {plans && plans.length === 0 && (
        <div className="launch-empty">
          <p>No day from {utc(from).slice(0, 10)} to the end of the data meets the bar at {data?.info.name} (Sun up at least {THRESHOLDS.power.greenPct}% of the day{rule === 'sun' ? '' : ` and Earth in view at least ${THRESHOLDS.comms.greenPct}%`}).
            {rule === 'sun' ? ' This point gets almost no sunlight, as in a permanently shadowed crater.' : data && data.info.stats.earthPct < 1 ? ' Earth is never in view from here, so there is no direct radio link.' : ''}</p>
          {rule === 'sun-earth' && <button onClick={() => setRule('sun')}>Plan for sunlight only</button>}
        </div>
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
                  <tr key={p.day.t} className={idx === Math.min(picked, plans.length - 1) ? 'picked' : ''} onClick={() => choose(idx)}
                    tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(idx); } }} aria-selected={idx === picked}>
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
            <span className="muted small">Select a row to jump to its flight path.</span>
            {plans.length === count && <button onClick={() => setCount((c) => c + 8)}>Show more days</button>}
          </div>
        </div>
      )}

      {best && sel && <div ref={fpRef} className="launch-fp-anchor"><FlightPath option={best} landing={sel.day.landing} /></div>}

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
