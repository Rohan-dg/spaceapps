/** Compute any point on the Moon as a site (skyline + Sun/Earth series) in a Web Worker, on the main-thread side. */
import { registerSite, type SiteData, type SitesDoc } from './data';
import { upFraction, type Series } from './series';
import type { CustomRequest } from '../workers/customSite';

let worker: Worker | null = null;
let queue: Promise<unknown> = Promise.resolve();

export const fmtLatLon = (lat: number, lon: number) => {
  const l = ((lon % 360) + 360) % 360;
  return `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'} ${l > 180 ? `${(360 - l).toFixed(3)}°W` : `${l.toFixed(3)}°E`}`;
};

export function validateLatLon(lat: number, lon: number): string | null {
  if (!isFinite(lat) || lat < -90 || lat > 90) return 'Latitude has to be between −90 and 90.';
  if (!isFinite(lon) || lon < -180 || lon > 360) return 'Longitude has to be between −180 and 360 (east positive).';
  return null;
}

/** Runs one point at a time; resolves with a registered SiteData. */
export function computeSite(doc: SitesDoc, lat: number, lon: number, onProgress: (msg: string) => void, mastM = 2): Promise<SiteData> {
  const run = () => new Promise<SiteData>((resolve, reject) => {
    worker ??= new Worker(new URL('../workers/customSite.ts', import.meta.url), { type: 'module' });
    const stepMin = doc.range.stepMin;
    const n = Math.floor((Date.parse(doc.range.end) - Date.parse(doc.range.start)) / (stepMin * 60000)) + 1;
    const base = new URL(import.meta.env.BASE_URL, location.href).href;
    const req: CustomRequest = {
      lat, lon, mastM, demUrl: `${base}dem/south_polar_400m.json`, start: doc.range.start, n, stepMin,
      eq: { url: `${base}moon/height_4k.png`, hMin: -8982, quantum: 4 },
    };
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.progress) onProgress(m.progress);
      if (m.error) reject(new Error(m.error));
      if (m.done) {
        const { hz, sunEl, earthEl, sunFrac, sunUp, earthUp } = m.done;
        const id = `custom_${lat.toFixed(3)}_${(((lon % 360) + 360) % 360).toFixed(3)}${mastM !== 2 ? `_m${mastM}` : ''}`;
        const series: Series = { id, t0: Date.parse(doc.range.start), stepMs: stepMin * 60000, n, synthetic: false, sunUp, earthUp, sunEl, earthEl, sunFrac };
        const res = Math.round(hz.resM);
        const name = fmtLatLon(lat, lon);
        const d: SiteData = {
          info: {
            id, name: `Point ${name}`, short: name.replace(/\.(\d)\d+/g, '.$1'),
            lat, lon, citedLat: lat, citedLon: lon, snappedM: 0, region: lat < -80.5 ? 'south-pole' : 'global', mission: 'Any point on the Moon (approximate)',
            description: `Skyline traced in your browser on ${hz.source}. Approximate: coarser than the 40 m data behind the listed sites${res > 1000 ? ', so small hills and crater rims closer than a few km are missed' : ''}.`,
            source: 'User input', verify: false, siteHeightM: hz.siteHeightM, dem: hz.source, demResolutionM: res, synthetic: false, approximate: true,
            stats: { sunPct: upFraction(sunUp, 0, n) * 100, sunDiskPct: NaN, earthPct: upFraction(earthUp, 0, n) * 100 },
          },
          horizon: { id, lat, lon, synthetic: false, dem: hz.source, demResolutionM: res, siteHeightM: hz.siteHeightM, observerHeightM: mastM, maxRangeKm: 150, horizonDeg: hz.horizonDeg, horizonDistKm: hz.horizonDistKm },
          series,
        };
        registerSite(d);
        resolve(d);
      }
    };
    worker.postMessage(req);
  });
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}
