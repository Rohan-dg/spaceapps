/// <reference lib="webworker" />
/**
 * Rover game worker: decodes the terrain off the main thread, then answers "which ground can see this body?" maps
 * (Sun for shadows and power, Earth for signal) whenever the game asks. Heights come from the app's own files:
 * public/hires/<site>.png (LOLA 20 m) and public/moon/south_height.png (LOLA 148 m), both 16-bit in the R and G bytes.
 */
import { type Grid, type World, makeWorld, visibilityMap } from './terrain';
import { stereoXY } from '../lib/moon/frames';

export interface HiMeta { resM: number; n: number; row0: number; col0: number; projOffset: number; hMinM: number; quantumM: number; dem: string }
export type Req =
  | { type: 'load'; base: string; siteId: string; lat: number; lon: number }
  | { type: 'map'; id: number; u: number[]; radiusDeg: number; halfM: number; n: number; obsM: number };
export type Res =
  | { type: 'loaded'; hi: Grid | null; cap: Grid; dem: string }
  | { type: 'error'; message: string }
  | { type: 'map'; id: number; data: Uint8Array };

/** Side of the square cut from the 148 m polar grid: 2048 cells is 304 km, so 152 km in every direction from the site. */
const CROP = 2048;
let world: World | null = null;

async function pixels(url: string, sx = 0, sy = 0, size?: number) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const n = size ?? bmp.width;
  const g = new OffscreenCanvas(n, n).getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, -sx, -sy);
  bmp.close();
  return { px: g.getImageData(0, 0, n, n).data };
}

self.onmessage = async (ev: MessageEvent<Req>) => {
  const m = ev.data;
  try {
    if (m.type === 'load') {
      const tex = await (await fetch(`${m.base}moon/textures.json`)).json() as { south: { n: number; resM: number; halfM: number; hMinM: number; quantumM: number } };
      const meta = m.lat < -80.5 ? await fetch(`${m.base}hires/${m.siteId}.json`).then((r) => (r.ok ? r.json() as Promise<HiMeta> : null)).catch(() => null) : null;
      let hi: Grid | null = null;
      if (meta) {
        const { px } = await pixels(`${m.base}hires/${m.siteId}.png`);
        const h = new Float32Array(meta.n * meta.n);
        for (let i = 0; i < h.length; i++) h[i] = meta.hMinM + (px[i * 4] * 256 + px[i * 4 + 1]) * meta.quantumM;
        hi = { h, n: meta.n, resM: meta.resM, x0: (meta.col0 - meta.projOffset) * meta.resM, y0: (meta.projOffset - meta.row0) * meta.resM };
      }
      // the part of the polar grid around the site, kept as whole metres (its quantum is 1 m)
      const s = tex.south, [xs, ys] = stereoXY(m.lat, m.lon);
      const X0 = -s.halfM + s.resM / 2, Y0 = s.halfM - s.resM / 2;
      const clamp = (v: number) => Math.max(0, Math.min(s.n - CROP, Math.round(v - CROP / 2)));
      const c0 = clamp((xs - X0) / s.resM), r0 = clamp((Y0 - ys) / s.resM);
      const { px } = await pixels(`${m.base}moon/south_height.png`, c0, r0, CROP);
      const ch = new Int16Array(CROP * CROP);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.round(s.hMinM + (px[i * 4] * 256 + px[i * 4 + 1]) * s.quantumM);
      const cap: Grid = { h: ch, n: CROP, resM: s.resM, x0: X0 + c0 * s.resM, y0: Y0 - r0 * s.resM };
      world = makeWorld(hi, cap, m.lat, m.lon);
      (self as unknown as Worker).postMessage({ type: 'loaded', hi, cap, dem: meta?.dem ?? 'LOLA 148 m' } satisfies Res);
    } else if (m.type === 'map' && world) {
      const data = visibilityMap(world, m.u, m.radiusDeg, m.halfM, m.n, m.obsM);
      (self as unknown as Worker).postMessage({ type: 'map', id: m.id, data } satisfies Res, [data.buffer]);
    }
  } catch (e) {
    (self as unknown as Worker).postMessage({ type: 'error', message: String(e) } satisfies Res);
  }
};

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Fable 5.2 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
