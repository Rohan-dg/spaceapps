import type { SiteData, SiteInfo } from '../lib/data';
import { useScenario } from '../lib/useScenario';
import { LevelDot } from './Metrics';

const REGION: Record<string, string> = { 'south-pole': 'South pole', 'high-latitude': 'High lat.', equatorial: 'Equator', 'far-side': 'Far side' };

function Row({ info, data, t, selected, onSelect }: { info: SiteInfo; data: SiteData | null; t: number; selected: boolean; onSelect: () => void }) {
  const r = useScenario(data, t);
  return (
    <li>
      <button className={`site-row${selected ? ' selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
        <span className="site-name">{info.short}</span>
        <span className="site-meta">
          <span className="region-tag">{REGION[info.region] ?? info.region}</span>
          <span className="site-coord">{Math.abs(info.lat).toFixed(2)}°{info.lat < 0 ? 'S' : 'N'}</span>
        </span>
        <span className="site-badges">
          {r ? (
            <>
              <span className={`now now-sun ${r.metrics.sunUp ? 'on' : 'off'}`} title={r.metrics.sunUp ? 'Sunlit now' : 'In shadow now'}>{r.metrics.sunUp ? '☀' : '☾'}</span>
              <span className={`now now-earth ${r.metrics.earthUp ? 'on' : 'off'}`} title={r.metrics.earthUp ? 'Earth in view now' : 'Earth hidden now'}>{r.metrics.earthUp ? '◉' : '○'}</span>
              <LevelDot level={r.power.level} title={`Power: ${r.power.level}`} />
              <LevelDot level={r.comms.level} title={`Comms: ${r.comms.level}`} />
            </>
          ) : <span className="loading-dots">…</span>}
        </span>
      </button>
    </li>
  );
}

export default function SiteList({ sites, all, t, selected, onSelect }: { sites: SiteInfo[]; all: (SiteData | null)[]; t: number; selected: string; onSelect: (id: string) => void }) {
  // Quantise to the hour so 12 rows don't recompute on every animation frame.
  const tq = Math.floor(t / 3600000) * 3600000;
  return (
    <nav aria-label="Landing sites">
      <div className="list-legend" aria-hidden>
        <span>now: ☀ sun ◉ Earth</span><span>next lunar day: power · comms</span>
      </div>
      <ul className="site-list">
        {sites.map((s, i) => <Row key={s.id} info={s} data={all[i]} t={tq} selected={s.id === selected} onSelect={() => onSelect(s.id)} />)}
      </ul>
    </nav>
  );
}
