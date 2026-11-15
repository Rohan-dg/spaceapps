import { useEffect, useMemo, useRef, useState } from 'react';
import type { SiteData } from '../lib/data';
import { skyAt } from '../lib/ephemeris';
import { compass } from '../lib/metrics';
import { decodeI16, SYNODIC_DAYS } from '../lib/series';
import { hzAt, litMask, normals, type SunDir, type Tile } from '../lib/shadowMap';
import { siteOf } from '../lib/useScenario';
import type { ShadowRequest } from '../workers/shadowMap';
import { Loading } from './Help';
import { useDpr } from './useDpr';

const DAY = 86400_000;
const FRAC_STEP_H = 3;
const tiles = new Map<string, Promise<Tile>>();
const hzCache = new Map<string, Promise<Int16Array>>();
let worker: Worker | null = null;
let seq = 0;

type NoId<R> = R extends unknown ? Omit<R, 'id'> : never;
function run<T>(req: NoId<ShadowRequest>, transfer: Transferable[] = []): Promise<T> {
  worker ??= new Worker(new URL('../workers/shadowMap.ts', import.meta.url), { type: 'module' });
  const id = ++seq, w = worker;
  return new Promise((resolve, reject) => {
    const on = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', on);
      if (e.data.error) reject(new Error(e.data.error)); else resolve((e.data.hz ?? e.data.frac) as T);
    };
    w.addEventListener('message', on);
    w.postMessage({ ...req, id }, transfer);
  });
}

function loadTile(id: string): Promise<Tile> {
  let p = tiles.get(id);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}terrain/${id}.json`).then((r) => {
      if (!r.ok) throw new Error('no terrain tile');
      return r.json();
    }).then((f) => ({ n: f.n, halfKm: f.halfKm, spacingM: f.spacingM, dem: f.dem, z: decodeI16(f.data) }));
    p.catch(() => tiles.delete(id));
    tiles.set(id, p);
  }
  return p;
}
function loadHz(id: string, tile: Tile): Promise<Int16Array> {
  let p = hzCache.get(id);
  if (!p) { p = run<Int16Array>({ kind: 'horizons', tile }); p.catch(() => hzCache.delete(id)); hzCache.set(id, p); }
  return p;
}

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
type Mode = 'now' | 'pct';

/**
 * Top-down shadow map of the ground around the site, following the app's time (so Play gives a time-lapse),
 * plus a "sunlit share of the next lunar day" layer that shows where the best-lit ground is and how much a
 * short move changes it.
 */
export default function ShadowMap({ data, t, mastPct }: { data: SiteData; t: number; mastPct?: number }) {
  const id = data.info.id;
  const [tile, setTile] = useState<{ id: string; tile: Tile } | null>(null);
  const [hz, setHz] = useState<{ id: string; hz: Int16Array } | null>(null);
  const [errFor, setErrFor] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('now');
  const [hover, setHover] = useState<number | null>(null);
  const [frac, setFrac] = useState<{ key: string; frac: Uint8Array } | null>(null);
  const site = useMemo(() => siteOf(data), [data]);

  useEffect(() => {
    let live = true;
    loadTile(id).then((tl) => {
      if (!live) return;
      setTile({ id, tile: tl });
      return loadHz(id, tl).then((h) => { if (live) setHz({ id, hz: h }); });
    }).catch(() => live && setErrFor(id));
    return () => { live = false; };
  }, [id]);

  const T = tile?.id === id ? tile.tile : null;
  const H = hz?.id === id ? hz.hz : null;
  const norm = useMemo(() => (T ? normals(T) : null), [T]);

  // the distant skyline beyond the tile, from the site's 150 km profile
  const farAt = useMemo(() => {
    const prof = data.horizon.horizonDeg, dist = data.horizon.horizonDistKm, half = T?.halfKm ?? 12;
    return (az: number) => {
      const a = Math.round(((az % 360) + 360) % 360) % 360;
      return dist && dist[a] > half ? prof[a] : -90;
    };
  }, [data, T]);

  const sun: SunDir = useMemo(() => { const s = skyAt(site, new Date(t)).sun; return { az: s.az, el: s.el }; }, [site, t]);
  const mask = useMemo(() => (T && H ? litMask(T, H, sun, farAt(sun.az)) : null), [T, H, sun, farAt]);

  // sunlit share over the next lunar day, recomputed when the day changes
  const day0 = Math.floor(t / DAY) * DAY;
  const fracKey = `${id}@${day0}`;
  useEffect(() => {
    if (!T || !H || frac?.key === fracKey) return;
    let live = true;
    const suns: (SunDir & { far: number })[] = [];
    for (let h = 0; h < SYNODIC_DAYS * 24; h += FRAC_STEP_H) {
      const s = skyAt(site, new Date(day0 + h * 3600_000)).sun;
      suns.push({ az: s.az, el: s.el, far: farAt(s.az) });
    }
    const timer = setTimeout(() => {
      run<Uint8Array>({ kind: 'fraction', tile: T, hz: H, suns }).then((f) => { if (live) setFrac({ key: fracKey, frac: f }); }, () => undefined);
    }, 300); // let playback settle
    return () => { live = false; clearTimeout(timer); };
  }, [T, H, fracKey, day0, site, farAt, frac?.key]);
  const F = frac?.key === fracKey ? frac.frac : null;

  // the best-lit ground within a short move of the site
  const best = useMemo(() => {
    if (!T || !F) return null;
    const { n, spacingM, halfKm } = T, c0 = (n - 1) / 2, rKm = halfKm / 4;
    const lim = (rKm * 1000) / spacingM;
    let bi = -1, bv = -1;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if ((r - c0) ** 2 + (c - c0) ** 2 > lim * lim) continue;
      const v = F[r * n + c]; if (v > bv) { bv = v; bi = r * n + c; }
    }
    const ci = Math.round(c0) * n + Math.round(c0);
    return { i: bi, pct: (bv / 250) * 100, sitePct: (F[ci] / 250) * 100, rKm };
  }, [T, F]);

  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(520);
  const dpr = useDpr();
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.min(560, Math.floor(e.contentRect.width)))));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cnv = cv.current; if (!cnv || !T || !norm) return;
    const { n } = T;
    const off = document.createElement('canvas'); off.width = n; off.height = n;
    const og = off.getContext('2d')!, img = og.createImageData(n, n), px = img.data;
    const ce = Math.cos(sun.el * Math.PI / 180);
    const sE = ce * Math.sin(sun.az * Math.PI / 180), sN = ce * Math.cos(sun.az * Math.PI / 180), sU = Math.sin(sun.el * Math.PI / 180);
    for (let i = 0; i < n * n; i++) {
      const nE = norm[i * 3], nN = norm[i * 3 + 1], nU = norm[i * 3 + 2];
      const relief = clamp(0.5 + 1.6 * (-0.55 * nE + 0.55 * nN + 0.63 * nU - 0.63)); // fixed NW light for terrain shape
      let r: number, g: number, b: number;
      if (mode === 'pct') {
        const v = F ? F[i] / 250 : 0;
        if (F && v === 0) { r = 18 + 14 * relief; g = 34 + 20 * relief; b = 74 + 36 * relief; }
        else { const k = 30 + 215 * Math.sqrt(v) * (0.82 + 0.18 * relief); r = g = b = k; }
      } else if (mask && mask[i]) {
        const k = clamp(0.62 + 6 * (sE * nE + sN * nN + sU * nU - sU), 0.32, 1);
        r = 236 * k; g = 232 * k; b = 222 * k;
      } else { r = 10 + 18 * relief; g = 12 + 20 * relief; b = 20 + 26 * relief; }
      const o = i * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
    }
    og.putImageData(img, 0, 0);
    cnv.width = Math.round(w * dpr); cnv.height = Math.round(w * dpr);
    const ctx = cnv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, w, w);
    const cell = w / n, toPx = (i: number) => [((i % n) + 0.5) * cell, (Math.floor(i / n) + 0.5) * cell];
    // site
    const c = w / 2;
    ctx.strokeStyle = '#4c90f0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c, c, 7, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c - 12, c); ctx.lineTo(c - 4, c); ctx.moveTo(c + 4, c); ctx.lineTo(c + 12, c); ctx.moveTo(c, c - 12); ctx.lineTo(c, c - 4); ctx.moveTo(c, c + 4); ctx.lineTo(c, c + 12); ctx.stroke();
    // best-lit point and the search radius
    if (mode === 'pct' && best && best.i >= 0) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c, c, (best.rKm / (2 * T.halfKm)) * w, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      const [bx, by] = toPx(best.i);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, 6, 0, 2 * Math.PI); ctx.stroke();
      ctx.fillStyle = '#4c90f0'; ctx.beginPath(); ctx.arc(bx, by, 2.5, 0, 2 * Math.PI); ctx.fill();
    }
    // Sun direction on the edge
    if (mode === 'now' && sun.el > -1) {
      const a = sun.az * Math.PI / 180, rr = w / 2 - 12;
      const x = c + Math.sin(a) * rr, y = c - Math.cos(a) * rr;
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI); ctx.stroke(); ctx.fill();
    }
    // north arrow and scale bar
    ctx.font = `600 11px Inter, system-ui, sans-serif`; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(8, 8, 22, 30);
    ctx.fillStyle = '#ffffff'; ctx.fillText('N', 19, 22);
    ctx.beginPath(); ctx.moveTo(19, 26); ctx.lineTo(15, 34); ctx.lineTo(23, 34); ctx.closePath(); ctx.fill();
    const km = T.halfKm * 2, barKm = km > 60 ? 20 : 5, bw = (barKm / km) * w;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(8, w - 30, bw + 16, 22);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(16, w - 14, bw, 3);
    ctx.textAlign = 'left'; ctx.fillText(`${barKm} km`, 16, w - 18);
    if (hover !== null) {
      const [hx, hy] = toPx(hover);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.strokeRect(hx - cell * 1.5, hy - cell * 1.5, cell * 3, cell * 3);
    }
  }, [T, norm, mask, F, mode, sun, w, dpr, best, hover]);

  if (errFor === id) return <p className="sm-note">The shadow map needs the site's precomputed terrain tile, so it isn't available for this point.</p>;
  if (!T) return <Loading label="Loading terrain around the site" />;

  const n = T.n, c0 = (n - 1) / 2;
  const litShare = mask ? (mask.reduce((a, b) => a + b, 0) / mask.length) * 100 : null;
  const describe = (i: number) => {
    const r = Math.floor(i / n), c = i % n;
    const E = (c - c0) * T.spacingM, N = (c0 - r) * T.spacingM;
    const dKm = Math.hypot(E, N) / 1000, az = (Math.atan2(E, N) * 180 / Math.PI + 360) % 360;
    const dz = T.z[i] + (E * E + N * N) / (2 * 1737400);
    return { dKm, dir: compass(az), dz };
  };
  const hv = hover !== null ? describe(hover) : null;
  const onMove = (e: React.PointerEvent) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * n), r = Math.floor(((e.clientY - rect.top) / rect.height) * n);
    setHover(r >= 0 && c >= 0 && r < n && c < n ? r * n + c : null);
  };
  const bd = best && best.i >= 0 ? describe(best.i) : null;

  return (
    <div className="sm">
      <div className="sm-top">
        <div className="seg" role="radiogroup" aria-label="Shadow map layer">
          <button role="radio" aria-checked={mode === 'now'} onClick={() => setMode('now')}>Light and shadow now</button>
          <button role="radio" aria-checked={mode === 'pct'} onClick={() => setMode('pct')}>Sunlit share, next lunar day</button>
        </div>
        <span className="sm-meta num">{T.halfKm * 2} × {T.halfKm * 2} km · {T.spacingM} m grid · {T.dem}</span>
      </div>
      <div className="sm-body">
        <div className="sm-map" ref={wrap}>
          {!H && <div className="sm-busy"><Loading label={`Tracing the horizon for ${(n * n).toLocaleString('en-US')} ground points`} /></div>}
          <canvas ref={cv} style={{ width: w, height: w }} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
            aria-label={`Top-down map of ${T.halfKm * 2} by ${T.halfKm * 2} km around ${data.info.name}, north up, showing ${mode === 'now' ? 'sunlit and shadowed ground now' : 'the share of the next lunar day each point is sunlit'}`} />
        </div>
        <div className="sm-side">
          {mode === 'now' ? (
            <>
              <p><b className="num">{litShare === null ? '…' : `${litShare.toFixed(0)}%`}</b> of the area is sunlit now. Sun at <span className="num">{sun.el.toFixed(2)}°</span> elevation, from the {compass(sun.az)} (white dot on the edge).</p>
              <p className="muted">Press Play to watch shadows sweep across the ground. At the pole the Sun circles just above the horizon, so long shadows from ridges kilometres away decide what is lit.</p>
              <ul className="chart-legend sm-legend">
                <li><span className="swatch" style={{ background: '#ece8de' }} aria-hidden /> Sunlit</li>
                <li><span className="swatch" style={{ background: '#1a1e2c', outline: '1px solid var(--line)' }} aria-hidden /> Shadow</li>
                <li><span className="swatch" style={{ background: '#4c90f0' }} aria-hidden /> Site</li>
              </ul>
            </>
          ) : (
            <>
              {!F ? <Loading label="Adding up sunlight over the next lunar day" /> : best && bd && (
                <p>At ground level the site point is sunlit <b className="num">{best.sitePct.toFixed(0)}%</b> of the next lunar day{mastPct !== undefined ? <> (a 2 m mast at the exact site, as used elsewhere in the app: <span className="num">{mastPct.toFixed(0)}%</span>)</> : null}.
                  The best-lit ground within <span className="num">{best.rKm} km</span> gets <b className="num">{best.pct.toFixed(0)}%</b>,
                  {' '}{bd.dKm < 0.2 ? 'right at the site' : <><span className="num">{bd.dKm.toFixed(1)} km</span> to the {bd.dir}</>} (ringed).
                  {best.pct - best.sitePct >= 5 ? ' A short move makes a large difference.' : ''}</p>
              )}
              <p className="muted">Dark blue: never sunlit in this period. Brighter means more hours of sunlight.</p>
              <div className="sm-ramp" aria-hidden><span>0%</span><i /><span>100%</span></div>
            </>
          )}
          <p className="sm-hover num" aria-live="polite">
            {hv && hover !== null ? <>
              {hv.dKm < 0.1 ? 'At the site' : `${hv.dKm.toFixed(1)} km ${hv.dir}`}, {hv.dz >= 0 ? '+' : '−'}{Math.abs(hv.dz).toFixed(0)} m vs site
              {mode === 'now' && mask ? ` · ${mask[hover] ? 'sunlit' : 'shadow'} (skyline ${Math.max(hzAt(H!, hover, sun.az), farAt(sun.az)).toFixed(1)}°)` : ''}
              {mode === 'pct' && F ? ` · sunlit ${((F[hover] / 250) * 100).toFixed(0)}%` : ''}
            </> : 'Point at the map for details.'}
          </p>
          <p className="sm-note">Ground level, Sun treated as a point. Terrain within the tile is traced per point; the skyline beyond it comes from the site's 150 km horizon. The site's own figures elsewhere use a 2 m mast on finer terrain, so they can differ. Ground near the map edge facing the Sun has less terrain to trace and can look too bright.</p>
        </div>
      </div>
    </div>
  );
}
