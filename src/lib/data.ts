/** Lazy, cached loading of precomputed site data from /public. */
import { useEffect, useState } from 'react';
import { parseSeries, type Series, type SeriesFile } from './series';

export interface SiteInfo {
  id: string; name: string; short: string; lat: number; lon: number; citedLat: number; citedLon: number;
  snappedM: number; region: string; mission: string; description: string; source: string; verify: boolean;
  siteHeightM: number; dem: string; demResolutionM: number | null; synthetic: boolean;
  stats: { sunPct: number; sunDiskPct: number; earthPct: number };
  approximate?: boolean;
  /** Grouping in the site list: artemis | clps | apollo | international | reference (custom points have none). */
  program?: string;
  /** landed | planned | target (planned site of a failed landing) | candidate | reference */
  status?: string;
}
export interface SitesDoc { generated: string; range: { start: string; end: string; stepMin: number }; sites: SiteInfo[] }
export interface HorizonFile {
  id: string; lat: number; lon: number; synthetic: boolean; dem: string; demResolutionM: number | null;
  siteHeightM: number; observerHeightM: number; maxRangeKm: number; horizonDeg: number[]; horizonDistKm: number[] | null;
}
export interface SiteData { info: SiteInfo; horizon: HorizonFile; series: Series }

const base = import.meta.env.BASE_URL;
const getJSON = async <T,>(p: string): Promise<T> => {
  const r = await fetch(`${base}${p}`);
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
};

let sitesP: Promise<SitesDoc> | null = null;
export const loadSites = () => (sitesP ??= getJSON<SitesDoc>('sites.json'));

const cache = new Map<string, Promise<SiteData>>();
const resolved = new Map<string, SiteData>();
export function loadSite(id: string): Promise<SiteData> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const [doc, horizon, sf] = await Promise.all([loadSites(), getJSON<HorizonFile>(`horizons/${id}.json`), getJSON<SeriesFile>(`series/${id}.json`)]);
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
    if (hit) setData(hit); else loadSite(id).then((d) => live && setData(d));
    return () => { live = false; };
  }, [id]);
  return data && data.info.id === id ? data : null;
}

/** Preload every site in the background so the site list can show live status. */
export function useAllSites(ids: string[]) {
  const [, force] = useState(0);
  useEffect(() => {
    let live = true;
    ids.forEach((id) => loadSite(id).then(() => live && force((x) => x + 1)));
    return () => { live = false; };
  }, [ids.join(',')]);
  return ids.map((id) => getLoaded(id) ?? null);
}
