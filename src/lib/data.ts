/** Lazy, cached loading of precomputed site data from /public. */
import { useEffect, useState } from 'react';
import { parseSeries, type Series, type SeriesFile } from './series';

export interface SiteInfo {
  id: string; name: string; short: string; lat: number; lon: number; citedLat: number; citedLon: number;
  snappedM: number; region: string; mission: string; description: string; source: string; verify: boolean;
  siteHeightM: number; dem: string; demResolutionM: number | null; synthetic: boolean;
  stats: { sunPct: number; sunDiskPct: number; earthPct: number };
  approximate?: boolean;
  /** Who flew or plans it: artemis | clps | apollo | nasa | commercial | international | reference (custom points have none). */
  program?: string;
  /** landed | crashed | impact (deliberate or end of mission) | planned | target (planned site of a failed landing) | candidate | reference */
  status?: string;
  /** Year of landing or impact, or planned year (e.g. "1966", "2027"). */
  date?: string;
}
export interface SitesDoc { generated: string; range: { start: string; end: string; stepMin: number }; sites: SiteInfo[] }
export interface HorizonFile {
  id: string; lat: number; lon: number; synthetic: boolean; dem: string; demResolutionM: number | null;
  siteHeightM: number; observerHeightM: number; maxRangeKm: number; horizonDeg: number[]; horizonDistKm: number[] | null;
}
export interface SiteData { info: SiteInfo; horizon: HorizonFile; series: Series }

const base = import.meta.env.BASE_URL;
type Pri = 'high' | 'low';
const getJSON = async <T,>(p: string, priority: Pri = 'high'): Promise<T> => {
  // fetch priority: the site someone picked jumps ahead of the background preload (ignored where unsupported)
  const r = await fetch(`${base}${p}`, { priority } as RequestInit);
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
};

let sitesP: Promise<SitesDoc> | null = null;
export const loadSites = () => (sitesP ??= getJSON<SitesDoc>('sites.json'));

const cache = new Map<string, Promise<SiteData>>();
const resolved = new Map<string, SiteData>();
export function loadSite(id: string, priority: Pri = 'high'): Promise<SiteData> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const [doc, horizon, sf] = await Promise.all([loadSites(), getJSON<HorizonFile>(`horizons/${id}.json`, priority), getJSON<SeriesFile>(`series/${id}.json`, priority)]);
      const info = doc.sites.find((s) => s.id === id)!;
      const d = { info, horizon, series: parseSeries(sf) };
      resolved.set(id, d);
      return d;
    })();
    cache.set(id, p);
  }
  return p;
}
export const getLoaded = (id: string) => resolved.get(id);

/** Background preload: a few sites at a time at low priority, so a site someone picks (loaded at once, at high
 *  priority) never waits behind ~28 MB of series for every other site. */
const queue: string[] = [];
const waiters = new Map<string, (() => void)[]>();
let active = 0;
const MAX_BG = 3;
function pump() {
  while (active < MAX_BG && queue.length) {
    const id = queue.shift()!;
    const done = () => { (waiters.get(id) ?? []).forEach((f) => f()); waiters.delete(id); };
    if (resolved.has(id)) { done(); continue; }
    active++;
    loadSite(id, 'low').then(done, done).finally(() => { active--; pump(); });
  }
}
function preload(id: string): Promise<void> {
  if (resolved.has(id)) return Promise.resolve();
  return new Promise((res) => {
    if (!waiters.has(id)) { waiters.set(id, []); queue.push(id); }
    waiters.get(id)!.push(res);
    pump();
  });
}

/** Register a site computed in the browser (custom coordinates). */
export function registerSite(d: SiteData) {
  resolved.set(d.info.id, d);
  cache.set(d.info.id, Promise.resolve(d));
}

export function useSites() {
  const [doc, setDoc] = useState<SitesDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadSites().then(setDoc, (e) => setErr(String(e))); }, []);
  return { doc, err };
}

export function useSiteData(id: string | null) {
  const [data, setData] = useState<SiteData | null>(id ? getLoaded(id) ?? null : null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    const hit = getLoaded(id);
    if (hit) setData(hit); else loadSite(id).then((d) => live && setData(d), () => undefined);
    return () => { live = false; };
  }, [id]);
  // a site that is already in memory shows on the very render that picks it, with no effect round trip
  if (id && (!data || data.info.id !== id)) return getLoaded(id) ?? null;
  return data && data.info.id === id ? data : null;
}

/** Preload sites in the background so the site list can show live status. Ids in `lazy` are not preloaded:
 *  their list rows load them when shown. */
export function useAllSites(ids: string[], lazy?: ReadonlySet<string>) {
  const [, force] = useState(0);
  const eager = ids.filter((id) => !lazy?.has(id));
  useEffect(() => {
    let live = true;
    // a site uploaded without its precomputed files just shows no status here (the mission sidebar computes it instead)
    eager.forEach((id) => preload(id).then(() => live && force((x) => x + 1)));
    return () => { live = false; };
  }, [eager.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return ids.map((id) => getLoaded(id) ?? null);
}
