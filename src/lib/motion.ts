/**
 * Sliding selection for segmented controls and tab bars (.seg, .tabs), in the manner of a native
 * segmented control: one highlight that glides to the selected option instead of jumping.
 *
 * The highlight is the container's ::before, positioned through CSS variables, so React's DOM is never
 * touched. Controls inside the 3D views (.moon, .tv) are left alone.
 */
const SEL = '.seg, .tabs';
const SKIP = '.moon, .tv';

function place(el: HTMLElement) {
  const on = el.querySelector<HTMLElement>(':scope > [aria-checked="true"], :scope > [aria-selected="true"]');
  if (!on) { el.classList.remove('ind-on'); return; }
  el.style.setProperty('--ix', `${on.offsetLeft}px`);
  el.style.setProperty('--iy', `${on.offsetTop}px`);
  el.style.setProperty('--iw', `${on.offsetWidth}px`);
  el.style.setProperty('--ih', `${on.offsetHeight}px`);
  if (!el.classList.contains('ind-on')) {
    // first placement: appear in place, then animate later moves
    el.classList.add('ind-on');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('ind-anim')));
  }
}

export function installMotion() {
  if (typeof window === 'undefined') return;
  const tracked = new WeakSet<HTMLElement>();
  const ro = new ResizeObserver((es) => es.forEach((e) => place(e.target as HTMLElement)));
  const scan = () => {
    document.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
      if (el.closest(SKIP)) return;
      if (!tracked.has(el)) { tracked.add(el); el.classList.add('has-ind'); ro.observe(el); }
      place(el);
    });
  };
  let pending = false;
  const schedule = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; scan(); }); };
  new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked', 'aria-selected'] });
  document.fonts?.ready.then(schedule);
  schedule();
}
