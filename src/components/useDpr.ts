import { useEffect, useState } from 'react';

/**
 * Live device pixel ratio. Browser zoom and moving the window between displays change it without
 * resizing the element, so canvases that only redraw on resize go blurry; this re-renders them.
 */
export function useDpr(): number {
  const read = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
  const [dpr, setDpr] = useState(read);
  useEffect(() => {
    let mq: MediaQueryList | null = null;
    const watch = () => {
      const v = read();
      setDpr(v);
      mq?.removeEventListener('change', watch);
      mq = window.matchMedia?.(`(resolution: ${v}dppx)`) ?? null;
      mq?.addEventListener('change', watch);
    };
    watch();
    return () => mq?.removeEventListener('change', watch);
  }, []);
  return dpr;
}

/** Size a canvas backing store to whole device pixels and return the scale to draw with. */
export function fitCanvas(cv: HTMLCanvasElement, w: number, h: number, dpr: number): CanvasRenderingContext2D {
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d')!;
  g.setTransform(cv.width / w, 0, 0, cv.height / h, 0, 0);
  return g;
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
