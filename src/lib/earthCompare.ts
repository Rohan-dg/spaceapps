/**
 * The same latitude on Earth, for the Moon-vs-Earth panel. Low-precision solar geometry (NOAA-style
 * declination and equation of time, no refraction unless asked): good to a few tenths of a degree, which is
 * plenty for a side-by-side comparison. The Moon side of the panel uses the app's real ephemeris and terrain.
 */
const D2R = Math.PI / 180;
export const EARTH_R_M = 6371000;
export const MOON_R_M = 1737400;
/** The Sun's mean angular speed across a lunar sky (deg/h): 360° per synodic month. */
export const MOON_SUN_RATE = 360 / (29.530589 * 24);

function fracYear(t: number) {
  const d = new Date(t);
  const y0 = Date.UTC(d.getUTCFullYear(), 0, 1);
  return (2 * Math.PI / 365) * ((t - y0) / 86400_000);
}

/** Solar declination (deg). */
export function declination(t: number): number {
  const g = fracYear(t);
  return (0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)) / D2R;
}

/** Equation of time (minutes). */
function eqTime(t: number): number {
  const g = fracYear(t);
  return 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
}

/** Sun elevation (deg, geometric) at latitude/longitude (deg, east positive) on Earth at time t. */
export function earthSunEl(lat: number, lon: number, t: number): number {
  const d = new Date(t);
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const lonE = ((lon + 540) % 360) - 180;
  const ha = ((minutes + eqTime(t) + 4 * lonE) / 4 - 180) * D2R;
  const φ = lat * D2R, δ = declination(t) * D2R;
  return Math.asin(Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(ha)) / D2R;
}

/** Highest Sun elevation that day (deg): local noon. */
export const earthNoonEl = (lat: number, t: number) => 90 - Math.abs(lat - declination(t));

/** Hours of daylight on Earth that day (0 in polar night, 24 in midnight sun), with standard refraction. */
export function earthDayLengthH(lat: number, t: number): number {
  const φ = lat * D2R, δ = declination(t) * D2R;
  const c = (Math.sin(-0.833 * D2R) - Math.sin(φ) * Math.sin(δ)) / (Math.cos(φ) * Math.cos(δ));
  if (c >= 1) return 0;
  if (c <= -1) return 24;
  return (2 * Math.acos(c) / D2R) / 15;
}

/**
 * How long the whole solar disk (0.53°) takes to clear a flat horizon, in hours, for a Sun moving at `rateDegH`
 * along its daily circle at latitude `lat` and declination `dec`. Near the poles the Sun skims the horizon
 * and this gets very long; capped at 24 × 29.5 h.
 */
export function sunriseDurationH(lat: number, dec: number, rateDegH: number): number {
  const vertical = rateDegH * Math.cos(lat * D2R) * Math.cos(dec * D2R);
  return Math.min(24 * 29.5, 0.533 / Math.max(vertical, 1e-6));
}

/** Distance (km) to the geometric horizon for an eye `hM` above a smooth sphere of radius `rM`. */
export const horizonDistKm = (hM: number, rM: number) => Math.sqrt(2 * rM * hM + hM * hM) / 1000;
