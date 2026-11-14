/** Calculator equations. Each one ties to the mission-variable table by its "#" numbers. */
import { MOON_RADIUS_KM } from './geometry';
import { DEFAULT_PLAN, SIGMA, SOLAR_CONSTANT } from './mission';
import type { Equation } from './solver';

const D = Math.PI / 180;
const LUNAR_DAY_H = 29.530589 * 24;

export const EQUATIONS: Equation[] = [
  {
    id: 'travel', group: 'Route & rover', title: 'Travel time', covers: [1, 6, 20],
    formula: 'D = v × t', about: 'Distance covered at a steady speed.',
    vars: [
      { key: 'D', label: 'Travel distance', unit: 'km', min: 0, max: 10000, def: 8, sim: 'routeKm' },
      { key: 'v', label: 'Rover speed', unit: 'km/h', min: 0.0001, max: 100, def: 0.5, sim: 'avgSpeed', hint: 'Average speed over the route' },
      { key: 't', label: 'Travel time', unit: 'h', min: 0, max: 100000, def: 16, sim: 'travelH' },
    ],
    f: (v) => [v.D, v.v * v.t],
  },
  {
    id: 'slope-speed', group: 'Route & rover', title: 'Speed on a slope', covers: [18, 20],
    formula: 'v = v₀ × (1 − k × θ / θmax)', about: 'The app slows the rover linearly with slope, down to (1 − k)·v₀ at the slope limit.',
    vars: [
      { key: 'v', label: 'Speed on the slope', unit: 'km/h', min: 0, max: 100, def: 0.375 },
      { key: 'v0', label: 'Speed on flat ground', unit: 'km/h', min: 0.0001, max: 100, def: DEFAULT_PLAN.speedKmH, sim: 'speed' },
      { key: 'k', label: 'Speed lost at the limit', unit: 'fraction', min: 0, max: 0.95, def: DEFAULT_PLAN.slopeDerate, sim: 'derate' },
      { key: 'th', label: 'Terrain slope', unit: '°', min: 0, max: 90, def: 7.5, sim: 'meanSlope' },
      { key: 'thMax', label: 'Slope limit', unit: '°', min: 0.1, max: 90, def: DEFAULT_PLAN.maxSlopeDeg, sim: 'maxSlopeLimit' },
    ],
    f: (v) => [v.v, v.v0 * (1 - v.k * Math.min(1, v.th / v.thMax))],
  },
  {
    id: 'slope', group: 'Terrain', title: 'Terrain slope', covers: [18],
    formula: 'θ = atan(Δh / Δd)', about: 'Slope from a height change over a horizontal distance.',
    vars: [
      { key: 'th', label: 'Terrain slope', unit: '°', min: 0, max: 89.9, def: 10 },
      { key: 'dh', label: 'Height change', unit: 'm', min: 0, max: 20000, def: 70.5 },
      { key: 'dd', label: 'Horizontal distance', unit: 'm', min: 0.01, max: 1e6, def: 400, sim: 'demRes' },
    ],
    f: (v) => [Math.tan(v.th * D), v.dh / v.dd],
  },
  {
    id: 'sun-clear', group: 'Sky', title: 'Sun terrain clearance', covers: [3, 11, 14],
    formula: 'C☉ = el☉ − h(az☉)', about: 'How far the Sun’s centre sits above the skyline in its direction. Positive means sunlit.',
    vars: [
      { key: 'C', label: 'Sun terrain clearance', unit: '°', min: -180, max: 180, def: 0.5, sim: 'sunClear' },
      { key: 'el', label: 'Sun elevation', unit: '°', min: -90, max: 90, def: 1, sim: 'sunEl' },
      { key: 'h', label: 'Terrain horizon angle toward the Sun', unit: '°', min: -90, max: 90, def: 0.5, sim: 'sunHz' },
    ],
    f: (v) => [v.C, v.el - v.h],
  },
  {
    id: 'earth-clear', group: 'Sky', title: 'Earth terrain clearance', covers: [4, 11, 15],
    formula: 'C⊕ = el⊕ − h(az⊕)', about: 'How far Earth’s centre sits above the skyline in its direction. Positive means a direct radio link is possible.',
    vars: [
      { key: 'C', label: 'Earth terrain clearance', unit: '°', min: -180, max: 180, def: 2, sim: 'earthClear' },
      { key: 'el', label: 'Earth elevation', unit: '°', min: -90, max: 90, def: 3, sim: 'earthEl' },
      { key: 'h', label: 'Terrain horizon angle toward Earth', unit: '°', min: -90, max: 90, def: 1, sim: 'earthHz' },
    ],
    f: (v) => [v.C, v.el - v.h],
  },
  {
    id: 'ridge', group: 'Terrain', title: 'Horizon angle of a ridge', covers: [10, 11, 31],
    formula: 'h = atan((H_ridge − H_site − H_obs − d²/2R) / d)', about: 'Elevation angle of a distant peak, with the drop from lunar curvature (R = 1737.4 km).',
    vars: [
      { key: 'h', label: 'Terrain horizon angle', unit: '°', min: -89, max: 89, def: 1.2 },
      { key: 'Hr', label: 'Ridge height', unit: 'm', min: -20000, max: 20000, def: 2500 },
      { key: 'Hs', label: 'Terrain elevation at the site', unit: 'm', min: -20000, max: 20000, def: 1900, sim: 'siteH' },
      { key: 'Ho', label: 'Observer height', unit: 'm', min: 0, max: 10000, def: 2, sim: 'obsH' },
      { key: 'd', label: 'Distance to the ridge', unit: 'km', min: 0.001, max: 2000, def: 20 },
    ],
    f: (v) => [Math.tan(v.h * D), (v.Hr - v.Hs - v.Ho - (v.d * v.d * 1000) / (2 * MOON_RADIUS_KM)) / (v.d * 1000)],
  },
  {
    id: 'horizon-dist', group: 'Terrain', title: 'Distance to a flat horizon', covers: [31],
    formula: 'd = √(2 R H_obs)', about: 'How far an observer can see across a smooth sphere. A taller mast sees further.',
    vars: [
      { key: 'd', label: 'Horizon distance', unit: 'km', min: 0, max: 2000, def: 2.64 },
      { key: 'Ho', label: 'Observer height', unit: 'm', min: 0, max: 100000, def: 2, sim: 'obsH' },
    ],
    f: (v) => [v.d * v.d, (2 * MOON_RADIUS_KM * v.Ho) / 1000],
  },
  {
    id: 'res', group: 'Terrain', title: 'Angular resolution of the terrain', covers: [32],
    formula: 'δ = atan(res / d)', about: 'Smallest terrain feature, as an angle, that a DEM can resolve at a distance. Nearby terrain dominates horizon errors.',
    vars: [
      { key: 'del', label: 'Angular resolution', unit: '°', min: 0, max: 89.9, def: 0.46 },
      { key: 'res', label: 'Terrain data resolution', unit: 'm/px', min: 0.01, max: 100000, def: 40, sim: 'demRes' },
      { key: 'd', label: 'Distance', unit: 'km', min: 0.001, max: 2000, def: 5 },
    ],
    f: (v) => [Math.tan(v.del * D), v.res / (v.d * 1000)],
  },
  {
    id: 'solar', group: 'Power', title: 'Solar power generation', covers: [22],
    formula: 'P = A × η × S × f × cos(el)', about: 'Output of a vertical panel facing the Sun (cos el = 1 for a two-axis tracker). f is the share of the Sun’s disk above the skyline.',
    vars: [
      { key: 'P', label: 'Solar power', unit: 'W', min: 0, max: 1e7, def: 816, sim: 'powerW' },
      { key: 'A', label: 'Panel area', unit: 'm²', min: 0.0001, max: 10000, def: DEFAULT_PLAN.panelM2, sim: 'panelM2' },
      { key: 'eta', label: 'Panel efficiency', unit: '%', min: 0.01, max: 100, def: DEFAULT_PLAN.panelEffPct, sim: 'panelEff' },
      { key: 'S', label: 'Solar irradiance', unit: 'W/m²', min: 1, max: 5000, def: SOLAR_CONSTANT },
      { key: 'f', label: 'Visible Sun disk', unit: '%', min: 0, max: 100, def: 100, sim: 'sunFrac' },
      { key: 'el', label: 'Sun elevation', unit: '°', min: -90, max: 90, def: 1.5, sim: 'sunEl' },
    ],
    f: (v) => [v.P, v.A * (v.eta / 100) * v.S * (v.f / 100) * Math.max(0, Math.cos(v.el * D))],
  },
  {
    id: 'battery', group: 'Power', title: 'Battery level after a period', covers: [21, 22],
    formula: 'B = B₀ + (P_gen − P_load) × t / C × 100', about: 'Battery percentage after t hours of steady generation and load (no clamping at 0 or 100%).',
    vars: [
      { key: 'B', label: 'Battery level after', unit: '%', min: -1000, max: 1000, def: 70 },
      { key: 'B0', label: 'Battery level before', unit: '%', min: -1000, max: 1000, def: 100, sim: 'battPct' },
      { key: 'Pg', label: 'Solar power', unit: 'W', min: 0, max: 1e6, def: 0, sim: 'powerW' },
      { key: 'Pl', label: 'Load', unit: 'W', min: 0, max: 1e6, def: 400, sim: 'loadW' },
      { key: 't', label: 'Time', unit: 'h', min: 0, max: 100000, def: 3 },
      { key: 'C', label: 'Battery capacity', unit: 'Wh', min: 1, max: 1e8, def: DEFAULT_PLAN.batteryWh, sim: 'batteryWh' },
    ],
    f: (v) => [v.B, v.B0 + ((v.Pg - v.Pl) * v.t * 100) / v.C],
  },
  {
    id: 'survive', group: 'Power', title: 'Surviving the dark', covers: [16, 21],
    formula: 'C × DoD = P_load × t_dark', about: 'Battery needed to ride out the longest dark spell, given how deep you are willing to discharge it.',
    vars: [
      { key: 'C', label: 'Battery capacity', unit: 'Wh', min: 1, max: 1e9, def: DEFAULT_PLAN.batteryWh, sim: 'batteryWh' },
      { key: 'DoD', label: 'Usable depth of discharge', unit: '%', min: 0.1, max: 100, def: 80, sim: 'dod' },
      { key: 'Pl', label: 'Load while dark', unit: 'W', min: 0, max: 1e6, def: DEFAULT_PLAN.hotelW, sim: 'hotelW' },
      { key: 't', label: 'Darkness duration', unit: 'h', min: 0, max: 100000, def: 21, sim: 'darkH' },
    ],
    f: (v) => [v.C * (v.DoD / 100), v.Pl * v.t],
  },
  {
    id: 'range', group: 'Power', title: 'Driving range on one charge', covers: [1, 20, 21, 22],
    formula: 'D = v × C × DoD / (P_drive + P_hotel − P_gen)', about: 'How far the rover gets before the battery reaches its reserve, when the load exceeds generation.',
    vars: [
      { key: 'D', label: 'Range', unit: 'km', min: 0, max: 1e6, def: 4.8 },
      { key: 'v', label: 'Rover speed', unit: 'km/h', min: 0.0001, max: 100, def: DEFAULT_PLAN.speedKmH, sim: 'speed' },
      { key: 'C', label: 'Battery capacity', unit: 'Wh', min: 1, max: 1e8, def: DEFAULT_PLAN.batteryWh, sim: 'batteryWh' },
      { key: 'DoD', label: 'Usable depth of discharge', unit: '%', min: 0.1, max: 100, def: 80, sim: 'dod' },
      { key: 'Pd', label: 'Drive load', unit: 'W', min: 0, max: 1e6, def: DEFAULT_PLAN.driveW, sim: 'driveW' },
      { key: 'Ph', label: 'Hotel load', unit: 'W', min: 0, max: 1e6, def: DEFAULT_PLAN.hotelW, sim: 'hotelW' },
      { key: 'Pg', label: 'Solar power', unit: 'W', min: 0, max: 1e6, def: 0, sim: 'powerW' },
    ],
    f: (v) => [v.D * (v.Pd + v.Ph - v.Pg), v.v * v.C * (v.DoD / 100)],
  },
  {
    id: 'availability', group: 'Visibility', title: 'Availability percentage', covers: [12, 13, 30],
    formula: 'p = t_visible / t_total × 100', about: 'Works for sunlight, Earth visibility, or both at once. A lunar day is 708.7 h.',
    vars: [
      { key: 'p', label: 'Availability', unit: '%', min: 0, max: 100, def: 80, sim: 'sunPct' },
      { key: 'tv', label: 'Time visible', unit: 'h', min: 0, max: 1e6, def: 567 },
      { key: 'tt', label: 'Total time', unit: 'h', min: 0.001, max: 1e6, def: +LUNAR_DAY_H.toFixed(1) },
    ],
    f: (v) => [v.p * v.tt, v.tv * 100],
  },
  {
    id: 'duration', group: 'Mission', title: 'Mission duration in lunar days', covers: [9],
    formula: 'T = N × 29.53 d', about: 'Convert a mission length to lunar days (one full light–dark cycle).',
    vars: [
      { key: 'T', label: 'Mission duration', unit: 'days', min: 0, max: 1e5, def: DEFAULT_PLAN.durationDays, sim: 'durationDays' },
      { key: 'N', label: 'Lunar days', unit: 'cycles', min: 0, max: 1e4, def: 0.474 },
    ],
    f: (v) => [v.T, v.N * 29.530589],
  },
  {
    id: 'temp', group: 'Terrain', title: 'Surface temperature (sunlit)', covers: [28],
    formula: 'T = ((1 − a) S sin(el) / (ε σ))^¼', about: 'Radiative-equilibrium temperature of flat ground lit at elevation el. Ignores heat stored in the soil, so it overstates swings.',
    vars: [
      { key: 'T', label: 'Terrain temperature', unit: 'K', min: 1, max: 1000, def: 140 },
      { key: 'a', label: 'Albedo', unit: 'fraction', min: 0, max: 0.99, def: 0.12 },
      { key: 'S', label: 'Solar irradiance', unit: 'W/m²', min: 1, max: 5000, def: SOLAR_CONSTANT },
      { key: 'el', label: 'Sun elevation', unit: '°', min: 0, max: 90, def: 1.5, sim: 'sunEl' },
      { key: 'eps', label: 'Emissivity', unit: 'fraction', min: 0.01, max: 1, def: 0.95 },
    ],
    f: (v) => [v.eps * SIGMA * v.T ** 4, (1 - v.a) * v.S * Math.max(0, Math.sin(v.el * D))],
  },
  {
    id: 'gc', group: 'Route & rover', title: 'Distance between two points', covers: [1, 5, 7, 8],
    formula: 'D = 2R asin √(sin²(Δφ/2) + cos φ₁ cos φ₂ sin²(Δλ/2))', about: 'Straight-line (great-circle) distance over the Moon’s surface. Solving for a coordinate can give two answers.',
    vars: [
      { key: 'D', label: 'Travel distance (direct)', unit: 'km', min: 0, max: 5459, def: 8, sim: 'directKm' },
      { key: 'lat1', label: 'Landing latitude', unit: '°', min: -90, max: 90, def: -89.45, sim: 'lat' },
      { key: 'lon1', label: 'Landing longitude', unit: '° E', min: -360, max: 360, def: 222.7, sim: 'lon' },
      { key: 'lat2', label: 'Destination latitude', unit: '°', min: -90, max: 90, def: -89.3, sim: 'destLat' },
      { key: 'lon2', label: 'Destination longitude', unit: '° E', min: -360, max: 360, def: 230, sim: 'destLon' },
    ],
    f: (v) => {
      const φ1 = v.lat1 * D, φ2 = v.lat2 * D, h = Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(((v.lon2 - v.lon1) * D) / 2) ** 2;
      return [v.D, 2 * MOON_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))];
    },
  },
];
