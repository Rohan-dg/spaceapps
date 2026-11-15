/**
 * Whether the opening sting (components/Intro.tsx) is covering the page. The 3D Moon checks this so it does no
 * GPU work behind the opaque intro: rendering the globe there (shadow march, antialiasing accumulation, the
 * drift-in from deep space) competed with the intro's own drawing and made it stutter on slower laptops.
 */
let active = false;
const waiters = new Set<() => void>();

export const introActive = () => active;

export function setIntroActive(on: boolean) {
  active = on;
  if (on) return;
  const w = [...waiters];
  waiters.clear();
  w.forEach((f) => f());
}

/** run cb once the intro is gone (right away if it isn't showing); returns a cancel function */
export function whenIntroDone(cb: () => void): () => void {
  if (!active) { cb(); return () => {}; }
  waiters.add(cb);
  return () => { waiters.delete(cb); };
}
