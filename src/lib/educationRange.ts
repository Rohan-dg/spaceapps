import { EDU_ROVER, type PathReport } from './pathPlan';
import { roverReach, type Reach, type RoverSpec } from './moon/rover';
import type { HeightFn } from './moon/probe';

export interface BatteryPoint { id: string; lat: number; lon: number; chargePct: number | null }
export interface BatteryRange { id: string; chargePct: number; minKm: number; maxKm: number }

/** Battery left on first arrival. Do not imply a stranded rover reaches later stops. */
export function arrivalCharge(report: PathReport | null, stop: number, startPct: number): number | null {
  if (stop === 0) return startPct;
  if (!report) return null;
  const t = report.legs[stop - 1]?.arrive;
  if (t === undefined) return null;
  if (report.tl.emptyT !== null && report.tl.emptyT <= t) return 0;
  if (t > report.tl.t0 + report.simulatedH * 3600000 + 1) return null;
  const x = Math.max(0, (t - report.tl.t0) / report.tl.stepMs);
  const a = Math.min(report.tl.n - 1, Math.floor(x)), b = Math.min(report.tl.n - 1, a + 1);
  return report.tl.battPct[a] + (report.tl.battPct[b] - report.tl.battPct[a]) * (x - a);
}

/** One-way battery-only reach; sunlight is deliberately excluded from the available energy. */
export function educationReach(height: HeightFn, point: BatteryPoint, resM: number): Reach | null {
  if (point.chargePct === null || !Number.isFinite(point.chargePct)) return null;
  const spec: RoverSpec = {
    lat: point.lat, lon: point.lon, batteryWh: EDU_ROVER.batteryWh,
    startPct: Math.max(0, Math.min(100, point.chargePct)), reservePct: EDU_ROVER.reservePct,
    hotelW: EDU_ROVER.hotelW, driveW: EDU_ROVER.driveW, solarW: 0, speedKmH: EDU_ROVER.speedKmH,
    maxSlopeDeg: 15, slopeDerate: 0.5, massKg: 250, drivetrainPct: 60, detourPct: 0,
  };
  if (spec.startPct <= spec.reservePct) {
    // roverReach expects positive usable energy. A zero budget has a zero-radius boundary.
    const zero = roverReach(height, { ...spec, startPct: spec.reservePct + 0.000001 }, resM, 72);
    return { ...zero, usableWh: 0, flatKm: 0, driveHFlat: 0, parkedH: 0,
      rays: zero.rays.map((r) => ({ ...r, oneWayKm: 0, returnKm: 0 })),
      ring: zero.ring.map(() => ({ lat: point.lat, lon: point.lon })),
      returnRing: zero.returnRing.map(() => ({ lat: point.lat, lon: point.lon })),
      oneWay: { min: 0, median: 0, max: 0, areaKm2: 0 }, ret: { min: 0, median: 0, max: 0, areaKm2: 0 } };
  }
  return roverReach(height, spec, resM, 72);
}
