import { Earth, Sun, X } from './Icons';
import { useEffect, useRef } from 'react';
import { LevelIcon } from './Metrics';

/** Small inline keys that match what the charts draw, so the legend is literally the same marks. */
export function Key({ k }: { k: 'sun' | 'earth' | 'hidden' | 'path' | 'terrain' | 'flat' }) {
  const common = { width: 26, height: 16, viewBox: '0 0 26 16', 'aria-hidden': true } as const;
  switch (k) {
    case 'sun': return <svg {...common}><circle cx="13" cy="8" r="5.5" fill="var(--sun-disk)" stroke="var(--sun)" strokeWidth="1.5" /></svg>;
    case 'earth': return <svg {...common}><circle cx="13" cy="8" r="5.5" fill="var(--earth)" /></svg>;
    case 'hidden': return <svg {...common}><circle cx="13" cy="8" r="5.5" fill="none" stroke="var(--ink-2)" strokeWidth="1.5" strokeDasharray="3 2" /></svg>;
    case 'path': return <svg {...common}><path d="M2 11 Q13 3 24 9" fill="none" stroke="var(--sun)" strokeWidth="1.5" strokeDasharray="2 3" /></svg>;
    case 'terrain': return <svg {...common}><path d="M0 16V9l5-3 5 4 6-6 5 4 5-1v9z" fill="var(--terrain)" stroke="var(--terrain-edge)" strokeWidth="1" /></svg>;
    case 'flat': return <svg {...common}><path d="M1 8h24" stroke="var(--ink-2)" strokeWidth="1.2" strokeDasharray="4 3" /></svg>;
  }
}

interface Props { onClose: () => void }

/** Help: chart legend and keyboard shortcuts. Opens only from the Help button or the ? key. */
export default function Guide({ onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="guide-h" onClick={onClose}>
      <div className="modal guide" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} className="icon-btn modal-close" onClick={onClose} aria-label="Close help"><X size={16} /></button>
        <h2 id="guide-h">Help</h2>

        <h3>Legend</h3>
        <dl className="legend-grid">
          <dt><Key k="terrain" /></dt><dd><b>Terrain skyline</b>, LRO LOLA, per degree of azimuth.</dd>
          <dt><Key k="sun" /></dt><dd><b>Sun</b>, drawn at true angular size. Above the skyline: sunlit.</dd>
          <dt><Key k="earth" /></dt><dd><b>Earth</b>. Above the skyline: direct-to-Earth link possible.</dd>
          <dt><Key k="hidden" /></dt><dd><b>Occluded</b>: Sun or Earth behind terrain.</dd>
          <dt><Key k="path" /></dt><dd><b>Track</b>, next 24 h.</dd>
          <dt><Key k="flat" /></dt><dd><b>0° horizon</b> (local tangent plane).</dd>
          <dt className="lvls"><LevelIcon level="green" size={16} /><LevelIcon level="amber" size={16} /><LevelIcon level="red" size={16} /></dt>
          <dd><b>Good / Marginal / Poor</b> over the next 29.5 d (one lunar day). Power: Good at 70% or more sunlit and no dark spell over about 4 d. Radio to Earth: Good at 90% or more in view and no gap over 24 h.</dd>
          <dt className="lvls"><Sun size={16} className="ico-sun on" aria-hidden /><Earth size={16} className="ico-earth on" aria-hidden /></dt>
          <dd><b>Site list</b>: filled when sunlit or Earth in view now; grey when not.</dd>
        </dl>
        <p className="small">Panorama height is exaggerated; the factor is shown under the chart. Hover the chart for exact angles.</p>

        <h3>Shortcuts</h3>
        <table className="kbd-table">
          <tbody>
            <tr><th scope="row"><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd></th><td>Search sites, presets and actions</td></tr>
            <tr><th scope="row"><kbd>1</kbd> – <kbd>4</kbd></th><td>Explore, Compare, Calculator, Launch</td></tr>
            <tr><th scope="row"><kbd>Space</kbd></th><td>Play / pause</td></tr>
            <tr><th scope="row"><kbd>←</kbd> <kbd>→</kbd></th><td>Step 1 h</td></tr>
            <tr><th scope="row"><kbd>Shift</kbd> + <kbd>←</kbd> <kbd>→</kbd></th><td>Step 1 d</td></tr>
            <tr><th scope="row"><kbd>?</kbd></th><td>Help</td></tr>
            <tr><th scope="row"><kbd>Esc</kbd></th><td>Close dialog</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
