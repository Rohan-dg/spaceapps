/**
 * Guided tour over the live app: a spotlight glides from one real control to the next, with a card that says how to
 * use it. Nothing is blocked; the page underneath stays fully clickable, so each step can be tried as it is explained.
 * Steps differ by mode (onboarding/steps.ts). Opens at the start of every visit (and the first switch to the other mode), and from the Tutorial button or ⌘K.
 *
 * Motion: one requestAnimationFrame loop follows the current target (it may move as the page scrolls or the 3D view
 * animates). Between steps the spotlight and card ease from where they were to the new target over ~0.55 s; after
 * that they track it exactly. Only transform, size and opacity are written.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Ui } from './ModeChooser';
import { ArrowRight, ChevronLeft, X } from './Icons';
import { createPortal } from 'react-dom';
import { TOUR, type TourApi } from '../onboarding/steps';

const MOVE_MS = 560;
const PAD = 8;
/** Open popups the user may launch from a step; while one is up the dimming lifts so it can be used. */
const POPUPS = '.cmdk, section.as, .modal-backdrop, .mc, .tv, .hud-menu';

type Box = { x: number; y: number; w: number; h: number };
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const mix = (a: Box, b: Box, t: number): Box => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t });
const shown = (e: Element | null): e is HTMLElement => !!e && e.isConnected && (e as HTMLElement).getClientRects().length > 0;

export default function Onboarding({ ui, api, onClose }: { ui: Ui; api: TourApi; onClose: () => void }) {
  const steps = TOUR[ui];
  const last = steps.length - 1;
  const [i, setI] = useState(0);
  const [closing, setClosing] = useState(false);
  const dir = useRef(1);
  const apiRef = useRef(api);
  useEffect(() => { apiRef.current = api; }, [api]);
  const spot = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const reduce = useRef(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  const finish = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, reduce.current ? 0 : 320);
  }, [ui, onClose]);
  const go = useCallback((k: number) => {
    if (k > last) { finish(); return; }
    dir.current = k >= i ? 1 : -1;
    setI(Math.max(0, k));
  }, [i, last, finish]);

  // per-step setup (select a site, return to Explore ...) before looking for the target
  useEffect(() => { steps[i].prep?.(apiRef.current); }, [i, steps]);

  // the follow loop; restarted per step so it knows where the transition starts
  const shownBox = useRef<Box>({ x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0 });
  const cardPos = useRef({ x: innerWidth / 2 - 180, y: innerHeight / 2 - 120 });
  useLayoutEffect(() => {
    const step = steps[i];
    const from = { ...shownBox.current }, cardFrom = { ...cardPos.current };
    const t0 = performance.now();
    let raf = 0, el: HTMLElement | null = null, scrolled = false, scrolledTo = false, pinned = false, lastLook = -1e9;
    const frame = (now: number) => {
      const W = innerWidth, H = innerHeight;
      // find (and keep re-finding) the target; give up after a while and move on in the same direction
      if (step.target && (!shown(el) || now - lastLook > 500)) {
        lastLook = now;
        const found = step.target();
        el = shown(found) ? found : null;
        if (!el && now - t0 > 1400) { go(i + dir.current); return; }
      }
      let to: Box;
      if (el) {
        const r = el.getBoundingClientRect();
        to = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
        if (!scrolled) {
          scrolled = true;
          // a target in a fixed or sticky bar (header, rail, status bar) is always on screen; scrolling for it
          // would only fight the step's own scroll
          for (let a: HTMLElement | null = el; a && !pinned; a = a.parentElement) pinned = /fixed|sticky/.test(getComputedStyle(a).position);
        }
        if (!scrolledTo) {
          scrolledTo = true;
          const off = r.top < 64 || r.bottom > H - 16 || r.left < 0 || r.right > W;
          if (off) el.scrollIntoView({ block: r.height > H - 140 ? 'start' : 'center', inline: 'nearest', behavior: reduce.current ? 'auto' : 'smooth' });
          else if (!pinned && (r.top < 64 || r.bottom > H - 16)) window.scrollTo({ top: scrollY + r.top - (H - r.height) / 2, behavior: reduce.current ? 'auto' : 'smooth' });
        }
      } else {
        const c0 = shownBox.current;
        to = step.target ? { x: c0.x + c0.w / 2, y: c0.y + c0.h / 2, w: 0, h: 0 } : { x: W / 2, y: H / 2, w: 0, h: 0 };
      }
      const t = reduce.current ? 1 : Math.max(0, Math.min(1, (now - t0) / MOVE_MS)), e = ease(t);
      const b = t >= 1 ? to : mix(from, to, e);
      shownBox.current = b;
      // card: beside the target where it fits (right, left, below, above), else the free corner; docked on phones
      const c = card.current, s = spot.current;
      if (c && s) {
        const cw = c.offsetWidth, ch = c.offsetHeight, g = 16, m = 12;
        let x: number, y: number;
        if (W < 640) { x = m; y = H - ch - m; }
        else if (!el) { x = (W - cw) / 2; y = (H - ch) / 2; }
        else {
          const cy = Math.min(H - ch - m, Math.max(m + 56, to.y + to.h / 2 - ch / 2)), cx = Math.min(W - cw - m, Math.max(m, to.x + to.w / 2 - cw / 2));
          const wide = to.w > W * 0.5;
          const opts: [boolean, number, number][] = [
            [to.x + to.w + g + cw <= W - m, to.x + to.w + g, cy],
            [to.x - g - cw >= m, to.x - g - cw, cy],
            [to.y + to.h + g + ch <= H - m, cx, to.y + to.h + g],
            [to.y - g - ch >= m + 56, cx, to.y - g - ch],
          ];
          const order = wide ? [2, 3, 0, 1] : [0, 1, 2, 3];
          const pick = order.map((k) => opts[k]).find((o) => o[0]);
          [x, y] = pick ? [pick[1], pick[2]] : [W - cw - 24, H - ch - 24];
        }
        const p = t >= 1 ? { x, y } : { x: cardFrom.x + (x - cardFrom.x) * e, y: cardFrom.y + (y - cardFrom.y) * e };
        cardPos.current = p;
        c.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
        s.style.transform = `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0)`;
        s.style.width = `${Math.max(0, b.w).toFixed(1)}px`;
        s.style.height = `${Math.max(0, b.h).toFixed(1)}px`;
        s.classList.toggle('lit', !!el);
        root.current?.classList.toggle('lifted', !!document.querySelector(POPUPS));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [i, steps, go]);

  // Esc closes the tour (unless a popup or a text field has it); the app's other keys keep working
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector(POPUPS)) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.stopPropagation(); finish();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [finish]);

  const s = steps[i];
  const first = i === 0, end = i === last;
  // rendered on the page body, above every other layer (the app container isolates its own z-index stack)
  return createPortal(
    <div ref={root} className={`tour tour-${ui}${closing ? ' closing' : ''}`}>
      <div ref={spot} className="tour-spot" aria-hidden />
      <div ref={card} className="tour-card" role="dialog" aria-modal="false" aria-label={`${ui === 'expert' ? 'Scientific' : 'Education'} mode tour`}>
        <div className="tour-card-in" key={i}>
          <div className="tour-head">
            <span className="tour-kicker">{s.kicker}</span>
            {!first && !end && <span className="tour-count num">{i} / {last - 1}</span>}
            <button className="tour-x" onClick={finish} aria-label="Close the tour" title="Close (Esc)"><X size={14} /></button>
          </div>
          <h2>{s.title}</h2>
          <p>{s.body}</p>
          {s.how && <ul className="tour-how">{s.how.map((h) => <li key={h}>{h}</li>)}</ul>}
          {s.keys && <dl className="tour-keys">{s.keys.map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}</dl>}
          {s.learn && <p className="tour-learn"><b>{ui === 'expert' ? 'Method' : 'Why it matters'}</b> {s.learn}</p>}
          {s.think && <p className="tour-think"><b>Think about it</b> {s.think}</p>}
          {s.tryIt && <p className="tour-try"><b>Try it</b> {s.tryIt}</p>}
        </div>
        <div className="tour-bar" aria-hidden><i style={{ transform: `scaleX(${i / last})` }} /></div>
        <div className="tour-foot">
          {first ? <>
            <button className="tour-ghost" onClick={finish}>Not now</button>
            <button className="tour-go" onClick={() => go(1)}>Start the tour <ArrowRight size={14} /></button>
          </> : end ? <>
            <button className="tour-ghost" onClick={() => go(0)}>Replay</button>
            <button className="tour-go" onClick={finish}>Start exploring <ArrowRight size={14} /></button>
          </> : <>
            <button className="tour-ghost" onClick={() => go(i - 1)}><ChevronLeft size={14} /> Back</button>
            <button className="tour-go" onClick={() => go(i + 1)}>Next <ArrowRight size={14} /></button>
          </>}
        </div>
      </div>
    </div>
  , document.body);
}
