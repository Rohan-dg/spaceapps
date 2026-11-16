/**
 * Precompute Sun/Earth visibility series per site from the ephemeris + horizon profiles.
 *   npm run series -- [--start 2027-01-01] [--end 2029-12-31] [--step 30]
 * Writes public/series/<id>.json and public/sites.json (sites merged with horizon metadata),
 * then prints a sanity-check summary.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { bodyFixedGeometry, skyFromGeometry } from '../src/lib/ephemeris';
import { enuBasis } from '../src/lib/geometry';
import { diskVisibleFraction, horizonAt } from '../src/lib/horizon';
import { encodeI16, encodeRuns, encodeU8, type SeriesFile, upFraction, longestGap } from '../src/lib/series';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const START = new Date(arg('start', '2027-01-01') + 'T00:00:00Z');
const END = new Date(arg('end', '2029-12-31') + 'T23:59:59Z');
const STEP_MIN = Number(arg('step', '30'));
const n = Math.floor((END.getTime() - START.getTime()) / (STEP_MIN * 60000)) + 1;

const sitesDoc = JSON.parse(readFileSync('data/sites.json', 'utf8'));
type Hz = { lat: number; lon: number; synthetic: boolean; horizonDeg: number[]; siteHeightM: number; observerHeightM: number; dem: string; demResolutionM: number | null; snappedM: number; maxRangeKm: number };
const sites = sitesDoc.sites.map((s: Record<string, unknown>) => ({ ...s, hz: JSON.parse(readFileSync(`public/horizons/${s.id}.json`, 'utf8')) as Hz }));

console.log(`Ephemeris: ${n} samples, ${START.toISOString()} → ${END.toISOString()}, step ${STEP_MIN} min`);
const t0 = performance.now();
const geoms = new Array(n);
for (let i = 0; i < n; i++) geoms[i] = bodyFixedGeometry(new Date(START.getTime() + i * STEP_MIN * 60000));
console.log(`  geometry in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

mkdirSync('public/series', { recursive: true });
const rows: string[] = [];
const publicSites = [];
const flags: string[] = [];
const info: string[] = [];
for (const s of sites) {
  const site = { lat: s.hz.lat, lon: s.hz.lon, heightM: s.hz.siteHeightM + s.hz.observerHeightM };
  const basis = enuBasis(site);
  const sunEl = new Int16Array(n), earthEl = new Int16Array(n), sunFrac = new Uint8Array(n);
  const sunUp = new Uint8Array(n), earthUp = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const k = skyFromGeometry(geoms[i], site, basis);
    sunEl[i] = Math.round(k.sun.el * 100);
    earthEl[i] = Math.round(k.earth.el * 100);
    const hs = horizonAt(s.hz.horizonDeg, k.sun.az);
    const he = horizonAt(s.hz.horizonDeg, k.earth.az);
    sunFrac[i] = Math.round(diskVisibleFraction(k.sun.el, k.sun.radiusDeg, hs) * 250);
    sunUp[i] = k.sun.el > hs ? 1 : 0;
    earthUp[i] = k.earth.el > he ? 1 : 0;
  }
  const file: SeriesFile = {
    id: s.id, version: 1, start: START.toISOString(), stepMin: STEP_MIN, n, synthetic: !!s.hz.synthetic,
    sunUp: encodeRuns(sunUp), earthUp: encodeRuns(earthUp),
    sunEl: encodeI16(sunEl), earthEl: encodeI16(earthEl), sunFrac: encodeU8(sunFrac),
  };
  writeFileSync(`public/series/${s.id}.json`, JSON.stringify(file));
  const sunPct = upFraction(file.sunUp, 0, n) * 100, earthPct = upFraction(file.earthUp, 0, n) * 100;
  let meanFrac = 0; for (let i = 0; i < n; i++) meanFrac += sunFrac[i]; meanFrac = (meanFrac / n / 250) * 100;
  const gapD = (longestGap(file.sunUp, 0, n).length * STEP_MIN) / 1440;
  const gapE = (longestGap(file.earthUp, 0, n).length * STEP_MIN) / 1440;
  rows.push(`${s.id.padEnd(18)} ${s.region.padEnd(13)} ${sunPct.toFixed(1).padStart(6)} ${meanFrac.toFixed(1).padStart(6)} ${earthPct.toFixed(1).padStart(7)} ${gapD.toFixed(1).padStart(8)} ${gapE.toFixed(1).padStart(8)}`);
  // ---- sanity checks
  const isFloor = /floor|PSR/.test(`${s.id} ${s.name}`);
  if (isFloor && sunPct > 1) flags.push(`${s.id}: crater floor/PSR but ${sunPct.toFixed(1)}% sunlit (expected ≈0)`);
  if (s.region === 'far-side' && earthPct > 0) flags.push(`${s.id}: far side but Earth visible ${earthPct.toFixed(2)}% (expected 0)`);
  // "Highly illuminated" is only expected for rims/ridges within ~1.6° of the pole (Bussey 2010, Mazarico 2011).
  if (s.region === 'south-pole' && !isFloor && /ridge|rim/.test(s.id) && s.hz.lat < -88.4 && sunPct < 50) flags.push(`${s.id}: near-pole rim/ridge only ${sunPct.toFixed(1)}% sunlit (expected high)`);
  if (s.region === 'south-pole' && !isFloor && /ridge|rim/.test(s.id) && s.hz.lat >= -88.4) info.push(`${s.id}: ${(90 + s.hz.lat).toFixed(1)}° from pole: ${sunPct.toFixed(1)}% sunlit (moderate illumination is expected this far out)`);
  if (s.region === 'equatorial' && Math.abs(sunPct - 50) > 3) flags.push(`${s.id}: equatorial site ${sunPct.toFixed(1)}% sunlit (expected ≈50)`);
  publicSites.push({ ...Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'hz')),
    citedLat: s.lat, citedLon: s.lon, lat: s.hz.lat, lon: s.hz.lon, snappedM: s.hz.snappedM,
    siteHeightM: s.hz.siteHeightM, dem: s.hz.dem, demResolutionM: s.hz.demResolutionM, synthetic: !!s.hz.synthetic,
    stats: { sunPct: +sunPct.toFixed(2), sunDiskPct: +meanFrac.toFixed(2), earthPct: +earthPct.toFixed(2) } });
}
writeFileSync('public/sites.json', JSON.stringify({ generated: new Date().toISOString(), range: { start: START.toISOString(), end: END.toISOString(), stepMin: STEP_MIN }, sites: publicSites }, null, 1));

console.log(`\n${'site'.padEnd(18)} ${'region'.padEnd(13)} ${'sun%'.padStart(6)} ${'disk%'.padStart(6)} ${'earth%'.padStart(7)} ${'maxDark'.padStart(8)} ${'maxNoCom'.padStart(8)}   (days; whole range)`);
rows.forEach((r) => console.log(r));
if (info.length) console.log(`\nℹ ${info.join('\n  ')}`);
console.log(flags.length ? `\n⚠ SANITY FLAGS:\n  ${flags.join('\n  ')}` : '\n✓ All sanity checks pass');
console.log(`total ${((performance.now() - t0) / 1000).toFixed(1)} s`);

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
