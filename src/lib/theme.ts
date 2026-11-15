/**
 * Theme store. Light and dark themes are defined as CSS tokens in index.css; this module resolves the
 * active theme and exposes the token values to canvas/WebGL code, which can't use CSS.
 * Dark is the default; light applies only when the user saved it with the toggle.
 */
import { useSyncExternalStore } from 'react';

export type ThemeName = 'light' | 'dark';
export interface Palette {
  bg: string; surface: string; surface2: string; line: string; ink: string; ink2: string; ink3: string;
  accent: string; sun: string; sunDisk: string; earth: string; terrain: string; terrainEdge: string; sky: string;
  good: string; warn: string; poor: string; font: string;
}

const KEY = 'lsc-theme';
const listeners = new Set<() => void>();
let snapshot: { name: ThemeName; c: Palette } | null = null;

function resolveName(): ThemeName {
  const attr = document.documentElement.dataset.theme;
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function read(): { name: ThemeName; c: Palette } {
  const cs = getComputedStyle(document.documentElement);
  const v = (k: string) => cs.getPropertyValue(k).trim();
  return {
    name: resolveName(),
    c: {
      bg: v('--bg'), surface: v('--surface'), surface2: v('--surface-2'), line: v('--line'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'),
      accent: v('--accent'), sun: v('--sun'), sunDisk: v('--sun-disk'), earth: v('--earth'), terrain: v('--terrain'), terrainEdge: v('--terrain-edge'),
      sky: v('--sky'), good: v('--good'), warn: v('--warn'), poor: v('--poor'), font: v('--font-body'),
    },
  };
}

function emit() { snapshot = read(); listeners.forEach((l) => l()); }

let wired = false;
function wire() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  // dark is the default; only a saved 'light' switches it
  let saved: string | null = null;
  try { saved = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark';
  new MutationObserver(emit).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', emit);
  document.fonts?.ready.then(emit);
}

export function useTheme() {
  wire();
  const s = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => (snapshot ??= read()));
  const toggle = () => {
    const next: ThemeName = s.name === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  };
  return { name: s.name, c: s.c, toggle };
}

/** Mix two colours given as #rrggbb or rgb() (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => {
    const m = h.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(',').slice(0, 3).map((v) => parseFloat(v));
    let x = h.trim().replace('#', '');
    if (x.length === 3 || x.length === 4) x = [...x.slice(0, 3)].map((ch) => ch + ch).join(''); // minifiers shorten #ffffff to #fff
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  };
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}
