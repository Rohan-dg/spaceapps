import { useMemo } from 'react';
import type { SiteData } from './data';
import { computeMetrics, type Metrics } from './metrics';
import { commsVerdict, powerVerdict, type Verdict } from './verdict';

export interface ScenarioResult { metrics: Metrics; power: Verdict; comms: Verdict }

/** Metrics are recomputed when time moves; verdict windows are quantised to 30 min to stay cheap. */
export function useScenario(d: SiteData | null, t: number): ScenarioResult | null {
  return useMemo(() => {
    if (!d) return null;
    const site = { lat: d.horizon.lat, lon: d.horizon.lon, heightM: d.horizon.siteHeightM + d.horizon.observerHeightM };
    const metrics = computeMetrics(site, d.horizon.horizonDeg, d.series, t);
    return {
      metrics,
      power: powerVerdict(metrics, site, d.horizon.horizonDeg, d.series),
      comms: commsVerdict(metrics, site, d.horizon.horizonDeg, d.series),
    };
  }, [d, t]);
}

export const siteOf = (d: SiteData) => ({ lat: d.horizon.lat, lon: d.horizon.lon, heightM: d.horizon.siteHeightM + d.horizon.observerHeightM });
