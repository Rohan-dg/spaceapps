/**
 * Rover range on battery alone: how far a rover can drive with no sunlight, and the ring it can reach.
 * First-order: flat-ground speed, no slope or route detours (the mission planner's A* route handles those).
 */
import { offsetPoint, type LatLon } from '../mission';

export interface RoverInput { lat: number; lon: number; batteryH: number; speedKmH: number }
export interface RoverRange {
  oneWayKm: number; // drive until the battery is flat
  returnKm: number; // drive out and back to the start on one charge
  ring: LatLon[]; // one-way reach
  returnRing: LatLon[]; // out-and-back reach
}

export function validateRover(q: RoverInput): string | null {
  if (!isFinite(q.lat) || q.lat < -90 || q.lat > 90) return 'Latitude must be between −90 and 90.';
  if (!isFinite(q.lon) || q.lon < -180 || q.lon > 360) return 'Longitude must be between −180 and 360 (east positive).';
  if (!isFinite(q.batteryH) || q.batteryH <= 0) return 'Battery life must be more than 0 hours.';
  if (!isFinite(q.speedKmH) || q.speedKmH <= 0) return 'Speed must be more than 0 km/h.';
  return null;
}

/** Points on the circle `km` away from `c` (great-circle distance), `n` bearings. */
export function ringAround(c: LatLon, km: number, n = 256): LatLon[] {
  return Array.from({ length: n }, (_, i) => offsetPoint(c, km, (i * 360) / n));
}

export function roverRange(q: RoverInput, n = 256): RoverRange {
  const oneWayKm = q.batteryH * q.speedKmH, returnKm = oneWayKm / 2, c = { lat: q.lat, lon: q.lon };
  return { oneWayKm, returnKm, ring: ringAround(c, oneWayKm, n), returnRing: ringAround(c, returnKm, n) };
}
