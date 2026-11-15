import { useMemo } from 'react';
import type { SiteData } from './data';
import { computeMetrics, type Metrics } from './metrics';
import { commsVerdict, powerVerdict, type Verdict } from './verdict';

export interface ScenarioResult { metrics: Metrics; power: Verdict; comms: Verdict }

/** Metrics are recomputed when time moves; verdict windows are quantised to 30 min to stay cheap. */
/** Pure version of useScenario, for summaries that cover many sites at once. */
const SCEN_CACHE = new WeakMap<SiteData, Map<number, ScenarioResult>>();
const SCEN_MAX = 512;

/** Cached per site and instant: the summary strip, date-slip panel, comparisons and help chat ask for the same
 *  (site, time) pairs over and over. Results are treated as read-only by every caller. */
export function scenarioFor(d: SiteData, t: number): ScenarioResult {
  let m = SCEN_CACHE.get(d);
  if (!m) { m = new Map(); SCEN_CACHE.set(d, m); }
  const hit = m.get(t);
  if (hit) return hit;
  const r = computeScenario(d, t);
  if (m.size >= SCEN_MAX) m.delete(m.keys().next().value as number);
  m.set(t, r);
  return r;
}

function computeScenario(d: SiteData, t: number): ScenarioResult {
  const site = { lat: d.horizon.lat, lon: d.horizon.lon, heightM: d.horizon.siteHeightM + d.horizon.observerHeightM };
  const metrics = computeMetrics(site, d.horizon.horizonDeg, d.series, t);
  return {
    metrics,
    power: powerVerdict(metrics, site, d.horizon.horizonDeg, d.series),
    comms: commsVerdict(metrics, site, d.horizon.horizonDeg, d.series),
  };
}

export function useScenario(d: SiteData | null, t: number): ScenarioResult | null {
  return useMemo(() => (d ? scenarioFor(d, t) : null), [d, t]);
}

export const siteOf = (d: SiteData) => ({ lat: d.horizon.lat, lon: d.horizon.lon, heightM: d.horizon.siteHeightM + d.horizon.observerHeightM });
