/// <reference lib="webworker" />
/**
 * Any point on the Moon: trace its terrain skyline, then mark when the Sun and Earth are above it for the
 * whole data range. Near the south pole (south of 80.5°S) the skyline comes from a 400 m/px LOLA polar DEM;
 * everywhere else from the global LOLA height map the 3D view uses (4096 x 2048, about 2.7 km/px).
 */
import { bodyFixedGeometry, skyFromGeometry, type BodyFixedGeometry } from '../lib/ephemeris';
import { enuBasis } from '../lib/geometry';
import { horizonAt } from '../lib/horizon';
import { sampleEq, type EqGrid } from '../lib/moon/frames';
import { horizonFrom } from '../lib/moon/probe';
import { computeHorizon, type PolarDem } from '../lib/raymarch';
import { decodeI16, encodeRuns } from '../lib/series';

export interface CustomRequest {
  lat: number; lon: number; demUrl: string; start: string; n: number; stepMin: number;
  /** Height of the panels / antenna above the ground, m (default 2). */
  mastM?: number;
  eq: { url: string; hMin: number; quantum: number };
}
export const POLAR_LIMIT = -80.5;

let dem: PolarDem | null = null;
let eq: EqGrid | null = null;
let geomKey = '';
let geoms: BodyFixedGeometry[] = [];

async function loadEq(q: CustomRequest['eq']): Promise<EqGrid> {
  const r = await fetch(q.url);
  if (!r.ok) throw new Error(`Global terrain: HTTP ${r.status}`);
  const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  const px = g.getImageData(0, 0, bmp.width, bmp.height).data;
  const h = new Float32Array(bmp.width * bmp.height);
  for (let i = 0, j = 0; i < h.length; i++, j += 4) h[i] = q.hMin + (px[j] * 256 + px[j + 1]) * q.quantum;
  const out = { h, w: bmp.width, hgt: bmp.height };
  bmp.close();
  return out;
}

self.onmessage = async (e: MessageEvent<CustomRequest>) => {
  const q = e.data;
  try {
    let hz: { horizonDeg: number[]; siteHeightM: number; horizonDistKm: number[] | null; resM: number; source: string };
    if (q.lat < POLAR_LIMIT) {
      if (!dem) {
        self.postMessage({ progress: 'Fetching 400 m polar terrain (6 MB)…' });
        const meta = await fetch(q.demUrl).then((r) => r.json());
        dem = { data: decodeI16(meta.data), size: meta.size, resM: meta.resM, scaleFactor: meta.scaleFactor };
      }
      self.postMessage({ progress: 'Tracing the skyline…' });
      const h = computeHorizon(dem, q.lat, q.lon, q.mastM ?? 2, 150);
      hz = { horizonDeg: h.horizonDeg, siteHeightM: h.siteHeightM, horizonDistKm: h.horizonDistKm, resM: dem.resM, source: 'LDEM_80S_40M → 400 m (in-browser)' };
    } else {
      if (!eq) { self.postMessage({ progress: 'Fetching global LOLA terrain (10 MB)…' }); eq = await loadEq(q.eq); }
      self.postMessage({ progress: 'Tracing the skyline…' });
      const grid = eq, resM = (Math.PI * 1737400) / grid.hgt;
      const H = (la: number, lo: number) => sampleEq(grid, la, lo);
      const h0 = H(q.lat, q.lon);
      hz = { horizonDeg: horizonFrom(H, q.lat, q.lon, h0, resM, 150, q.mastM ?? 2).map((v) => Math.round(v * 1000) / 1000), siteHeightM: h0, horizonDistKm: null, resM, source: `LOLA global, ${(resM / 1000).toFixed(1)} km/px (in-browser)` };
    }
    const key = `${q.start}|${q.n}|${q.stepMin}`;
    if (key !== geomKey) {
      geoms = [];
      const t0 = Date.parse(q.start);
      for (let i = 0; i < q.n; i++) {
        geoms.push(bodyFixedGeometry(new Date(t0 + i * q.stepMin * 60000)));
        if (i % 5000 === 0) self.postMessage({ progress: `Working out Sun and Earth positions: ${Math.round((i / q.n) * 100)}%` });
      }
      geomKey = key;
    }
    self.postMessage({ progress: 'Marking when each is in view…' });
    const site = { lat: q.lat, lon: q.lon, heightM: hz.siteHeightM + (q.mastM ?? 2) };
    const basis = enuBasis(site);
    const sunEl = new Int16Array(q.n), earthEl = new Int16Array(q.n), sunFrac = new Uint8Array(q.n);
    const sunUp = new Uint8Array(q.n), earthUp = new Uint8Array(q.n);
    for (let i = 0; i < q.n; i++) {
      const k = skyFromGeometry(geoms[i], site, basis);
      sunEl[i] = Math.round(k.sun.el * 100); earthEl[i] = Math.round(k.earth.el * 100);
      sunUp[i] = k.sun.el > horizonAt(hz.horizonDeg, k.sun.az) ? 1 : 0;
      earthUp[i] = k.earth.el > horizonAt(hz.horizonDeg, k.earth.az) ? 1 : 0;
      sunFrac[i] = sunUp[i] * 250;
    }
    self.postMessage({ done: { hz, sunEl, earthEl, sunFrac, sunUp: encodeRuns(sunUp), earthUp: encodeRuns(earthUp) } }, [sunEl.buffer, earthEl.buffer, sunFrac.buffer]);
  } catch (err) {
    self.postMessage({ error: String((err as Error).message ?? err) });
  }
};

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 5 commits), under the team's direction. Attribution from the commit history.
