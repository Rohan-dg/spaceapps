import { CircleHelp } from './Icons';
import { useId, type ReactNode } from 'react';

/**
 * Inline "?" help: a small focusable icon that shows a one-paragraph explanation on hover or focus.
 * `align="right"` anchors the bubble to the icon's right edge so it never runs off the screen.
 */
export function HelpTip({ children, label = 'What is this?', align = 'left' }: { children: ReactNode; label?: string; align?: 'left' | 'right' }) {
  const id = useId();
  return (
    <span className="help" tabIndex={0} role="button" aria-label={label} aria-describedby={id}>
      <CircleHelp size={14} aria-hidden />
      <span className={`term-tip${align === 'right' ? ' right' : ''}`} role="tooltip" id={id}>{children}</span>
    </span>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="loading-label"><span className="loader" aria-hidden />{label}</span>
      <span className="skel" style={{ width: '94%' }} aria-hidden />
      <span className="skel" style={{ width: '78%' }} aria-hidden />
      <span className="skel" style={{ width: '86%' }} aria-hidden />
    </div>
  );
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 4 commits), under the team's direction. Attribution from the commit history.
