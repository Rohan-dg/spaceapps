/**
 * Sol's reasoning layer: answers questions that need real numbers by computing them from the app's own data,
 * on the device, before the topic retriever (assistant.ts) is consulted.
 *
 * It understands a site named in the question (or the one in view, or the last one discussed), a date or relative
 * time ("on 3 March 2028", "next week", "in 5 days"), and an intent: state now, next sunrise / sunset / Earthrise /
 * Earthset, longest night, a comparison of two sites, a ranking across sites, the best landing day in a period,
 * the distance between sites, or a list of sites by program or region. Every figure comes from the same
 * precomputed series and verdicts the rest of the app shows, so Sol and the panels always agree.
 */
import type { SiteData, SiteInfo } from './data';
import { formatDuration, type Event } from './metrics';
import { scenarioFor, type ScenarioResult } from './useScenario';
import type { Action, SiteRef } from './assistant';

export interface AnalystApi {
  sites: SiteInfo[];
  /** the app's current time and the data range */
  t: number; range: [number, number];
  /** the site in view, if any */
  currentId: string | null;
  load: (id: string) => Promise<SiteData>;
}
export interface Finding { text: string; actions: Action[]; site?: SiteRef | null; follow?: string[] }

const DAY = 86400_000, H = 3600_000;
const utc = (t: number) => `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const day = (t: number) => new Date(t).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
const pct = (x: number) => `${Math.round(x)}%`;
const WORD = { green: 'good', amber: 'marginal', red: 'poor' } as const;
const isAttempt = (s: SiteInfo) => s.status === 'crashed' || s.status === 'impact';
const label = (s: SiteInfo) => s.short || s.name;
const ref = (s: SiteInfo): SiteRef => ({ id: s.id, name: s.name, short: s.short });

/* ---------------- understanding the question ---------------- */

const norm = (s: string) => ` ${s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
/** Every catalogue site named in the question, in the order they appear (longest name wins on overlaps). */
export function sitesIn(q: string, sites: SiteInfo[]): SiteInfo[] {
  const nq = norm(q), hits: { s: SiteInfo; at: number; len: number }[] = [];
  for (const s of sites) {
    let best: { at: number; len: number } | null = null;
    for (const cand of [s.short, s.name, s.id.replace(/-/g, ' '), s.mission?.split(/[,(]/)[0] ?? '']) {
      const c = norm(cand).trim();
      if (c.length < 3) continue;
      const at = nq.indexOf(` ${c} `);
      if (at >= 0 && (!best || c.length > best.len)) best = { at, len: c.length };
    }
    if (best) hits.push({ s, ...best });
  }
  // drop a hit that sits inside a longer one ("Apollo 1" inside "Apollo 11", "Shackleton rim" inside "Shackleton rim")
  const kept = hits.filter((h) => !hits.some((o) => o !== h && o.len > h.len && h.at >= o.at && h.at + h.len <= o.at + o.len));
  const seen = new Set<string>();
  return kept.sort((a, b) => a.at - b.at).map((h) => h.s).filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON = (w: string) => MONTHS.findIndex((m) => m.startsWith(w.slice(0, 3)));
export interface When { t: number; span?: [number, number]; words: string }
/** A date or relative time in the question; `span` is set when it names a whole month or year. */
export function parseWhen(q: string, now: number): When | null {
  const s = q.toLowerCase();
  let m = s.match(/\b(20\d\d)-(\d\d)-(\d\d)(?:[ t](\d\d):(\d\d))?/);
  if (m) { const t = Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0); return { t, words: `on ${m[4] ? utc(t) : day(t)}` }; }
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*),?\s+(20\d\d)\b/)
    ?? s.match(/\b(jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)\b/);
  if (m) {
    const [d, mo] = /^\d/.test(m[1]) ? [+m[1], MON(m[2])] : [+m[2], MON(m[1])];
    const t = Date.UTC(+m[3], mo, d); return { t, words: `on ${day(t)}` };
  }
  m = s.match(/\b(jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)\s+(20\d\d)\b/);
  if (m) { const a = Date.UTC(+m[2], MON(m[1]), 1), b = Date.UTC(+m[2], MON(m[1]) + 1, 1); return { t: a, span: [a, b], words: `in ${MONTHS[MON(m[1])][0].toUpperCase()}${MONTHS[MON(m[1])].slice(1)} ${m[2]}` }; }
  m = s.match(/\bin\s+(20\d\d)\b/);
  if (m) { const a = Date.UTC(+m[1], 0, 1), b = Date.UTC(+m[1] + 1, 0, 1); return { t: a, span: [a, b], words: `in ${m[1]}` }; }
  m = s.match(/\bin\s+(\d+|a|an|one|two|three|four|five|six|seven|ten)\s+(hour|day|week|month)s?\b/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10 } as Record<string, number>)[m[1]];
    const unit = { hour: H, day: DAY, week: 7 * DAY, month: 29.53 * DAY }[m[2] as 'hour'];
    return { t: now + n * unit, words: `in ${n} ${m[2]}${n === 1 ? '' : 's'} (${utc(now + n * unit)})` };
  }
  if (/\btomorrow\b/.test(s)) return { t: now + DAY, words: `tomorrow (${utc(now + DAY)})` };
  if (/\bnext week\b/.test(s)) return { t: now + 7 * DAY, words: `a week from now (${utc(now + 7 * DAY)})` };
  if (/\bnext month\b/.test(s)) return { t: now + 29.53 * DAY, span: [now, now + 29.53 * DAY], words: 'over the next month' };
  return null;
}

/* ---------------- the answers ---------------- */

const when = (e: Event, now: number) => (e.t === null ? (e.beyondRange ? 'not before the data ends (end of 2029)' : 'never in the data') : `in ${formatDuration(e.t - now)} (${utc(e.t)})`);
function stateLine(s: SiteInfo, r: ScenarioResult, t: number) {
  const m = r.metrics, clear = m.sky.sun.el - m.sunHorizon;
  return `${label(s)} at ${utc(t)}: ${m.sunUp ? 'in sunlight' : 'in shadow'} (Sun ${m.sky.sun.el.toFixed(2)}° high, ${Math.abs(clear).toFixed(2)}° ${clear >= 0 ? 'above' : 'below'} the skyline toward it), and Earth is ${m.earthUp ? 'in view' : 'hidden'} (${m.sky.earth.el.toFixed(2)}°). `
    + `The Sun ${m.sunUp ? 'sets' : 'rises'} ${when(m.sunUp ? m.nextSunset : m.nextSunrise, t)}; Earth ${m.earthUp ? 'sets' : 'rises'} ${when(m.earthUp ? m.nextEarthset : m.nextEarthrise, t)}.`;
}
const ratingLine = (s: SiteInfo, r: ScenarioResult) => {
  const m = r.metrics;
  return `Over the next lunar day ${label(s)} rates ${WORD[r.power.level]} for power (sunlit ${pct(m.sunPct)}, longest dark spell ${m.longestDarkH > 0 ? formatDuration(m.longestDarkH * H) : 'none'}) and ${WORD[r.comms.level]} for radio (Earth in view ${pct(m.earthPct)}${m.longestNoCommH > 0 ? `, longest gap ${formatDuration(m.longestNoCommH * H)}` : ''}).`;
};
const score = (r: ScenarioResult) => r.metrics.sunPct * 0.55 + r.metrics.earthPct * 0.45;
const R_MOON = 1737.4;
const SUNNY = /(sun|light|power|solar|bright)/;
function gcKm(a: SiteInfo, b: SiteInfo) {
  const r = Math.PI / 180, p1 = a.lat * r, p2 = b.lat * r, dl = (b.lon - a.lon) * r;
  return R_MOON * Math.acos(Math.min(1, Math.max(-1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl))));
}

const PROGRAMS: [RegExp, (s: SiteInfo) => boolean, string][] = [
  [/\bclps|commercial\b/, (s) => s.program === 'clps', 'NASA CLPS (commercial) missions'],
  [/\bartemis\b/, (s) => !!s.program?.startsWith('artemis'), 'Artemis III candidate regions'],
  [/\bapollo\b/, (s) => s.program === 'apollo', 'Apollo landing sites'],
  [/\bfar side\b/, (s) => { const l = ((s.lon % 360) + 360) % 360; return l > 90 && l < 270; }, 'far-side sites'],
  [/\bsouth pole|polar\b/, (s) => s.lat < -80, 'south-polar sites'],
  [/\bchin|chang ?e\b/, (s) => /chang.?e/i.test(s.name), 'Chinese Chang\'e sites'],
  [/\bindia|chandrayaan\b/, (s) => /chandrayaan/i.test(s.name), 'Indian Chandrayaan sites'],
  [/\bsoviet|luna\b/, (s) => /^luna \d/i.test(s.name), 'Soviet Luna sites'],
  [/\bplanned|future|upcoming\b/, (s) => s.status === 'planned' || s.status === 'target', 'planned missions'],
  [/\bcrash|impact|failed\b/, isAttempt, 'crashes and impacts'],
];

export async function analyse(q: string, api: AnalystApi, lastId: string | null): Promise<Finding | null> {
  const s = q.toLowerCase();
  const named = sitesIn(q, api.sites);
  const whenQ = parseWhen(q, api.t);
  const clampT = (t: number) => Math.max(api.range[0], Math.min(api.range[1], t));
  const t = whenQ ? clampT(whenQ.t) : api.t;
  const outOfRange = whenQ && whenQ.t !== t ? ` That date is outside the data (${new Date(api.range[0]).getUTCFullYear()} to ${new Date(api.range[1]).getUTCFullYear()}), so I used ${utc(t)}.` : '';
  const fallback = api.sites.find((x) => x.id === (lastId ?? api.currentId)) ?? null;
  const focus = named[0] ?? (/\b(it|this|here|there|that site|the site)\b/.test(s) || !named.length ? fallback : null);
  const goTime: Action[] = whenQ ? [{ type: 'time', t, label: `Go to ${day(t)}` }] : [];

  // ---- lists: "which sites are CLPS", "list far side sites", "how many sites"
  if (/\b(list|which|what|show)\b.*\bsites?\b|\bhow many (sites|missions)\b/.test(s) && !/\b(best|most|least|sunniest|better|worst)\b/.test(s)) {
    const p = PROGRAMS.find(([re]) => re.test(s));
    if (p || /how many/.test(s)) {
      const list = p ? api.sites.filter(p[1]) : api.sites;
      const names = list.slice(0, 14).map(label).join(', ');
      return { text: `${list.length} ${p ? p[2] : 'sites and missions in the catalogue'}: ${names}${list.length > 14 ? `, and ${list.length - 14} more` : ''}.`, actions: list[0] ? [{ type: 'site', id: list[0].id, label: `Open ${label(list[0])}` }, { type: 'missions', label: 'Open the Missions sidebar' }] : [], follow: ['Which site has the most sunlight?', 'Compare Malapert and de Gerlache rim'] };
    }
  }

  // ---- distance between two sites
  if (named.length >= 2 && /\b(how far|distance|km apart|apart)\b/.test(s)) {
    const [a, b] = named;
    return { text: `${label(a)} and ${label(b)} are ${gcKm(a, b).toFixed(gcKm(a, b) < 10 ? 1 : 0)} km apart along the surface (great circle on a 1,737.4 km Moon).`, actions: [], site: ref(a) };
  }

  // ---- comparison of two named sites
  if (named.length >= 2 && /\b(vs|versus|compare|comparison|better|or|between|against|difference)\b/.test(s)) {
    const [a, b] = named;
    const [da, db] = await Promise.all([api.load(a.id), api.load(b.id)]);
    const ra = scenarioFor(da, t), rb = scenarioFor(db, t);
    const by = /\b(earth|radio|comms?|talk|contact|signal)/.test(s) ? 'earth' : SUNNY.test(s) ? 'sun' : 'both';
    const val = (r: ScenarioResult) => (by === 'earth' ? r.metrics.earthPct : by === 'sun' ? r.metrics.sunPct : score(r));
    const w = val(ra) >= val(rb) ? a : b, rw = w === a ? ra : rb, rl = w === a ? rb : ra;
    const tie = Math.abs(val(ra) - val(rb)) < 1;
    const why = by === 'earth' ? 'for staying in touch with Earth' : by === 'sun' ? 'for sunlight' : 'with power and radio weighed together';
    return {
      text: `${whenQ ? `${whenQ.words[0].toUpperCase()}${whenQ.words.slice(1)}, ` : `For the lunar day from ${utc(t)}, `}${tie ? `${label(a)} and ${label(b)} are about even ${why}` : `${label(w)} comes out ahead ${why}`}: sunlit ${pct(rw.metrics.sunPct)} vs ${pct(rl.metrics.sunPct)}, Earth in view ${pct(rw.metrics.earthPct)} vs ${pct(rl.metrics.earthPct)}. `
        + `${ratingLine(a, ra)} ${ratingLine(b, rb)}${outOfRange}`,
      actions: [{ type: 'pair', a: a.id, b: b.id, label: `Compare ${label(a)} and ${label(b)}` }, ...goTime], site: ref(w),
      follow: [`Best day to land at ${label(w)}`, `How far is ${label(a)} from ${label(b)}?`],
    };
  }

  // ---- ranking across sites: "which site has the most sunlight", "best site for radio"
  if (/\b(best|most|sunniest|brightest|least|worst|top|rank|highest|longest|shortest)\b/.test(s) && /\b(site|sites|place|where|landing)\b/.test(s) && !named.length) {
    const metric: 'sun' | 'earth' | 'both' | 'dark' = /\b(earth|radio|comms?|talk|contact|signal)/.test(s) ? (SUNNY.test(s) ? 'both' : 'earth') : /\b(night|dark)/.test(s) ? 'dark' : SUNNY.test(s) ? 'sun' : 'both';
    const pool = api.sites.filter((x) => !isAttempt(x) && !x.id.startsWith('custom') && !x.id.startsWith('pending'));
    const datas = await Promise.all(pool.map((x) => api.load(x.id).then((d) => d, () => null)));
    const rows = pool.map((x, i) => ({ x, r: datas[i] ? scenarioFor(datas[i]!, Math.floor(t / (6 * H)) * 6 * H) : null })).filter((v) => v.r) as { x: SiteInfo; r: ScenarioResult }[];
    const val = (r: ScenarioResult) => metric === 'sun' ? r.metrics.sunPct : metric === 'earth' ? r.metrics.earthPct : metric === 'dark' ? -r.metrics.longestDarkH : score(r);
    const worst = /\b(least|worst|lowest)\b/.test(s);
    rows.sort((p, q2) => (worst ? val(p.r) - val(q2.r) : val(q2.r) - val(p.r)));
    const top = rows.slice(0, 5);
    const what = metric === 'sun' ? 'sunlight' : metric === 'earth' ? 'Earth in view' : metric === 'dark' ? 'shortest longest night' : 'sunlight and Earth contact together';
    return {
      text: `${worst ? 'Weakest' : 'Best'} for ${what} over the lunar day from ${utc(t)} (${rows.length} sites checked): `
        + top.map((v, i) => `${i + 1}. ${label(v.x)}: ${pct(v.r.metrics.sunPct)} sunlit, ${pct(v.r.metrics.earthPct)} Earth in view${metric === 'dark' ? `, longest night ${v.r.metrics.longestDarkH > 0 ? formatDuration(v.r.metrics.longestDarkH * H) : 'none'}` : ''}`).join('; ') + `.${outOfRange}`,
      actions: top[0] ? [{ type: 'site', id: top[0].x.id, label: `Open ${label(top[0].x)}` }, ...(top[1] ? [{ type: 'pair', a: top[0].x.id, b: top[1].x.id, label: `Compare the top two` } as Action] : []), ...goTime] : [],
      site: top[0] ? ref(top[0].x) : null, follow: top[0] ? [`Best day to land at ${label(top[0].x)}`, 'Which site is best for talking to Earth?'] : [],
    };
  }

  if (!focus) return null;
  // "what does the power rating mean", "how do I compare": explanations belong to the topic model unless a site or date is named
  if (!named.length && !whenQ && /^(what (is|are|does|do)|what s|how (does|do|is|are)|why|explain|define|tell me about)\b/.test(s.trim()) && !/\b(now|right now|currently|today|here)\b/.test(s)) return null;

  // ---- best landing day at a site within a period
  if (/\b(best|good|ideal|optimal)\b.*\b(day|date|time|window)\b|\bwhen (should|could|can|to) (we |i )?land\b/.test(s)) {
    const d = await api.load(focus.id);
    const [a0, b0] = whenQ?.span ?? [t, t + 60 * DAY];
    const a = clampT(a0), b = clampT(b0);
    const lv = { green: 2, amber: 1, red: 0 } as const;
    const value = (r: ScenarioResult) => lv[r.power.level] + lv[r.comms.level] + score(r) / 100;
    let best: { t: number; r: ScenarioResult; v: number } | null = null;
    for (let x = Math.ceil(a / (12 * H)) * 12 * H; x <= b; x += 12 * H) {
      const r = scenarioFor(d, x), v = value(r);
      if (!best || v > best.v) best = { t: x, r, v };
    }
    if (!best) return null;
    return {
      text: `The best landing time at ${label(focus)} ${whenQ?.span ? whenQ.words : `in the 60 days from ${day(a)}`} is ${utc(best.t)}: ${best.r.metrics.sunUp ? 'sunlit' : 'dark'} on arrival, and over the following lunar day power is ${WORD[best.r.power.level]} (${pct(best.r.metrics.sunPct)} sunlit) and radio ${WORD[best.r.comms.level]} (${pct(best.r.metrics.earthPct)} Earth in view). I checked every 12 hours.`,
      actions: [{ type: 'time', t: best.t, label: `Go to ${utc(best.t)}` }, { type: 'site', id: focus.id, label: `Open ${label(focus)}` }, { type: 'deep', deep: 'calendar', label: 'Open the calendar' }], site: ref(focus),
      follow: [`Is ${label(focus)} sunlit right now?`, 'Best launch time'],
    };
  }

  const wantsSun = SUNNY.test(s) || /\b(dark|shadow|night|day)\b/.test(s);
  const wantsEarth = /\b(earth|radio|comms?|talk|contact|signal|earthset|earthrise|link)\b/.test(s);
  const wantsRating = /\b(rate|rating|good|viable|safe|worth|how good|feasible|recommend|land)\b/.test(s);
  const wantsNight = /\b(longest|how long).*(night|dark)|\bnight\b.*\bhow long\b/.test(s);
  const wantsFacts = /\b(where is|coordinates|location|latitude|longitude|elevation|height|altitude)\b/.test(s);
  if (!(wantsSun || wantsEarth || wantsRating || wantsNight || wantsFacts || whenQ || named.length)) return null;

  const d = await api.load(focus.id), r = scenarioFor(d, t), m = r.metrics;
  const parts: string[] = [];
  if (wantsFacts) parts.push(`${focus.name} is at ${Math.abs(focus.lat).toFixed(3)}° ${focus.lat < 0 ? 'S' : 'N'}, ${(((focus.lon % 360) + 360) % 360).toFixed(3)}° E, ${Math.round(focus.siteHeightM)} m relative to the Moon's reference sphere${focus.mission ? ` (${focus.mission})` : ''}.`);
  if (wantsNight) parts.push(`The longest dark spell at ${label(focus)} in the lunar day from ${utc(t)} is ${m.longestDarkH > 0 ? formatDuration(m.longestDarkH * H) : 'none: it stays sunlit'}${m.longestDarkStart ? `, starting ${utc(m.longestDarkStart)}` : ''}. A lander has to survive it on batteries.`);
  if (/\b(sunset|sunrise|earthset|earthrise|when)\b/.test(s) && !wantsNight) {
    if (wantsSun || !wantsEarth) parts.push(`At ${label(focus)} the next sunrise is ${when(m.nextSunrise, t)} and the next sunset ${when(m.nextSunset, t)}.`);
    if (wantsEarth) parts.push(`Earth next rises ${when(m.nextEarthrise, t)} and sets ${when(m.nextEarthset, t)}.`);
  } else if (!wantsNight && !wantsFacts) parts.push(stateLine(focus, r, t));
  if (wantsRating || (!wantsSun && !wantsEarth && !wantsNight && !wantsFacts)) parts.push(ratingLine(focus, r));
  return {
    text: parts.join(' ') + outOfRange,
    actions: [...(focus.id !== api.currentId ? [{ type: 'site', id: focus.id, label: `Open ${label(focus)}` } as Action] : []), ...goTime],
    site: ref(focus),
    follow: [`Best day to land at ${label(focus)}`, wantsEarth ? `When is the next sunset at ${label(focus)}?` : `Can ${label(focus)} talk to Earth?`, 'Which site has the most sunlight?'],
  };
}
