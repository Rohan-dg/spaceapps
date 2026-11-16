/**
 * Geometry for the first-person site view: a cylindrical projection of the sky around the observer,
 * plus Earth's phase as seen from the site. Pure functions, unit-tested in __tests__/firstPerson.test.ts.
 */
const D2R = Math.PI / 180;

/** Signed smallest difference a − b in degrees, in (−180, 180]. */
export function wrapDelta(a: number, b: number): number {
  const d = ((a - b) % 360 + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

/** Unit vector (east, north, up) for an azimuth/elevation in degrees. */
function enu(az: number, el: number): [number, number, number] {
  const ca = Math.cos(el * D2R);
  return [ca * Math.sin(az * D2R), ca * Math.cos(az * D2R), Math.sin(el * D2R)];
}

/** Angle in degrees between two sky directions. */
export function separation(az1: number, el1: number, az2: number, el2: number): number {
  const a = enu(az1, el1), b = enu(az2, el2);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot) / D2R;
}

/**
 * Earth's phase seen from the Moon. The Sun is effectively at infinity, so the phase angle
 * (Sun–Earth–observer) is 180° minus the Sun–Earth elongation seen from the site.
 * Returns the phase angle in degrees and the illuminated fraction of the disc (0 new, 1 full).
 */
export function earthPhase(sunAz: number, sunEl: number, earthAz: number, earthEl: number): { phaseDeg: number; lit: number } {
  const phaseDeg = 180 - separation(sunAz, sunEl, earthAz, earthEl);
  return { phaseDeg, lit: (1 + Math.cos(phaseDeg * D2R)) / 2 };
}

export interface View { yaw: number; fov: number; width: number; height: number; vScale: number; horizonY: number }

/** Pixels per degree horizontally. */
export const pxPerDeg = (v: View) => v.width / v.fov;

/** Screen x for an azimuth, or null when it is outside the field of view. */
export function xOf(v: View, az: number): number | null {
  const d = wrapDelta(az, v.yaw);
  if (Math.abs(d) > v.fov / 2) return null;
  return v.width / 2 + d * pxPerDeg(v);
}

/** Screen y for an elevation (degrees above the observer's horizontal plane). */
export const yOf = (v: View, el: number) => v.horizonY - el * pxPerDeg(v) * v.vScale;

/** Azimuth at a screen x. */
export const azAt = (v: View, x: number) => (((v.yaw + (x - v.width / 2) / pxPerDeg(v)) % 360) + 360) % 360;

const NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** Short compass name for an azimuth. */
export const compassShort = (az: number) => NAMES[Math.round((((az % 360) + 360) % 360) / 45) % 8];

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 2 commits), under the team's direction. Attribution from the commit history.
