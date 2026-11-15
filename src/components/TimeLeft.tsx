import { Earth, Sun, SunDim } from './Icons';
import { formatDuration, inWords, type Event, type Metrics } from '../lib/metrics';
import { findRun, indexAt, timeAt, type Runs, type Series } from '../lib/series';

/** Start of the current lit (or dark) stretch at time t, from the run-length series; null if before the data. */
export function stretchStart(runs: Runs, s: Series, t: number): number | null {
  const i = Math.floor(indexAt(s, t));
  const k = findRun(runs, i);
  if (k >= 0) return timeAt(s, runs[2 * k]);
  const r = -k - 1;
  return r > 0 ? timeAt(s, runs[2 * r - 1]) : null;
}

const utc = (t: number) => `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

function Bar({ kind, up, start, end, t, plain, never }: { kind: 'sun' | 'earth'; up: boolean; start: number | null; end: Event; t: number; plain: boolean; never: boolean }) {
  const label = kind === 'sun' ? (up ? 'Daylight left' : 'Darkness left') : (up ? 'Earth contact left' : 'Earth blackout left');
  const until = kind === 'sun' ? (up ? 'sunset' : 'sunrise') : (up ? 'Earthset' : 'Earthrise');
  const icon = kind === 'sun' ? (up ? <Sun size={16} aria-hidden /> : <SunDim size={16} aria-hidden />) : <Earth size={16} aria-hidden />;
  if (never) {
    return (
      <div className={`tl-row ${kind} off`}>
        <span className="tl-ico">{icon}</span>
        <div className="tl-main"><div className="tl-head"><b>{kind === 'sun' ? 'Never sunlit' : 'Earth never in view'}</b></div>
          <p className="tl-sub">{kind === 'sun' ? 'Terrain blocks the Sun at every time in the data.' : 'A relay satellite is needed for radio contact.'}</p></div>
      </div>
    );
  }
  const total = end.t !== null && start !== null ? end.t - start : null;
  const left = end.t !== null ? end.t - t : null;
  const frac = total && left !== null ? Math.max(0, Math.min(1, left / total)) : 1;
  const urgent = up && left !== null && left < 24 * 3600_000;
  return (
    <div className={`tl-row ${kind}${up ? ' up' : ' off'}${urgent ? ' urgent' : ''}`}>
      <span className="tl-ico">{icon}</span>
      <div className="tl-main">
        <div className="tl-head">
          <span>{label}</span>
          <b className="num">{left === null ? (end.beyondRange ? (plain ? 'for years' : 'past 2029') : 'none') : plain ? inWords(end, t).replace(/^in /, '') : formatDuration(left)}</b>
        </div>
        <div className="tl-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
          <i style={{ width: `${frac * 100}%` }} />
        </div>
        <p className="tl-sub">
          {end.t === null ? `No ${until} before the data ends (${end.beyondRange ? 'end of 2029' : 'never'}).`
            : <>{plain ? `${until[0].toUpperCase()}${until.slice(1)} ${inWords(end, t)}` : <>{until[0].toUpperCase()}{until.slice(1)} at <span className="num">{utc(end.t)}</span></>}
              {total ? <> · this {up ? (kind === 'sun' ? 'sunlit' : 'contact') : (kind === 'sun' ? 'dark' : 'blackout')} stretch lasts <span className="num">{formatDuration(total)}</span> in all</> : null}</>}
        </p>
      </div>
    </div>
  );
}

/**
 * Time remaining before the next sunset and Earthset (or until sunrise / Earthrise while down), as a draining
 * bar for the current stretch with the exact event time. Event times are refined to about 30 s by bisection on
 * the live ephemeris against the terrain skyline (src/lib/metrics.ts).
 */
export default function TimeLeft({ s, m, t, plain = false }: { s: Series; m: Metrics; t: number; plain?: boolean }) {
  return (
    <div className="tl" aria-label="Time remaining">
      <Bar kind="sun" up={m.sunUp} start={stretchStart(s.sunUp, s, t)} end={m.sunUp ? m.nextSunset : m.nextSunrise} t={t} plain={plain} never={!m.sunUp && s.sunUp.length === 0} />
      <Bar kind="earth" up={m.earthUp} start={stretchStart(s.earthUp, s, t)} end={m.earthUp ? m.nextEarthset : m.nextEarthrise} t={t} plain={plain} never={!m.earthUp && s.earthUp.length === 0} />
    </div>
  );
}
