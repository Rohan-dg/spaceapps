/// <reference lib="webworker" />
import type { LatLon } from '../lib/mission';
import { type PolarDem } from '../lib/raymarch';
import { planRoute } from '../lib/routeplan';
import { decodeI16 } from '../lib/series';

export interface RouteRequest { id: number; from: LatLon; to: LatLon; maxSlopeDeg: number; demUrl: string }

let dem: PolarDem | null = null;

self.onmessage = async (e: MessageEvent<RouteRequest>) => {
  const q = e.data;
  try {
    if (!dem) {
      self.postMessage({ id: q.id, progress: 'Fetching 400 m terrain (6 MB)…' });
      const meta = await fetch(q.demUrl).then((r) => r.json());
      dem = { data: decodeI16(meta.data), size: meta.size, resM: meta.resM, scaleFactor: meta.scaleFactor };
    }
    self.postMessage({ id: q.id, progress: 'Planning a route around steep ground…' });
    self.postMessage({ id: q.id, done: planRoute(dem, q.from, q.to, { maxSlopeDeg: q.maxSlopeDeg }) });
  } catch (err) {
    self.postMessage({ id: q.id, error: String((err as Error).message ?? err) });
  }
};
