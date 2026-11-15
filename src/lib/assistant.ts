/**
 * Sol helper: a small on-device language model for questions about this website.
 *
 * It runs entirely in the browser: no network requests, no API keys, no usage cost, and nothing typed leaves
 * the device. The model is a nearest-neighbour retriever over TF-IDF vectors of word unigrams, bigrams and
 * character trigrams (the trigrams make it tolerant of typos), matched against example questions for each topic.
 * Topics can carry an action (open a tab, select a named site, open the mission sidebar ...), so the helper
 * navigates as well as answers. Below a confidence threshold it says so and offers human support instead of
 * guessing.
 */

export type Action =
  | { type: 'mode'; mode: 'explore' | 'compare' | 'calc' | 'launch'; label: string }
  | { type: 'missions'; label: string }
  | { type: 'guide'; label: string }
  | { type: 'about'; label: string }
  | { type: 'palette'; label: string }
  | { type: 'theme'; label: string }
  | { type: 'home'; label: string }
  | { type: 'view'; view: 'panorama' | 'sky' | 'first' | 'shadow'; label: string }
  | { type: 'deep'; deep: 'libration' | 'calendar' | 'mission'; label: string }
  | { type: 'site'; id: string; label: string }
  | { type: 'support'; label: string };

export interface Topic { id: string; examples: string[]; answer: string; actions?: Action[]; support?: boolean }

export const TOPICS: Topic[] = [
  { id: 'greet', examples: ['hi', 'hello', 'hey there', 'good morning', 'yo'],
    answer: 'Hi! I can explain any part of Sol Teris and take you there. Try "how do I compare two missions" or "show me Malapert".' },
  { id: 'thanks', examples: ['thanks', 'thank you', 'cheers', 'great thanks', 'that helped'],
    answer: 'Glad to help. Ask me anything else about the site, or use Talk to a person if you need more.' },
  { id: 'what', examples: ['what is this app', 'what does this website do', 'what is sol teris', 'explain this site', 'what can i do here', 'purpose of this tool'],
    answer: 'Sol Teris shows, for any lunar landing site and date, where the Sun and Earth sit against the real terrain skyline: when a lander has sunlight for power and a direct radio link to Earth. Terrain is NASA LRO LOLA; Sun and Earth positions are checked against JPL Horizons. Data covers 2027 to 2029.',
    actions: [{ type: 'guide', label: 'Open the How to use guide' }, { type: 'about', label: 'About the data' }] },
  { id: 'select-site', examples: ['how do i pick a site', 'select a landing site', 'choose a site', 'change the site', 'where is the site list', 'switch site'],
    answer: 'Pick a site in the Landing sites list on the right (grouped by program), click a site marker on the 3D Moon, or search with Ctrl K. You can also type "show me" and a site name here.',
    actions: [{ type: 'palette', label: 'Search sites (Ctrl K)' }, { type: 'mode', mode: 'explore', label: 'Go to Explore' }] },
  { id: 'sunlit', examples: ['what does sunlit mean', 'is the site in sunlight', 'what is sun above skyline', 'when does the sun set', 'sunrise time', 'how much sunlight'],
    answer: 'Sunlit means the centre of the Sun is above the terrain skyline seen from 2 m above the site. The Summary shows sunlit or not right now, the Sun\'s elevation against the skyline, and the time to the next sunset or sunrise.',
    actions: [{ type: 'mode', mode: 'explore', label: 'Go to Explore' }] },
  { id: 'earth', examples: ['what does earth in view mean', 'can the site talk to earth', 'earth visibility', 'radio link to earth', 'when does earth set', 'direct to earth comms', 'why is earth never visible'],
    answer: 'Earth in view means Earth\'s centre is above the skyline, so a lander has a direct radio link. Near the pole Earth hangs low and drifts with libration, so ridges come and go. From the far side (Chang\'e-4, Chang\'e-6, Blue Ghost 2) Earth is never in view, so those missions need a relay satellite.' },
  { id: 'refraction', examples: ['does it account for refraction', 'atmosphere refraction', 'no atmosphere horizon', 'how is the horizon calculated', 'edge of the lunar sphere', 'why no twilight'],
    answer: 'The Moon has no air, so there is no refraction and no twilight. The app treats the Sun or Earth as up exactly when its geometric direction clears the skyline. In each direction the skyline is the highest terrain along the line of sight (LOLA heights traced up to 150 km, with the Moon\'s curvature). A perfectly smooth Moon would give about 0.09° below level for the 2 m mast; real terrain raises it near ridges and lowers it from peaks. On Earth, refraction would lift the Sun by about 0.57°. Expert mode shows both in All figures.' },
  { id: 'modes', examples: ['normal mode', 'expert mode', 'simple view', 'too complicated', 'show me more detail', 'switch mode', 'simpler please'],
    answer: 'Normal mode answers three questions in plain words: is it sunny, can it talk to Earth, and is it a good place to land. Expert mode adds exact angles, scenario comparison, the calculator, the launch planner, mission inputs, your own points and data export. Switch with Normal / Expert at the top.' },
  { id: 'ratings', examples: ['what do the ratings mean', 'how good is this site', 'power rating', 'comms rating', 'green amber red', 'good marginal poor meaning', 'how is the verdict calculated'],
    answer: 'Ratings cover the next lunar day (29.5 days). Power is good when the site is sunlit at least 70% of the time and the longest dark spell is at most 100 h; marginal at 40% or 200 h. Radio is good at 90% Earth visibility with gaps of at most 24 h; marginal at 40% or 120 h. Otherwise poor.' },
  { id: 'time', examples: ['how do i change the date', 'change the time', 'play the animation', 'go forward in time', 'set a date', 'time slider', 'speed up time'],
    answer: 'Use the time controls under the site summary: Play, the step buttons (hours and days), the date box, and the slider across 2027 to 2029. Space plays and pauses; the left and right arrow keys step an hour (with Shift, a day).',
    actions: [{ type: 'mode', mode: 'explore', label: 'Go to Explore' }] },
  { id: 'calendar', examples: ['best landing dates', 'calendar', 'daily visibility', 'best windows', 'heatmap', 'which days are best', 'when should we land'],
    answer: 'The Daily visibility calendar colours every day of 2027 to 2029 by sunlight, Earth in view, or both. The Grid view shows all 36 months at once; Months shows a calendar per month. Best windows lists the top stretches; click any day to jump to it.',
    actions: [{ type: 'deep', deep: 'calendar', label: 'Open the calendar' }] },
  { id: 'compare-tab', examples: ['compare sites', 'compare two sites side by side', 'compare dates', 'scenario comparison', 'compare tab'],
    answer: 'The Compare tab shows up to four site-and-date scenarios side by side with their ratings, skylines and a metric table that marks the best of each.',
    actions: [{ type: 'mode', mode: 'compare', label: 'Open Compare' }] },
  { id: 'missions', examples: ['compare missions', 'mission comparison', 'compare two missions', 'which mission is better', 'past and future missions', 'clps missions', 'apollo vs artemis', 'more efficient mission', 'mission sidebar'],
    answer: 'The Missions sidebar (button in the top bar, or the M key) lists flown, failed and planned missions, including upcoming NASA CLPS landers. Pick any two to compare sunlight, Earth contact, longest night and battery, radio blackouts and landing days, with a long-run efficiency score whose weights are shown.',
    actions: [{ type: 'missions', label: 'Open the Missions sidebar' }] },
  { id: 'launch', examples: ['launch planner', 'when should we launch', 'best launch time', 'launch from kennedy', 'wallops launch', 'flight path', 'trajectory to the moon', 'how long to get to the moon', 'delta v', 'when does the rocket leave', 'launch date and time'],
    answer: 'The Launch tab lists the next good landing days at a site and the best launch time from a NASA centre (Kennedy or Wallops), with azimuth and orbit. Pick a row to see the estimated flight path: parking orbit, trans-lunar injection, coast, lunar orbit and landing, with a speed-change budget.',
    actions: [{ type: 'mode', mode: 'launch', label: 'Open Launch' }] },
  { id: 'calculator', examples: ['calculator', 'solve an equation', 'mission variables', 'compute travel time', 'battery calculation'],
    answer: 'The Calculator tab solves the mission equations (travel time, slopes, power, battery, visibility) for any one variable, and can fill values from the current simulation.',
    actions: [{ type: 'mode', mode: 'calc', label: 'Open Calculator' }, { type: 'deep', deep: 'mission', label: 'Mission variables table' }] },
  { id: 'moon-controls', examples: ['how do i use the 3d moon', 'rotate the moon', 'zoom in on the moon', 'move the camera', 'click on the moon', 'double click moon', 'pan the view', 'camera controls'],
    answer: 'Drag to rotate, scroll or pinch to zoom. Click a point to glide to a top-down view over it and see its light and Earth contact; double-click for a close-up. H returns to the whole Moon, Esc closes panels, and Expand makes the Moon fill the window.',
    actions: [{ type: 'home', label: 'Back to the whole Moon' }] },
  { id: 'display', examples: ['shadows', 'light up dark areas', 'see the night side', 'relief exaggeration', 'display menu', 'turn off shadows', 'floodlight'],
    answer: 'The Display menu on the 3D Moon has switches for Light dark areas (a floodlight so night-side and shadowed ground are visible), Sun & Earth pointers, lines to Earth and the Sun, Shadows, Relief ×3 and Fine detail. They change the picture only, not the numbers.' },
  { id: 'probe', examples: ['what happens when i click a point', 'probe a point', 'light at any point', 'is earth visible from this point', 'probed point panel', 'line to earth'],
    answer: 'Clicking any point opens the Probed point panel: coordinates, elevation, how much of the Sun is visible now, whether Earth is in view, and the shares over the next 29.5 days. Dotted lines run to Earth and toward the Sun, blue or yellow when clear and red when blocked.' },
  { id: 'rover', examples: ['rover range', 'how far can a rover drive', 'battery range', 'can the rover reach sunlight', 'rover distance on battery'],
    answer: 'Rover range (Expert, on the 3D Moon) takes a start point and the rover: battery capacity, charge and reserve, hotel and drive power, solar input, speed, slope limit, mass, drivetrain efficiency and path detour. It drives 180 directions over the loaded terrain, charging time and climbing energy and stopping at slopes past the limit, and draws the exact one-way and out-and-back boundary with the radius in each direction. It also searches for the nearest point that will be sunlit when the rover arrives.' },
  { id: 'custom', examples: ['enter coordinates', 'custom point', 'any point on the moon', 'my own location', 'latitude longitude', 'plan a launch to here'],
    answer: 'Any point works: enter latitude and longitude in Custom coordinates (Explore) or in Launch (Any point), or click the Moon and choose Plan a launch to here. The skyline is computed in your browser, so these results are approximate.',
    actions: [{ type: 'mode', mode: 'launch', label: 'Open Launch' }] },
  { id: 'views', examples: ['first person view', 'panorama', 'sky plot', 'look around from the site', 'horizon view'],
    answer: 'The Horizon panel has three views: Panorama (the skyline with the Sun and Earth at true size), Sky plot (from above) and First person (look around from the mast).',
    actions: [{ type: 'view', view: 'first', label: 'First person' }, { type: 'view', view: 'panorama', label: 'Panorama' }, { type: 'view', view: 'sky', label: 'Sky plot' }] },
  { id: 'export', examples: ['export data', 'download csv', 'json export', 'save the results', 'share a link'],
    answer: 'CSV and JSON export sit under the Libration & orbit tab in Detailed analysis. The page address keeps the site, time and comparison, so you can share a link to exactly what you see.',
    actions: [{ type: 'deep', deep: 'libration', label: 'Open export' }] },
  { id: 'libration', examples: ['libration', 'earth wobble', 'why does earth move in the sky', 'orbital variation', 'perigee apogee', 'earth moon distance', 'lunar seasons', 'does earth stay in view'],
    answer: 'The Libration & orbit tool (Detailed analysis, first tab) shows Earth\'s wobble in the lunar sky (about ±8° in longitude and ±7° in latitude), the Earth–Moon distance from perigee to apogee, the Sun\'s ±1.5° seasonal swing, and whether libration hides Earth at this site or is the only reason it is ever in view.',
    actions: [{ type: 'deep', deep: 'libration', label: 'Open Libration & orbit' }] },
  { id: 'data', examples: ['where does the data come from', 'how accurate is this', 'data sources', 'is this real data', 'jpl horizons', 'lola terrain', 'method'],
    answer: 'Terrain is NASA LRO LOLA (40 m near the south pole, about 1.9 km elsewhere). Skylines are traced 150 km out with the Moon\'s curvature. Sun and Earth positions come from astronomy-engine and agree with JPL Horizons to within 0.004°. Coordinates marked to verify are approximate.',
    actions: [{ type: 'about', label: 'About the data and method' }] },
  { id: 'theme', examples: ['dark mode', 'light mode', 'change the theme', 'switch colours'],
    answer: 'The contrast button at the bottom of the left rail switches between dark and light.',
    actions: [{ type: 'theme', label: 'Switch theme' }] },
  { id: 'shortcuts', examples: ['keyboard shortcuts', 'hotkeys', 'what keys can i use', 'command menu', 'search everything'],
    answer: 'Ctrl K (Cmd K on Mac) opens the command menu over every site and action. 1 to 4 switch tabs, M opens Missions, H returns to the whole Moon, Space plays, the arrows step time, ? opens the guide and Esc closes panels.',
    actions: [{ type: 'palette', label: 'Open the command menu' }] },
  { id: 'webgl', examples: ['3d moon not showing', 'moon is blank', 'webgl not available', 'the moon does not load', 'black screen', 'it is slow'],
    answer: 'The 3D Moon needs WebGL. If it is blank, turn on hardware acceleration in your browser settings or try another browser. Everything else (skylines, ratings, calendar, Launch, Missions) works without it. If it is slow, turn off Shadows in the Display menu.' },
  { id: 'home', examples: ['go home', 'start over', 'reset the view', 'back to the start'],
    answer: 'Taking you back to the start: Explore with the whole Moon in view.',
    actions: [{ type: 'home', label: 'Go home' }] },
  { id: 'human', examples: ['talk to a person', 'human support', 'contact support', 'i need help from a real person', 'customer service', 'speak to someone', 'report a bug', 'this is not working'],
    answer: 'You can reach the Sol Teris team directly. Use the support options below.', support: true,
    actions: [{ type: 'support', label: 'Contact the team' }] },
];

/* ---------------- model ---------------- */

const STOP = new Set('a an the is are was were be to of in on at for and or do does did i me my you your it this that how what can could would should please there here with from by about which when where why we us our'.split(' '));
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);
/** Everyday words mapped onto the site's own terms. */
const SYN: Record<string, string> = {
  rocket: 'launch', liftoff: 'launch', takeoff: 'launch', blastoff: 'launch', florida: 'kennedy', cape: 'kennedy', virginia: 'wallops',
  spreadsheet: 'csv', excel: 'csv', download: 'export', bigger: 'zoom', closer: 'zoom', enlarge: 'zoom',
  sunset: 'sun', sundown: 'sun', daylight: 'sunlight', light: 'sunlight', comms: 'radio', communication: 'radio', signal: 'radio',
  human: 'person', agent: 'person', staff: 'person', representative: 'person', bug: 'problem', broken: 'problem',
  lander: 'mission', landers: 'mission', missions: 'mission', efficient: 'efficiency',
};
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9×'\s-]/g, ' ').replace(/['-]/g, ' ').split(/\s+/).filter(Boolean);
const words = (s: string) => {
  const t = tokens(s);
  const kept = t.filter((w) => !STOP.has(w));
  // a question made only of common words ("what can I do here") still needs something to match on
  return (kept.length ? kept : t).map((w) => SYN[w] ?? w).map(stem);
};

function features(s: string): Map<string, number> {
  const f = new Map<string, number>();
  const add = (k: string, v: number) => f.set(k, (f.get(k) ?? 0) + v);
  const ws = words(s);
  ws.forEach((w, i) => {
    add(`w:${w}`, 1);
    if (i > 0) add(`b:${ws[i - 1]}_${w}`, 1);
    const p = `#${w}#`;
    for (let k = 0; k + 3 <= p.length; k++) add(`c:${p.slice(k, k + 3)}`, 0.35); // typo tolerance
  });
  return f;
}

export interface Model { idf: Map<string, number>; vecs: { topic: Topic; v: Map<string, number>; norm: number }[] }

export function buildModel(topics: Topic[] = TOPICS): Model {
  const docs = topics.flatMap((t) => t.examples.map((e) => ({ topic: t, f: features(e) })));
  const df = new Map<string, number>();
  for (const d of docs) for (const k of d.f.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  const idf = new Map([...df].map(([k, n]) => [k, Math.log(1 + docs.length / n)]));
  const vecs = docs.map(({ topic, f }) => {
    const v = new Map([...f].map(([k, x]) => [k, x * (idf.get(k) ?? 0)]));
    return { topic, v, norm: Math.sqrt([...v.values()].reduce((a, x) => a + x * x, 0)) || 1 };
  });
  return { idf, vecs };
}

export interface SiteRef { id: string; name: string; short: string }
export interface Reply { topic: Topic | null; confidence: number; text: string; actions: Action[]; support: boolean; site: SiteRef | null }

/** Threshold below which the helper admits it does not know and offers human support. */
export const MIN_CONFIDENCE = 0.3;

/** The catalogue site named in the question, if any (longest, most specific match wins). */
export function findSite(q: string, sites: SiteRef[]): SiteRef | null {
  const norm = (s: string) => ` ${s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const nq = norm(q);
  let best: { s: SiteRef; len: number } | null = null;
  for (const s of sites) {
    for (const cand of [s.short, s.name, s.id.replace(/-/g, ' ')]) {
      const c = norm(cand).trim();
      if (c.length < 3) continue;
      if (nq.includes(` ${c} `) && (!best || c.length > best.len)) best = { s, len: c.length };
    }
  }
  return best?.s ?? null;
}

const NAV = /\b(show|open|go|take|fly|select|view|display|find|navigate|jump|zoom)\b/i;

export function answer(model: Model, q: string, sites: SiteRef[] = []): Reply {
  const site = findSite(q, sites);
  const f = features(q);
  const v = new Map([...f].map(([k, x]) => [k, x * (model.idf.get(k) ?? 0)]));
  const norm = Math.sqrt([...v.values()].reduce((a, x) => a + x * x, 0)) || 1;
  let best: { topic: Topic; score: number } | null = null;
  for (const d of model.vecs) {
    let dot = 0;
    for (const [k, x] of v) { const y = d.v.get(k); if (y) dot += x * y; }
    const score = dot / (norm * d.norm);
    if (!best || score > best.score) best = { topic: d.topic, score };
  }
  const siteAction: Action[] = site ? [{ type: 'site', id: site.id, label: `Open ${site.short}` }] : [];
  // "show me Malapert", "go to Apollo 15": a navigation verb plus a site name is a site request
  if (site && (NAV.test(q) || !best || best.score < MIN_CONFIDENCE)) {
    return { topic: null, confidence: 1, text: `Opening ${site.name}. Its skyline, ratings and calendar are in Explore, and the 3D Moon flies to it.`, actions: siteAction, support: false, site };
  }
  if (!best || best.score < MIN_CONFIDENCE) {
    return { topic: null, confidence: best?.score ?? 0, text: 'I am not sure about that one. I only know this website, so try rephrasing, pick a suggestion, or ask the team directly.', actions: [{ type: 'guide', label: 'Open the How to use guide' }], support: true, site: null };
  }
  return { topic: best.topic, confidence: best.score, text: best.topic.answer, actions: [...(best.topic.actions ?? []), ...siteAction], support: !!best.topic.support, site };
}
