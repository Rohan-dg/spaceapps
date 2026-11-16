/** Green/amber/red verdicts with a plain-language reason. Thresholds: src/config/thresholds.ts */
import { THRESHOLDS, type Level } from '../config/thresholds';
import { skyAt } from './ephemeris';
import type { Site } from './geometry';
import { horizonAt, type HorizonProfile } from './horizon';
import { compass, type Metrics } from './metrics';
import { type Series, indexAt } from './series';

export interface Verdict { level: Level; reason: string }

const fmtD = (h: number) => (h >= 48 ? `${(h / 24).toFixed(h >= 240 ? 0 : 1)} days` : `${Math.round(h)} hours`);

function level(pct: number, maxGapH: number, c: { greenPct: number; amberPct: number }, gG: number, aG: number): Level {
  if (pct >= c.greenPct && maxGapH <= gG) return 'green';
  if (pct >= c.amberPct || maxGapH <= aG) return 'amber';
  return 'red';
}

/** Describe why a body is blocked during a gap: below the horizon entirely, or behind terrain. */
function blockerPhrase(site: Site, hz: HorizonProfile, s: Series, startT: number, hours: number, body: 'sun' | 'earth') {
  const els = body === 'sun' ? s.sunEl : s.earthEl;
  const g0 = Math.max(0, Math.floor(indexAt(s, startT)));
  const g1 = Math.min(s.n, g0 + Math.round((hours * 3600_000) / s.stepMs));
  // Ignore the first/last 15% of the gap: at its edges the body is, by definition, right at the skyline.
  const trim = Math.floor((g1 - g0) * 0.15);
  const i0 = g0 + trim, i1 = Math.max(i0 + 1, g1 - trim);
  let best = -1e9, bi = i0;
  for (let i = i0; i < i1; i++) if (els[i] > best) { best = els[i]; bi = i; }
  const maxEl = best / 100;
  const k = skyAt(site, new Date(s.t0 + bi * s.stepMs))[body];
  const h = horizonAt(hz, k.az);
  const name = body === 'sun' ? 'Sun' : 'Earth';
  if (maxEl < -3) return `${name} stays well below the horizon (at most ${maxEl.toFixed(1)}°)`;
  if (maxEl <= h) return `${name} never clears the skyline (at most ${maxEl.toFixed(1)}° vs ${h.toFixed(1)}° terrain to the ${compass(k.az)})`;
  return `${name} never clears the ${h.toFixed(1)}° terrain to the ${compass(k.az)}`;
}

export function powerVerdict(m: Metrics, site: Site, hz: HorizonProfile, s: Series): Verdict {
  const T = THRESHOLDS.power;
  const lv = level(m.sunPct, m.longestDarkH, T, T.greenMaxDarkH, T.amberMaxDarkH);
  if (m.sunPct === 0) {
    const maxHz = Math.max(...hz);
    return { level: 'red', reason: `No direct sunlight in this lunar cycle. Terrain rises to ${maxHz.toFixed(0)}° around the site (permanent shadow).` };
  }
  if (m.longestDarkH === 0) return { level: lv, reason: `Sunlit for the entire lunar cycle (${m.sunPct.toFixed(0)}%).` };
  const why = blockerPhrase(site, hz, s, m.longestDarkStart, m.longestDarkH, 'sun');
  const clip = m.longestDarkClipped ? ' (at least)' : '';
  return { level: lv, reason: `${m.sunPct.toFixed(0)}% sunlit. Longest dark spell is ${fmtD(m.longestDarkH)}${clip}: ${why}.` };
}

export function commsVerdict(m: Metrics, site: Site, hz: HorizonProfile, s: Series): Verdict {
  const T = THRESHOLDS.comms;
  const lv = level(m.earthPct, m.longestNoCommH, T, T.greenMaxGapH, T.amberMaxGapH);
  if (m.earthPct === 0) {
    const reason = m.sky.earth.el < -20
      ? 'Earth never rises. This is the far side, so it needs a relay satellite.'
      : 'Earth never clears the terrain in this lunar cycle.';
    return { level: 'red', reason };
  }
  if (m.longestNoCommH === 0) return { level: lv, reason: `Earth in view for the entire cycle (${m.earthPct.toFixed(0)}%). Direct-to-Earth link is always possible.` };
  const why = blockerPhrase(site, hz, s, m.longestNoCommStart, m.longestNoCommH, 'earth');
  const clip = m.longestNoCommClipped ? ' (at least)' : '';
  return { level: lv, reason: `Earth visible ${m.earthPct.toFixed(0)}% of the time. Longest blackout is ${fmtD(m.longestNoCommH)}${clip}: ${why}.` };
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 2 commits), under the team's direction. Attribution from the commit history.
