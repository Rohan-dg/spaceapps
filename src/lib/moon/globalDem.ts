/**
 * Global LOLA terrain (LDEM_128, 128 px/deg, NASA PDS) served as 5 x 5 degree tiles from public/dem/,
 * built by scripts/build_global_dem.py. Heights are the original LOLA samples (0.5 m quantum) above the
 * 1737.4 km reference sphere; between samples we interpolate bilinearly and never add synthetic detail.
 */
import { decodeHeights } from '../../components/MoonView';
import { R_M } from './frames';

const base = import.meta.env.BASE_URL;
interface Index { ppd: number; tileDeg: number; n: number; quantumM: number; hMin: number[][] }
let idxP: Promise<Index> | null = null;
const tiles = new Map<string, Promise<Float32Array>>();

function index() {
  idxP ??= fetch(`${base}dem/index.json`).then((r) => { if (!r.ok) throw new Error('global LOLA tiles are not deployed'); return r.json() as Promise<Index>; });
  idxP.catch(() => { idxP = null; });
  return idxP;
}

function tile(ix: Index, i: number, j: number) {
  const k = `${i}_${j}`;
  let p = tiles.get(k);
  if (!p) {
    p = decodeHeights(`${base}dem/${k}.png`, ix.hMin[i][j], ix.quantumM).then((d) => d.data);
    p.catch(() => tiles.delete(k));
    tiles.set(k, p);
  }
  return p;
}

/** Point at ground distance (dx east, dy north) metres from (lat, lon), along a great circle. */
export function offsetLatLon(lat: number, lon: number, dx: number, dy: number): [number, number] {
  const d = Math.hypot(dx, dy) / R_M, az = Math.atan2(dx, dy), f1 = (lat * Math.PI) / 180, l1 = (lon * Math.PI) / 180;
  const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(az));
  const l2 = l1 + Math.atan2(Math.sin(az) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
  return [(f2 * 180) / Math.PI, ((((l2 * 180) / Math.PI) % 360) + 360) % 360];
}

export const GLOBAL_RES_M = (R_M * Math.PI) / 180 / 128;

/** Loads every tile within `radiusM` of (lat, lon) and returns a synchronous bilinear sampler h(lat, lon) in metres. */
export async function globalSampler(lat: number, lon: number, radiusM: number) {
  const ix = await index();
  const { ppd, tileDeg: T, n } = ix, rows = 180 * ppd, cols = 360 * ppd;
  const dLat = (radiusM / R_M) * (180 / Math.PI) + 0.1;
  const cl = Math.cos((Math.min(89.9, Math.abs(lat) + dLat) * Math.PI) / 180);
  const dLon = Math.abs(lat) + dLat >= 89.9 ? 180 : dLat / cl + 0.1;
  const i0 = Math.max(0, Math.floor((90 - lat - dLat) / T)), i1 = Math.min(180 / T - 1, Math.floor((90 - lat + dLat) / T));
  const nj = 360 / T, jw = dLon >= 180 ? nj : Math.floor((2 * dLon) / T) + 2, ja = dLon >= 180 ? 0 : Math.floor((lon - dLon) / T);
  const want: [number, number][] = [];
  for (let i = i0; i <= i1; i++) for (let k = 0; k < Math.min(jw, nj); k++) want.push([i, (((ja + k) % nj) + nj) % nj]);
  const got = new Map<number, Float32Array>();
  await Promise.all(want.map(async ([i, j]) => got.set(i * nj + j, await tile(ix, i, j))));
  const px = (r: number, c: number) => {
    r = Math.min(rows - 1, Math.max(0, r)); c = ((c % cols) + cols) % cols;
    const t = got.get(Math.floor(r / n) * nj + Math.floor(c / n));
    return t ? t[(r % n) * n + (c % n)] : NaN;
  };
  return (la: number, lo: number) => {
    const y = (90 - la) * ppd - 0.5, x = ((((lo % 360) + 360) % 360)) * ppd - 0.5;
    const r = Math.floor(y), c = Math.floor(x), fy = y - r, fx = x - c;
    return (px(r, c) * (1 - fx) + px(r, c + 1) * fx) * (1 - fy) + (px(r + 1, c) * (1 - fx) + px(r + 1, c + 1) * fx) * fy;
  };
}
