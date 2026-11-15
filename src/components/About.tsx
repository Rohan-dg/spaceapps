import { X } from './Icons';
import type { SitesDoc } from '../lib/data';

/** Written to answer the Space Apps judging criteria in order: impact, creativity, validity, relevance, presentation. */
export default function About({ doc, onClose }: { doc: SitesDoc; onClose: () => void }) {
  const dems = [...new Set(doc.sites.map((s) => `${s.dem}${s.demResolutionM ? ` (${s.demResolutionM} m/px)` : ''}`))];
  const start = doc.range.start.slice(0, 10), end = doc.range.end.slice(0, 10);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="about-h" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        <h2 id="about-h">About Sol Teris</h2>

        <h3>The problem</h3>
        <p>
          At the lunar south pole the Sun stays within a few degrees of the horizon and Earth hangs low, drifting with libration.
          There is no atmosphere and no twilight, so one ridge decides whether a lander has solar power and a direct radio link to Earth.
          The tools that compute this exist, but they are hard to use quickly, which makes comparing sites and dates slow.
        </p>

        <h3>What the tool does</h3>
        <p>
          Pick a site and a time. The app shows where the Sun and Earth sit against the real terrain skyline, how long each stays up,
          and a power and radio rating for the next lunar day. A three-year calendar ({start} to {end}) marks the best landing windows,
          and up to four site and date scenarios can be compared side by side. Any point on the Moon can be checked, not only the {doc.sites.length} listed sites.
        </p>

        <h3>Who it helps</h3>
        <ul>
          <li><b>Mission planners</b> weighing landing sites and dates for power and direct-to-Earth communication, as in NASA's CLPS program.</li>
          <li><b>Educators</b> showing why the poles have near-constant light on some ridges and permanent shadow in nearby craters.</li>
          <li><b>The public</b>, who can see the same answers without reading an ephemeris.</li>
        </ul>

        <h3>What is new</h3>
        <ul>
          <li>The skyline comes from the terrain itself: for each degree of azimuth, a ray runs 150 km out from a 2 m mast, with lunar curvature included, so distant massifs that matter at grazing Sun angles are counted.</li>
          <li>The 3D Moon traces shadows on the same heights the numbers use, so the picture and the figures agree.</li>
          <li>Custom points are computed in the browser in a few seconds, and a rover range and launch planner build on the same results.</li>
        </ul>

        <h3>How the numbers are checked</h3>
        <ul>
          <li>Sun and Earth positions come from <a href="https://github.com/cosinekitty/astronomy">astronomy-engine</a>, rotated into the IAU Moon-fixed frame. Checked against <a href="https://ssd.jpl.nasa.gov/horizons/">JPL Horizons</a> (DE441) at 10 site and time points: worst error 0.004°.</li>
          <li>Visibility is sampled every 30 minutes over the three years, and rise and set times are refined to about a minute.</li>
          <li>Custom points use a coarser 400 m terrain grid. Tested against the full 40 m pipeline, their skylines differ by 0.1 to 0.6° on average and 2.4° at worst, and the app labels them approximate.</li>
          <li>Each site lists the source of its coordinates. Rim and summit points are moved onto the nearby high ground, and the app says how far. A "verify" flag means a coordinate has not yet been checked against its source.</li>
        </ul>

        <h3>NASA data used</h3>
        <ul>
          <li><b>Terrain:</b> NASA LRO <a href="https://pds-geosciences.wustl.edu/missions/lro/lola.htm">LOLA</a> elevation grids ({dems.join(', ')}). Every skyline, rating and calendar value is computed from them.</li>
          <li><b>Ephemeris check:</b> NASA/JPL Solar System Dynamics, Horizons.</li>
          <li><b>3D Moon:</b> LROC WAC colour and LOLA relief from the NASA SVS <a href="https://svs.gsfc.nasa.gov/4720">CGI Moon Kit</a>. Near the pole the view switches to LOLA at 148 m, then to 5, 10 or 20 m windows around each site. Craters and rocks smaller than the data are drawn for look only, and the view says so.</li>
          <li><b>Site context:</b> NASA Moon Trek and LROC QuickMap.</li>
        </ul>

        <h3>Limits</h3>
        <ul>
          <li>The terrain grid is 40 m at the pole and about 1.9 km elsewhere. Boulders and small ridges are missing, so skyline angles are good to roughly 0.1 to 0.3°.</li>
          <li>"Sunlit" means the centre of the Sun is above the skyline. Partial sunlight and light reflected off nearby slopes are not counted.</li>
          <li>"Earth in view" means the centre of Earth is above the skyline. Antenna patterns, link budgets and relay satellites are not modelled.</li>
          <li>Not a mission-planning tool of record.</li>
        </ul>

        <h3>Credits</h3>
        <ul>
          <li>NASA Lunar Reconnaissance Orbiter, LOLA team; PDS Geosciences Node, Washington University in St. Louis.</li>
          <li>NASA/JPL Solar System Dynamics: Horizons.</li>
          <li>NASA Scientific Visualization Studio, CGI Moon Kit. LROC team, Arizona State University.</li>
          <li>Site sources are cited per site in <code>data/sites.json</code>.</li>
        </ul>
        <p className="disclaimer">Built with publicly available NASA data. NASA does not endorse any non-U.S. Government entity and is not responsible for information on non-U.S. Government websites.</p>
      </div>
    </div>
  );
}
