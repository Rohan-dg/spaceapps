import { X } from 'lucide-react';
import type { SitesDoc } from '../lib/data';
import Term from './Term';

export function Explainer() {
  return (
    <section className="explainer" aria-labelledby="why-h">
      <h2 id="why-h">Why one degree decides everything</h2>
      <ol>
        <li><b>The Sun barely rises.</b> The Moon's <Term t="axial-tilt">axis tilts 1.54°</Term>, so at the south pole the Sun circles the horizon and never climbs much past 1.5°. A one-degree ridge can block it for days.</li>
        <li><b>Earth sits on the skyline.</b> From the pole, Earth hovers near the horizon and <Term t="libration">drifts about ±7°</Term> over a month. A small hill is enough to cut the <Term t="dte">direct radio link</Term>.</li>
        <li><b>Only the terrain counts.</b> No air means no twilight and no refraction. What you see is the <Term t="terrain-horizon">skyline</Term> from laser altimetry, with the Moon's curvature taken into account.</li>
        <li><b>Small moves flip the answer.</b> A few kilometres or a few days can turn near-constant sunlight into a week of night. Some crater floors are in <Term t="psr">permanent shadow</Term>.</li>
      </ol>
    </section>
  );
}

export default function About({ doc, onClose }: { doc: SitesDoc; onClose: () => void }) {
  const dems = [...new Set(doc.sites.map((s) => `${s.dem}${s.demResolutionM ? ` (${s.demResolutionM} m/px)` : ''}`))];
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="about-h" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <h2 id="about-h">Method and sources</h2>
        <p>This tool shows where the Sun and Earth sit against the real skyline at Moon landing sites, and for how long. Use it to compare sites and dates for power and direct-to-Earth radio. It was built for a hackathon and is not a mission-planning tool of record.</p>
        <h3>Where the numbers come from</h3>
        <ul>
          <li><b>Sun and Earth positions:</b> <a href="https://github.com/cosinekitty/astronomy">astronomy-engine</a>, rotated into the IAU Moon-fixed frame and then into each site's east-north-up frame. There is no refraction to model. Checked against <a href="https://ssd.jpl.nasa.gov/horizons/">JPL Horizons</a> (DE441) at 10 site/time points: worst error 0.004°.</li>
          <li><b>Horizon (skyline):</b> NASA LRO <a href="https://pds-geosciences.wustl.edu/missions/lro/lola.htm">LOLA</a> elevation grids ({dems.join(', ')}). For each degree of azimuth, a ray runs 150 km out from a 2 m mast, with lunar curvature included.</li>
          <li><b>Timing:</b> Sun and Earth visibility every 30 minutes from {doc.range.start.slice(0, 10)} to {doc.range.end.slice(0, 10)} UTC. Rise and set times are refined to about a minute.</li>
          <li><b>Coordinates:</b> each site lists its source. A "verify" flag means the coordinate has not been checked against the source. Rim and summit points are moved onto the nearby high ground, and the app says how far.</li>
        </ul>
        <h3>Limits</h3>
        <ul>
          <li>The terrain grid is 40 m at the pole and about 1.9 km elsewhere. Boulders and small ridges are missing, so skyline angles are good to roughly 0.1–0.3°.</li>
          <li>"Sunlit" means the centre of the Sun is above the skyline. Partial sunlight and light reflected off nearby slopes are not counted.</li>
          <li>"Earth in view" means the centre of Earth is above the skyline. Antenna patterns, link budgets and relay satellites are not modelled.</li>
        </ul>
        <h3>Credits</h3>
        <ul>
          <li>NASA Lunar Reconnaissance Orbiter, LOLA team; PDS Geosciences Node, Washington University in St. Louis.</li>
          <li>NASA/JPL Solar System Dynamics: Horizons.</li>
          <li>NASA Moon Trek and LROC QuickMap, used for site context.</li>
          <li>Site sources are cited per site in <code>data/sites.json</code>.</li>
        </ul>
        <p className="disclaimer">Built with publicly available NASA data. NASA does not endorse any non-U.S. Government entity and is not responsible for information on non-U.S. Government websites.</p>
      </div>
    </div>
  );
}
