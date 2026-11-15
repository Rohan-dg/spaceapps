import { useMemo } from 'react';
import type { SiteData, SiteInfo } from '../lib/data';
import { scenarioFor } from '../lib/useScenario';
import { CircleCheck, Earth, Globe, Sun } from './Icons';

/** Workspace summary: how many sites, and how many are sunlit, see Earth, and rate good for power right now. */
export default function KpiStrip({ sites, all, t }: { sites: SiteInfo[]; all: (SiteData | null)[]; t: number }) {
  const tq = Math.floor(t / 3600000) * 3600000; // hourly, like the site list, so playback stays cheap
  const k = useMemo(() => {
    let sun = 0, earth = 0, good = 0, ready = 0;
    for (const d of all) {
      if (!d) continue;
      const r = scenarioFor(d, tq);
      ready++;
      if (r.metrics.sunUp) sun++;
      if (r.metrics.earthUp) earth++;
      if (r.power.level === 'green') good++;
    }
    return { sun, earth, good, ready };
  }, [all, tq]);
  const loading = k.ready < sites.length;
  const tiles = [
    { icon: <Globe size={16} />, value: sites.length, label: 'Landing sites' },
    { icon: <Sun size={16} />, value: k.sun, label: 'Sunlit now' },
    { icon: <Earth size={16} />, value: k.earth, label: 'Earth in view now' },
    { icon: <CircleCheck size={16} />, value: k.good, label: 'Good for power, next lunar day' },
  ];
  return (
    <ul className="kpis" aria-label="Summary across all sites" aria-busy={loading}>
      {tiles.map((x) => (
        <li key={x.label} className="kpi">
          <span className="kpi-icon" aria-hidden>{x.icon}</span>
          <span className="kpi-value num">{loading && x.label !== 'Landing sites' ? '…' : x.value}</span>
          <span className="kpi-label">{x.label}</span>
        </li>
      ))}
    </ul>
  );
}
