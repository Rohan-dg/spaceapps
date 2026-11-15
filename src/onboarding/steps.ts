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

const vis = (e: Element | null | undefined) => (e && (e as HTMLElement).getClientRects().length ? e : null);
const q = (sel: string) => () => vis([...document.querySelectorAll(sel)].find((e) => vis(e)));
const nth = (sel: string, i: number) => () => vis(document.querySelectorAll(sel)[i]);
const btn = (text: string, within = '') => () =>
  vis([...document.querySelectorAll(`${within} button`)].find((b) => vis(b) && b.textContent?.trim().startsWith(text)));
const site = (api: TourApi) => api.ensureSite();
/** Header and rail steps come after the long page sections, so bring the page back to the top first. */
const top = () => window.scrollTo({ top: 0, behavior: 'smooth' });

const NORMAL: TourStep[] = [
  { kicker: 'Education mode', title: 'Where should we land on the Moon?',
    body: 'Space agencies are planning to send astronauts back to the Moon, near its south pole. To choose a landing place they ask two big questions: will there be sunlight for power, and can the crew talk to Earth? This tour shows you how to answer them yourself.',
    how: ['Next and Back move between stops.', 'Esc or the close button ends the tour at any time.', 'Everything stays clickable, so try things as we go.'] },
  { target: q('section.moon'), kicker: '3D Moon', title: 'A model of the real Moon',
    body: 'This Moon is built from real measurements: a NASA spacecraft fired a laser at the surface billions of times to map every hill and crater. Every dot is a mission point: a past landing, a planned one, or a place NASA is considering for astronauts.',
    how: ['Drag to spin it.', 'Scroll or pinch to zoom.', 'Double-click to see a place from the ground.'],
    learn: 'The light and shadows are real too. They show where the Sun is shining on the Moon right now in the app\'s clock.',
    tryIt: 'Drag the Moon around and find the south pole at the bottom.' },
  { target: q('.moon-marker'), kicker: 'Mission points', title: 'Click a dot to learn about it',
    body: 'A card pops up with what happened there or is planned, how much of the time it has sunlight, and how often Earth is in view for radio contact.',
    learn: 'A lander runs on solar panels, so sunlight means power. It also needs Earth in the sky to send its pictures and data home: radio travels in straight lines, so a hill in the way blocks the signal.',
    think: 'Most of the dots are near the south pole. Why might astronauts want to go there instead of where Apollo landed?' },
  { target: q('.edu-build'), kicker: 'Rover path', title: 'Plan a drive between points',
    body: 'Press Plan a rover path, then click points in the order the rover should visit them. A line joins them on the Moon, and a panel checks the drive.',
    how: ['Each card also has Add to rover path.', 'Remove a stop with the × next to it, or Clear path to start again.'],
    tryIt: 'Plan a path from Malapert to Shackleton rim.' },
  { target: q('.edu-path'), kicker: 'Is it possible?', title: 'Battery, sunlight and Earth contact',
    body: 'The rover drives non-stop. The panel says whether the battery lasts, how much of the drive is in sunlight, and how long the rover goes without talking to Earth, using the real Sun and Earth positions for the day you leave.',
    learn: 'When the Sun sets, the solar panels stop and the battery has to run the heaters, computers and radio on its own. A small rover battery lasts hours, but a lunar night can last days.',
    think: 'If a path is not possible, try Find a better day to leave. Why does the start date change the answer?' },
  { target: q('.ui-toggle'), kicker: 'Mode', title: 'Education or Scientific',
    body: 'You are in Education mode: the main ideas in plain words. Scientific is the version mission planners use, with exact numbers, equations and planning tools.' },
  { target: q('.edu-actions'), kicker: 'More', title: 'Drive a rover, and help',
    body: 'Drive a rover is a game: steer NASA\'s RASSOR rover, collect ice and keep it powered and in touch with Earth. The ? button brings this tour back, and the i button explains the data.' },
  { kicker: 'Done', title: 'Now you can be the mission planner',
    body: 'You know the two big questions: is there sunlight for power, and can you talk to Earth? Click around the Moon, plan a path, and decide where you would send a rover.',
    think: 'Challenge: find a path with three stops that is possible.' },
];

const EXPERT: TourStep[] = [
  { kicker: 'Scientific mode', title: 'Site analysis toolkit',
    body: 'Illumination, direct-to-Earth (DTE) visibility, terrain and mission feasibility for lunar landing sites, computed from LOLA topography and a lunar-fixed ephemeris. Each stop names the data and model behind the tool, and its limits.',
    how: ['Next and Back move between stops.', 'Esc or the close button ends the tour at any time.'] },
  { target: q('.ct-tabs'), kicker: 'Workspaces', title: 'Explore, Compare, Calculator, Launch',
    body: 'Explore: one site in depth. Compare: site × epoch scenarios side by side. Calculator: the mission equations, solvable for any variable. Launch: departure windows that put arrival in a good illumination and comms state.',
    keys: [['1 to 4', 'Switch tab']] },
  { target: q('.dash-sites'), kicker: 'Sites card', title: 'Good power, next lunar day',
    body: 'Sites whose power verdict is green over the next synodic cycle (29.53 d from the selected epoch), ranked by sunlit fraction.',
    learn: 'Sunlit means the Sun\'s centre is above the terrain horizon at a 2 m mast. The series is precomputed at 30 min steps over three years per site.',
    tryIt: 'Click a name to open that site; the ↗ button opens the full table.' },
  { target: q('section.moon'), kicker: '3D Moon', title: 'Navigate the globe',
    body: 'LROC WAC colour over LOLA relief, shaded for the selected epoch with cast shadows. Edge arrows point to the Sun and Earth when they are off screen.',
    how: ['Drag to rotate. Click the Moon, then scroll or pinch to zoom.', 'Click: top-down view over the point, and it is probed. Double-click: near-horizontal terrain view.'],
    keys: [['H', 'Whole Moon (same as the Moon button)'], ['Ctrl / ⌘ scroll', 'Zoom without clicking first']],
    learn: 'Heights come from the finest grid loaded under the camera: 5–40 m LOLA site windows at the pole, a 148 m polar cap, 64 px/deg tiles (~474 m), then the global model. The readout names the source in use.' },
  { target: q('.dash-dock'), kicker: 'Dock', title: 'Every panel, one click away',
    body: 'Conditions, Sites, Horizon, Next 30 days, Date slip, Moon vs Earth, Libration & orbit, Calendar, Mission plan (and Compare once two sites are picked) each open as a sheet over the Moon. The tabs across the sheet switch between them; Esc closes it. Below the line: missions, search, about, help and theme.',
    tryIt: 'Hover an icon to see its name.' },
  { target: q('.dash-dock button[aria-label="Sites"]'), kicker: 'Landing sites', title: 'The site table',
    body: 'Now: Sun and Earth above the local skyline at the selected epoch. Rating: power and DTE comms verdicts for the next lunar day (tick green, triangle amber, cross red).',
    learn: 'Rim and summit sites whose published point came from older topography snap to the highest DEM cell within a stated radius (Shackleton rim 600 m, de Gerlache ~1 km). Cited and analysed coordinates are both shown.',
    tryIt: 'Search by name, mission or program.' },
  { target: q('.ui-toggle'), kicker: 'Mode', title: 'Education or Scientific',
    body: 'Education presents the same results in plain language, with a tour that teaches the science, for students and classrooms. Selection and epoch carry over; the 3D view is rebuilt on a switch.' },
  { target: q('.hud-tr'), prep: site, kicker: 'Readout', title: 'Camera and Sun at a glance',
    body: 'Ground sample distance per screen pixel, camera altitude, topocentric Sun elevation and azimuth at the site, and the dataset being drawn.' },
  { target: q('.hud-probe'), prep: site, kicker: 'Probed point', title: 'Probe any point',
    body: 'Height, distance to the selected site, Sun and Earth clearance now, the coming cycle\'s sunlit and DTE fractions, and the longest dark and no-comms stretches.',
    how: ['Compare this point turns it into a site and pairs it with the current one.', 'Plan a launch to here sends it to the launch planner.'],
    learn: 'The skyline is ray-marched over 360° of azimuth out to 150 km with curvature drop, at the resolution of the loaded terrain. Distant massifs matter at grazing Sun angles, which is why the range is long.',
    tryIt: 'Click a spot on the ground to probe it.' },
  { target: q('.hud-bl'), prep: site, kicker: 'Zoom presets', title: 'Moon, 200 km, 10 km',
    body: 'Moon returns to the whole globe and clears the selection. 200 km and 10 km are fixed framings around the selected site; at 10 km individual ridges can be judged against the Sun line.' },
  { target: btn('Display', 'section.moon'), prep: site, kicker: 'Display menu', title: 'Choose what the globe draws',
    body: 'Sun and Earth markers, cast shadows, relief exaggeration (×3 default), procedural sub-grid detail, and the sight lines: green to Earth, yellow to the Sun.',
    learn: 'Procedural detail is cosmetic and drawn only below the DEM resolution; it never feeds a computed number.',
    tryIt: 'Open the menu and switch something off and on.' },
  { target: btn('Rover range', 'section.moon'), prep: site, kicker: 'Rover range', title: 'Terrain-aware traverse reach',
    body: 'Battery capacity, state of charge, reserve, hotel and drive loads, solar input, speed, slope limit and derate, mass, drivetrain efficiency and path detour. Draws the one-way and out-and-back reach boundaries on the terrain.',
    learn: '180 bearings are marched outward; each step costs net power × time at the slope-derated speed plus m·g·Δh / η for climbs, with no regeneration. Slopes are measured at the DEM spacing, so sub-grid obstacles are missed.' },
  { target: btn('Terrain 3D', 'section.moon'), prep: site, kicker: 'Terrain 3D', title: 'The site mesh',
    body: 'LOLA terrain around the site as a solid mesh: radius 5 to 100 km, wireframe and grid, vertical exaggeration up to ×5, orthographic top, front and right views or perspective.' },
  { target: q('.hud-br'), prep: site, kicker: 'View tools', title: 'Remove shadows and Expand',
    body: 'Remove shadows lifts shadow exposure for reading terrain; the computed illumination is unchanged. Expand takes the 3D view full screen.' },
  { target: q('.dash-site'), prep: site, kicker: 'Site card', title: 'The site at a glance',
    body: 'Sunlit fraction of the next lunar day on the ring, Sun and Earth elevation with their ±36 h trend, Earth-in-view fraction, the skyline toward the Sun, and the power and radio ratings. Below: coordinates and elevation, then compare, launch and the equations.' },
  { target: q('.dash-hero'), prep: site, kicker: 'Countdown', title: 'Time to sunset or sunrise',
    body: 'T-minus to the next sunset (or sunrise while dark), with the Sun elevation against the local skyline and the event time in UTC.',
    learn: 'Crossings are located on the 30 min series, then refined by bisection on the live ephemeris to about 30 s.' },
  { target: q('.dash-time'), prep: site, kicker: 'Time bar', title: 'Time controls',
    body: 'Every panel and the globe follow this epoch (UTC). The track shows 12 days of sunlit (white) and Earth-in-view (blue) windows with their events; drag it to move. The speed pill changes playback rate, and the date pill opens the full controls (type a date, step by hours or days).',
    keys: [['Space', 'Play or pause'], ['← →', '1 hour'], ['Shift ← →', '1 day']],
    learn: 'Sun and Earth vectors come from astronomy-engine in the IAU 2015 lunar rotation frame, validated against JPL Horizons to within a few thousandths of a degree.',
    tryIt: 'Press Play and pick a speed.' },
  { target: q('.dash-alert'), prep: site, kicker: 'Earth contact', title: 'Earthset and blackouts',
    body: 'Time to the next Earthset (or Earthrise during a blackout), the share of the lunar day with Earth in view and the longest gap. The button opens the date-slip analysis.' },
  { target: q('.dash-dock button[aria-label="Conditions"]'), prep: site, kicker: 'Conditions', title: 'Power and comms verdicts',
    body: 'Green, amber or red for power and DTE comms over the next lunar day, with the rule that fired.',
    learn: 'Power green: ≥ 70% sunlit and longest dark ≤ 100 h; amber: ≥ 40% or ≤ 200 h. Comms green: ≥ 90% Earth in view and longest gap ≤ 24 h; amber: ≥ 40% or ≤ 120 h. Thresholds live in config/thresholds.ts.' },
  { target: q('.dash-dock button[aria-label="Horizon"]'), prep: site, kicker: 'Horizon', title: 'The skyline from the site',
    body: 'The traced terrain horizon with the Sun and Earth tracks over it. Panorama unrolls 360°, Sky plot is a zenith projection, First person stands at the 2 m observer with true angular sizes, and Shadow map shows lit ground.',
    learn: 'A partly hidden solar disc is resolved: the series stores the visible fraction of the disc, so grazing illumination is not rounded to on or off.',
    tryIt: 'Switch between the four views.' },
  { target: q('.dash-dock button[aria-label="Next 30 days"]'), prep: site, kicker: 'Next 30 days', title: 'Sunlit and Earth-in-view windows',
    body: 'Every sunlit and Earth-visible interval over the next 30 days, and their overlap.',
    learn: 'Earth\'s position in the sky wanders with optical libration (about ±7–8° in longitude and ±6.7° in latitude), which is what opens and closes DTE windows at polar sites.',
    tryIt: 'Click a bar to jump the whole app to that moment.' },
  { target: q('.dash-dock button[aria-label="Date slip"]'), prep: site, kicker: 'Schedule risk', title: 'If the landing date slips',
    body: 'The same verdicts recomputed for later landing dates, showing how much margin a slip costs.' },
  { target: q('.dash-dock button[aria-label="Moon vs Earth"]'), prep: site, kicker: 'Reference', title: 'Moon vs Earth',
    body: 'Day length, temperature swing, sunrise duration and sky at this latitude, against Earth.' },
  { target: q('.dash-dock button[aria-label="Mission plan"]'), prep: site, kicker: 'Detailed analysis', title: 'Four deeper tools',
    body: 'Libration and orbit (export as CSV or JSON), Compare, a day-by-day Calendar over the full data range, and Mission plan for your own power, battery and route parameters.',
    learn: 'Mission plan routes with A* over a 400 m south-polar DEM under the slope limit and simulates battery state along the drive; outside the polar cap it falls back to a straight route with unknown slope.',
    tryIt: 'Open the Calendar tab.' },
  { target: nth('.ct-tabs button', 1), prep: top, kicker: 'Compare tab', title: 'Scenarios side by side',
    body: 'Each column is a site at an epoch, with its horizon, verdicts and countdowns; the table aligns every quantity and marks the best. Add scenario adds a column, Sync dates to A aligns epochs.' },
  { target: nth('.ct-tabs button', 2), prep: top, kicker: 'Calculator tab', title: 'Solve for any variable',
    body: 'Route, terrain, sky, power, visibility and mission equations. Choose an equation and the unknown; Fill from sim copies in the live values.' },
  { target: nth('.ct-tabs button', 3), prep: top, kicker: 'Launch tab', title: 'Departure windows',
    body: 'Launch times from US launch sites whose arrival lands in a good illumination and comms state, for a listed site or any point. See flight path shows the trajectory.' },
  { target: q('.ct-missions'), prep: top, kicker: 'Missions', title: 'Mission comparison',
    body: 'Any two missions, flown or planned, row by row: landing site, sunlight, Earth contact and surface duration.', keys: [['M', 'Open or close']] },
  { target: q('.as-launch'), prep: top, kicker: 'Need help?', title: 'Ask the guide',
    body: 'It reads the live values on screen, explains them, and can drive the app ("open the launch planner").' },
  { target: q('.dash-dock button[aria-label^="Search"], .ct-rail button[aria-label="Search sites and actions"]'), prep: top, kicker: 'Command menu', title: 'Everything from the keyboard',
    body: 'Every site, preset, view and action in one list.', keys: [['⌘ K / Ctrl K', 'Open'], ['?', 'Help']] },
  { target: q('.ct-tutorial'), prep: top, kicker: 'Replay', title: 'Take the tour again',
    body: 'Tutorial brings this tour back whenever you want it. Take the tour in the command menu does the same.' },
  { kicker: 'Done', title: 'Know the limits',
    body: 'Results are as good as the terrain under them: 5–40 m at the polar sites, coarser elsewhere, and custom points use a 400 m grid (mean horizon error 0.1–0.6°, labelled approximate). Spherical Moon, R = 1737.4 km. The About (i) button in the dock lists the data sources and method.' },
];

export const TOUR: Record<Ui, TourStep[]> = { normal: NORMAL, expert: EXPERT };
