/**
 * Scientific lander model: power, thermal survival and Earth link, driven by the engineer's own numbers and by the
 * site's precomputed Sun / Earth series (every 30 min, terrain skyline included).
 *
 * Lunar environment, built in: no atmosphere, so no absorption, scattering or refraction (sunlight arrives at the
 * full solar constant, scaled for the Earth-Moon distance from the Sun) and no convective cooling (heaters must
 * carry the lander through the night). The visible part of the solar disk is taken from the series, so a Sun
 * half behind a ridge gives half power.
 *
 * Array output per step = S * A * eta * pointing(elevation) * diskFraction * (1 - losses) * (1 - dust * days),
 * where pointing is cos(elevation) for a vertical array that tracks the Sun in azimuth (the usual polar choice),
 * sin(elevation) for a horizontal array, or 1 for a two-axis tracker.
 */
import { SYNODIC_DAYS, isUp, indexAt, type Series } from './series';

export type Pointing = 'vertical-tracking' | 'horizontal' | 'two-axis';

export interface Lander {
  // solar array
  arrayAreaM2: number;
  cellEffPct: number;
  pointing: Pointing;
  systemLossPct: number; // wiring, MPPT, temperature derating, mismatch
  dustLossPctPerDay: number; // regolith dust build-up
  solarConstantWm2: number;
  // battery
  batteryKWh: number;
  initialChargePct: number;
  maxDepthOfDischargePct: number; // usable fraction before the battery is protected
  roundTripEffPct: number;
  // loads
  dayLoadW: number;
  nightLoadW: number; // avionics kept on through the night
  heaterW: number; // survival heaters, night only (no air, so nothing else keeps it warm)
  // link
  commsLoadW: number; // extra while transmitting to Earth
  commsDutyPct: number;
  minEarthElDeg: number; // antenna mask: Earth must be at least this high
  // mission
  durationDays: number;
}

export const DEFAULT_LANDER: Lander = {
  arrayAreaM2: 3, cellEffPct: 29, pointing: 'vertical-tracking', systemLossPct: 12, dustLossPctPerDay: 0.05, solarConstantWm2: 1361,
  batteryKWh: 30, initialChargePct: 100, maxDepthOfDischargePct: 80, roundTripEffPct: 92,
  dayLoadW: 250, nightLoadW: 60, heaterW: 90,
  commsLoadW: 40, commsDutyPct: 25, minEarthElDeg: 0,
  durationDays: Math.round(SYNODIC_DAYS * 10) / 10,
};

/** Every input with its label, unit, limits and the group it belongs to, so the form and validation share one list. */
export const LANDER_FIELDS: { key: Exclude<keyof Lander, 'pointing'>; label: string; unit: string; min: number; max: number; group: string; hint?: string }[] = [
  { key: 'arrayAreaM2', label: 'Array area', unit: 'm²', min: 0, max: 500, group: 'Solar array' },
  { key: 'cellEffPct', label: 'Cell efficiency', unit: '%', min: 1, max: 50, group: 'Solar array', hint: 'Triple-junction GaAs is about 28–32 %' },
  { key: 'systemLossPct', label: 'System losses', unit: '%', min: 0, max: 90, group: 'Solar array', hint: 'Wiring, MPPT, temperature derating' },
  { key: 'dustLossPctPerDay', label: 'Dust build-up', unit: '%/day', min: 0, max: 10, group: 'Solar array' },
  { key: 'solarConstantWm2', label: 'Solar constant', unit: 'W/m²', min: 1200, max: 1500, group: 'Solar array', hint: '1361 at 1 AU; the Moon varies about ±3 % over a year' },
  { key: 'batteryKWh', label: 'Battery capacity', unit: 'kWh', min: 0.01, max: 10000, group: 'Battery' },
  { key: 'initialChargePct', label: 'Charge at start', unit: '%', min: 0, max: 100, group: 'Battery' },
  { key: 'maxDepthOfDischargePct', label: 'Max depth of discharge', unit: '%', min: 1, max: 100, group: 'Battery' },
  { key: 'roundTripEffPct', label: 'Round-trip efficiency', unit: '%', min: 50, max: 100, group: 'Battery' },
  { key: 'dayLoadW', label: 'Daytime operations load', unit: 'W', min: 0, max: 100000, group: 'Loads' },
  { key: 'nightLoadW', label: 'Night avionics load', unit: 'W', min: 0, max: 100000, group: 'Loads' },
  { key: 'heaterW', label: 'Survival heaters (night)', unit: 'W', min: 0, max: 100000, group: 'Loads', hint: 'No atmosphere: heaters alone keep it warm in the dark' },
  { key: 'commsLoadW', label: 'Transmitter load', unit: 'W', min: 0, max: 100000, group: 'Earth link' },
  { key: 'commsDutyPct', label: 'Transmit duty cycle', unit: '%', min: 0, max: 100, group: 'Earth link' },
  { key: 'minEarthElDeg', label: 'Antenna elevation mask', unit: '°', min: 0, max: 45, group: 'Earth link', hint: 'Earth must be in view and at least this high' },
  { key: 'durationDays', label: 'Mission duration', unit: 'days', min: 0.5, max: 365, group: 'Mission' },
];

export function validateLander(l: Lander): string | null {
  for (const f of LANDER_FIELDS) {
    const v = l[f.key];
    if (!Number.isFinite(v) || v < f.min || v > f.max) return `${f.label} must be between ${f.min} and ${f.max} ${f.unit}.`;
  }
  return null;
}

export interface LanderResult {
  survives: boolean;
  firstOutageH: number | null; // hours from start to the first time the battery hits its protection limit
  minChargePct: number;
  hoursWithoutPower: number;
  generatedKWh: number;
  usedKWh: number;
  netKWh: number;
  peakArrayW: number;
  meanArrayWSunlit: number;
  operatingHours: number; // sunlit with the array covering the day load, or powered daytime ops
  linkHours: number; // Earth above the mask while powered
  heaterKWh: number;
  periodH: number;
}

export function simulateLander(s: Series, t: number, l: Lander): LanderResult {
  const stepH = s.stepMs / 3600000;
  const i0 = Math.max(0, Math.floor(indexAt(s, t)));
  const i1 = Math.min(s.n, i0 + Math.round((l.durationDays * 24) / stepH));
  const cap = l.batteryKWh, floor = cap * (1 - l.maxDepthOfDischargePct / 100);
  const eff = Math.sqrt(l.roundTripEffPct / 100); // split evenly between charge and discharge
  const area = l.arrayAreaM2 * (l.cellEffPct / 100) * (1 - l.systemLossPct / 100) * l.solarConstantWm2;
  let soc = cap * (l.initialChargePct / 100), min = soc, dead = 0, op = 0, link = 0, gen = 0, used = 0, heat = 0, peak = 0, sunSum = 0, sunN = 0;
  let firstOut: number | null = null;
  for (let i = i0; i < i1; i++) {
    const h = (i - i0) * stepH;
    const sun = isUp(s.sunUp, i);
    const el = (s.sunEl[i] ?? 0) / 100, frac = sun ? Math.min(1, (s.sunFrac[i] ?? 250) / 250) : 0;
    const rad = (Math.max(0, el) * Math.PI) / 180;
    const point = l.pointing === 'horizontal' ? Math.sin(rad) : l.pointing === 'two-axis' ? 1 : Math.cos(rad);
    const dust = Math.max(0, 1 - (l.dustLossPctPerDay / 100) * (h / 24));
    const arrayW = sun && el > -1 ? area * point * frac * dust : 0;
    const earthOk = isUp(s.earthUp, i) && (s.earthEl[i] ?? -9999) / 100 >= l.minEarthElDeg;
    const loadW = (sun ? l.dayLoadW : l.nightLoadW + l.heaterW) + (earthOk ? l.commsLoadW * (l.commsDutyPct / 100) : 0);
    gen += (arrayW * stepH) / 1000;
    used += (loadW * stepH) / 1000;
    if (!sun) heat += (l.heaterW * stepH) / 1000;
    if (arrayW > peak) peak = arrayW;
    if (sun) { sunSum += arrayW; sunN++; }
    // surplus charges the battery through the charge efficiency; a shortfall draws it through the discharge efficiency
    const netW = arrayW - loadW;
    const dE = netW >= 0 ? (netW * stepH * eff) / 1000 : (netW * stepH) / eff / 1000;
    soc = Math.min(cap, soc + dE);
    const out = soc <= floor;
    if (out) { soc = floor; dead += stepH; if (firstOut === null) firstOut = h; }
    if (soc < min) min = soc;
    if (!out && sun) op += stepH;
    if (!out && earthOk) link += stepH;
  }
  return {
    survives: dead === 0, firstOutageH: firstOut, minChargePct: (min / cap) * 100, hoursWithoutPower: dead,
    generatedKWh: gen, usedKWh: used, netKWh: gen - used, peakArrayW: peak, meanArrayWSunlit: sunN ? sunSum / sunN : 0,
    operatingHours: op, linkHours: link, heaterKWh: heat, periodH: (i1 - i0) * stepH,
  };
}
