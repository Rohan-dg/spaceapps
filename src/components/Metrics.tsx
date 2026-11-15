import { CircleCheck, Earth, OctagonX, Sun, SunDim, TriangleAlert } from './Icons';
import type { Level } from '../config/thresholds';
import { formatDuration, type Event, type Metrics } from '../lib/metrics';
import { sphereHorizonDeg } from '../lib/geometry';
import type { ScenarioResult } from '../lib/useScenario';
import type { Verdict } from '../lib/verdict';
import { HelpTip } from './Help';
import Term from './Term';

const CLS: Record<Level, string> = { green: 'good', amber: 'warn', red: 'poor' };
const WORD: Record<Level, string> = { green: 'Good', amber: 'Marginal', red: 'Poor' };

export function LevelIcon({ level, size = 18, label }: { level: Level; size?: number; label?: string }) {
  const p = { size, className: `lvl-${CLS[level]}`, 'aria-label': label, role: label ? 'img' : undefined, 'aria-hidden': label ? undefined : true } as const;
  if (level === 'green') return <CircleCheck {...p} />;
  if (level === 'amber') return <TriangleAlert {...p} />;
  return <OctagonX {...p} />;
}

export function VerdictBadge({ kind, v, compact = false }: { kind: 'Power' | 'Comms'; v: Verdict; compact?: boolean }) {
  return (
    <div className={`verdict ${CLS[v.level]}${compact ? ' compact' : ''}`}>
      <span className="verdict-icon"><LevelIcon level={v.level} size={compact ? 16 : 22} /></span>
      <div className="verdict-head">
        {!compact && <span className="verdict-kind">{kind === 'Power' ? 'Power' : 'DTE comms'}</span>}
        <span className="verdict-word">{WORD[v.level]}</span>
      </div>
      {!compact && <p className="verdict-reason">{v.reason}</p>}
    </div>
  );
}

/** Status: what is true now, then the two ratings for the next lunar day. */
export function Summary({ r }: { r: ScenarioResult }) {
  const m = r.metrics;
  const sunNext = m.sunUp ? m.nextSunset : m.nextSunrise;
  const eNext = m.earthUp ? m.nextEarthset : m.nextEarthrise;
  return (
    <section className="answer" aria-label="Status">
      <div className="answer-now">
        <span className="answer-kind">At this time</span>
        <p className={`now-line${m.sunUp ? ' on-sun' : ''}`}>
          {m.sunUp ? <Sun size={20} className="ico-sun on" aria-hidden /> : <SunDim size={20} className="ico-off" aria-hidden />}
          <span><b>{m.sunUp ? 'In sunlight' : 'In shadow'}</b><small>Solar elevation <span className="num">{m.sky.sun.el.toFixed(2)}°</span>, skyline <span className="num">{m.sunHorizon.toFixed(2)}°</span></small><small>{m.sunUp ? 'Sun sets' : 'Sun rises'} {eventText(sunNext, m.t)}</small></span>
        </p>
        <p className={`now-line${m.earthUp ? ' on-earth' : ''}`}>
          <Earth size={20} className={m.earthUp ? 'ico-earth on' : 'ico-off'} aria-hidden />
          <span><b>{m.earthUp ? 'Earth in view' : 'Earth hidden'}</b><small>Earth elevation <span className="num">{m.sky.earth.el.toFixed(2)}°</span>, skyline <span className="num">{m.earthHorizon.toFixed(2)}°</span></small><small>{m.earthUp ? 'Sets' : 'Rises'} {eventText(eNext, m.t)}</small></span>
        </p>
      </div>
      <AnswerCard title="Power" v={r.power} />
      <AnswerCard title="Radio to Earth" v={r.comms} />
      <p className="answer-foot">
        <span>Ratings cover the next <span className="num">{m.windowDays.toFixed(1)} days</span> (one lunar day){m.windowTruncated ? ', cut short where the data ends' : ''}</span>
        <HelpTip label="Rating thresholds" align="right">
          <b>Good</b>: power needs sun at least 70% of the time and no dark spell over about 4 days; radio needs Earth in view at least 90% of the time and no gap over 24 hours.
          <b> Marginal</b>: workable with planning. <b>Poor</b>: needs a different site, date or a relay satellite.
        </HelpTip>
      </p>
    </section>
  );
}

function AnswerCard({ title, v }: { title: string; v: Verdict }) {
  return (
    <div className={`answer-card ${CLS[v.level]}`}>
      <span className="answer-kind">{title}</span>
      <span className="answer-word"><LevelIcon level={v.level} size={24} /> {WORD[v.level]}</span>
      <p className="answer-reason">{v.reason}</p>
    </div>
  );
}

export function eventText(e: Event, now: number): string {
  if (e.t === null) return e.beyondRange ? 'after the data ends' : 'none';
  return `in ${formatDuration(e.t - now)}`;
}
const at = (e: Event) => (e.t === null ? '' : `${new Date(e.t).toISOString().slice(0, 16).replace('T', ' ')} UTC`);
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}°`;
const deg = (x: number) => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(2)}°`;
const span = (h: number, clipped: boolean) => `${clipped ? '≥ ' : ''}${h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`}`;

/** Sun and Earth side by side in one ruled table: the numbers behind the verdicts. */
export function Readout({ r, hz }: { r: ScenarioResult; hz?: { profile: number[]; observerM: number } }) {
  const m: Metrics = r.metrics;
  const sunNext = m.sunUp ? m.nextSunset : m.nextSunrise, sunThen = m.sunUp ? m.nextSunrise : m.nextSunset;
  const eNext = m.earthUp ? m.nextEarthset : m.nextEarthrise, eThen = m.earthUp ? m.nextEarthrise : m.nextEarthset;
  return (
    <table className="readout">
      <caption className="sr-only">Sun and Earth readout</caption>
      <thead>
        <tr>
          <th scope="col"><span className="sr-only">Quantity</span></th>
          <th scope="col" className="sun-col"><span className="key"><Sun size={14} aria-hidden /> Sun</span></th>
          <th scope="col" className="earth-col"><span className="key"><Earth size={14} aria-hidden /> Earth</span></th>
        </tr>
      </thead>
      <tbody>
        <tr className="lead">
          <th scope="row">Now</th>
          <td><span className="state">{m.sunUp ? <><Sun size={18} className="ico-sun on" aria-hidden /> In sunlight</> : <><SunDim size={18} className="ico-off" aria-hidden /> In shadow</>}</span></td>
          <td><span className="state">{m.earthUp ? <><Earth size={18} className="ico-earth on" aria-hidden /> In view</> : <><Earth size={18} className="ico-off" aria-hidden /> Hidden</>}</span></td>
        </tr>
        <tr>
          <th scope="row"><Term t="elevation">Elevation</Term></th>
          <td>{deg(m.sky.sun.el)}<small>azimuth {m.sky.sun.az.toFixed(1)}°</small></td>
          <td>{deg(m.sky.earth.el)}<small>azimuth {m.sky.earth.az.toFixed(1)}°</small></td>
        </tr>
        <tr>
          <th scope="row"><Term t="terrain-horizon">Terrain clearance</Term></th>
          <td>{signed(m.sky.sun.el - m.sunHorizon)}<small>skyline at {deg(m.sunHorizon)}</small></td>
          <td>{signed(m.sky.earth.el - m.earthHorizon)}<small>skyline at {deg(m.earthHorizon)}</small></td>
        </tr>
        {hz && (
          <tr>
            <th scope="row"><Term t="no-refraction">Horizon, no air</Term></th>
            <td colSpan={2}>
              terrain skyline {deg(Math.min(...hz.profile))} to {deg(Math.max(...hz.profile))}; a smooth Moon would give {deg(sphereHorizonDeg(hz.observerM))} all round ({hz.observerM} m mast)
              <small>No atmosphere, so no refraction: the skyline is the highest terrain in each direction, with the Moon's curvature included. From a peak it can drop below the smooth-sphere value. On Earth, refraction would lift the Sun by about 0.57° at the horizon.</small>
            </td>
          </tr>
        )}
        <tr className="lead">
          <th scope="row">Next {m.sunUp ? 'set' : 'rise'} / {m.earthUp ? 'set' : 'rise'}</th>
          <td>{eventText(sunNext, m.t)}<small>{at(sunNext)}</small></td>
          <td>{eventText(eNext, m.t)}<small>{at(eNext)}</small></td>
        </tr>
        <tr>
          <th scope="row">Then {m.sunUp ? 'rise' : 'set'} / {m.earthUp ? 'rise' : 'set'}</th>
          <td>{eventText(sunThen, m.t)}<small>{at(sunThen)}</small></td>
          <td>{eventText(eThen, m.t)}<small>{at(eThen)}</small></td>
        </tr>
        <tr>
          <th scope="row">Fraction of next <Term t="lunar-day">lunar day</Term></th>
          <td>{m.sunPct.toFixed(0)}%<small>sunlit</small></td>
          <td>{m.earthPct.toFixed(0)}%<small>in view</small></td>
        </tr>
        <tr>
          <th scope="row">Longest gap</th>
          <td>{span(m.longestDarkH, m.longestDarkClipped)}<small>without sun</small></td>
          <td>{span(m.longestNoCommH, m.longestNoCommClipped)}<small>without <Term t="dte">DTE</Term></small></td>
        </tr>
      </tbody>
    </table>
  );
}
