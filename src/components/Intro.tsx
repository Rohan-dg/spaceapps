import { useEffect, useState } from 'react';

/**
 * Opening sting: the wordmark builds on black ("Lunar Site" slides in, the orange "Compare" box pops in),
 * holds, then the overlay fades to reveal the app, which has been loading underneath the whole time.
 * Silent, about 1.9 s, skipped by any click or key, and not shown at all when the OS asks for reduced motion.
 */
export default function Intro() {
  const [show, setShow] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!show) return;
    const out = window.setTimeout(() => setLeaving(true), 1500);
    const skip = () => setLeaving(true);
    window.addEventListener('keydown', skip, { once: true });
    return () => { window.clearTimeout(out); window.removeEventListener('keydown', skip); };
  }, [show]);

  if (!show) return null;
  return (
    <div className={`intro${leaving ? ' out' : ''}`} aria-hidden onClick={() => setLeaving(true)}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget && leaving) setShow(false); }}>
      <div className="intro-mark">
        <span className="intro-word">Lunar Site</span>
        <span className="intro-box">Compare</span>
      </div>
    </div>
  );
}
