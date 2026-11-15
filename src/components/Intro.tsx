import { useEffect, useState } from 'react';
import { LogoMark } from './Logo';

/**
 * Opening sting, on black: a blue laptop rises and flips up, its lid swings open and the screen lights with the logo,
 * the camera dives into the screen, then the logo builds (the mark pops in, "Sol Teris" slides in) before the
 * overlay fades to reveal the app, which loads underneath throughout. Silent, about 3.9 s, skipped by any click
 * or key, and not shown at all when the OS asks for reduced motion.
 * The timings live in the CSS (index.css, "opening sting"); LEAVE_MS is when the fade-out starts.
 */
const LEAVE_MS = 3500;

export default function Intro() {
  const [show, setShow] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!show) return;
    const out = window.setTimeout(() => setLeaving(true), LEAVE_MS);
    const skip = () => setLeaving(true);
    window.addEventListener('keydown', skip, { once: true });
    return () => { window.clearTimeout(out); window.removeEventListener('keydown', skip); };
  }, [show]);

  if (!show) return null;
  return (
    <div className={`intro${leaving ? ' out' : ''}`} aria-hidden onClick={() => setLeaving(true)}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget && leaving) setShow(false); }}>
      <div className="lt-stage">
        <div className="lt-rig">
          <div className="lt-tilt">
            <div className="lt-lid">
              <div className="lt-screen"><LogoMark /></div>
              <div className="lt-shell"><LogoMark /></div>
            </div>
            <div className="lt-base">
              <div className="lt-keys" />
              <div className="lt-pad" />
              <div className="lt-edge" />
            </div>
          </div>
        </div>
      </div>
      <div className="intro-mark">
        <LogoMark />
        <span className="intro-word">Sol Teris</span>
      </div>
    </div>
  );
}
