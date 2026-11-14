import type { Level } from '../config/thresholds';
import { formatDuration, type Event, type Metrics } from '../lib/metrics';
import type { ScenarioResult } from '../lib/useScenario';
import type { Verdict } from '../lib/verdict';
import Term from './Term';

const ICON: Record<Level, string> = { green: '✔', amber: '▲', red: '✖' };
const WORD: Record<Level, string> = { green: 'Good', amber: 'Marginal', red: 'Poor' };

export function VerdictBadge({ kind, v, compact = false }: { kind: 'Power' | 'Comms'; v: Verdict; compact?: boolean }) {
  return (
    <div className={`verdict verdict-${v.level}${compact ? ' compact' : ''}`} role="status">
      <div className="verdict-head">
        <span className="verdict-icon" aria-hidden>{ICON[v.level]}</span>
        <span className="verdict-kind">{kind}</span>
        <span className="verdict-word">{WORD[v.level]}</span>
      </div>
      {!compact && <p className="verdict-reason">{v.reason}</p>}
    </div>
  );
}

export const LevelDot = ({ level, title }: { level: Level; title: string }) => (
  <span className={`dot dot-${level}`} title={title} aria-label={title}>{ICON[level]}</span>
);

export function eventText(e: Event, now: number): string {
  if (e.t === null) return e.beyondRange ? 'beyond data range' : '-';
  return `in ${formatDuration(e.t - now)}`;
}
const dateText = (e: Event) => (e.t === null ? '' : new Date(e.t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC');

function Card({ label, value, sub, tone, term }: { label: string; value: string; sub?: string; tone?: 'sun' | 'earth' | 'warn'; term?: string }) {
  return (
    <div className={`card${tone ? ` tone-${tone}` : ''}`}>
      <div className="card-label">{term ? <Term t={term}>{label}</Term> : label}</div>
      <div className="card-value">{value}</div>
      {sub && <div className="card-sub">{sub}</div>}
    </div>
  );
}

const pct = (x: number) => `${x.toFixed(0)}%`;
const hrs = (h: number, clipped: boolean) => `${clipped ? '≥ ' : ''}${h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`}`;

export function MetricCards({ r }: { r: ScenarioResult }) {
  const m: Metrics = r.metrics;
  const sunClear = m.sky.sun.el - m.sunHorizon, earthClear = m.sky.earth.el - m.earthHorizon;
  return (
    <div className="cards">
      <Card tone="sun" label="Sun elevation" term="elevation" value={`${m.sky.sun.el.toFixed(2)}°`}
        sub={`az ${m.sky.sun.az.toFixed(1)}° · terrain ${m.sunHorizon.toFixed(2)}°`} />
      <Card tone="sun" label={m.sunUp ? '☀ Sunlit' : '● In shadow'} term="terrain-horizon"
        value={`${sunClear >= 0 ? '+' : ''}${sunClear.toFixed(2)}°`} sub={m.sunUp ? 'above the terrain horizon' : 'below the terrain horizon'} />
      <Card tone="sun" label={m.sunUp ? 'Next sunset' : 'Next sunrise'} value={eventText(m.sunUp ? m.nextSunset : m.nextSunrise, m.t)}
        sub={dateText(m.sunUp ? m.nextSunset : m.nextSunrise)} />
      <Card tone="sun" label={m.sunUp ? 'Then sunrise' : 'Then sunset'} value={eventText(m.sunUp ? m.nextSunrise : m.nextSunset, m.t)}
        sub={dateText(m.sunUp ? m.nextSunrise : m.nextSunset)} />
      <Card tone="earth" label="Earth elevation" term="libration" value={`${m.sky.earth.el.toFixed(2)}°`}
        sub={`az ${m.sky.earth.az.toFixed(1)}° · terrain ${m.earthHorizon.toFixed(2)}°`} />
      <Card tone="earth" label={m.earthUp ? '◉ Earth in view' : '○ Earth hidden'} term="dte"
        value={`${earthClear >= 0 ? '+' : ''}${earthClear.toFixed(2)}°`} sub={m.earthUp ? 'direct-to-Earth link possible' : 'no direct-to-Earth link'} />
      <Card tone="earth" label={m.earthUp ? 'Next Earthset' : 'Next Earthrise'} value={eventText(m.earthUp ? m.nextEarthset : m.nextEarthrise, m.t)}
        sub={dateText(m.earthUp ? m.nextEarthset : m.nextEarthrise)} />
      <Card tone="earth" label={m.earthUp ? 'Then Earthrise' : 'Then Earthset'} value={eventText(m.earthUp ? m.nextEarthrise : m.nextEarthset, m.t)}
        sub={dateText(m.earthUp ? m.nextEarthrise : m.nextEarthset)} />
      <Card tone="sun" label="Sunlit, next lunar day" term="lunar-day" value={pct(m.sunPct)} sub={`over ${m.windowDays.toFixed(1)} days${m.windowTruncated ? ' (truncated at end of data)' : ''}`} />
      <Card tone="sun" label="Longest dark period" value={hrs(m.longestDarkH, m.longestDarkClipped)} sub="next lunar day" />
      <Card tone="earth" label="Earth visible, next lunar day" value={pct(m.earthPct)} sub={`over ${m.windowDays.toFixed(1)} days`} />
      <Card tone="earth" label="Longest no-comm gap" value={hrs(m.longestNoCommH, m.longestNoCommClipped)} sub="next lunar day" />
    </div>
  );
}
