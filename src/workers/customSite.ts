/// <reference lib="webworker" />
import { bodyFixedGeometry, skyFromGeometry, type BodyFixedGeometry } from '../lib/ephemeris';
import { enuBasis } from '../lib/geometry';
import { horizonAt } from '../lib/horizon';
import { computeHorizon, type PolarDem } from '../lib/raymarch';
import { decodeI16, encodeRuns } from '../lib/series';

export interface CustomRequest { lat: number; lon: number; demUrl: string; start: string; n: number; stepMin: number }

let dem: PolarDem | null = null;
let geomKey = '';
let geoms: BodyFixedGeometry[] = [];

self.onmessage = async (e: MessageEvent<CustomRequest>) => {
  const q = e.data;
  try {
    if (!dem) {
      self.postMessage({ progress: 'Fetching 400 m terrain (6 MB)…' });
      const meta = await fetch(q.demUrl).then((r) => r.json());
      dem = { data: decodeI16(meta.data), size: meta.size, resM: meta.resM, scaleFactor: meta.scaleFactor };
    }
    self.postMessage({ progress: 'Tracing the skyline…' });
    const hz = computeHorizon(dem, q.lat, q.lon, 2, 150);
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
    const site = { lat: q.lat, lon: q.lon, heightM: hz.siteHeightM + 2 };
    const basis = enuBasis(site);
    const sunEl = new Int16Array(q.n), earthEl = new Int16Array(q.n), sunFrac = new Uint8Array(q.n);
    const sunUp = new Uint8Array(q.n), earthUp = new Uint8Array(q.n);
    for (let i = 0; i < q.n; i++) {
      const k = skyFromGeometry(geoms[i], site, basis);
      sunEl[i] = Math.round(k.sun.el * 100); earthEl[i] = Math.round(k.earth.el * 100);
      const hs = horizonAt(hz.horizonDeg, k.sun.az);
      sunUp[i] = k.sun.el > hs ? 1 : 0;
      earthUp[i] = k.earth.el > horizonAt(hz.horizonDeg, k.earth.az) ? 1 : 0;
      sunFrac[i] = sunUp[i] * 250;
    }
    self.postMessage({ done: { hz, sunEl, earthEl, sunFrac, sunUp: encodeRuns(sunUp), earthUp: encodeRuns(earthUp) } }, [sunEl.buffer, earthEl.buffer, sunFrac.buffer]);
  } catch (err) {
    self.postMessage({ error: String((err as Error).message ?? err) });
  }
};
