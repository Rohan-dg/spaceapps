import type { SitesDoc } from '../lib/data';
import Term from './Term';

export function Explainer() {
  return (
    <section className="explainer" aria-labelledby="why-h">
      <h2 id="why-h">Why is this hard?</h2>
      <ul>
        <li><b>The Sun skims the horizon.</b> The Moon's <Term t="axial-tilt">axis tilts only 1.54°</Term>, so near the south pole the Sun circles the sky at most about 1.5° up. A ridge one degree high can hide it for days.</li>
        <li><b>Earth bobs up and down.</b> From the pole, Earth sits near the horizon and <Term t="libration">wobbles about ±7°</Term> over a month. Small hills cut off <Term t="dte">direct-to-Earth</Term> radio.</li>
        <li><b>Terrain decides everything.</b> With no atmosphere there is no twilight and no refraction. The skyline (the <Term t="terrain-horizon">terrain horizon</Term>) comes from NASA laser altimetry, with the Moon's curvature included.</li>
        <li><b>Small moves flip the answer.</b> A few kilometres or a few days can turn near-constant sunlight into a week of darkness. Crater floors in <Term t="psr">permanent shadow</Term> never see the Sun at all.</li>
      </ul>
    </section>
  );
}

export default function About({ doc, onClose }: { doc: SitesDoc; onClose: () => void }) {
  const dems = [...new Set(doc.sites.map((s) => `${s.dem}${s.demResolutionM ? ` (${s.demResolutionM} m/px)` : ''}`))];
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="about-h" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h2 id="about-h">About Lunar Site Compare</h2>
        <p>An educational and planning-support tool that compares Moon south-pole landing sites for sunlight (power) and direct-to-Earth visibility (communications). It is a hackathon prototype and must not be used for mission-critical decisions.</p>
        <h3>How the numbers are made</h3>
        <ul>
          <li><b>Ephemeris:</b> <a href="https://github.com/cosinekitty/astronomy">astronomy-engine</a> gives Sun and Earth positions. These are rotated into the IAU Moon-fixed frame and then into each site's local east-north-up frame, with no refraction. We checked them against <a href="https://ssd.jpl.nasa.gov/horizons/">JPL Horizons</a> (DE441) at 10 site/time points: the maximum error was 0.004°.</li>
          <li><b>Terrain:</b> NASA LRO <a href="https://pds-geosciences.wustl.edu/missions/lro/lola.htm">LOLA</a> gridded elevation products from the PDS Geosciences Node: {dems.join(', ')}. For every 1° of azimuth, rays run out to 150 km from a 2 m observer, with lunar curvature included.</li>
          <li><b>Time series:</b> Sun and Earth visibility every 30 min from {doc.range.start.slice(0, 10)} to {doc.range.end.slice(0, 10)} (UTC). Countdowns are refined to about 1 minute with the live ephemeris.</li>
          <li><b>Coordinates:</b> each site's source is listed with it. Sites marked "verify" come from approximate or remembered coordinates and should be checked. Rim and summit sites are moved to the local DEM high point, and the distance moved is shown.</li>
        </ul>
        <h3>Limitations</h3>
        <ul>
          <li>The terrain resolution (40 m/px at the pole, ~1.9 km/px elsewhere) smooths out boulders and small ridges. Treat horizon angles as good to roughly ±0.1–0.3°.</li>
          <li>"Sunlit" means the Sun's centre is above the terrain. Partial-disk sunlight and reflected light from nearby terrain are not counted as power.</li>
          <li>Earth visibility means Earth's centre is above the terrain. Antenna masks, link budgets and relay satellites are not modelled.</li>
        </ul>
        <h3>Data sources and credits</h3>
        <ul>
          <li>NASA Lunar Reconnaissance Orbiter, Lunar Orbiter Laser Altimeter (LOLA) team. PDS Geosciences Node, Washington University in St. Louis.</li>
          <li>NASA/JPL Solar System Dynamics: Horizons ephemeris system (validation).</li>
          <li>NASA Moon Trek and LROC QuickMap were used as references for site context.</li>
          <li>Site coordinates come from published sources, cited per site in <code>data/sites.json</code>.</li>
        </ul>
        <p className="disclaimer">This project uses publicly available NASA data. NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites.</p>
      </div>
    </div>
  );
}
