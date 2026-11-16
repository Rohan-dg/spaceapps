/**
 * Sliding selection for segmented controls and tab bars (.seg, .tabs), in the manner of a native
 * segmented control: one highlight that glides to the selected option instead of jumping.
 *
 * The highlight is the container's ::before, positioned through CSS variables, so React's DOM is never
 * touched. Controls inside the 3D views (.moon, .tv) are left alone.
 *
 * Measuring (offsetLeft/Width) forces a layout, so it happens only when something can have moved: the
 * selected option changed, or a ResizeObserver saw the bar or one of its options change size. Ordinary DOM
 * churn elsewhere (which while time plays is every frame) costs one cheap querySelector per bar.
 */
const SEL = '.seg, .tabs, .dash-dock, .ct-tabs';
const SKIP = '.moon, .tv';
const ON = ':scope > [aria-checked="true"], :scope > [aria-selected="true"], :scope > [aria-pressed="true"]';

/** The option each bar's highlight was last placed on, and the values written, so unchanged ones are not rewritten. */
const placed = new WeakMap<HTMLElement, { on: HTMLElement | null; v: string }>();

function place(el: HTMLElement, force: boolean) {
  const on = el.querySelector<HTMLElement>(ON);
  const prev = placed.get(el);
  if (!force && prev && prev.on === on) return;
  if (!on) { placed.set(el, { on: null, v: '' }); el.classList.remove('ind-on', 'ind-anim'); return; }
  const v = `${on.offsetLeft},${on.offsetTop},${on.offsetWidth},${on.offsetHeight}`;
  placed.set(el, { on, v });
  if (prev?.v !== v) {
    el.style.setProperty('--ix', `${on.offsetLeft}px`);
    el.style.setProperty('--iy', `${on.offsetTop}px`);
    el.style.setProperty('--iw', `${on.offsetWidth}px`);
    el.style.setProperty('--ih', `${on.offsetHeight}px`);
  }
  if (!el.classList.contains('ind-on')) {
    // first placement: appear in place, then animate later moves
    el.classList.add('ind-on');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('ind-anim')));
  }
}

export function installMotion() {
  if (typeof window === 'undefined') return;
  const tracked = new WeakSet<HTMLElement>();
  const watched = new WeakSet<Element>();
  // a bar or any of its options changing size can move the selected option: re-measure that bar
  const ro = new ResizeObserver((es) => {
    const bars = new Set<HTMLElement>();
    for (const e of es) { const t = e.target as HTMLElement; bars.add(tracked.has(t) ? t : (t.parentElement as HTMLElement)); }
    bars.forEach((b) => b && place(b, true));
  });
  const scan = () => {
    document.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
      if (!tracked.has(el)) {
        if (el.closest(SKIP)) return;
        tracked.add(el); el.classList.add('has-ind'); ro.observe(el);
      }
      for (const c of el.children) if (!watched.has(c)) { watched.add(c); ro.observe(c); }
      place(el, false);
    });
  };
  let pending = false;
  const schedule = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; scan(); }); };
  new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked', 'aria-selected', 'aria-pressed'] });
  document.fonts?.ready.then(() => document.querySelectorAll<HTMLElement>(SEL).forEach((el) => tracked.has(el) && place(el, true)));
  schedule();
}
