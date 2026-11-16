/**
 * Cursor light for the glass panes (styles/tahoe.css): every pane under the pointer gets its position as --mx/--my
 * (pixels inside the pane) and --px/--py (-1 to 1 across it), and --ga fades to 1; panes the pointer has left fade
 * back to 0 where it last was, so the light dims in place instead of jumping. Mouse and pen only: a finger has
 * no hover. One listener for the whole page, at most one update per frame.
 */
const PANES = [
  '.dash .glass', '.dash .pill', '.dash .chip', '.dash .dt-pill', '.dash .hud-tr',
  '.edu .edu-glass', '.edu .edu-card', '.edu .edu-pg', '.edu .edu-dock button', '.edu .edu-top .ui-toggle', '.edu .edu-actions', '.edu .edu-rover', '.edu .hud-seg button', '.edu .hud-toggle',
  '.chooser-backdrop .chooser', '.chooser-backdrop .chooser-card',
  '.rg .rg-bar', '.rg .rg-goal', '.rg button.rg-radio', '.rg .rg-controls',
].join(', ');

export function installPointerGlow() {
  if (typeof window === 'undefined' || !window.matchMedia?.('(hover: hover)').matches) return;
  let lit = new Set<HTMLElement>(), raf = 0, last: PointerEvent | null = null;
  const ready = new WeakSet<HTMLElement>();
  // --ga needs a transition to fade; add it to whatever the pane already transitions instead of replacing that
  const prep = (el: HTMLElement) => {
    if (ready.has(el)) return;
    ready.add(el);
    const t = getComputedStyle(el).transition, fade = '--ga 380ms ease';
    el.style.transition = !t || /^all 0s ease 0s$/.test(t) ? fade : `${t}, ${fade}`;
  };
  const dim = (keep: Set<HTMLElement>) => { lit.forEach((el) => { if (!keep.has(el)) el.style.setProperty('--ga', '0'); }); lit = keep; };
  const frame = () => {
    raf = 0;
    const ev = last;
    if (!ev) return;
    const next = new Set<HTMLElement>();
    for (let el = ev.target instanceof Element ? ev.target : null; el; el = el.parentElement) {
      if (el instanceof HTMLElement && el.matches(PANES)) next.add(el);
    }
    next.forEach((el) => {
      prep(el);
      const r = el.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      el.style.setProperty('--mx', `${x.toFixed(1)}px`);
      el.style.setProperty('--my', `${y.toFixed(1)}px`);
      el.style.setProperty('--px', r.width ? ((x / r.width) * 2 - 1).toFixed(3) : '0');
      el.style.setProperty('--py', r.height ? ((y / r.height) * 2 - 1).toFixed(3) : '0');
      el.style.setProperty('--ga', '1');
    });
    dim(next);
  };
  document.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'touch') return;
    last = ev;
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { last = null; dim(new Set()); });
  window.addEventListener('blur', () => dim(new Set()));
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
