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
      <span className="loader" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
