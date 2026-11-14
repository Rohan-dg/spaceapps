import { CircleCheck, Earth, OctagonX, Sun, SunDim, TriangleAlert } from 'lucide-react';
import type { Level } from '../config/thresholds';
import { formatDuration, type Event, type Metrics } from '../lib/metrics';
import type { ScenarioResult } from '../lib/useScenario';
import type { Verdict } from '../lib/verdict';
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
        {!compact && <span className="verdict-kind">{kind === 'Power' ? 'Power' : 'Direct-to-Earth comms'}</span>}
        <span className="verdict-word">{WORD[v.level]}</span>
      </div>
      {!compact && <p className="verdict-reason">{v.reason}</p>}
    </div>
  );
}

export function Verdicts({ r }: { r: ScenarioResult }) {
  return (
    <section aria-label="Verdicts">
      <div className="verdicts">
        <VerdictBadge kind="Power" v={r.power} />
        <VerdictBadge kind="Comms" v={r.comms} />
      </div>
      <p className="verdict-window">Judged over the next <Term t="lunar-day">lunar day</Term> ({r.metrics.windowDays.toFixed(1)} days{r.metrics.windowTruncated ? ', cut short by the end of the data' : ''}). Thresholds live in <code>src/config/thresholds.ts</code>.</p>
    </section>
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
export function Readout({ r }: { r: ScenarioResult }) {
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
          <th scope="row">Clearance over the <Term t="terrain-horizon">skyline</Term></th>
          <td>{signed(m.sky.sun.el - m.sunHorizon)}<small>skyline at {deg(m.sunHorizon)}</small></td>
          <td>{signed(m.sky.earth.el - m.earthHorizon)}<small>skyline at {deg(m.earthHorizon)}</small></td>
        </tr>
        <tr className="lead">
          <th scope="row">{m.sunUp ? 'Sets' : 'Rises'} / {m.earthUp ? 'sets' : 'rises'}</th>
          <td>{eventText(sunNext, m.t)}<small>{at(sunNext)}</small></td>
          <td>{eventText(eNext, m.t)}<small>{at(eNext)}</small></td>
        </tr>
        <tr>
          <th scope="row">Then {m.sunUp ? 'rises' : 'sets'} / {m.earthUp ? 'rises' : 'sets'}</th>
          <td>{eventText(sunThen, m.t)}<small>{at(sunThen)}</small></td>
          <td>{eventText(eThen, m.t)}<small>{at(eThen)}</small></td>
        </tr>
        <tr>
          <th scope="row">Share of the next <Term t="lunar-day">lunar day</Term></th>
          <td>{m.sunPct.toFixed(0)}%<small>sunlit</small></td>
          <td>{m.earthPct.toFixed(0)}%<small>in view</small></td>
        </tr>
        <tr>
          <th scope="row">Longest gap in that window</th>
          <td>{span(m.longestDarkH, m.longestDarkClipped)}<small>without sun</small></td>
          <td>{span(m.longestNoCommH, m.longestNoCommClipped)}<small>without <Term t="dte">direct link</Term></small></td>
        </tr>
      </tbody>
    </table>
  );
}
