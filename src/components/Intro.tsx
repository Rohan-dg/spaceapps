import { useEffect, useState } from 'react';

/**
 * Opening sting, on black: a laptop rises and flips up, its lid swings open and the screen lights, the camera
 * dives into the screen, then the wordmark slams in ("Sol" whips in from the left, the orange "Teris" box drops,
 * squashes and bounces) and shakes before the overlay fades to reveal the app, which loads underneath throughout.
 * Silent, about 4 s, skipped by any click or key, and not shown at all when the OS asks for reduced motion.
 * The timings live in the CSS (index.css, "opening sting"); LEAVE_MS is when the fade-out starts.
 */
const LEAVE_MS = 3700;

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
              <div className="lt-screen"><i /></div>
              <div className="lt-shell"><i /></div>
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
        <span className="intro-word">Sol</span>
        <span className="intro-box">Teris</span>
      </div>
    </div>
  );
}
