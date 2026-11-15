import type { SiteData, SiteInfo } from '../lib/data';
import { useScenario } from '../lib/useScenario';
import type { Level } from '../config/thresholds';

const REGION: Record<string, string> = { 'south-pole': 'pole', 'high-latitude': 'high lat.', equatorial: 'equator', 'far-side': 'far side' };
const WORD = { green: 'good', amber: 'marginal', red: 'poor' } as const;
const BARS: Record<Level, number> = { green: 3, amber: 2, red: 1 };

/** Signal-strength glyph: 3 bars good, 2 marginal, 1 poor. The bar count carries the meaning, colour only reinforces it. */
function Bars({ level }: { level: Level }) {
  const n = BARS[level];
  return (
    <svg className={`bars bars-${level}`} width="16" height="12" viewBox="0 0 16 12" aria-hidden>
      {[0, 1, 2].map((i) => <rect key={i} x={i * 6} y={8 - i * 4} width="4" height={4 + i * 4} rx="1" className={i < n ? 'on' : 'off'} />)}
    </svg>
  );
}

function Row({ info, data, t, selected, onSelect }: { info: SiteInfo; data: SiteData | null; t: number; selected: boolean; onSelect: () => void }) {
  const r = useScenario(data, t);
  const label = r
    ? `${info.short}. Now: ${r.metrics.sunUp ? 'sunlit' : 'in shadow'}, Earth ${r.metrics.earthUp ? 'in view' : 'hidden'}. Power ${WORD[r.power.level]}, radio to Earth ${WORD[r.comms.level]}.`
    : info.short;
  return (
    <li>
      <button className={`site-row${selected ? ' selected' : ''}`} onClick={onSelect} aria-pressed={selected} aria-label={label}>
        <span className="site-text">
          <span className="site-name">{info.short}</span>
          <span className="site-meta">
            <span className="num">{Math.abs(info.lat).toFixed(2)}°{info.lat < 0 ? 'S' : 'N'}</span>
            <span>{info.approximate ? 'custom' : REGION[info.region] ?? info.region}</span>
          </span>
          {r && <span className="site-now" aria-hidden><span className={r.metrics.sunUp ? 'is-sun' : undefined}>{r.metrics.sunUp ? 'Sunlit' : 'In shadow'}</span> · <span className={r.metrics.earthUp ? 'is-earth' : undefined}>{r.metrics.earthUp ? 'Earth in view' : 'Earth hidden'}</span></span>}
        </span>
        {r ? (
          <>
            <span className="cell-status" aria-hidden><Bars level={r.power.level} /></span>
            <span className="cell-status" aria-hidden><Bars level={r.comms.level} /></span>
          </>
        ) : <><span className="cell-status muted">…</span><span /></>}
      </button>
    </li>
  );
}

export default function SiteList({ sites, all, t, selected, onSelect }: { sites: SiteInfo[]; all: (SiteData | null)[]; t: number; selected: string; onSelect: (id: string) => void }) {
  const tq = Math.floor(t / 3600000) * 3600000; // hourly is plenty for the index; keeps playback smooth
  return (
    <nav className="site-index" aria-label="Landing sites">
      <div className="site-index-head">
        <span>Site</span>
        <span title="Solar power rating, next lunar day">Power</span>
        <span title="Direct-to-Earth radio rating, next lunar day">Radio</span>
      </div>
      <ul className="site-list">
        {sites.map((s, i) => <Row key={s.id} info={s} data={all[i]} t={tq} selected={s.id === selected} onSelect={() => onSelect(s.id)} />)}
      </ul>
    </nav>
  );
}
