/**
 * Icon set drawn for this app in the visual language of Apple's SF Symbols: 24-unit grid, round caps and
 * joins, optical stroke of 1.6, filled variants for status. These are original drawings, not Apple's glyphs
 * (SF Symbols are licensed for Apple platforms only). Names match the icons they replace.
 */
import type { ReactNode, SVGProps } from 'react';

type P = { size?: number; className?: string; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' | 'false'; title?: string } & Omit<SVGProps<SVGSVGElement>, 'ref'>;

function Svg({ size = 16, className, strokeWidth = 1.6, children, title, ...rest }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={`sf${className ? ` ${className}` : ''}`} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} {...rest}>
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

const rays = (r0: number, r1: number, n = 8, rot = 0) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2 + rot;
  return <line key={i} x1={12 + r0 * Math.cos(a)} y1={12 + r0 * Math.sin(a)} x2={12 + r1 * Math.cos(a)} y2={12 + r1 * Math.sin(a)} />;
});

export const ChevronRight = (p: P) => <Svg {...p}><path d="M9.5 5.5 16 12l-6.5 6.5" /></Svg>;
export const ChevronLeft = (p: P) => <Svg {...p}><path d="M14.5 5.5 8 12l6.5 6.5" /></Svg>;
export const ArrowRight = (p: P) => <Svg {...p}><path d="M4.5 12h14.5M13.5 6.5 19 12l-5.5 5.5" /></Svg>;
export const X = (p: P) => <Svg {...p}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></Svg>;
export const Plus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;

/** sun.max */
export const Sun = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4.2" />{rays(6.8, 9.2)}</Svg>;
/** sun.min: short rays, for "no sun" states */
export const SunDim = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3.6" />{rays(6.2, 6.9)}</Svg>;
/** globe.americas-like: meridians and parallels */
export const Earth = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.6" /><ellipse cx="12" cy="12" rx="3.8" ry="8.6" /><path d="M3.6 9.2h16.8M3.6 14.8h16.8" /></Svg>
);
export const Satellite = (p: P) => (
  <Svg {...p}><rect x="9.6" y="9.6" width="4.8" height="4.8" rx="1" transform="rotate(45 12 12)" /><path d="M8.2 8.2 4.4 4.4M6.6 3 3 6.6M15.8 15.8l3.8 3.8M17.4 21l3.6-3.6M5 15.5a4.5 4.5 0 0 0 3.5 3.5M5.6 12.4a6 6 0 0 0 6 6" /></Svg>
);
export const Copy = (p: P) => <Svg {...p}><rect x="8.5" y="8.5" width="11" height="11" rx="2.4" /><path d="M15.5 5.6V5a1.5 1.5 0 0 0-1.5-1.5H6A2.5 2.5 0 0 0 3.5 6v8A1.5 1.5 0 0 0 5 15.5h.6" /></Svg>;
export const Download = (p: P) => <Svg {...p}><path d="M12 3.8v11.4M7.4 10.8 12 15.4l4.6-4.6M4.5 15.5v2.2a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5v-2.2" /></Svg>;
export const Info = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.8" /><path d="M12 11v5.4" /><circle cx="12" cy="7.9" r="0.4" fill="currentColor" /></Svg>;
export const CircleHelp = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.8" /><path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2.9-1.2 1.8v.5" /><circle cx="12" cy="16.9" r="0.4" fill="currentColor" /></Svg>;
export const Search = (p: P) => <Svg {...p}><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.5 15.5 4.5 4.5" /></Svg>;
export const Globe = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.6" /><circle cx="9" cy="9.5" r="1.8" /><circle cx="15" cy="14.5" r="2.4" /><circle cx="8.6" cy="15.6" r="0.9" /></Svg>;
/** circle.lefthalf.filled */
export const Contrast = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.6" /><path d="M12 3.4a8.6 8.6 0 0 0 0 17.2z" fill="currentColor" stroke="none" /></Svg>;
export const Sparkles = (p: P) => (
  <Svg {...p}><path d="M10 3.5c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6z" /><path d="M17.5 14.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5z" /></Svg>
);
export const SlidersHorizontal = (p: P) => <Svg {...p}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Svg>;
export const RotateCcw = (p: P) => <Svg {...p}><path d="M4.6 12a7.4 7.4 0 1 0 2.2-5.2L4.4 9.2" /><path d="M4.4 4.6v4.6H9" /></Svg>;
export const Play = (p: P) => <Svg {...p}><path d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L8.7 4.5a.8.8 0 0 0-1.2.7z" fill="currentColor" /></Svg>;
export const Pause = (p: P) => <Svg {...p}><rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" /><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" /></Svg>;
export const Columns2 = (p: P) => <Svg {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M12 4.5v15" /></Svg>;
export const CalendarSync = (p: P) => <Svg {...p}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M14.6 13.2a3 3 0 1 0 .3 3.2M14.9 12v1.6h-1.6" /></Svg>;
export const Calculator = (p: P) => <Svg {...p}><rect x="5" y="3" width="14" height="18" rx="3" /><rect x="8" y="6" width="8" height="3.4" rx="0.8" /><circle cx="9" cy="13" r=".5" fill="currentColor" /><circle cx="12" cy="13" r=".5" fill="currentColor" /><circle cx="15" cy="13" r=".5" fill="currentColor" /><circle cx="9" cy="16.6" r=".5" fill="currentColor" /><circle cx="12" cy="16.6" r=".5" fill="currentColor" /><circle cx="15" cy="16.6" r=".5" fill="currentColor" /></Svg>;

/* status, filled like the ".fill" symbol variants */
export const CircleCheck = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" /><path d="m8 12.3 2.7 2.7L16.2 9.4" stroke="var(--icon-knock, #fff)" strokeWidth={2} /></Svg>
);
export const TriangleAlert = (p: P) => (
  <Svg {...p}><path d="M10.4 4.4a1.85 1.85 0 0 1 3.2 0l7.3 12.9a1.85 1.85 0 0 1-1.6 2.8H4.7a1.85 1.85 0 0 1-1.6-2.8z" fill="currentColor" stroke="none" /><path d="M12 9v4.4" stroke="var(--icon-knock, #fff)" strokeWidth={2} /><circle cx="12" cy="16.6" r=".6" fill="var(--icon-knock, #fff)" stroke="var(--icon-knock, #fff)" /></Svg>
);
export const OctagonX = (p: P) => (
  <Svg {...p}><path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z" fill="currentColor" stroke="none" /><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" stroke="var(--icon-knock, #fff)" strokeWidth={2} /></Svg>
);

/* extra glyphs for the 3D view */
const extra: Record<string, ReactNode> = {
  shadow: <><circle cx="9" cy="10" r="4.4" /><path d="M12.4 13.4 20 21M14.6 11.6 21 18M10.6 14.6 17 21" /></>,
  mountain: <path d="M2.8 19.5 9.2 8.8l3.4 5.4 2.2-3.2 6.4 8.5z" />,
  sparkle: <path d="M12 3.5c.7 4.3 2.9 6.5 7.2 7.2-4.3.7-6.5 2.9-7.2 7.2-.7-4.3-2.9-6.5-7.2-7.2C9.1 10 11.3 7.8 12 3.5z" />,
  rover: <><rect x="4" y="8" width="16" height="7" rx="1.5" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /><path d="M12 8V4.5M10 4.5h4" /></>,
  lamp: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></>,
  scope: <><circle cx="12" cy="12" r="7.5" /><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" /></>,
};
export const Icon = ({ name, ...p }: P & { name: keyof typeof extra | string }) => <Svg {...p}>{extra[name]}</Svg>;
