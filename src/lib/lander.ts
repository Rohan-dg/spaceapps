/**
 * "Your lander": a simple energy model the user feeds with their own numbers. Over the next lunar day from time t,
 * the battery charges while the site is sunlit (array output minus daytime load) and drains at the night load
 * while it is dark. It reports whether the lander survives, its lowest charge, how long it is without power, and
 * how many hours it can both run and talk to Earth. Real arrays also depend on Sun elevation, panel tilt and
 * temperature; this model treats any sunlit hour as full output, which the panel says plainly.
 */
import { SYNODIC_DAYS, isUp, indexAt, type Series } from './series';

export interface Lander { arrayW: number; batteryKWh: number; dayLoadW: number; nightLoadW: number }
export const DEFAULT_LANDER: Lander = { arrayW: 450, batteryKWh: 30, dayLoadW: 250, nightLoadW: 150 };

export interface LanderResult {
  survives: boolean;
  minChargePct: number;
  hoursWithoutPower: number;
  operatingHours: number; // sunlit, so running on the array
  linkHours: number; // Earth in view while powered
  netKWh: number; // energy in minus energy out over the period
  periodH: number;
}

export function validateLander(l: Lander): string | null {
  if (!(l.arrayW >= 0 && l.arrayW <= 100000)) return 'Array power must be 0 to 100 000 W.';
  if (!(l.batteryKWh > 0 && l.batteryKWh <= 10000)) return 'Battery must be more than 0 and at most 10 000 kWh.';
  if (!(l.dayLoadW >= 0 && l.dayLoadW <= 100000)) return 'Daytime load must be 0 to 100 000 W.';
  if (!(l.nightLoadW >= 0 && l.nightLoadW <= 100000)) return 'Night load must be 0 to 100 000 W.';
  return null;
}

export function simulateLander(s: Series, t: number, l: Lander, days = SYNODIC_DAYS): LanderResult {
  const stepH = s.stepMs / 3600000;
  const i0 = Math.max(0, Math.floor(indexAt(s, t)));
  const i1 = Math.min(s.n, i0 + Math.round((days * 24) / stepH));
  const cap = l.batteryKWh;
  let soc = cap, min = cap, dead = 0, op = 0, link = 0, net = 0;
  for (let i = i0; i < i1; i++) {
    const sun = isUp(s.sunUp, i), earth = isUp(s.earthUp, i);
    const dW = sun ? l.arrayW - l.dayLoadW : -l.nightLoadW;
    net += (dW * stepH) / 1000;
    soc = Math.max(0, Math.min(cap, soc + (dW * stepH) / 1000));
    if (soc < min) min = soc;
    const powered = sun ? l.arrayW >= l.dayLoadW || soc > 0 : soc > 0;
    if (!powered) dead += stepH;
    if (sun && powered) op += stepH;
    if (earth && powered) link += stepH;
  }
  return { survives: dead === 0, minChargePct: (min / cap) * 100, hoursWithoutPower: dead, operatingHours: op, linkHours: link, netKWh: net, periodH: (i1 - i0) * stepH };
}
