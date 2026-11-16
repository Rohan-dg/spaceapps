/**
 * Rover game rules, with no graphics in them: the power and heat model, where the mission's stops go on the real
 * terrain, and the quest's steps. Everything here is plain data in, plain data out, so it is unit-tested.
 *
 * The figures are a game's, chosen so the three lessons land inside a ten-minute session (Sun = power, Earth = signal,
 * shadow = cold). They are in real units and of a believable size for a small solar rover, but they are not RASSOR's
 * published numbers.
 */

/** The game clock runs 60 times faster than real time (one second is one minute), and 1800 times while fast-forwarding. */
export const RATE = 60, RATE_FF = 1800;

export interface Spec {
  batteryWh: number; solarW: number; idleW: number; driveW: number; lampW: number; digW: number; txW: number; heaterMaxW: number;
  vMax: number; tauH: number; envSunC: number; envDarkC: number; heaterOnC: number; heaterCPerWh: number; wasteCPerWh: number; freezeC: number;
  /** steady heat from a radioisotope heater, W (free: it never touches the battery) */
  isotopeW?: number;
}
export const SPEC: Spec = {
  batteryWh: 600,
  /** panel output with the whole Sun in view */
  solarW: 240,
  idleW: 30, driveW: 160, lampW: 20, digW: 220, txW: 70, heaterMaxW: 100,
  /** top speed on screen, m/s (at 60x that is 0.3 km/h for the robot itself) */
  vMax: 5,
  /** how fast the rover drifts toward its surroundings' temperature, hours */
  tauH: 1.5,
  envSunC: 20, envDarkC: -170,
  /** the heater starts below this and is flat out 5 C lower */
  heaterOnC: -5,
  /** warming per watt: heater, and waste heat from motors and radio (C per hour per W) */
  heaterCPerWh: 1, wasteCPerWh: 0.08,
  /** below this the electronics fail */
  freezeC: -40,
};

const DEFAULT = SPEC;
export interface Vitals { wh: number; tempC: number; heaterW: number; solarW: number; loadW: number }
export interface Loads { sunFrac: number; drive: number; dig: boolean; tx: boolean; lamp: boolean; /** Shift boost: the motors draw three times their rated power on top of normal driving */ boost?: boolean }

export const newVitals = (pct = 55, spec: Spec = SPEC): Vitals => ({ wh: (spec.batteryWh * pct) / 100, tempC: 10, heaterW: 0, solarW: 0, loadW: 0 });

/** Advance battery and temperature by dtH hours of game time. A flat battery runs nothing, heater included. */
export function stepVitals(v: Vitals, dtH: number, l: Loads, SPEC: Spec = DEFAULT): Vitals {
  if (!Number.isFinite(dtH) || dtH <= 0) return { ...v };
  // Substep long waits so the thermostat and battery cannot overshoot at high time acceleration.
  if (dtH > 1 / 120) {
    const n = Math.ceil(dtH * 120);
    let out = v;
    for (let i = 0; i < n; i++) out = stepVitals(out, dtH / n, l, SPEC);
    return out;
  }
  const alive = v.wh > 0;
  const heaterW = alive ? Math.max(0, Math.min(SPEC.heaterMaxW, (SPEC.heaterOnC - v.tempC) * (SPEC.heaterMaxW / 5))) : 0;
  const work = alive ? Math.max(0, Math.min(2, l.drive)) * SPEC.driveW + (l.dig ? SPEC.digW : 0) + (l.tx ? SPEC.txW : 0) + (l.boost ? 3 * SPEC.driveW : 0) : 0;
  const loadW = alive ? SPEC.idleW + work + (l.lamp ? SPEC.lampW : 0) + heaterW : 0;
  const sunFrac = Math.max(0, Math.min(1, l.sunFrac));
  const solarW = SPEC.solarW * sunFrac;
  const wh = Math.max(0, Math.min(SPEC.batteryWh, v.wh + (solarW - loadW) * dtH));
  const env = SPEC.envDarkC + (SPEC.envSunC - SPEC.envDarkC) * sunFrac;
  const tempC = v.tempC + ((env - v.tempC) / SPEC.tauH + (heaterW + (SPEC.isotopeW ?? 0)) * SPEC.heaterCPerWh + work * SPEC.wasteCPerWh) * dtH;
  return { wh, tempC, heaterW, solarW, loadW };
}

/* ---------- where the mission goes ---------- */

export interface Pt { e: number; n: number }
/** What the ground looks like on an n x n grid over +-halfM around the site (row 0 = north): Sun and Earth visibility 0..255, slope in degrees, height in metres. */
export interface Maps { n: number; halfM: number; sun: Uint8Array; earth: Uint8Array; slope: Float32Array; elev: Float32Array }
export interface MissionPlan { start: Pt; charge: Pt; phone: Pt; zone: { c: Pt; r: number }; ice: Pt[]; haven: Pt; bonus: Pt[] }

const dist = (a: Pt, b: Pt) => Math.hypot(a.e - b.e, a.n - b.n);
export const distance = dist;

/**
 * Place the mission on the real ground: a sunlit spot to charge at, a spot with Earth in view, a patch of shadow
 * with ice to find in it, and a high sunlit haven that can see Earth. Returns null when this place and time cannot
 * hold a mission (no reachable sunlight, or nothing in shadow), so the caller can try another time.
 */
export function planMission(m: Maps, seed = 1): MissionPlan | null {
  const { n, halfM } = m, step = (2 * halfM) / n;
  if (n < 2 || halfM <= 0 || [m.sun, m.earth, m.slope, m.elev].some((a) => a.length !== n * n)) return null;
  const at = (k: number): Pt => ({ e: -halfM + ((k % n) + 0.5) * step, n: halfM - (Math.floor(k / n) + 0.5) * step });
  const all = Array.from({ length: n * n }, (_, k) => k);
  const nearest = (to: Pt, ok: (k: number, p: Pt) => boolean) => {
    let best = -1, bd = Infinity;
    for (const k of all) { const p = at(k), d = dist(p, to); if (d < bd && ok(k, p)) { bd = d; best = k; } }
    return best < 0 ? null : at(best);
  };
  const lit = (k: number) => m.sun[k] >= 230, flat = (k: number, deg = 12) => m.slope[k] < deg;
  const O = { e: 0, n: 0 };
  const start = nearest(O, (k) => flat(k, 10));
  if (!start || dist(start, O) > 150) return null;
  // A flat destination across an impassable ridge is not a playable objective.
  const startK = all.reduce((a, b) => dist(at(a), start) < dist(at(b), start) ? a : b);
  const reachable = new Uint8Array(n * n), todo = [startK]; reachable[startK] = 1;
  while (todo.length) {
    const k = todo.pop()!, i = k % n, j = Math.floor(k / n);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = i + di, y = j + dj, a = y * n + x;
      if (x < 0 || y < 0 || x >= n || y >= n || reachable[a] || !flat(a, 23) || dist(at(a), O) > 680) continue;
      if (!Number.isFinite(m.elev[a]) || Math.abs(m.elev[a] - m.elev[k]) / step > Math.tan(23 * Math.PI / 180)) continue;
      reachable[a] = 1; todo.push(a);
    }
  }
  const driveable = (k: number, deg = 12) => !!reachable[k] && flat(k, deg);
  const charge = nearest(start, (k, p) => lit(k) && driveable(k) && dist(p, start) >= 60 && dist(p, O) < 620)
    ?? nearest(start, (k, p) => lit(k) && driveable(k) && dist(p, O) < 620);
  if (!charge) return null;
  const phone = nearest(charge, (k, p) => m.earth[k] >= 128 && driveable(k) && dist(p, O) < 650);
  if (!phone) return null;

  // patches of shadow: connected texels with no Sun at all on ground a rover can drive
  const seen = new Uint8Array(n * n);
  let zone: { cells: number[]; c: Pt } | null = null, zs = Infinity;
  for (const k0 of all) {
    if (seen[k0] || m.sun[k0] > 10 || !driveable(k0, 15)) continue;
    const cells: number[] = [], q = [k0]; seen[k0] = 1;
    while (q.length) {
      const k = q.pop()!; cells.push(k);
      const i = k % n, j = Math.floor(k / n);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj, kk = b * n + a;
        if (a < 0 || b < 0 || a >= n || b >= n || seen[kk] || m.sun[kk] > 10 || !driveable(kk, 15)) continue;
        seen[kk] = 1; q.push(kk);
      }
    }
    if (cells.length < 8) continue;
    // aim for the part of the patch nearest the charging spot, a little way in
    const inside = cells.map(at).filter((p) => dist(p, O) < 600 && dist(p, charge) > 90);
    if (inside.length < 6) continue;
    const edge = inside.reduce((a, b) => (dist(a, charge) < dist(b, charge) ? a : b));
    const near = inside.filter((p) => dist(p, edge) < 110);
    const c = { e: near.reduce((s, p) => s + p.e, 0) / near.length, n: near.reduce((s, p) => s + p.n, 0) / near.length };
    const score = dist(c, charge);
    if (near.length >= 5 && score < zs) { zs = score; zone = { cells, c }; }
  }
  if (!zone) return null;
  // ice: three shadowed spots near the zone centre, spread apart, picked in a repeatable shuffled order
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const cand = zone.cells.filter((k) => driveable(k)).map(at).filter((p) => dist(p, zone!.c) < 95).map((p) => ({ p, r: rnd() })).sort((a, b) => a.r - b.r);
  const ice: Pt[] = [];
  for (const { p } of cand) { if (ice.every((q) => dist(p, q) >= 28)) ice.push(p); if (ice.length === 3) break; }
  if (ice.length < 2) return null;
  const r = Math.max(35, Math.min(95, Math.max(...ice.map((p) => dist(p, zone!.c))) + 18));
  // haven: the highest sunlit ground that can also see Earth
  let haven: Pt | null = null, hh = -Infinity;
  for (const k of all) {
    const p = at(k);
    if (lit(k) && m.earth[k] >= 128 && driveable(k, 10) && dist(p, O) < 660 && dist(p, zone.c) > 100 && m.elev[k] > hh) { hh = m.elev[k]; haven = p; }
  }
  if (!haven) return null;
  // bonus science targets: interesting spots spread over the drivable ground, scanned by driving over them
  const bonus: Pt[] = [];
  const spots = all.filter((k) => driveable(k, 15)).map((k) => ({ p: at(k), r: rnd() })).filter(({ p }) => dist(p, O) > 50 && dist(p, O) < 560).sort((a, b) => a.r - b.r);
  for (const { p } of spots) { if ([start, charge, phone, haven, ...ice, ...bonus].every((q) => dist(p, q) >= 70)) bonus.push(p); if (bonus.length === 8) break; }
  return { start, charge, phone, zone: { c: zone.c, r }, ice, haven, bonus };
}

/* ---------- the quest ---------- */

export type Phase = 'charge' | 'phone' | 'ice' | 'targets' | 'uplink' | 'haven' | 'done';
/** The Ice Survey's steps, the original mission, in order. */
export const PHASES: Phase[] = ['charge', 'phone', 'ice', 'uplink', 'haven', 'done'];
/** `steps` is the mission's own order (the Ice Survey when absent); `done` follows the last step. */
export interface Quest { phase: Phase; found: boolean[]; steps?: Phase[] }
const SURVEY: Phase[] = PHASES.slice(0, -1);
export const stepsOf = (q: Quest): Phase[] => q.steps ?? SURVEY;
export const newQuest = (plan: MissionPlan, steps: Phase[] = SURVEY): Quest => ({ phase: steps[0], found: plan.ice.map(() => false), ...(steps === SURVEY ? {} : { steps }) });
const after = (q: Quest, p: Phase): Phase => { const s = stepsOf(q), i = s.indexOf(p); return i >= 0 && i < s.length - 1 ? s[i + 1] : 'done'; };

/* ---------- missions: the same ground and rules, different goals ---------- */
export type MissionId = 'first' | 'survey' | 'hunt' | 'dive' | 'sprint';
export interface MissionDef {
  id: MissionId; title: string; level: 'Easy' | 'Medium' | 'Hard'; minutes: number; kid: string; brief: string; win: string;
  steps: Phase[]; startPct: number;
  /** the first step only asks to reach the light, not to charge (a race) */
  noCharge?: boolean;
  /** speed bonus: `speedPts` minus `perS` for every second played; stars at these totals */
  speedPts: number; perS: number; stars: [number, number];
}
export const MISSIONS: MissionDef[] = [
  { id: 'first', title: 'First Drive', level: 'Easy', minutes: 3, steps: ['charge', 'phone'], startPct: 55, speedPts: 1200, perS: 4, stars: [1600, 2300],
    kid: 'Learn to drive! Find a sunny spot to charge up, then call home to Earth.',
    brief: 'Welcome to the Moon. Drive to the sunlit ground to charge your battery, then find a place where Earth is in view and call home.',
    win: 'You charged on sunlight and talked to Earth: the two things every Moon mission needs.' },
  { id: 'survey', title: 'Ice Survey', level: 'Medium', minutes: 10, steps: SURVEY, startPct: 55, speedPts: 2000, perS: 2.2, stars: [4600, 6200],
    kid: 'The full mission: charge up, call Earth, dig for ice in the dark, send the data and park somewhere safe.',
    brief: 'RASSOR, your survey begins here. Reach the charging point, report to Earth, then investigate the shadowed ground. You have enough power to get moving.',
    win: 'You found the ice, delivered the data and parked with sunlight and Earth in view. Those same constraints shape real lunar landing decisions.' },
  { id: 'hunt', title: 'Science Hunt', level: 'Medium', minutes: 8, steps: ['targets', 'uplink'], startPct: 90, speedPts: 2500, perS: 3, stars: [3800, 5600],
    kid: 'Race around to scan every science target. Scan them close together for a big combo!',
    brief: 'Eight interesting spots are marked in red. Drive over each one to scan it, then send the results home from somewhere Earth is in view.',
    win: 'Every target scanned and the results sent home. Geologists plan real rover drives exactly like this, stop by stop.' },
  { id: 'dive', title: 'Shadow Dive', level: 'Hard', minutes: 6, steps: ['ice', 'haven'], startPct: 95, speedPts: 2000, perS: 3, stars: [2200, 3200],
    kid: 'Dive into the freezing dark to dig up ice, then race back to the sunshine before your rover freezes!',
    brief: 'Full battery, no time to waste. Dig the ice deposits in the shadow, then get to the high ground in sunlight before the cold wins.',
    win: 'In and out of the dark before the cold won. Permanently shadowed craters are the coldest places in the Solar System.' },
  { id: 'sprint', title: 'Sun Sprint', level: 'Easy', minutes: 3, steps: ['charge', 'haven'], startPct: 70, noCharge: true, speedPts: 4000, perS: 18, stars: [3200, 4300],
    kid: 'A race! Zoom to the sunny spot, then to the safe high ground. The faster you go, the more points.',
    brief: 'Time trial: touch the sunlit ground, then park on the high ground with sunlight and Earth in view. Every second counts.',
    win: 'Finished! Rovers drive slowly in real life, but every hour of sunlight matters just as much.' },
];
export const missionById = (id: string) => MISSIONS.find((m) => m.id === id) ?? MISSIONS[1];

export const CHARGE_PCT = 85, REACH_M = 14, DIG_M = 6;

export interface Objective { n: number; total: number; title: string; text: string; target: Pt | null; ring: number }
/** `chargePct` 0 means the rover has no solar panels: the first step is just to reach the light. */
export function objective(q: Quest, plan: MissionPlan, earthUp: boolean, chargePct = CHARGE_PCT, targetsLeft = 0, nextTarget: Pt | null = null): Objective {
  const left = q.found.filter((f) => !f).length, steps = stepsOf(q), total = steps.length, n = q.phase === 'done' ? total : steps.indexOf(q.phase) + 1;
  const what = steps.includes('ice') ? 'ice data' : 'science results';
  switch (q.phase) {
    case 'charge': return { n, total, title: 'First light', text: chargePct > 0 ? `Drive to the sunlit ground and charge the battery to ${chargePct}%.` : 'Drive to the sunlit ground and stop there.', target: plan.charge, ring: REACH_M };
    case 'phone': return { n, total, title: 'Phone home', text: earthUp ? 'Earth is in view. Press T to send your status report.' : 'No signal here. Drive to where Earth clears the hills, then press T.', target: earthUp ? null : plan.phone, ring: REACH_M };
    case 'ice': return { n, total, title: 'Into the dark', text: `Find ${left} ice deposit${left === 1 ? '' : 's'} in the shadow. Follow the ice detector, stop when it peaks, press E to dig.`, target: plan.zone.c, ring: plan.zone.r };
    case 'targets': return { n, total, title: 'Science hunt', text: `Scan ${targetsLeft} more science target${targetsLeft === 1 ? '' : 's'}: follow the marker to the next red target and drive over it.`, target: nextTarget, ring: 9 };
    case 'uplink': return { n, total, title: 'Bring it home', text: earthUp ? `Earth is in view. Press T to send the ${what}.` : `The ${what} are on board. Get to where Earth is in view and press T.`, target: earthUp ? null : plan.phone, ring: REACH_M };
    case 'haven': return { n, total, title: 'Safe haven', text: 'Park on the high ground that keeps both sunlight and Earth in view.', target: plan.haven, ring: REACH_M };
    default: return { n, total, title: 'Mission complete', text: 'Explore freely.', target: null, ring: 0 };
  }
}

export type QuestEvent = { type: 'tick' } | { type: 'sent' } | { type: 'dug' };
export interface QuestCtx { pos: Pt; battPct: number; earthUp: boolean; sunFrac: number; parked: boolean; chargePct?: number; targetsLeft?: number }
/** One step of the quest. Returns the new state, and what just happened (for messages and checkpoints). */
export function advance(q: Quest, plan: MissionPlan, c: QuestCtx, ev: QuestEvent): { q: Quest; done: Phase | null; iceFound: number | null; dry: boolean } {
  const next = (p: Phase) => ({ q: { ...q, phase: after(q, p) }, done: p, iceFound: null, dry: false });
  const same = { q, done: null, iceFound: null, dry: false };
  if (ev.type === 'dug') {
    if (q.phase !== 'ice' || !c.parked || c.battPct <= 0) return same;
    const i = plan.ice.findIndex((p, k) => !q.found[k] && dist(p, c.pos) <= DIG_M);
    if (i < 0) return { ...same, dry: true };
    const found = q.found.map((f, k) => f || k === i), all = found.every(Boolean);
    return { q: { ...q, phase: all ? after(q, 'ice') : q.phase, found }, done: all ? 'ice' : null, iceFound: i, dry: false };
  }
  if (ev.type === 'sent') return c.earthUp && c.parked && c.battPct > 0 && (q.phase === 'phone' || q.phase === 'uplink') ? next(q.phase) : same;
  if (q.phase === 'charge' && c.parked && c.sunFrac > 0.5 && c.battPct >= (c.chargePct ?? CHARGE_PCT) && dist(c.pos, plan.charge) <= REACH_M * 1.5) return next('charge');
  if (q.phase === 'targets' && (c.targetsLeft ?? 1) === 0) return next('targets');
  if (q.phase === 'haven' && c.parked && c.earthUp && c.sunFrac > 0.5 && dist(c.pos, plan.haven) <= REACH_M) return next('haven');
  return same;
}

/** Ice detector reading 0..1 at a position: strongest right over an undug deposit, fading over a few tens of metres. */
export function iceSignal(q: Quest, plan: MissionPlan, pos: Pt, rangeM = 30): number {
  let s = 0;
  plan.ice.forEach((p, k) => { if (!q.found[k]) s = Math.max(s, Math.exp(-((dist(p, pos) / rangeM) ** 2))); });
  return s;
}

/** What mission control says. Shown as radio messages; ones marked `link` wait until Earth is in view. */
export const STORY: Record<'intro' | Phase | 'ice1' | 'iceOut' | 'dry' | 'lowBatt' | 'cold' | 'noSignal' | 'signalBack' | 'noSun', { from: string; text: string; link?: boolean }> = {
  intro: { from: 'Stored mission brief', text: 'RASSOR, your survey begins here. Reach the charging point, report to Earth, then investigate the shadowed ground. You have enough power to get moving.' },
  charge: { from: 'RASSOR', text: 'Battery charged. Solar panels are only useful where the Sun clears the terrain.' },
  phone: { from: 'Mission control', text: 'We hear you loud and clear. Orbiters saw hydrogen in the shadow near you. That could be water ice. Go and look. Watch your battery: there is no sunlight in there.', link: true },
  ice: { from: 'RASSOR', text: 'All deposits sampled. The data is stored on board. It is worth nothing until Earth has it.' },
  ice1: { from: 'RASSOR', text: 'Ice in the regolith. Sample logged.' },
  iceOut: { from: 'RASSOR', text: 'All deposits sampled. Now get out of the dark before the cold wins!' },
  targets: { from: 'RASSOR', text: 'Every science target scanned. Now send the results to Earth.' },
  uplink: { from: 'Mission control', text: 'Data received. Water ice confirmed. Future crews could drink it, breathe it and make rocket fuel from it. One job left: park somewhere you can survive.', link: true },
  haven: { from: 'Mission control', text: 'Parked in the light with Earth overhead. That is how you pick a landing site. Outstanding work, RASSOR.', link: true },
  done: { from: 'Mission control', text: 'The ground is yours. Explore as long as you like.', link: true },
  dry: { from: 'RASSOR', text: 'Dry regolith. Follow the ice detector until it peaks before digging.' },
  lowBatt: { from: 'RASSOR', text: 'Battery under 20%. Find sunlight.' },
  cold: { from: 'RASSOR', text: 'Heaters at full power. It is too cold to stay here for long.' },
  noSignal: { from: 'RASSOR', text: 'No signal. Earth is behind the terrain, so messages wait until it is back in view.' },
  signalBack: { from: 'RASSOR', text: 'Signal back. Earth is in view.' },
  noSun: { from: 'RASSOR', text: 'No power received. The Sun is behind the terrain, so the rover runs on battery alone.' },
};

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 3 commits), Claude Fable 5.2 (Anthropic, 1 commit) and OpenAI Codex (OpenAI, 1 commit), under the team's direction. Attribution from the commit history.
