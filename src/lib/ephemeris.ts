/**
 * Sun and Earth directions in the Moon-fixed frame, via astronomy-engine.
 *
 * Frame: IAU 2015 lunar rotation model (α0, δ0, W from astronomy-engine's
 * RotationAxis), which approximates the LOLA Mean-Earth/Polar-Axis (ME) frame to
 * within ~0.01°, far below our terrain resolution. See docs/MATH.md.
 */
import * as Astro from 'astronomy-engine';
import { DEG, type Vec3, add, norm, rotX, rotZ, scale, unit } from './vec';
import { type AzEl, type Site, azElFromBodyFixed, enuBasis } from './geometry';

export const AU_KM = 149597870.7;
const C_KM_S = 299792.458;
export const SUN_RADIUS_KM = 695700;
export const EARTH_RADIUS_KM = 6378.137;

/** Rotate a J2000 equatorial (EQJ) vector into the Moon-fixed frame at a time. */
export function eqjToMoonFixed(v: Vec3, axis: Astro.AxisInfo): Vec3 {
  const α0 = axis.ra * 15 * DEG; // sidereal hours → deg → rad
  const δ0 = axis.dec * DEG;
  const W = axis.spin * DEG;
  return rotZ(rotX(rotZ(v, Math.PI / 2 + α0), Math.PI / 2 - δ0), W);
}

export interface BodyFixedGeometry {
  time: Date;
  sunKm: Vec3; // Sun centre, Moon-centred Moon-fixed, km (apparent: aberration applied)
  earthKm: Vec3; // Earth centre, Moon-centred Moon-fixed, km
}

/** Site-independent geometry for one instant (compute once, reuse for all sites). */
export function bodyFixedGeometry(time: Date): BodyFixedGeometry {
  const t = Astro.MakeTime(time);
  const axis = Astro.RotationAxis(Astro.Body.Moon, t);

  // Moon heliocentric state (AU, AU/day). Sun as seen from the Moon = −moon.
  const ms = Astro.HelioState(Astro.Body.Moon, t);
  const sunFromMoonAU: Vec3 = [-ms.x, -ms.y, -ms.z];
  // First-order stellar aberration from the Moon's heliocentric velocity (~20″).
  const vKmS: Vec3 = scale([ms.vx, ms.vy, ms.vz], AU_KM / 86400);
  const dSun = norm(sunFromMoonAU) * AU_KM;
  const sunApparent = scale(unit(add(unit(sunFromMoonAU), scale(vKmS, 1 / C_KM_S))), dSun);

  // Earth as seen from the Moon (light time ~1.3 s and relative aberration ~0.7″ ignored).
  const gm = Astro.GeoMoon(t);
  const earthKm: Vec3 = [-gm.x * AU_KM, -gm.y * AU_KM, -gm.z * AU_KM];

  return {
    time,
    sunKm: eqjToMoonFixed(sunApparent, axis),
    earthKm: eqjToMoonFixed(earthKm, axis),
  };
}

export interface SkyState {
  sun: AzEl & { radiusDeg: number };
  earth: AzEl & { radiusDeg: number };
}

export function skyFromGeometry(g: BodyFixedGeometry, site: Site, basis = enuBasis(site)): SkyState {
  const sun = azElFromBodyFixed(g.sunKm, site, basis);
  const earth = azElFromBodyFixed(g.earthKm, site, basis);
  return {
    sun: { ...sun, radiusDeg: Math.asin(SUN_RADIUS_KM / sun.distKm) / DEG },
    earth: { ...earth, radiusDeg: Math.asin(EARTH_RADIUS_KM / earth.distKm) / DEG },
  };
}

/** Sun and Earth topocentric az/el at a site and time. */
export function skyAt(site: Site, time: Date): SkyState {
  return skyFromGeometry(bodyFixedGeometry(time), site);
}
