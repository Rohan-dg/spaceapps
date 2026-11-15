import type { SiteData, SiteInfo } from '../lib/data';
import { useScenario } from '../lib/useScenario';

const REGION: Record<string, string> = { 'south-pole': 'pole', 'high-latitude': 'high lat.', equatorial: 'equator', 'far-side': 'far side' };
const LAMP = { green: 'good', amber: 'warn', red: 'poor' } as const;
const WORD = { green: 'good', amber: 'marginal', red: 'poor' } as const;

function Row({ info, data, t, selected, onSelect }: { info: SiteInfo; data: SiteData | null; t: number; selected: boolean; onSelect: () => void }) {
  const r = useScenario(data, t);
  const label = r
    ? `${info.short}. Now: ${r.metrics.sunUp ? 'sunlit' : 'in shadow'}, Earth ${r.metrics.earthUp ? 'in view' : 'hidden'}. Power ${WORD[r.power.level]}, comms ${WORD[r.comms.level]}.`
    : info.short;
  return (
    <li>
      <button className={`site-row${selected ? ' selected' : ''}`} onClick={onSelect} aria-pressed={selected} aria-label={label}>
        <span className="site-text">
          <span className="site-name">{info.short}</span>
          <span className="site-meta"><span className="num">{Math.abs(info.lat).toFixed(2)}°{info.lat < 0 ? 'S' : 'N'}</span><span>{info.approximate ? 'custom' : REGION[info.region] ?? info.region}</span></span>
        </span>
        {r ? (
          <>
            <span className="cell-status" aria-hidden>
              <i className={`lamp sun${r.metrics.sunUp ? ' on' : ''}`} />
              <i className={`lamp earth${r.metrics.earthUp ? ' on' : ''}`} />
            </span>
            <span className="cell-status" aria-hidden>
              <i className={`lamp ${LAMP[r.power.level]}`} />
              <i className={`lamp ${LAMP[r.comms.level]}`} />
            </span>
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
        <span title="Sun / Earth above the skyline now">Sun · Earth</span>
        <span title="Power / comms rating, next lunar day">Pwr · Com</span>
      </div>
      <ul className="site-list">
        {sites.map((s, i) => <Row key={s.id} info={s} data={all[i]} t={tq} selected={s.id === selected} onSelect={() => onSelect(s.id)} />)}
      </ul>
      <p className="site-key" aria-hidden><span><i className="lamp sun on" /> Sun up</span><span><i className="lamp earth on" /> Earth up</span><span><i className="lamp good" /> Good</span><span><i className="lamp warn" /> Marginal</span><span><i className="lamp poor" /> Poor</span></p>
    </nav>
  );
}
