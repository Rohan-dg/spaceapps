/**
 * The guided tour's script, one list per mode. Each step points at a live element on the page (found when the step
 * opens; a step whose element is not on screen is skipped) and says how to use it. `prep` puts the app in the state
 * the step needs, through the small API App hands the tour. The first and last steps have no target (a centred card).
 *
 * Audiences: Education (internal id 'normal') is written for students in grades 5 to 12 learning the topic, so each stop teaches the science
 * behind what is on screen (`learn`) and often leaves a question (`think`). Scientific is written for interns, engineers
 * and scientists who know the field: it names the datasets, models, thresholds and limits behind each tool.
 */
import type { Ui } from '../components/ModeChooser';

/** What the tour may ask the app to do. */
export interface TourApi {
  /** Make sure a site is selected and Explore is showing (picks Mons Mouton if nothing is selected). */
  ensureSite: () => void;
  /** Close any open dock section, so the Moon's own controls are showing. */
  closePanels?: () => void;
}

export interface TourStep {
  target?: () => Element | null;
  prep?: (api: TourApi) => void;
  kicker: string;
  title: string;
  body: string;
  how?: string[];
  keys?: [string, string][];
  /** An invitation to use the highlighted control right now. */
  tryIt?: string;
  /** Education: the science behind this part ("Why it matters"). Scientific: the data and model behind it ("Method"). */
  learn?: string;
  /** Education only: a question to think about before moving on. */
  think?: string;
}

/** On screen for real: laid out, not hidden or faded out by itself or any parent. */
const vis = (e: Element | null | undefined) => {
  if (!e || !(e as HTMLElement).getClientRects().length) return null;
  for (let a: Element | null = e; a && a !== document.body; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return null;
  }
  return e;
};
/** Not covered by another control: the element (or a child of it) is what sits at its centre. */
const onTop = (e: Element) => {
  const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && (hit === e || e.contains(hit) || !!hit.closest('.tour'));
};
/** The visible, uncovered match nearest the middle of the screen. */
const qTop = (sel: string) => () => {
  const cx = innerWidth / 2, cy = innerHeight / 2;
  const all = [...document.querySelectorAll(sel)].filter((e) => vis(e) && onTop(e));
  all.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return Math.hypot(ra.x - cx, ra.y - cy) - Math.hypot(rb.x - cx, rb.y - cy); });
  return all[0] ?? null;
};
const q = (sel: string) => () => vis([...document.querySelectorAll(sel)].find((e) => vis(e)));
const btn = (text: string, within = '') => () =>
  vis([...document.querySelectorAll(`${within} button`)].find((b) => vis(b) && b.textContent?.trim().startsWith(text)));
const site = (api: TourApi) => api.ensureSite();
/** Header and rail steps come after the long page sections, so bring the page back to the top first. */
const top = () => window.scrollTo({ top: 0, behavior: 'smooth' });

const NORMAL: TourStep[] = [
  { kicker: 'Welcome', title: 'Find a safe place to land on the Moon',
    body: 'A lander needs two things: sunlight for power, and a clear view of Earth to send data home. This short tour shows you how to check both.',
    how: ['Next and Back move through the tour.', 'Esc or × skips it.'] },
  { target: q('section.moon'), kicker: '3D Moon', title: 'A real map of the Moon',
    body: 'Built from NASA laser measurements of every hill and crater, lit by the real Sun for the date shown.',
    tryIt: 'Drag to spin and scroll to zoom. The south pole is at the bottom.' },
  { target: qTop('.moon-marker'), kicker: 'Mission points', title: 'Every dot is a landing site',
    body: 'Click one to see the mission, how often it gets sunlight, and how often Earth is in view.',
    learn: 'Radio travels in straight lines, so a hill between a lander and Earth blocks the signal.' },
  { target: q('.edu-build'), kicker: 'Rover path', title: 'Plan a drive',
    body: 'Press Plan a rover path, then click points in the order to visit them. A panel checks whether the drive works.',
    tryIt: 'Try Malapert, then Shackleton rim.' },
  // the check panel appears once a path has two stops; until then point at the button that builds the path
  { target: () => q('.edu-path')() ?? q('.edu-build')(), kicker: 'The check', title: 'Battery, sunlight and Earth contact',
    body: 'Once a path has two stops, a panel checks the drive with the real Sun and Earth for your start date. If it fails, try Find a better day to leave.',
    think: 'Why would the day you leave change the answer?' },
  { target: q('.edu-rover'), kicker: 'Game', title: 'Drive a rover yourself',
    body: 'Pick one of NASA\'s rovers, collect ice samples, and keep it charged and in touch with Earth.' },
  { target: q('.ui-toggle'), kicker: 'Two modes', title: 'Education or Scientific',
    body: 'Scientific shows the exact numbers and planning tools that mission teams use.' },
  { target: q('.edu-actions'), kicker: 'Help', title: 'Replay this tour any time',
    body: 'The ? button brings this tour back. The i button explains where the data comes from.' },
  { kicker: 'Ready', title: 'You are the mission planner',
    body: 'Sunlight for power, Earth for radio. Use both to pick the best spot.',
    think: 'Challenge: plan a three-stop drive that works.' },
];

const EXPERT: TourStep[] = [
  { kicker: 'Scientific mode', title: 'Landing-site analysis',
    body: 'Sun and Earth visibility, power and comms verdicts, and mission planning tools, computed on NASA LOLA terrain.',
    how: ['Next and Back move through the tour.', 'Esc or × skips it.'] },
  { target: q('section.moon'), kicker: '3D Moon', title: 'Navigate and probe',
    body: 'Click a site to select it. Click any ground to probe its skyline; double-click for a near-horizontal terrain view.',
    keys: [['Drag', 'Rotate'], ['Scroll', 'Zoom'], ['H', 'Whole Moon']] },
  { target: q('.dash-site'), prep: site, kicker: 'Site card', title: 'The site at a glance',
    body: 'Sunlit share of the next lunar day, Sun and Earth elevation, Earth-in-view share, and the power and radio ratings.',
    learn: 'Sunlit means the Sun\'s centre is above the terrain horizon at a 2 m mast, on a 30 min series checked against JPL Horizons.' },
  { target: q('.dash-hero'), prep: site, kicker: 'Countdown', title: 'Next sunset or sunrise',
    body: 'Time to the next illumination change at the site, refined to about 30 s.' },
  { target: q('.dash-alert'), prep: site, kicker: 'Earth contact', title: 'Blackouts',
    body: 'Time to the next Earthset or Earthrise, and the longest gap without direct-to-Earth contact.' },
  { target: q('.dash-time'), prep: site, kicker: 'Time bar', title: 'Every panel follows this clock',
    body: 'White bands are sunlit, blue bands have Earth in view. Drag the track to scrub.',
    keys: [['Space', 'Play or pause'], ['← →', '±1 hour'], ['Shift ← →', '±1 day']] },
  { target: q('.dash-dock'), kicker: 'Dock', title: 'Every analysis panel',
    body: 'Conditions, the site table, horizon, next 30 days, date slip, calendar and mission plan open over the Moon.',
    tryIt: 'Hover an icon to see its name.' },
  { target: btn('Display', 'section.moon'), prep: (api) => { api.closePanels?.(); site(api); }, kicker: 'Map tools', title: 'Layers, rover range, Terrain 3D',
    body: 'Display toggles shadows, relief and sight lines. Rover range draws the ground a rover can reach. Terrain 3D opens the site mesh.' },
  { target: q('.ct-tabs'), prep: top, kicker: 'Workspaces', title: 'Compare, Calculator, Launch',
    body: 'Compare sites and dates side by side, solve the mission equations for any variable, or find launch windows.',
    keys: [['1 to 4', 'Switch tab']] },
  { target: q('.ct-missions'), prep: top, kicker: 'Missions', title: 'Compare real missions',
    body: 'Any two missions, flown or planned: landing site, sunlight, Earth contact and time on the surface.',
    keys: [['M', 'Open or close']] },
  { target: q('.moon-fab'), prep: site, kicker: 'View', title: 'Moon and Remove shadows',
    body: 'Moon flies back to the whole Moon in its starting position. Remove shadows lights the night side and dark craters (display only).',
    keys: [['H', 'Whole Moon']] },
  { target: q('.ct-utils button[title="AI help"]'), prep: top, kicker: 'Guide', title: 'Ask a question',
    body: 'The ? at the top right opens the AI help. It reads the live values on screen, explains them, and can operate the app for you.' },
  { target: q('.ct-tutorial'), prep: top, kicker: 'Replay', title: 'Tour on demand',
    body: 'Tutorial runs this tour again. ⌘K or Ctrl K finds any site or action.' },
  { kicker: 'Ready', title: 'Know the limits',
    body: 'Accuracy follows the terrain: 5 to 40 m at the polar sites, coarser elsewhere. About (i) lists the data sources and methods; Tutorial replays this tour.' },
];

export const TOUR: Record<Ui, TourStep[]> = { normal: NORMAL, expert: EXPERT };
