import { useEffect, useRef } from 'react';
import { LogoMark } from './Logo';

export type Ui = 'normal' | 'expert';

/**
 * Shown on every load: choose Normal (plain language, the essentials) or Scientific (every tool, exact figures).
 * Both use the same data. The last choice is highlighted and focused, so Enter confirms it.
 */
export default function ModeChooser({ last, onChoose }: { last: Ui | null; onChoose: (u: Ui) => void }) {
  const first = useRef<HTMLButtonElement>(null);
  const second = useRef<HTMLButtonElement>(null);
  useEffect(() => { (last === 'expert' ? second : first).current?.focus(); }, [last]);
  return (
    <div className="chooser-backdrop" role="dialog" aria-modal="true" aria-labelledby="chooser-h">
      <div className="chooser">
        <div className="chooser-brand"><LogoMark size={26} /><span>Sol Teris</span></div>
        <h2 id="chooser-h">How would you like to explore the Moon?</h2>
        <p className="chooser-lead">Both use the same NASA data. Normal keeps the essentials in plain words; Scientific adds the calculators and planning tools. You can switch at any time from the top bar.</p>
        <div className="chooser-cards">
          <button ref={first} className={`chooser-card${last === 'normal' ? ' last' : ''}`} onClick={() => onChoose('normal')}>
            <span className="chooser-k">Normal</span>
            <b>Plain language, step by step</b>
            <span>Is it sunny? Can it call Earth? Is it a good place to land? Clear answers, the views, the best days and side-by-side comparison, with nothing to type in.</span>
            <small>For students, the public and anyone new to lunar missions</small>
            {last === 'normal' && <em>Last used</em>}
          </button>
          <button ref={second} className={`chooser-card${last === 'expert' ? ' last' : ''}`} onClick={() => onChoose('expert')}>
            <span className="chooser-k">Scientific</span>
            <b>Exact figures and mission terms</b>
            <span>Everything in Normal, plus exact angles and countdowns, scenario comparison, the calculator, launch planning, mission inputs, your own points and data export.</span>
            <small>For mission planners, engineers and scientists</small>
            {last === 'expert' && <em>Last used</em>}
          </button>
        </div>
      </div>
    </div>
  );
}
