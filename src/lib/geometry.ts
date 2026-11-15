/**
 * Pure geometry: site position on a spherical Moon, local East-North-Up basis,
 * and conversion of a Moon-fixed target vector into local azimuth/elevation.
 * No ephemeris here, so it is easy to unit-test. See docs/MATH.md.
 */
import { DEG, RAD, type Vec3, dot, norm, sub } from './vec';

/** Mean lunar radius (km), IAU / LOLA reference sphere. */
export const MOON_RADIUS_KM = 1737.4;

export interface Site {
  lat: number; // degrees, planetocentric, north positive
  lon: number; // degrees, east positive
  heightM?: number; // observer height above reference sphere (m); terrain height + mast
}

/** Moon-fixed (body-fixed) Cartesian position of a site, km. */
export function siteVector(site: Site): Vec3 {
  const r = MOON_RADIUS_KM + (site.heightM ?? 0) / 1000;
  const φ = site.lat * DEG, λ = site.lon * DEG;
  return [r * Math.cos(φ) * Math.cos(λ), r * Math.cos(φ) * Math.sin(λ), r * Math.sin(φ)];
}

/** Local unit vectors East, North, Up at the site, in Moon-fixed axes. */
export function enuBasis(site: Site): { e: Vec3; n: Vec3; u: Vec3 } {
  const φ = site.lat * DEG, λ = site.lon * DEG;
  const sφ = Math.sin(φ), cφ = Math.cos(φ), sλ = Math.sin(λ), cλ = Math.cos(λ);
  return {
    e: [-sλ, cλ, 0],
    n: [-sφ * cλ, -sφ * sλ, cφ],
    u: [cφ * cλ, cφ * sλ, sφ],
  };
}

export interface AzEl {
  az: number; // degrees, clockwise from local north (0..360)
  el: number; // degrees above the local horizontal plane
  distKm: number;
}

/** Normalize an angle to [0, 360). */
export const wrap360 = (a: number) => ((a % 360) + 360) % 360;

/**
 * Topocentric azimuth/elevation of a target given its Moon-centred, Moon-fixed
 * position vector (km). Subtracting the site vector applies topocentric parallax
 * (≈0.26° for Earth, negligible for the Sun).
 */
export function azElFromBodyFixed(targetKm: Vec3, site: Site, basis = enuBasis(site)): AzEl {
  const rel = sub(targetKm, siteVector(site));
  const d = norm(rel);
  const E = dot(rel, basis.e), N = dot(rel, basis.n), U = dot(rel, basis.u);
  return { az: wrap360(Math.atan2(E, N) * RAD), el: Math.asin(Math.max(-1, Math.min(1, U / d))) * RAD, distKm: d };
}

/**
 * Elevation angle (deg) of a terrain point at horizontal ground distance dKm and
 * height hTargetM, seen from an observer at height hObsM, including the drop of
 * the target below the observer's tangent plane due to lunar curvature (d²/2R).
 */
export function terrainElevationAngle(dKm: number, hTargetM: number, hObsM: number, R = MOON_RADIUS_KM): number {
  const dropM = ((dKm * dKm) / (2 * R)) * 1000;
  return Math.atan2(hTargetM - hObsM - dropM, dKm * 1000) * RAD;
}

/**
 * Elevation (deg, negative) of the bare-sphere horizon for an eye `hM` above a smooth Moon: the edge of the
 * lunar sphere, with no terrain. There is no atmosphere, so no refraction term: the real skyline is purely
 * geometric, the highest terrain along each line of sight (which from a peak can be below this value).
 */
export const sphereHorizonDeg = (hM: number, R = MOON_RADIUS_KM * 1000) => -Math.acos(R / (R + hM)) * 180 / Math.PI;
