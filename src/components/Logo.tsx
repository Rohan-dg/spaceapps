/**
 * Sol Teris mark: the Sun half risen behind a lunar ridge, which is the question the app answers.
 * The Sun takes --logo-sun (default: the accent) and the ridge takes --logo-ridge (default: the text colour),
 * so the same mark works in the header, the intro, on the laptop and in the favicon (public/favicon.svg).
 */
export function LogoMark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`logo-mark ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle className="logo-sun" cx="12.5" cy="11" r="6.5" />
      <path className="logo-ridge" d="M1 21.5 L6.5 14 L10 17 L14 12.2 L18.5 16.4 L23 13.2 V21.5 Z" />
    </svg>
  );
}
