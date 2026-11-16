import { useDeferredValue, useMemo } from 'react';
import type { SiteData } from './data';
import { skyAt } from './ephemeris';
import { horizonAt, diskVisibleFraction } from './horizon';
import {
  bestDeparture, destinationOf, driveSchedule, feasibility, roverAt, simulateMission, solarPowerW, surfaceTempK, waypointVisibility,
  type MissionPlan,
} from './mission';
import type { ScenarioResult } from './useScenario';
import { useRoute } from './useRoute';

const AU_KM = 149597870.7;

/** Everything the mission-variable table and the calculator's "fill from sim" need, for one site and time. */
export function useMission(d: SiteData | null, res: ScenarioResult | null, planIn: MissionPlan, t: number) {
  const plan = useDeferredValue(planIn);
  const site = d ? { lat: d.horizon.lat, lon: d.horizon.lon } : { lat: -89.45, lon: 222.69 };
  const dest = destinationOf(plan, site);
  const { route, busy, err } = useRoute(site, dest, plan.maxSlopeDeg);

  const core = useMemo(() => {
    if (!d) return null;
    const sched = driveSchedule(route, plan);
    const travelH = sched[sched.length - 1];
    const tl = simulateMission(plan, route, sched, d.horizon.horizonDeg, d.horizon.siteHeightM, d.series.stepMs);
    const wp = waypointVisibility(route, sched, plan.departure, d.horizon.horizonDeg, d.horizon.siteHeightM);
    const best = bestDeparture(d.series, plan.departure, Math.max(travelH, 0.5));
    return { sched, travelH, tl, wp, best };
  }, [d, route, plan]);

  return useMemo(() => {
    if (!d || !res || !core) return null;
    const { sched, travelH, tl, wp, best } = core;
    const rover = roverAt(route, sched, plan.departure, t);
    // Live conditions where the rover is right now.
    const wps = route.waypoints.filter((w) => w.horizonDeg);
    const near = wps.length ? wps.reduce((a, w) => (Math.abs(w.dKm - rover.dKm) < Math.abs(a.dKm - rover.dKm) ? w : a)) : null;
    const hz = near?.horizonDeg ?? d.horizon.horizonDeg;
    const sky = skyAt({ lat: rover.lat, lon: rover.lon, heightM: (rover.hM ?? d.horizon.siteHeightM) + d.horizon.observerHeightM }, new Date(t));
    const sunHz = horizonAt(hz, sky.sun.az);
    const sunFrac = diskVisibleFraction(sky.sun.el, sky.sun.radiusDeg, sunHz);
    const powerW = solarPowerW(plan, sky.sun.el, sunFrac, sky.sun.distKm / AU_KM);
    const permShadow = d.info.stats.sunPct === 0 && rover.phase === 'before';
    const tempK = surfaceTempK(sky.sun.el, sunFrac, permShadow);
    const k = Math.round((t - plan.departure) / tl.stepMs);
    const inMission = k >= 0 && k < tl.n;
    const battPct = k < 0 ? plan.startPct : tl.battPct[Math.min(tl.n - 1, k)];
    const driving = rover.phase === 'driving';
    const loadW = plan.hotelW + (driving ? plan.driveW : 0);
    const feas = feasibility({ power: res.power.level, comms: res.comms.level, route, tl, travelH, plan });
    return {
      plan, site, dest, route, busy, err, sched, travelH, tl, wp, best, rover, sky, sunHz, sunFrac, powerW, tempK,
      battPct, inMission, loadW, feas, avgSpeed: travelH > 0 ? route.lengthKm / travelH : plan.speedKmH,
    };
  }, [d, res, core, route, plan, t, busy, err, site.lat, site.lon, dest.lat, dest.lon]);
}

export type MissionState = NonNullable<ReturnType<typeof useMission>>;

/** Flat numbers for the calculator's "Fill from the sim". Keys match VarDef.sim in equations.ts. */
export function simSnapshot(d: SiteData | null, r: ScenarioResult | null, m: MissionState | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (d) Object.assign(out, { siteH: d.horizon.siteHeightM, obsH: d.horizon.observerHeightM, demRes: d.horizon.demResolutionM ?? 1895, lat: d.horizon.lat, lon: d.horizon.lon });
  if (r) {
    const x = r.metrics;
    Object.assign(out, {
      sunEl: x.sky.sun.el, sunHz: x.sunHorizon, sunClear: x.sky.sun.el - x.sunHorizon, earthEl: x.sky.earth.el, earthHz: x.earthHorizon,
      earthClear: x.sky.earth.el - x.earthHorizon, sunPct: x.sunPct, darkH: x.longestDarkH,
    });
  }
  if (m) {
    const p = m.plan;
    Object.assign(out, {
      routeKm: m.route.lengthKm, directKm: m.route.directKm, travelH: m.travelH, avgSpeed: m.avgSpeed, speed: p.speedKmH, derate: p.slopeDerate,
      maxSlopeLimit: p.maxSlopeDeg, meanSlope: m.route.meanSlopeDeg ?? 0, panelM2: p.panelM2, panelEff: p.panelEffPct, sunFrac: m.sunFrac * 100,
      powerW: m.powerW, loadW: m.loadW, battPct: m.battPct, batteryWh: p.batteryWh, dod: 100 - p.reservePct, hotelW: p.hotelW, driveW: p.driveW,
      durationDays: p.durationDays, destLat: m.dest.lat, destLon: m.dest.lon,
    });
  }
  return out;
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
