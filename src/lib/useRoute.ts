import { useEffect, useMemo, useState } from 'react';
import { straightRoute, type LatLon, type Route } from './mission';
import type { RouteRequest } from '../workers/route';

/** The polar DEM covers 80.5° S to the pole (with a small margin for horizon rays). */
export const inPolarDem = (p: LatLon) => p.lat <= -80.6;

const cache = new Map<string, Route>();
let worker: Worker | null = null;
let seq = 0;

/** Route from a to b: slope-aware A* on the polar DEM in a worker, or a straight line elsewhere. */
export function useRoute(a: LatLon, b: LatLon, maxSlopeDeg: number) {
  const key = `${a.lat.toFixed(5)},${a.lon.toFixed(5)}>${b.lat.toFixed(5)},${b.lon.toFixed(5)}@${maxSlopeDeg}`;
  const terrain = inPolarDem(a) && inPolarDem(b);
  const [state, setState] = useState<{ key: string; route: Route | null; busy: string | null; err: string | null }>({ key: '', route: null, busy: null, err: null });

  useEffect(() => {
    const hit = cache.get(key);
    if (hit) { setState({ key, route: hit, busy: null, err: null }); return; }
    if (!terrain) {
      const r = straightRoute(a, b); cache.set(key, r);
      setState({ key, route: r, busy: null, err: null }); return;
    }
    const id = ++seq;
    let live = true;
    setState({ key, route: null, busy: 'Starting…', err: null });
    const timer = setTimeout(() => {
      worker ??= new Worker(new URL('../workers/route.ts', import.meta.url), { type: 'module' });
      const onMsg = (e: MessageEvent) => {
        const m = e.data;
        if (m.id !== id || !live) return;
        if (m.progress) setState((s) => ({ ...s, busy: m.progress }));
        if (m.error) { const r = straightRoute(a, b); setState({ key, route: { ...r, note: `Route planning failed (${m.error}). Showing a straight line.` }, busy: null, err: m.error }); worker!.removeEventListener('message', onMsg); }
        if (m.done) { cache.set(key, m.done); setState({ key, route: m.done, busy: null, err: null }); worker!.removeEventListener('message', onMsg); }
      };
      worker.addEventListener('message', onMsg);
      const demUrl = `${new URL(import.meta.env.BASE_URL, location.href).href}dem/south_polar_400m.json`;
      const req: RouteRequest = { id, from: a, to: b, maxSlopeDeg, demUrl };
      worker.postMessage(req);
    }, 250); // debounce typing in the plan form
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Until the worker answers, a straight line keeps the rest of the panel alive.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const straight = useMemo(() => straightRoute(a, b), [key]);
  const mine = state.key === key;
  return { route: mine && state.route ? state.route : straight, busy: mine ? state.busy : terrain ? 'Starting…' : null, err: mine ? state.err : null };
}
