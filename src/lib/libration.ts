/**
 * Libration and orbital variation: how Earth wobbles in the lunar sky and how the Moon's orbit changes the
 * Sun and Earth geometry, from the same Moon-fixed Sun and Earth vectors every other figure in the app uses.
 *
 * - Optical libration: the sub-Earth point (where Earth is overhead) moves about ±8° in longitude (the
 *   eccentric orbit: speed along the orbit varies, rotation does not) and about ±7° in latitude (the Moon's
 *   equator is tilted 6.7° to its orbit). Seen from a site, Earth traces a loop in the sky.
 * - Orbital variation: the Earth-Moon distance runs from perigee to apogee (about 356,000 to 407,000 km), so
 *   Earth's apparent size changes; the sub-solar latitude swings about ±1.5° over a year (the Moon's axis is
 *   tilted 1.54° to the ecliptic), which is what sets polar day and night.
 */
import { bodyFixedGeometry, skyFromGeometry, EARTH_RADIUS_KM } from './ephemeris';
import { azElFromBodyFixed, enuBasis, type Site } from './geometry';
import { horizonAt, type HorizonProfile } from './horizon';

const D = 180 / Math.PI;
const DAY = 86400000;

export interface LibrationState {
  t: number;
  lonDeg: number; // sub-Earth longitude (libration in longitude), east positive
  latDeg: number; // sub-Earth latitude (libration in latitude)
  distKm: number; // Earth-Moon centre distance
  earthDiamDeg: number; // Earth's apparent diameter from the Moon
  sunLatDeg: number; // sub-solar latitude (the Moon's season)
  sunLonDeg: number; // sub-solar longitude
}

export function librationAt(t: number): LibrationState {
  const g = bodyFixedGeometry(new Date(t));
  const [ex, ey, ez] = g.earthKm, [sx, sy, sz] = g.sunKm;
  const de = Math.hypot(ex, ey, ez), ds = Math.hypot(sx, sy, sz);
  return {
    t, lonDeg: Math.atan2(ey, ex) * D, latDeg: Math.asin(ez / de) * D, distKm: de,
    earthDiamDeg: 2 * Math.asin(EARTH_RADIUS_KM / de) * D,
    sunLatDeg: Math.asin(sz / ds) * D, sunLonDeg: Math.atan2(sy, sx) * D,
  };
}

export function librationSeries(t0: number, t1: number, stepH: number): LibrationState[] {
  const out: LibrationState[] = [];
  for (let t = t0; t <= t1; t += stepH * 3600000) out.push(librationAt(t));
  return out;
}

/** Mean spacing (days) between successive maxima of a quantity: its dominant period. */
export function periodDays(s: LibrationState[], key: keyof Omit<LibrationState, 't'>, windowDays = 7): number {
  const peaks: number[] = [];
  for (let i = 1; i < s.length - 1; i++) {
    const v = s[i][key];
    if (v > s[i - 1][key] && v >= s[i + 1][key]) {
      // ignore wiggles: a peak must be the highest point within ±windowDays
      const lo = s[i].t - windowDays * DAY, hi = s[i].t + windowDays * DAY;
      if (s.every((x) => x.t < lo || x.t > hi || x[key] <= v)) peaks.push(s[i].t);
    }
  }
  if (peaks.length < 2) return NaN;
  return (peaks[peaks.length - 1] - peaks[0]) / (peaks.length - 1) / DAY;
}

export interface Range { min: number; max: number; tMin: number; tMax: number }
export function rangeOf(s: LibrationState[], key: keyof Omit<LibrationState, 't'>): Range {
  let r: Range = { min: Infinity, max: -Infinity, tMin: 0, tMax: 0 };
  for (const x of s) {
    if (x[key] < r.min) r = { ...r, min: x[key], tMin: x.t };
    if (x[key] > r.max) r = { ...r, max: x[key], tMax: x.t };
  }
  return r;
}

export interface TrackPoint { t: number; az: number; el: number; skyline: number; up: boolean }
export interface SiteLibration {
  track: TrackPoint[];
  earthUpPct: number; // share of the window with Earth's centre above the skyline
  elMin: number; elMax: number; // how far libration moves Earth up and down in this site's sky
  azMin: number; azMax: number;
  bestT: number; bestClearance: number; // when Earth stands highest above the skyline
  fixedEarth: { el: number; clearance: number; up: boolean }; // Earth held at its mean position (no libration)
}

/** Earth's track in a site's sky over a window, against the terrain skyline, and the no-libration counterfactual. */
export function siteLibration(site: Site, hz: HorizonProfile, t0: number, days = 29.53, stepMin = 60): SiteLibration {
  const basis = enuBasis(site), track: TrackPoint[] = [];
  for (let t = t0; t <= t0 + days * DAY; t += stepMin * 60000) {
    const k = skyFromGeometry(bodyFixedGeometry(new Date(t)), site, basis);
    const sky = horizonAt(hz, k.earth.az);
    track.push({ t, az: k.earth.az, el: k.earth.el, skyline: sky, up: k.earth.el > sky });
  }
  let best = track[0];
  for (const p of track) if (p.el - p.skyline > best.el - best.skyline) best = p;
  // unwrap azimuths so a track crossing north (0°/360°) stays continuous
  const az = unwrap(track.map((p) => p.az));
  // mean Earth: sub-Earth point at 0°, 0° and the mean distance, as if the Moon did not librate
  const mean = azElFromBodyFixed([384400, 0, 0], site, basis);
  const meanSky = horizonAt(hz, mean.az);
  return {
    track, earthUpPct: (track.filter((p) => p.up).length / track.length) * 100,
    elMin: Math.min(...track.map((p) => p.el)), elMax: Math.max(...track.map((p) => p.el)),
    azMin: Math.min(...az), azMax: Math.max(...az),
    bestT: best.t, bestClearance: best.el - best.skyline,
    fixedEarth: { el: mean.el, clearance: mean.el - meanSky, up: mean.el > meanSky },
  };
}

export function unwrap(a: number[]): number[] {
  const out = a.slice();
  for (let i = 1; i < out.length; i++) {
    while (out[i] - out[i - 1] > 180) out[i] -= 360;
    while (out[i] - out[i - 1] < -180) out[i] += 360;
  }
  return out;
}
