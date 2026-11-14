import { CircleHelp } from 'lucide-react';
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

/** Numbered step heading, so the screen itself reads as the three-step quick start. */
export function Step({ n, title, hint, help }: { n: number; title: string; hint?: ReactNode; help?: ReactNode }) {
  return (
    <div className="step">
      <span className="step-n" aria-hidden>{n}</span>
      <div>
        <h3 className="step-title"><span className="sr-only">Step {n}: </span>{title}{help && <HelpTip>{help}</HelpTip>}</h3>
        {hint && <p className="step-hint">{hint}</p>}
      </div>
    </div>
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
