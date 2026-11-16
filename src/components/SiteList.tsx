import { Earth, Sun, SunDim } from './Icons';
import { memo, useMemo, useState } from 'react';
import { type SiteData, type SiteInfo, useSiteData } from '../lib/data';
import { yearOf } from '../lib/missionCompare';
import { useScenario } from '../lib/useScenario';
import { findRun } from '../lib/series';
import { LevelIcon } from './Metrics';

const REGION: Record<string, string> = { 'south-pole': 'pole', 'high-latitude': 'high lat.', 'mid-latitude': 'mid lat.', equatorial: 'equator', 'far-side': 'far side' };
/** Site-list groups, in display order. Custom points go last. Collapsed groups load their sites only when opened. */
const GROUPS: { id: string; label: string; collapsed?: boolean }[] = [
  { id: 'artemis', label: 'NASA Artemis III candidate regions (2024)' },
  { id: 'artemis-2022', label: 'Earlier Artemis III candidates (2022)' },
  { id: 'clps', label: 'NASA CLPS (commercial landers)' },
  { id: 'apollo', label: 'Apollo' },
  { id: 'nasa', label: 'NASA Surveyor' },
  { id: 'international', label: 'Other countries' },
  { id: 'attempts', label: 'Crashes and impacts', collapsed: true },
  { id: 'reference', label: 'Reference sites' },
  { id: 'custom', label: 'Your points' },
];
const STATUS: Record<string, string> = { planned: 'planned', target: 'target only', crashed: 'crash', impact: 'impact' };

/** A spacecraft that crashed or was deliberately crashed into the Moon. */
export const isAttempt = (s: SiteInfo) => s.status === 'crashed' || s.status === 'impact';
const groupOf = (s: SiteInfo) => (s.approximate ? 'custom' : isAttempt(s) ? 'attempts' : s.program ?? 'reference');
const WORD = { green: 'good', amber: 'marginal', red: 'poor' } as const;

const Row = memo(function Row({ info, data: preloaded, t, selected, onSelect, onRemove }: { info: SiteInfo; data: SiteData | null; t: number; selected: boolean; onSelect: (id: string) => void; onRemove?: (id: string) => void }) {
  const own = useSiteData(preloaded ? null : info.id); // sites that aren't preloaded load when their row is shown
  const data = preloaded ?? own;
  const year = yearOf(info);
  // ratings cover the next lunar day, so a 3-hour step is plenty; the cheap sunlit / Earth flags follow every hour
  const r0 = useScenario(data, Math.floor(t / 10800000) * 10800000);
  const r = useMemo(() => {
    if (!r0 || !data) return r0;
    // the series store run-length visibility ([start, end, ...] sample indices), so look up the run
    const s = data.series, i = Math.floor((t - s.t0) / s.stepMs), ok = i >= 0 && i < s.n;
    return { ...r0, metrics: { ...r0.metrics, sunUp: ok ? findRun(s.sunUp, i) >= 0 : r0.metrics.sunUp, earthUp: ok ? findRun(s.earthUp, i) >= 0 : r0.metrics.earthUp } };
  }, [r0, data, t]);
  const label = r
    ? `${info.short}. Now: ${r.metrics.sunUp ? 'sunlit' : 'in shadow'}, Earth ${r.metrics.earthUp ? 'in view' : 'hidden'}. Power ${WORD[r.power.level]}, comms ${WORD[r.comms.level]}.`
    : info.short;
  return (
    <li>
      <button className={`site-row${selected ? ' selected' : ''}`} onClick={() => onSelect(info.id)} aria-pressed={selected} aria-label={label}>
        <span className="site-text">
          <span className="site-name">{info.short}{info.status && STATUS[info.status] && <span className="site-status">{STATUS[info.status]}</span>}</span>
          <span className="site-meta">{year && <span className="num site-year">{year}</span>}<span className="num">{Math.abs(info.lat).toFixed(2)}°{info.lat < 0 ? 'S' : 'N'}</span><span>{info.approximate ? 'custom' : REGION[info.region] ?? info.region}</span></span>
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
      {onRemove && (info.id.startsWith('custom') || info.id.startsWith('pending')) && <button className="site-remove" onClick={() => onRemove(info.id)} aria-label={`Remove ${info.short}`} title={`Remove ${info.short}`}>×</button>}
    </li>
  );
});

export default function SiteList({ sites, all, t, selected, onSelect, onRemove }: { sites: SiteInfo[]; all: (SiteData | null)[]; t: number; selected: string; onSelect: (id: string) => void; onRemove?: (id: string) => void }) {
  const tq = Math.floor(t / 3600000) * 3600000; // hourly is plenty for the index; keeps playback smooth
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  // search: every word must appear in the site's name, short name, mission, program or region (accents ignored)
  const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  const matches = (s: SiteInfo) => !words.length || words.every((w) => fold(`${s.name} ${s.short} ${s.mission ?? ''} ${s.program ?? ''} ${s.region} ${s.id}`).includes(w));
  const shown = sites.filter(matches).length;
  return (
    <nav className="site-index" aria-label="Landing sites">
      <div className="site-search">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sites, missions, programs…" aria-label="Search landing sites"
          onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); if (e.key === 'Enter') { const first = sites.find(matches); if (first) onSelect(first.id); } }} />
        {query && <span className="site-search-n num" aria-live="polite">{shown} of {sites.length}</span>}
      </div>
      {query && !shown && <p className="site-search-none">No site matches "{query}". Try a mission, program or region, like "CLPS", "Apollo" or "pole".</p>}
      <div className="site-index-head">
        <span>Site</span>
        <span title="Sun / Earth above the skyline now">Now</span>
        <span title="Power / comms rating, next lunar day">Rating</span>
      </div>
      {GROUPS.map((g) => {
        const rows = sites.map((s, i) => ({ s, i, y: yearOf(s) })).filter(({ s }) => groupOf(s) === g.id && matches(s))
          .sort((a, b) => (a.y ?? 9999) - (b.y ?? 9999) || a.i - b.i); // oldest first; undated keep file order
        if (!rows.length) return null;
        const expanded = words.length > 0 || (open[g.id] ?? (!g.collapsed || rows.some(({ s }) => s.id === selected)));
        const listId = `site-group-${g.id}`;
        return (
          <section key={g.id} className={`site-group${g.id === 'artemis' ? ' featured' : ''}`} aria-label={g.label}>
            <h3 className="site-group-h">
              {g.collapsed ? (
                <button type="button" className="site-group-toggle" aria-expanded={expanded} aria-controls={listId} onClick={() => setOpen({ ...open, [g.id]: !expanded })}>
                  <span><span className="site-group-caret" aria-hidden>{expanded ? '▾' : '▸'}</span>{g.label}</span>
                  <span className="num">{rows.length}</span>
                </button>
              ) : (
                <>
                  <span>{g.label}{g.id === 'artemis' && <small>NASA's current crewed landing regions (Oct 2024)</small>}</span>
                  <span className="num">{rows.length}</span>
                </>
              )}
            </h3>
            {expanded && (
              <ul className="site-list" id={listId}>
                {rows.map(({ s, i }) => <Row key={s.id} info={s} data={all[i]} t={tq} selected={s.id === selected} onSelect={onSelect} onRemove={onRemove} />)}
              </ul>
            )}
          </section>
        );
      })}
    </nav>
  );
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 18 commits), under the team's direction. Attribution from the commit history.
