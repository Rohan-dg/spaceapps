/** Terrain-horizon masking. A profile is 360 elevation angles (deg) at azimuth 0°,1°,…,359°. */
import { wrap360 } from './geometry';

export type HorizonProfile = number[];

/** Terrain horizon elevation at an arbitrary azimuth, linear interpolation with wrap-around. */
export function horizonAt(profile: HorizonProfile, az: number): number {
  const n = profile.length;
  const x = (wrap360(az) / 360) * n;
  const i0 = Math.floor(x) % n;
  const i1 = (i0 + 1) % n;
  const f = x - Math.floor(x);
  return profile[i0] * (1 - f) + profile[i1] * f;
}

/** Centre of the body is above the local terrain horizon. */
export function isAboveHorizon(profile: HorizonProfile, az: number, el: number): boolean {
  return el > horizonAt(profile, az);
}

/**
 * Fraction (0..1) of a disk of angular radius r (deg) centred at elevation el that lies above
 * a horizon of elevation h. Treats the horizon as locally straight across the disk (valid
 * since the Sun's disk, 0.53°, is small compared with azimuthal terrain variation at 1° steps).
 */
export function diskVisibleFraction(el: number, r: number, h: number): number {
  const x = Math.max(-1, Math.min(1, (el - h) / r));
  return 1 - (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI;
}

/** Flat (no-terrain) profile: horizon at 0° everywhere. Used for tests and as a reference. */
export const flatProfile = (): HorizonProfile => new Array(360).fill(0);
