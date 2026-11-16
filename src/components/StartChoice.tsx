/**
 * After the tutorial: one small glass screen with two choices, drive a rover or experiment on your own.
 * Same glass, type and motion as the Scientific dashboard.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Play } from './Icons';

export default function StartChoice({ onRover, onExplore }: { onRover: () => void; onExplore: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onExplore(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onExplore]);
  return createPortal(
    <div className="start-pick" role="dialog" aria-modal="true" aria-labelledby="start-pick-title">
      <div className="start-pick-card">
        <h2 id="start-pick-title">What would you like to do?</h2>
        <div className="start-pick-buttons">
          <button ref={first} className="start-pick-go" onClick={onRover}><Play size={18} /> Drive a rover</button>
          <button onClick={onExplore}><Globe size={18} /> Experiment</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
