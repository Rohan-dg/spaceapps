import { Earth, Sun, SunDim } from './Icons';
import type { SiteData, SiteInfo } from '../lib/data';
import { useScenario } from '../lib/useScenario';
import { HelpTip } from './Help';
import { LevelIcon } from './Metrics';

const REGION: Record<string, string> = { 'south-pole': 'pole', 'high-latitude': 'high lat.', equatorial: 'equator', 'far-side': 'far side' };
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
      <div className="site-index-head eyebrow">
        <span>Site</span>
        <span>Now <HelpTip label="What the Now icons mean" align="right">Right now at this site. Sun icon lit: in sunlight. Globe lit: Earth is in view, so direct radio works. Greyed out: in shadow, or Earth is hidden.</HelpTip></span>
        <span>Month <HelpTip label="What the Month icons mean" align="right">Ratings for the next 29.5 days. First icon: solar power. Second icon: radio link to Earth. Green check is good, amber triangle is marginal, red octagon is poor.</HelpTip></span>
      </div>
      <ul className="site-list">
        {sites.map((s, i) => <Row key={s.id} info={s} data={all[i]} t={tq} selected={s.id === selected} onSelect={() => onSelect(s.id)} />)}
      </ul>
    </nav>
  );
}
