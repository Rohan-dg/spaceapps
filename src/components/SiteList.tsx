import { Earth, Sun, SunDim } from './Icons';
import type { SiteData, SiteInfo } from '../lib/data';
import { useScenario } from '../lib/useScenario';
import { LevelIcon } from './Metrics';

const REGION: Record<string, string> = { 'south-pole': 'pole', 'high-latitude': 'high lat.', 'mid-latitude': 'mid lat.', equatorial: 'equator', 'far-side': 'far side' };
/** Site-list groups, in display order. Custom points go last. */
const GROUPS: { id: string; label: string }[] = [
  { id: 'artemis', label: 'Artemis III candidate regions' },
  { id: 'clps', label: 'NASA CLPS (commercial landers)' },
  { id: 'apollo', label: 'Apollo' },
  { id: 'international', label: 'Other countries' },
  { id: 'reference', label: 'Reference sites' },
  { id: 'custom', label: 'Your points' },
];
const STATUS: Record<string, string> = { planned: 'planned', target: 'target only' };
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
          <span className="site-name">{info.short}{info.status && STATUS[info.status] && <span className="site-status">{STATUS[info.status]}</span>}</span>
          <span className="site-meta"><span className="num">{Math.abs(info.lat).toFixed(2)}°{info.lat < 0 ? 'S' : 'N'}</span><span>{info.approximate ? 'custom' : REGION[info.region] ?? info.region}</span></span>
        </span>
        {r ? (
          <>
            <span className="cell-status" aria-hidden>
              {r.metrics.sunUp ? <Sun size={15} className="ico-sun on" /> : <SunDim size={15} className="ico-off" />}
              <Earth size={15} className={r.metrics.earthUp ? 'ico-earth on' : 'ico-off'} />
            </span>
            <span className="cell-status" aria-hidden>
              <LevelIcon level={r.power.level} size={15} />
              <LevelIcon level={r.comms.level} size={15} />
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
        <span title="Sun / Earth above the skyline now">Now</span>
        <span title="Power / comms rating, next lunar day">Rating</span>
      </div>
      {GROUPS.map((g) => {
        const rows = sites.map((s, i) => ({ s, i })).filter(({ s }) => (s.approximate ? 'custom' : s.program ?? 'reference') === g.id);
        if (!rows.length) return null;
        return (
          <section key={g.id} className="site-group" aria-label={g.label}>
            <h3 className="site-group-h">{g.label}<span className="num">{rows.length}</span></h3>
            <ul className="site-list">
              {rows.map(({ s, i }) => <Row key={s.id} info={s} data={all[i]} t={tq} selected={s.id === selected} onSelect={() => onSelect(s.id)} />)}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
