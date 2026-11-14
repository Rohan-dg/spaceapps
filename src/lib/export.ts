/** P2: export the selected scenario's metrics as CSV or JSON. */
import type { SiteData } from './data';
import type { ScenarioResult } from './useScenario';

export function scenarioRecord(d: SiteData, r: ScenarioResult) {
  const m = r.metrics;
  const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString());
  return {
    site_id: d.info.id, site_name: d.info.name, lat: d.horizon.lat, lon_east: d.horizon.lon, site_height_m: d.horizon.siteHeightM,
    dem: d.horizon.dem, approximate: !!d.info.approximate, synthetic_terrain: d.horizon.synthetic, coordinate_needs_verification: d.info.verify,
    time_utc: new Date(m.t).toISOString(),
    sun_azimuth_deg: +m.sky.sun.az.toFixed(3), sun_elevation_deg: +m.sky.sun.el.toFixed(3), sun_terrain_horizon_deg: +m.sunHorizon.toFixed(3), sun_visible: m.sunUp,
    earth_azimuth_deg: +m.sky.earth.az.toFixed(3), earth_elevation_deg: +m.sky.earth.el.toFixed(3), earth_terrain_horizon_deg: +m.earthHorizon.toFixed(3), earth_visible: m.earthUp,
    next_sunset_utc: iso(m.nextSunset.t), next_sunrise_utc: iso(m.nextSunrise.t), next_earthset_utc: iso(m.nextEarthset.t), next_earthrise_utc: iso(m.nextEarthrise.t),
    window_days: +m.windowDays.toFixed(2), sunlit_pct: +m.sunPct.toFixed(2), earth_visible_pct: +m.earthPct.toFixed(2),
    longest_dark_h: +m.longestDarkH.toFixed(1), longest_dark_clipped: m.longestDarkClipped,
    longest_nocomm_h: +m.longestNoCommH.toFixed(1), longest_nocomm_clipped: m.longestNoCommClipped,
    power_verdict: r.power.level, power_reason: r.power.reason, comms_verdict: r.comms.level, comms_reason: r.comms.reason,
  };
}

export function toCSV(rows: Record<string, unknown>[]): string {
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n') + '\n';
}
