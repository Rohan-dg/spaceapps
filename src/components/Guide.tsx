import { ArrowRight, Earth, Sun, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PRESETS, type Preset } from '../lib/presets';
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

interface Props { onClose: () => void; onPreset: (p: Preset) => void; firstVisit: boolean }

export default function Guide({ onClose, onPreset, firstVisit }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="guide-h" onClick={onClose}>
      <div className="modal guide" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} className="icon-btn modal-close" onClick={onClose} aria-label="Close the guide"><X size={18} /></button>
        <span className="eyebrow">{firstVisit ? 'Welcome' : 'How to use'}</span>
        <h2 id="guide-h">Can a Moon lander get sunlight and still call home?</h2>
        <p className="guide-lead">
          At the Moon's south pole the Sun never climbs more than a degree or two above the horizon. A small hill can mean
          days of darkness (no solar power) or no line of sight to Earth (no radio). This app uses real NASA terrain to show,
          for any landing site and date, when you get <b className="t-sun">sunlight</b> and when you can <b className="t-earth">see Earth</b>.
        </p>

        <h3>Quick start: 30 seconds</h3>
        <ol className="quickstart">
          <li><span className="step-n">1</span><div><b>Pick a landing site</b> from the list on the left. Twelve real sites, from Artemis III candidates to Apollo 11.</div></li>
          <li><span className="step-n">2</span><div><b>Pick a moment.</b> Press <b>Play</b> to watch time pass, or drag the time slider anywhere in 2027–2029.</div></li>
          <li><span className="step-n">3</span><div><b>Read the answer.</b> Two traffic lights rate <b>solar power</b> and the <b>radio link to Earth</b> for the next month.</div></li>
        </ol>

        <h3>What you're looking at</h3>
        <dl className="legend-grid">
          <dt><Key k="terrain" /></dt><dd><b>The horizon.</b> Mountains and crater rims all around the site, measured by NASA's LRO laser altimeter (LOLA).</dd>
          <dt><Key k="sun" /></dt><dd><b>The Sun.</b> If it is above the grey terrain, the site is in sunlight and solar panels work.</dd>
          <dt><Key k="earth" /></dt><dd><b>Earth.</b> If it is above the terrain, the lander can radio Earth directly.</dd>
          <dt><Key k="hidden" /></dt><dd><b>Dashed outline:</b> the Sun or Earth is behind a mountain.</dd>
          <dt><Key k="path" /></dt><dd><b>Dotted trail:</b> where it will move over the next 24 hours.</dd>
          <dt><Key k="flat" /></dt><dd><b>Dashed line:</b> the "flat" horizon (0°). At the pole, terrain matters more than this line.</dd>
          <dt className="lvls"><LevelIcon level="green" size={16} /><LevelIcon level="amber" size={16} /><LevelIcon level="red" size={16} /></dt>
          <dd><b>Good, Marginal, Poor.</b> The rating for the next 29.5 days (one lunar day): how much of the time there is sun or Earth, and the longest gap without it.</dd>
          <dt className="lvls"><Sun size={16} className="ico-sun on" aria-hidden /><Earth size={16} className="ico-earth on" aria-hidden /></dt>
          <dd><b>Site list icons:</b> lit icons mean sunlit or Earth in view <i>right now</i>. Greyed out means in shadow or hidden.</dd>
        </dl>
        <p className="muted small">The vertical axis of the horizon chart is stretched so that one-degree ridges are visible. Hover over the chart to read the exact angles.</p>

        <h3>Try an example</h3>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button key={p.id} className="preset-card" onClick={() => onPreset(p)}>
              <span className="preset-title">{p.title} <ArrowRight size={14} aria-hidden /></span>
              <span className="preset-blurb">{p.blurb}</span>
            </button>
          ))}
        </div>

        <div className="guide-foot">
          <p className="muted small">Shortcuts: <kbd>Space</kbd> play/pause · <kbd>←</kbd> <kbd>→</kbd> one hour · <kbd>Shift</kbd> + arrows one day · <kbd>?</kbd> this guide</p>
          <button className="btn-primary" onClick={onClose}>Start exploring <ArrowRight size={15} aria-hidden /></button>
        </div>
      </div>
    </div>
  );
}
