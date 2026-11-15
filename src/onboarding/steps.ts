/**
 * The guided tour's script, one list per mode. Each step points at a live element on the page (found when the step
 * opens; a step whose element is not on screen is skipped) and says how to use it. `prep` puts the app in the state
 * the step needs, through the small API App hands the tour. The first and last steps have no target (a centred card).
 */
import type { Ui } from '../components/ModeChooser';

/** What the tour may ask the app to do. */
export interface TourApi {
  /** Make sure a site is selected and Explore is showing (picks Mons Mouton if nothing is selected). */
  ensureSite: () => void;
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
}

const vis = (e: Element | null | undefined) => (e && (e as HTMLElement).getClientRects().length ? e : null);
const q = (sel: string) => () => vis([...document.querySelectorAll(sel)].find((e) => vis(e)));
const nth = (sel: string, i: number) => () => vis(document.querySelectorAll(sel)[i]);
const btn = (text: string, within = '') => () =>
  vis([...document.querySelectorAll(`${within} button`)].find((b) => vis(b) && b.textContent?.trim().startsWith(text)));
/** A page section (Normal's cards, Expert's instruments) found by its heading. */
const sec = (title: string) => () => {
  const h = [...document.querySelectorAll('h2, h3, h4, .sv-k, .sv-sec > *:first-child')].find((e) => vis(e) && e.textContent?.trim().startsWith(title));
  return vis(h?.closest('.instrument, .sv-sec, .deep, section'));
};
const site = (api: TourApi) => api.ensureSite();
/** Header and rail steps come after the long page sections, so bring the page back to the top first. */
const top = () => window.scrollTo({ top: 0, behavior: 'smooth' });

const NORMAL: TourStep[] = [
  { kicker: 'Normal mode', title: 'A quick tour of the real thing',
    body: 'We will point at each part of the screen and say how to use it. Everything stays clickable, so try things as we go.',
    how: ['Next and Back move between stops.', 'Esc or the close button ends the tour at any time.'] },
  { target: q('.kp'), kicker: 'Top line', title: 'Sunniest over the next month',
    body: 'The places that will get the most sunlight in the coming month, best first, with the share of time in sunlight.',
    tryIt: 'Click a name to jump to that place.' },
  { target: q('section.moon'), kicker: '3D Moon', title: 'Spin and zoom the Moon',
    body: 'Every dot is a landing place or a past mission. The arrows on the edges point to the Sun and Earth.',
    how: ['Drag to spin it.', 'Click the Moon once, then scroll or pinch to zoom.', 'Click a dot to open that place. Double-click for a close-up.'],
    keys: [['H', 'Back to the whole Moon'], ['Esc', 'Close a close-up']], tryIt: 'Drag the Moon around.' },
  { target: nth('.ct-side .ct-panel', 0), kicker: 'Places to land', title: 'Find any place',
    body: 'NASA\'s Artemis III candidates come first. The two small icons say if the Sun and Earth are up right now; the two on the right rate power and radio contact.',
    tryIt: 'Type a name in the search box, or click a row to fly there.' },
  { target: q('.ui-toggle'), kicker: 'Mode', title: 'Normal or Expert',
    body: 'You are in Normal: plain words and the essentials. Expert adds exact numbers, the calculator, launch planning and mission inputs. Switch at any time.' },
  { target: q('section.moon'), prep: site, kicker: 'A place', title: 'The camera flies down to it',
    body: 'Picking a place lands the view over it. The green line points to Earth and the yellow line to the Sun, so you can see what blocks them.' },
  { target: q('.hud-probe'), prep: site, kicker: 'Point details', title: 'Everything about this spot',
    body: 'Height, sunlight and Earth contact now, how much of next month is sunny, and the longest stretch of darkness.',
    tryIt: 'Click anywhere on the ground to check that exact spot.' },
  { target: q('.hud-bl'), prep: site, kicker: 'Zoom buttons', title: 'Jump between distances',
    body: 'Home shows the whole Moon. Moon frames the selected place, 200 km shows the region, and 10 km gets you right over the ground.',
    tryIt: 'Press 10 km.' },
  { target: q('.hud-br'), prep: site, kicker: 'View tools', title: 'Light dark areas and Expand',
    body: 'Most of the pole sits in shadow. Light dark areas brightens the shadows so you can see the ground (the real lighting is unchanged). Expand makes the 3D view fill the screen.',
    tryIt: 'Turn on Light dark areas.' },
  { target: nth('.ct-side .ct-panel', 1), prep: site, kicker: 'About this place', title: 'The story and the numbers',
    body: 'Why this place matters, which missions went there, where it is and how high it sits. Pick a second place to compare starts a side by side comparison.' },
  { target: q('.action-bar'), prep: site, kicker: 'Status bar', title: 'Always at the bottom',
    body: 'The place you are on, whether it is dark or sunny and when that changes, if Earth is in view, and the date and time you are looking at.' },
  { target: sec('Right now'), prep: site, kicker: 'Further down', title: 'Right now',
    body: 'A plain answer for this moment: is it dark, is Earth in view, and how long until that changes.' },
  { target: q('.sv-time'), prep: site, kicker: 'Time', title: 'Move through time',
    body: 'Everything on the page follows the time you pick, including the 3D Moon. Day back and Day forward step a day; Skip to sunrise jumps to the next sunrise.',
    keys: [['Space', 'Play or pause'], ['← →', 'One hour'], ['Shift ← →', 'One day']], tryIt: 'Press Play and watch the numbers change.' },
  { target: sec('Good place to land'), prep: site, kicker: 'The verdict', title: 'Good place to land?',
    body: 'A one-line answer, then the reasons: how sunny it is over the next month, the longest dark spell, and how often Earth is in view for radio.' },
  { target: sec('Standing here'), prep: site, kicker: 'Standing here', title: 'Look around from the ground',
    body: 'The line is the real horizon around this spot. The Sun and Earth sit where they are in the sky; below the line means hidden.',
    how: ['Face Sun and Face Earth turn you toward them.', 'Height ×3 exaggerates the hills.'], tryIt: 'Drag the view to turn around.' },
  { target: sec('The month ahead'), prep: site, kicker: 'Plan ahead', title: 'The month ahead',
    body: 'White bars are sunny stretches and blue bars are when Earth is in view, over the next 30 days.',
    tryIt: 'Click a day on the bars to jump to it.' },
  { target: sec('Not like Earth'), prep: site, kicker: 'For comparison', title: 'Not like Earth',
    body: 'How a day here differs from home: a day lasts about a month, a sunrise takes hours, and the sky stays black because there is no air.' },
  { target: btn('Pick a second place'), prep: (api) => { site(api); top(); }, kicker: 'Compare', title: 'Two places side by side',
    body: 'Press this, then pick another place. Both get a success rate built from sunlight, Earth contact and surviving the night, side by side further down the page.' },
  { target: q('.ct-missions'), prep: top, kicker: 'All missions', title: 'Missions, past and planned',
    body: 'Compare any two lunar missions: where they landed, how much sunlight and Earth contact they had, and how long they lasted.',
    keys: [['M', 'Open or close']], tryIt: 'Open it, look around, then close it again.' },
  { target: q('.as-launch'), prep: top, kicker: 'Need help?', title: 'Ask in your own words',
    body: 'The guide knows what is on your screen and uses the live numbers. It can also take you places, like "show me Apollo 15".' },
  { target: q('.ct-rail button[aria-label="Search sites and actions"]'), prep: top, kicker: 'Search', title: 'Jump to anything',
    body: 'One search box for every place, preset and action.', keys: [['⌘ K / Ctrl K', 'Open search'], ['?', 'Help']] },
  { target: q('.ct-rail button[aria-label="Take the tour"]'), prep: top, kicker: 'Replay', title: 'Take the tour again',
    body: 'This button (or Take the tour in search) brings the tour back whenever you want it.' },
  { kicker: 'Done', title: 'You are ready',
    body: 'That is everything in Normal mode. Pick a place and start exploring.' },
];

const EXPERT: TourStep[] = [
  { kicker: 'Expert mode', title: 'A tour of every tool',
    body: 'We will point at each control on the real screen and say how to use it. Everything stays clickable, so try things as we go.',
    how: ['Next and Back move between stops.', 'Esc or the close button ends the tour at any time.'] },
  { target: q('.ct-tabs'), kicker: 'Workspaces', title: 'Explore, Compare, Calculator, Launch',
    body: 'Explore is one site in depth. Compare puts scenarios side by side, Calculator solves the mission equations, and Launch finds launch times.',
    keys: [['1 to 4', 'Switch tab']] },
  { target: q('.kp'), kicker: 'Top line', title: 'Good power, next lunar day',
    body: 'Sites rated green for power over the coming lunar day, ranked by sunlit fraction.', tryIt: 'Click a name to open that site.' },
  { target: q('section.moon'), kicker: '3D Moon', title: 'Navigate the globe',
    body: 'Sites, missions and your own points are all on the globe. Edge arrows point to the Sun and Earth when they are off screen.',
    how: ['Drag to rotate. Click the Moon, then scroll or pinch to zoom.', 'Click a point to fly over it and probe it. Double-click for a close-up.'],
    keys: [['H', 'Home view'], ['Ctrl / ⌘ scroll', 'Zoom without clicking first']] },
  { target: nth('.ct-side .ct-panel', 0), kicker: 'Landing sites', title: 'The site table',
    body: 'Now shows whether the Sun and Earth are above the skyline at the selected time. Rating gives power and DTE comms over the next lunar day: tick good, triangle marginal, cross poor.',
    tryIt: 'Search by name, mission or program.' },
  { target: q('.ui-toggle'), kicker: 'Mode', title: 'Normal or Expert',
    body: 'Normal shows the essentials in plain words for a wider audience. Your selection and time carry over when you switch.' },
  { target: q('.hud-tr'), prep: site, kicker: 'Readout', title: 'Camera and Sun at a glance',
    body: 'Ground resolution per pixel, camera altitude, Sun elevation and azimuth at the site, and which dataset is drawn.' },
  { target: q('.hud-probe'), prep: site, kicker: 'Probed point', title: 'Probe any point',
    body: 'Location, height, distance to the selected site, sunlight and Earth contact now, the coming month\'s fractions and the longest darkness.',
    how: ['Compare this point turns it into a site and pairs it with the current one.', 'Plan a launch to here sends it to the launch planner.'],
    tryIt: 'Click a spot on the ground to probe it.' },
  { target: q('.hud-bl'), prep: site, kicker: 'Zoom presets', title: 'Home, Moon, 200 km, 10 km',
    body: 'Fixed framings around the selected site. 10 km is close enough to judge individual ridges against the Sun line.' },
  { target: btn('Display', 'section.moon'), prep: site, kicker: 'Display menu', title: 'Choose what the globe draws',
    body: 'Sun and Earth markers, cast shadows, relief exaggeration (×3), fine terrain detail, and the sight lines: green to Earth, yellow to the Sun.',
    tryIt: 'Open the menu and switch something off and on.' },
  { target: btn('Rover range', 'section.moon'), prep: site, kicker: 'Rover range', title: 'How far can it drive?',
    body: 'Set battery capacity, reserve, loads, speed, maximum slope, mass and drivetrain efficiency. The reachable area is drawn on the terrain.' },
  { target: btn('Terrain 3D', 'section.moon'), prep: site, kicker: 'Terrain 3D', title: 'The site mesh',
    body: 'Opens LOLA terrain around the site as a solid mesh: pick a radius from 5 to 100 km, toggle wire and grid, exaggerate height up to ×5, and switch between top, front, right and perspective views.' },
  { target: q('.hud-br'), prep: site, kicker: 'View tools', title: 'Light dark areas and Expand',
    body: 'Light dark areas lifts the shadows for reading the ground without changing the computed lighting. Expand takes the 3D view full screen.' },
  { target: nth('.ct-side .ct-panel', 1), prep: site, kicker: 'Review site', title: 'Site summary and actions',
    body: 'The selected site\'s description, coordinates and elevation, with the next steps: pick a second site to compare, or plan a launch.' },
  { target: q('.action-bar'), prep: site, kicker: 'Status bar', title: 'Countdowns',
    body: 'Sun elevation against the shadowing skyline, and T-minus countdowns to the next sunrise or sunset and Earthrise or Earthset.' },
  { target: sec('Time'), prep: site, kicker: 'Further down', title: 'Time controls',
    body: 'Every panel and the globe follow this time. Drag the timeline, type a date and time (UTC), or use the step buttons.',
    keys: [['Space', 'Play or pause'], ['← →', '1 hour'], ['Shift ← →', '1 day']], tryIt: 'Press Play and pick a speed.' },
  { target: sec('Conditions'), prep: site, kicker: 'Conditions', title: 'Power and comms verdicts',
    body: 'Green, amber or red for power and direct-to-Earth comms over the next lunar day, with the reasons: sunlit fraction, longest dark spell, and how far the Sun or Earth clears the terrain.' },
  { target: sec('Horizon'), prep: site, kicker: 'Horizon', title: 'The skyline from the site',
    body: 'The traced terrain horizon with the Sun and Earth paths over it. Panorama unrolls the full 360°, Sky plot looks straight up, First person stands you on the ground, and Shadow map shows which ground is lit.',
    tryIt: 'Switch between the four views.' },
  { target: sec('Next 30 days'), prep: site, kicker: 'Next 30 days', title: 'Sunlit and Earth-in-view windows',
    body: 'Bars for every sunlit and Earth-visible stretch over the next 30 days.', tryIt: 'Click a bar to jump the whole app to that moment.' },
  { target: sec('If the landing date slips'), prep: site, kicker: 'Schedule risk', title: 'If the landing date slips',
    body: 'The same verdicts recomputed for later landing dates, so you can see how much margin a delay costs.' },
  { target: sec('Moon vs Earth'), prep: site, kicker: 'Reference', title: 'Moon vs Earth',
    body: 'Day length, temperature swing, sunrise duration and sky at this latitude, side by side with Earth.' },
  { target: q('.deep'), prep: site, kicker: 'Detailed analysis', title: 'Four deeper tools',
    body: 'Libration and orbit (export as CSV or JSON), Compare, a day-by-day Calendar of the whole data range, and Mission plan for your own power, battery and route numbers.',
    tryIt: 'Open the Calendar tab.' },
  { target: nth('.ct-tabs button', 1), prep: top, kicker: 'Compare tab', title: 'Scenarios side by side',
    body: 'Each column is a site and a time, with its horizon, verdicts and countdowns; the table lines up every quantity and marks the best. Add scenario adds a column, Sync dates to A aligns them.' },
  { target: nth('.ct-tabs button', 2), prep: top, kicker: 'Calculator tab', title: 'Solve for any variable',
    body: 'Route, terrain, sky, power, visibility and mission equations. Pick one, choose the variable to solve for, and Fill from sim copies in the live values.' },
  { target: nth('.ct-tabs button', 3), prep: top, kicker: 'Launch tab', title: 'When to launch',
    body: 'Best launch times from NASA launch sites in the United States for landing on a good day, for a listed site or any point. See flight path shows the trajectory.' },
  { target: q('.ct-missions'), prep: top, kicker: 'Missions', title: 'Mission comparison',
    body: 'Any two missions, past or planned, compared row by row: landing site, sunlight, Earth contact and how long they lasted.', keys: [['M', 'Open or close']] },
  { target: q('.as-launch'), prep: top, kicker: 'Need help?', title: 'Ask the guide',
    body: 'It reads the live numbers on screen, explains them, and can drive the app ("open the launch planner").' },
  { target: q('.ct-rail button[aria-label="Search sites and actions"]'), prep: top, kicker: 'Command menu', title: 'Everything from the keyboard',
    body: 'Every site, preset, view and action in one list.', keys: [['⌘ K / Ctrl K', 'Open'], ['?', 'Help']] },
  { target: q('.ct-rail button[aria-label="Take the tour"]'), prep: top, kicker: 'Replay', title: 'Take the tour again',
    body: 'This button (or Take the tour in the command menu) brings the tour back whenever you want it.' },
  { kicker: 'Done', title: 'You are ready',
    body: 'That is every tool in Expert mode. Pick a site and start planning.' },
];

export const TOUR: Record<Ui, TourStep[]> = { normal: NORMAL, expert: EXPERT };
