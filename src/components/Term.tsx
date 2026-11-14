import type { ReactNode } from 'react';

export const GLOSSARY: Record<string, string> = {
  elevation: 'Angle above the local horizontal plane (the plane tangent to the Moon at the site). Negative values are below it.',
  azimuth: 'Compass direction measured clockwise from local north: 0° N, 90° E, 180° S, 270° W.',
  'terrain-horizon': 'The skyline formed by mountains and crater rims, computed from NASA LOLA elevation data. The Sun or Earth must rise above this line, not just above 0°, to be seen.',
  libration: "The Moon's slight wobble as seen from Earth. From the lunar surface it makes Earth drift by about ±7° in the sky over a month, enough to dip it behind nearby ridges.",
  dte: 'Direct-to-Earth: a radio link straight to ground stations on Earth, with no relay satellite. It needs Earth above the terrain horizon.',
  'lunar-day': 'One synodic month, 29.53 Earth days: a full cycle of sunlight at any spot on the Moon.',
  psr: 'Permanently Shadowed Region: crater floors near the poles that sunlight never reaches. They are very cold and may hold water ice.',
  'axial-tilt': "The Moon's spin axis is tilted only ~1.54° to the ecliptic, so at the poles the Sun always grazes the horizon.",
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
