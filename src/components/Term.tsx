import type { ReactNode } from 'react';

export const GLOSSARY: Record<string, string> = {
  elevation: 'Angle above the flat horizon: the plane that touches the Moon at the site. Negative means below it.',
  azimuth: 'Compass direction measured clockwise from local north: 0° N, 90° E, 180° S, 270° W.',
  'terrain-horizon': 'The line of mountains and crater rims, traced from NASA LOLA elevation data. The Sun or Earth has to clear this line, not just 0°, to be seen.',
  libration: "The Moon's monthly wobble. Seen from the surface, Earth drifts about ±7° up and down, enough to drop behind a nearby ridge.",
  dte: 'Direct-to-Earth: radio straight to dishes on Earth, no relay satellite. Needs Earth above the skyline.',
  'lunar-day': '29.53 Earth days: one full cycle of light and dark anywhere on the Moon.',
  'no-refraction': 'The Moon has no atmosphere, so light travels in straight lines. The horizon is set only by terrain and the curve of the Moon, with no refraction correction. On a perfectly smooth Moon it would sit about 0.09° below level for a 2 m mast; real terrain raises it near ridges and lowers it from peaks. On Earth, air bends sunlight so the Sun appears about 0.57° higher at the horizon.',
  psr: 'Crater floors near the poles that sunlight never reaches. Cold enough to trap water ice.',
  'axial-tilt': "The Moon's spin axis leans only 1.54° from upright, so at the poles the Sun always skims the horizon.",
  exaggeration: 'The vertical axis is stretched so that one-degree ridges are visible. Real slopes look much flatter.',
};

export default function Term({ t, children }: { t: string; children: ReactNode }) {
  const tip = GLOSSARY[t];
  if (!tip) return <>{children}</>;
  return (
    <span className="term" tabIndex={0} aria-describedby={`tip-${t}`}>
      {children}
      <span className="term-tip" role="tooltip" id={`tip-${t}`}>{tip}</span>
    </span>
  );
}
