/**
 * Compare our Sun/Earth topocentric az/el with JPL Horizons (DE441, Moon MEAN_ME frame)
 * for lunar-surface observers.  Run:  npm run validate
 * Horizons API: https://ssd.jpl.nasa.gov/api/horizons.api  (docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html)
 * Observer on the Moon: CENTER='coord@301', COORD_TYPE='GEODETIC', SITE_COORD='Elon,lat,alt_km'.
 */
import { skyAt } from '../src/lib/ephemeris';
import { wrap360 } from '../src/lib/geometry';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
// 10 site/time points (5 sites × 2 times), chosen to span pole, mid-latitude, equator, far side.
const POINTS: { name: string; lat: number; lon: number; times: string[] }[] = [
  { name: 'Shackleton ridge', lat: -89.45, lon: 222.69, times: ['2027-03-01 00:00', '2027-09-15 12:00'] },
  { name: 'Malapert massif', lat: -85.99, lon: 2.93, times: ['2028-01-10 06:00', '2028-06-20 18:00'] },
  { name: 'de Gerlache rim', lat: -88.5, lon: 291.0, times: ['2027-12-01 00:00', '2029-04-05 03:30'] },
  { name: 'Apollo 11', lat: 0.67408, lon: 23.47297, times: ['2027-05-05 00:00', '2028-11-11 11:00'] },
  { name: 'Far side (Korolev)', lat: -4.0, lon: 202.5, times: ['2027-07-07 07:00', '2029-02-14 20:00'] },
];

async function horizons(target: '10' | '399', lat: number, lon: number, times: string[]) {
  const lonE = wrap360(lon);
  const p = new URLSearchParams({
    format: 'text', COMMAND: `'${target}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'", COORD_TYPE: "'GEODETIC'", SITE_COORD: `'${lonE},${lat},0'`,
    TLIST: times.map((t) => `'${t}'`).join(' '), TIME_TYPE: "'UT'", QUANTITIES: "'4'",
    ANG_FORMAT: "'DEG'", EXTRA_PREC: "'YES'", APPARENT: "'AIRLESS'",
  });
  const res = await fetch(`${API}?${p}`);
  const txt = await res.text();
  const body = txt.split('$$SOE')[1]?.split('$$EOE')[0];
  if (!body) throw new Error(`Horizons parse failure:\n${txt.slice(0, 2000)}`);
  return body.trim().split('\n').map((line) => {
    const nums = line.trim().split(/\s+/).slice(-2).map(Number);
    return { az: nums[0], el: nums[1] };
  });
}

const angDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

async function main() {
  const rows: string[] = [];
  let maxEl = 0, maxAz = 0;
  for (const s of POINTS) {
    const [hs, he] = [await horizons('10', s.lat, s.lon, s.times), await horizons('399', s.lat, s.lon, s.times)];
    s.times.forEach((t, i) => {
      const ours = skyAt({ lat: s.lat, lon: s.lon }, new Date(t.replace(' ', 'T') + ':00Z'));
      for (const [label, h, o] of [['Sun', hs[i], ours.sun], ['Earth', he[i], ours.earth]] as const) {
        const dAz = angDiff(o.az, h.az), dEl = o.el - h.el;
        // azimuth error matters less near zenith; scale by cos(el) for an on-sky error
        const dAzSky = dAz * Math.cos((h.el * Math.PI) / 180);
        maxEl = Math.max(maxEl, Math.abs(dEl)); maxAz = Math.max(maxAz, Math.abs(dAzSky));
        rows.push(`| ${s.name} | ${t} | ${label} | ${h.az.toFixed(4)} | ${h.el.toFixed(4)} | ${o.az.toFixed(4)} | ${o.el.toFixed(4)} | ${dAz.toFixed(4)} | ${dEl.toFixed(4)} |`);
      }
    });
  }
  console.log('| Site | UT | Body | Horizons az | Horizons el | Ours az | Ours el | Δaz (°) | Δel (°) |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  rows.forEach((r) => console.log(r));
  console.log(`\nMax |Δel| = ${maxEl.toFixed(4)}°, max |Δaz·cos el| = ${maxAz.toFixed(4)}°`);
}
main().catch((e) => { console.error(e); process.exit(1); });
