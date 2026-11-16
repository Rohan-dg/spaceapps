/**
 * Pull every variable for every site in the dataset and test which ones explain the two outcomes the app
 * rates: sunlight (power) and Earth visibility (radio).
 *
 *   npx tsx scripts/site_analysis.ts [--ids connecting-ridge,shackleton-rim,...]
 *
 * Writes data/analysis/{sites_all.csv, horizons.csv, daily_ratings.csv, summary.json} and prints the findings.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { skyAt } from '../src/lib/ephemeris';
import { horizonAt } from '../src/lib/horizon';
import { computeMetrics } from '../src/lib/metrics';
import { longestGap, parseSeries, upCount } from '../src/lib/series';
import { commsVerdict, powerVerdict } from '../src/lib/verdict';

const OUT = 'data/analysis';
mkdirSync(OUT, { recursive: true });
const doc = JSON.parse(readFileSync('public/sites.json', 'utf8'));
// --ids a,b,c limits the analysis to those sites (docs/ANALYSIS.md covers the original 12)
const ids = process.argv.includes('--ids') ? new Set(process.argv[process.argv.indexOf('--ids') + 1].split(',')) : null;
if (ids) doc.sites = doc.sites.filter((s: { id: string }) => ids.has(s.id));
const STEP = 4; // sample every 2 h for the az-dependent statistics (52 608 → 13 152 points per site)

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const pearson = (x: number[], y: number[]) => {
  const mx = mean(x), my = mean(y);
  let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return dx && dy ? n / Math.sqrt(dx * dy) : NaN;
};
const r2 = (x: number) => (isFinite(x) ? x : 0);

type Row = Record<string, number | string | boolean>;
const rows: Row[] = [];
const hzRows: string[] = ['site,az_deg,horizon_deg,horizon_dist_km'];
const daily: string[] = ['site,start_utc,sun_pct,earth_pct,longest_dark_h,longest_no_earth_h,power,comms'];

for (const info of doc.sites) {
  const id = info.id as string;
  const hz = JSON.parse(readFileSync(`public/horizons/${id}.json`, 'utf8'));
  const s = parseSeries(JSON.parse(readFileSync(`public/series/${id}.json`, 'utf8')));
  const site = { lat: hz.lat, lon: hz.lon, heightM: hz.siteHeightM + hz.observerHeightM };
  const H: number[] = hz.horizonDeg;
  H.forEach((h, az) => hzRows.push(`${id},${az},${h},${hz.horizonDistKm?.[az] ?? ''}`));

  // Time series: elevations (all samples) and az-dependent terrain/clearance (every STEP samples).
  const sunEl: number[] = [], earthEl: number[] = [];
  for (let i = 0; i < s.n; i++) { sunEl.push(s.sunEl[i] / 100); earthEl.push(s.earthEl[i] / 100); }
  const sunTerr: number[] = [], earthTerr: number[] = [], sunClr: number[] = [], earthClr: number[] = [];
  let both = 0, bothN = 0;
  for (let i = 0; i < s.n; i += STEP) {
    const k = skyAt(site, new Date(s.t0 + i * s.stepMs));
    const hs = horizonAt(H, k.sun.az), he = horizonAt(H, k.earth.az);
    sunTerr.push(hs); earthTerr.push(he);
    sunClr.push(k.sun.el - hs); earthClr.push(k.earth.el - he);
    if (k.sun.el > hs && k.earth.el > he) both++;
    bothN++;
  }
  const sunPct = (upCount(s.sunUp, 0, s.n) / s.n) * 100;
  const earthPct = (upCount(s.earthUp, 0, s.n) / s.n) * 100;
  const hours = (n: number) => (n * s.stepMs) / 3600_000;
  const sunRises = s.sunUp.length / 2, earthRises = s.earthUp.length / 2;
  const sorted = [...sunEl].sort((a, b) => a - b);

  // Ratings the app would give for every daily start (00:00 UTC) whose 29.5-day window fits in the data.
  const lv = { power: { green: 0, amber: 0, red: 0 }, comms: { green: 0, amber: 0, red: 0 } };
  const end = s.t0 + s.n * s.stepMs - 29.530589 * 86400_000;
  for (let t = s.t0; t <= end; t += 86400_000) {
    const m = computeMetrics(site, H, s, t);
    const p = powerVerdict(m, site, H, s).level, c = commsVerdict(m, site, H, s).level;
    lv.power[p]++; lv.comms[c]++;
    daily.push(`${id},${new Date(t).toISOString().slice(0, 10)},${m.sunPct.toFixed(1)},${m.earthPct.toFixed(1)},${m.longestDarkH.toFixed(1)},${m.longestNoCommH.toFixed(1)},${p},${c}`);
  }
  const nd = lv.power.green + lv.power.amber + lv.power.red;

  rows.push({
    site: id, region: info.region, verify_coord: info.verify,
    // inputs: where the site is
    lat_deg: hz.lat, lon_deg: hz.lon, colatitude_deg: +(90 - Math.abs(hz.lat)).toFixed(3),
    site_height_m: hz.siteHeightM, snapped_m: hz.snappedM ?? 0, dem: hz.dem, dem_res_m: hz.demResolutionM ?? '',
    // inputs: the terrain around it
    horizon_mean_deg: +mean(H).toFixed(3), horizon_max_deg: +Math.max(...H).toFixed(3), horizon_min_deg: +Math.min(...H).toFixed(3), horizon_sd_deg: +sd(H).toFixed(3),
    horizon_pos_frac: +(H.filter((h) => h > 0).length / 360).toFixed(3),
    // inputs: where the Sun and Earth go in its sky (2027-2029)
    sun_el_mean_deg: +mean(sunEl).toFixed(3), sun_el_max_deg: +sorted[sorted.length - 1].toFixed(3), sun_el_min_deg: +sorted[0].toFixed(3),
    earth_el_mean_deg: +mean(earthEl).toFixed(3), earth_el_max_deg: +Math.max(...earthEl).toFixed(3), earth_el_min_deg: +Math.min(...earthEl).toFixed(3),
    // derived: terrain in the direction the body actually is
    terrain_toward_sun_mean_deg: +mean(sunTerr).toFixed(3), terrain_toward_earth_mean_deg: +mean(earthTerr).toFixed(3),
    sun_clearance_mean_deg: +mean(sunClr).toFixed(3), earth_clearance_mean_deg: +mean(earthClr).toFixed(3),
    // outcomes over the full 3 years
    sun_pct: +sunPct.toFixed(2), earth_pct: +earthPct.toFixed(2), both_pct: +((both / bothN) * 100).toFixed(2),
    longest_dark_h: +hours(longestGap(s.sunUp, 0, s.n).length).toFixed(1), longest_no_earth_h: +hours(longestGap(s.earthUp, 0, s.n).length).toFixed(1),
    sunrises: sunRises, earthrises: earthRises,
    // outcomes as the app rates them (share of daily starts)
    power_green_pct: +((lv.power.green / nd) * 100).toFixed(1), power_amber_pct: +((lv.power.amber / nd) * 100).toFixed(1), power_red_pct: +((lv.power.red / nd) * 100).toFixed(1),
    comms_green_pct: +((lv.comms.green / nd) * 100).toFixed(1), comms_amber_pct: +((lv.comms.amber / nd) * 100).toFixed(1), comms_red_pct: +((lv.comms.red / nd) * 100).toFixed(1),
    // check: the clearance sign alone reproduces the stored visibility
    check_sun_pct_from_clearance: +((sunClr.filter((c) => c > 0).length / sunClr.length) * 100).toFixed(2),
    check_earth_pct_from_clearance: +((earthClr.filter((c) => c > 0).length / earthClr.length) * 100).toFixed(2),
  });
  process.stderr.write(`${id} done\n`);
}

const cols = Object.keys(rows[0]);
const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
writeFileSync(`${OUT}/sites_all.csv`, csv + '\n');
writeFileSync(`${OUT}/horizons.csv`, hzRows.join('\n') + '\n');
writeFileSync(`${OUT}/daily_ratings.csv`, daily.join('\n') + '\n');

// Which variable explains each outcome? Pearson r over all sites and over the 9 polar sites.
const candidates = ['lat_deg', 'colatitude_deg', 'lon_deg', 'site_height_m', 'horizon_mean_deg', 'horizon_max_deg', 'horizon_sd_deg',
  'sun_el_max_deg', 'sun_el_mean_deg', 'earth_el_mean_deg', 'terrain_toward_sun_mean_deg', 'terrain_toward_earth_mean_deg',
  'sun_clearance_mean_deg', 'earth_clearance_mean_deg'];
const subsets = { all: rows, polar: rows.filter((r) => r.region === 'south-pole') };
const corr: Record<string, Record<string, Record<string, number>>> = {};
for (const outcome of ['sun_pct', 'earth_pct']) {
  corr[outcome] = {};
  for (const [name, set] of Object.entries(subsets)) {
    corr[outcome][name] = {};
    const y = set.map((r) => r[outcome] as number);
    for (const c of candidates) corr[outcome][name][c] = +r2(pearson(set.map((r) => r[c] as number), y)).toFixed(3);
  }
}
writeFileSync(`${OUT}/summary.json`, JSON.stringify({ generated: new Date().toISOString(), range: doc.range, sites: rows, correlations: corr }, null, 1));

console.table(rows.map((r) => ({ site: r.site, lat: r.lat_deg, hgt_m: r.site_height_m, hz_mean: r.horizon_mean_deg, sunMax: r.sun_el_max_deg, sunClr: r.sun_clearance_mean_deg, sun: r.sun_pct, earthEl: r.earth_el_mean_deg, earthClr: r.earth_clearance_mean_deg, earth: r.earth_pct, both: r.both_pct })));
for (const o of Object.keys(corr)) {
  console.log(`\nPearson r vs ${o}`);
  console.table(Object.fromEntries(candidates.map((c) => [c, { all: corr[o].all[c], polar: corr[o].polar[c] }])));
}
console.table(rows.map((r) => ({ site: r.site, sun_pct: r.sun_pct, sun_from_clearance: r.check_sun_pct_from_clearance, earth_pct: r.earth_pct, earth_from_clearance: r.check_earth_pct_from_clearance })));

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 2 commits), under the team's direction. Attribution from the commit history.
