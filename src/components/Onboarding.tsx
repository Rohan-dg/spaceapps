/**
 * Full-screen guided tour, shown after the mode chooser (once per mode) and from Help / the command menu.
 *
 * Scrolling drives a camera over real screenshots of the app: steps on the same screenshot glide (with a slight
 * pull-back on long pans) from control to control, and a new screenshot flies in with a tilt as the old one flies
 * away. Each step holds still for reading, and the scroll settles onto the nearest step when the wheel stops.
 *
 * Smoothness: the scroll position is damped in requestAnimationFrame and only transform and opacity are written per
 * frame (plus one highlight box), so everything stays on the compositor. The loop sleeps when it has caught up.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Ui } from './ModeChooser';
import { LogoMark } from './Logo';
import { ArrowRight, ChevronLeft, X } from './Icons';
import { SHOTS, type Rect } from '../onboarding/shots';
import { TOUR, type TourStep } from '../onboarding/steps';
import { markTourSeen } from '../onboarding/seen';


/** Scroll distance per step, as a share of the viewport height. */
const STEP = 0.85;
/** Part of each step at either end that holds still (the rest is the transition). */
const HOLD = 0.2;
const ASPECT = 1440 / 900;
const FULL: Rect = [0, 0, 1, 1];

interface Flight { x: number; y: number; rx: number; ry: number; s: number; o: number }
// x and y are shares of the view's width and height; rx and ry are tilts in degrees
const FLAT: Flight = { x: 0, y: 0, rx: 0, ry: 0, s: 1, o: 1 };
const INTRO: Flight = { x: 0.56, y: 0.04, rx: 8, ry: -30, s: 0.78, o: 0.9 };
const OUTRO: Flight = { x: 0.56, y: -0.02, rx: -6, ry: -30, s: 0.72, o: 0.75 };
const LEAVE: Flight = { x: 0, y: -0.42, rx: 16, ry: 0, s: 0.86, o: 0 };
const ENTER: Flight = { x: 0, y: 0.42, rx: -16, ry: 0, s: 0.86, o: 0 };

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2); // ease-in-out cubic
const lerpF = (a: Flight, b: Flight, t: number): Flight => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), rx: lerp(a.rx, b.rx, t), ry: lerp(a.ry, b.ry, t), s: lerp(a.s, b.s, t), o: lerp(a.o, b.o, t) });

interface Slot { shot: string; rect: Rect; lit: number; f: Flight }

export default function Onboarding({ ui, onClose }: { ui: Ui; onClose: () => void }) {
  const steps = TOUR[ui];
  const n = steps.length;
  // slot 0 is the intro, 1..n the steps, n + 1 the outro
  const slots = useMemo<Slot[]>(() => {
    const at = (s: TourStep): Rect => (s.focus && SHOTS[s.shot]?.[s.focus]) || FULL;
    return [
      { shot: steps[0].shot, rect: FULL, lit: 0, f: INTRO },
      ...steps.map((s) => ({ shot: s.shot, rect: at(s), lit: s.focus ? 1 : 0, f: FLAT })),
      { shot: steps[n - 1].shot, rect: at(steps[n - 1]), lit: 0, f: OUTRO },
    ];
  }, [steps, n]);
  const shots = useMemo(() => [...new Set(slots.map((s) => s.shot))], [slots]);

  const scroller = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const layers = useRef(new Map<string, { fly: HTMLDivElement | null; cam: HTMLDivElement | null; hl: HTMLDivElement | null }>());
  const texts = useRef<(HTMLDivElement | null)[]>([]);
  const [slot, setSlot] = useState(0);
  const [closing, setClosing] = useState(false);
  const reduce = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);

  const finish = useCallback(() => {
    markTourSeen(ui);
    setClosing(true);
    window.setTimeout(onClose, reduce ? 0 : 380);
  }, [ui, onClose, reduce]);

  const stepPx = () => (scroller.current?.clientHeight ?? window.innerHeight) * STEP;
  const goTo = useCallback((k: number) => {
    const el = scroller.current; if (!el) return;
    el.scrollTo({ top: Math.max(0, Math.min(n + 1, k)) * stepPx(), behavior: reduce ? 'auto' : 'smooth' });
  }, [n, reduce]);

  // the render loop: damped scroll position -> camera, flights, highlight, text
  useLayoutEffect(() => {
    const el = scroller.current, vw = view.current; if (!el || !vw) return;
    let box = { w: 0, h: 0, bw: 0, bh: 0, ox: 0, oy: 0 };
    const measure = () => {
      const r = vw.getBoundingClientRect();
      const bw = Math.min(r.width, r.height * ASPECT), bh = bw / ASPECT;
      box = { w: r.width, h: r.height, bw, bh, ox: (r.width - bw) / 2, oy: (r.height - bh) / 2 };
      // each flying layer is exactly the screenshot's size, centred in the view, so there is never a letterbox
      for (const [, l] of layers.current) {
        if (l.cam) { l.cam.style.width = `${bw}px`; l.cam.style.height = `${bh}px`; }
        if (l.fly) Object.assign(l.fly.style, { left: `${box.ox}px`, top: `${box.oy}px`, width: `${bw}px`, height: `${bh}px` });
      }
    };
    // camera for a rect: zoom so it fills most of the view, centred; small controls keep some context around them
    // (at most 2.5x, so the 1440 px screenshots stay sharp)
    const camOf = (r: Rect) => {
      const z = r === FULL ? 1 : Math.max(1, Math.min(2.5, Math.min(0.84 / Math.max(r[2], 0.24), 0.8 / Math.max(r[3], 0.24))));
      return { cx: r[0] + r[2] / 2, cy: r[1] + r[3] / 2, z };
    };
    const place = (shot: string, cam: { cx: number; cy: number; z: number }, f: Flight, r: Rect, lit: number) => {
      const l = layers.current.get(shot); if (!l?.fly || !l.cam) return;
      const { bw, bh } = box, w = bw, h = bh;
      // keep the frame filled: clamp the pan so no edge of the screenshot comes into view when zoomed
      let tx = w / 2 - cam.cx * bw * cam.z, ty = h / 2 - cam.cy * bh * cam.z;
      const sw = bw * cam.z, sh = bh * cam.z;
      tx = sw > w ? Math.min(0, Math.max(w - sw, tx)) : (w - sw) / 2;
      ty = sh > h ? Math.min(0, Math.max(h - sh, ty)) : (h - sh) / 2;
      const fx = reduce ? 0 : f.x, fy = reduce ? 0 : f.y, frx = reduce ? 0 : f.rx, fry = reduce ? 0 : f.ry, fs = reduce ? 1 : f.s;
      l.fly.style.opacity = f.o.toFixed(3);
      l.fly.style.visibility = f.o < 0.004 ? 'hidden' : 'visible';
      l.fly.style.transform = `translate3d(${(fx * w).toFixed(1)}px, ${(fy * h).toFixed(1)}px, 0) rotateX(${frx.toFixed(2)}deg) rotateY(${fry.toFixed(2)}deg) scale(${fs.toFixed(4)})`;
      l.cam.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${cam.z.toFixed(4)})`;
      if (l.hl) {
        const pad = 6;
        const x = tx + r[0] * sw - pad, y = ty + r[1] * sh - pad;
        l.hl.style.opacity = lit.toFixed(3);
        l.hl.style.visibility = lit < 0.004 ? 'hidden' : 'visible';
        l.hl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        l.hl.style.width = `${(r[2] * sw + pad * 2).toFixed(1)}px`;
        l.hl.style.height = `${(r[3] * sh + pad * 2).toFixed(1)}px`;
      }
    };
    const hide = (shot: string) => {
      const l = layers.current.get(shot);
      if (l?.fly && l.fly.style.visibility !== 'hidden') { l.fly.style.visibility = 'hidden'; l.fly.style.opacity = '0'; }
    };
    const textAt = (k: number, v: number, dir: number) => {
      const t = texts.current[k]; if (!t) return;
      t.style.visibility = v < 0.004 ? 'hidden' : 'visible';
      t.style.opacity = v.toFixed(3);
      // lines arrive one after another
      const kids = t.children;
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i] as HTMLElement;
        const u = reduce ? 1 : clamp01(v * 1.5 - i * 0.09);
        c.style.transform = `translate3d(0, ${((1 - ease(u)) * 26 * dir).toFixed(1)}px, 0)`;
        c.style.opacity = u.toFixed(3);
      }
    };

    let target = 0, cur = 0, last = performance.now(), raf = 0, shown = -1, idle = 0;
    const visibleTexts = new Set<number>();
    const frame = (now: number) => {
      // a frame's timestamp can be a little older than the performance.now() that restarted the loop, so dt is clamped at 0
      const dt = Math.max(0, Math.min(64, now - last)); last = now;
      cur += (target - cur) * (reduce ? 1 : 1 - Math.exp(-dt / 70));
      if (Math.abs(target - cur) < 0.0004) cur = target;
      cur = Math.max(0, Math.min(n + 1, cur));
      const a = Math.min(n, Math.floor(cur)), fr = cur - a;
      const t = ease(clamp01((fr - HOLD) / (1 - 2 * HOLD)));
      const A = slots[a], B = slots[Math.min(n + 1, a + 1)];
      for (const s of shots) if (s !== A.shot && s !== B.shot) hide(s);
      if (A.shot === B.shot) {
        const ca = camOf(A.rect), cb = camOf(B.rect);
        // long pans pull back a little mid-way, like a camera flying over
        const dist = Math.hypot(cb.cx - ca.cx, cb.cy - ca.cy);
        const dip = reduce ? 1 : 1 - 0.32 * Math.sin(Math.PI * t) * Math.min(1, dist / 0.35);
        const z = Math.max(0.9, Math.exp(lerp(Math.log(ca.z), Math.log(cb.z), t)) * dip);
        const r: Rect = [lerp(A.rect[0], B.rect[0], t), lerp(A.rect[1], B.rect[1], t), lerp(A.rect[2], B.rect[2], t), lerp(A.rect[3], B.rect[3], t)];
        place(A.shot, { cx: lerp(ca.cx, cb.cx, t), cy: lerp(ca.cy, cb.cy, t), z }, lerpF(A.f, B.f, t), r, lerp(A.lit, B.lit, t));
      } else {
        // the old screenshot pulls back and flies away, the new one rises in and zooms to its control
        const ca = camOf(A.rect), cb = camOf(B.rect), full = camOf(FULL);
        const zo = Math.exp(lerp(Math.log(ca.z), 0, t));
        place(A.shot, { cx: lerp(ca.cx, full.cx, t), cy: lerp(ca.cy, full.cy, t), z: zo }, lerpF(A.f, LEAVE, t), A.rect, A.lit * (1 - clamp01(t * 3)));
        const zi = Math.exp(lerp(0, Math.log(cb.z), t));
        place(B.shot, { cx: lerp(full.cx, cb.cx, t), cy: lerp(full.cy, cb.cy, t), z: zi }, lerpF(ENTER, B.f, t), B.rect, B.lit * clamp01(t * 3 - 2));
      }
      // text: the leaving block fades up and out in the first half, the arriving one rises in during the second
      const now2 = new Set<number>();
      const vOut = 1 - clamp01(t * 2), vIn = clamp01(t * 2 - 1);
      if (vOut > 0) { textAt(a, vOut, -1); now2.add(a); }
      if (vIn > 0 && a + 1 <= n + 1) { textAt(a + 1, vIn, 1); now2.add(a + 1); }
      for (const k of visibleTexts) if (!now2.has(k)) textAt(k, 0, 1);
      visibleTexts.clear(); now2.forEach((k) => visibleTexts.add(k));
      if (bar.current) bar.current.style.transform = `scaleX(${(cur / (n + 1)).toFixed(4)})`;
      const k = Math.round(cur);
      if (k !== shown) { shown = k; setSlot(k); }
      raf = cur === target ? 0 : requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    const onScroll = () => {
      target = Math.max(0, Math.min(n + 1, el.scrollTop / stepPx()));
      kick();
      // when the wheel stops between two steps, settle onto the nearer one
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        const k = Math.round(target);
        if (Math.abs(target - k) > 0.015) el.scrollTo({ top: k * stepPx(), behavior: reduce ? 'auto' : 'smooth' });
      }, 170);
    };
    const onResize = () => { measure(); if (spacer.current) spacer.current.style.height = `${((n + 1) * stepPx()).toFixed(0)}px`; target = el.scrollTop / stepPx(); cur = target; kick(); };
    measure();
    for (let k = 0; k < texts.current.length; k++) textAt(k, 0, 1);
    onResize();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(idle); el.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); };
  }, [slots, shots, n, reduce]);

  // the tour owns the keyboard while it is open (capture phase, so the app's own shortcuts do not fire)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const next = ['ArrowDown', 'ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key);
      const prev = ['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key);
      if (e.key === 'Escape') { e.preventDefault(); finish(); }
      else if (next || prev) {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'BUTTON') return;
        e.preventDefault();
        const el = scroller.current; if (!el) return;
        const now = Math.round(el.scrollTop / stepPx());
        if (next && now >= n + 1) finish(); else goTo(now + (next ? 1 : -1));
      } else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
      else if (e.key === 'End') { e.preventDefault(); goTo(n + 1); }
      e.stopPropagation();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [goTo, finish, n]);

  // lock the page behind, and give the tour focus for screen readers and keys
  useEffect(() => {
    const root = document.documentElement, prev = root.style.overflow;
    root.style.overflow = 'hidden';
    scroller.current?.focus({ preventScroll: true });
    return () => { root.style.overflow = prev; };
  }, []);

  // load screenshots near the current step first, the rest after
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set([slots[0].shot, slots[1]?.shot]));
  useEffect(() => {
    setLoaded((had) => {
      const want = new Set(had);
      for (let k = Math.max(0, slot - 2); k <= Math.min(n + 1, slot + 4); k++) want.add(slots[k].shot);
      return want.size === had.size ? had : want;
    });
  }, [slot, slots, n]);
  useEffect(() => {
    const id = window.setTimeout(() => setLoaded(new Set(shots)), 2500);
    return () => window.clearTimeout(id);
  }, [shots]);

  const base = import.meta.env.BASE_URL;
  const step = slot >= 1 && slot <= n ? slot : null;
  return (
    <div ref={scroller} tabIndex={-1} className={`tour tour-${ui}${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label={`${ui === 'expert' ? 'Expert' : 'Normal'} mode tour`}>
      {/* everything visible is pinned; the spacer after it gives the scroll its length */}
      <div className="tour-pin">
      <div className="tour-glow" aria-hidden />
      <div className="tour-top">
        <span className="tour-brand"><LogoMark size={20} /> Sol Teris <em>{ui === 'expert' ? 'Expert' : 'Normal'} tour</em></span>
        <span className="tour-count num" aria-live="polite">{step ? `${String(step).padStart(2, '0')} / ${n}` : ''}</span>
        <button className="tour-skip" onClick={finish}>{slot > n ? 'Close' : 'Skip tour'} <X size={14} /></button>
        <div className="tour-bar" aria-hidden><div ref={bar} /></div>
      </div>
      <div className="tour-stage" aria-hidden>
        <div className="tour-view" ref={view}>
          {shots.map((s) => (
            <div key={s} className="tour-fly" ref={(e) => { const l = layers.current.get(s) ?? { fly: null, cam: null, hl: null }; l.fly = e; layers.current.set(s, l); }}>
              <div className="tour-cam" ref={(e) => { const l = layers.current.get(s) ?? { fly: null, cam: null, hl: null }; l.cam = e; layers.current.set(s, l); }}>
                {loaded.has(s) && <img src={`${base}onboarding/${s}.webp`} alt="" decoding="async" draggable={false} />}
              </div>
              <div className="tour-hl" ref={(e) => { const l = layers.current.get(s) ?? { fly: null, cam: null, hl: null }; l.hl = e; layers.current.set(s, l); }} />
            </div>
          ))}
        </div>
      </div>
      <div className="tour-copy">
        <div className="tour-text tour-hero" ref={(e) => { texts.current[0] = e; }}>
          <span className="tour-kicker">{ui === 'expert' ? 'Expert mode' : 'Normal mode'} · {n} stops</span>
          <h1>{ui === 'expert' ? 'Every tool, one scroll.' : 'Learn Sol Teris in a minute.'}</h1>
          <p>Scroll to fly through every screen and button, with how to use each one.</p>
          <div className="tour-actions">
            <button className="tour-go" onClick={() => goTo(1)}>Start the tour <ArrowRight size={15} /></button>
            <button className="tour-ghost" onClick={finish}>Skip, go to the app</button>
          </div>
          <span className="tour-cue"><i /> Scroll</span>
        </div>
        {steps.map((s, i) => (
          <div key={i} className="tour-text" ref={(e) => { texts.current[i + 1] = e; }}>
            <span className="tour-kicker">{s.kicker}</span>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
            {s.how && <ul className="tour-how">{s.how.map((h) => <li key={h}>{h}</li>)}</ul>}
            {s.keys && <dl className="tour-keys">{s.keys.map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}</dl>}
          </div>
        ))}
        <div className="tour-text tour-hero" ref={(e) => { texts.current[n + 1] = e; }}>
          <span className="tour-kicker">That is everything</span>
          <h1>You are ready.</h1>
          <p>Replay this tour any time with the sparkle button in the left rail, or search for Tour with {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} K.</p>
          <div className="tour-actions">
            <button className="tour-go" onClick={finish}>Start exploring <ArrowRight size={15} /></button>
            <button className="tour-ghost" onClick={() => goTo(0)}>Watch again</button>
          </div>
        </div>
      </div>
      <div className="tour-nav">
        <button aria-label="Previous" onClick={() => goTo(slot - 1)} disabled={slot === 0}><ChevronLeft size={16} /></button>
        <button aria-label="Next" onClick={() => (slot > n ? finish() : goTo(slot + 1))}><ArrowRight size={16} /></button>
      </div>
      </div>
      <div className="tour-spacer" ref={spacer} />
    </div>
  );
}
