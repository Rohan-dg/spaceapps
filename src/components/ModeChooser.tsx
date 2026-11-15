import { useEffect, useRef } from 'react';
import { LogoMark } from './Logo';

export type Ui = 'normal' | 'expert';

/**
 * Shown on every load: choose Education (learning the science, for classrooms) or Scientific (every tool, exact figures).
 * The internal id stays 'normal' so saved choices and shared links keep working.
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
        <p className="chooser-lead">Both run on the same NASA terrain and Sun and Earth positions. Education teaches the ideas behind choosing a landing site; Scientific gives you the numbers and tools to plan with. You can switch at any time from the top bar.</p>
        <div className="chooser-cards">
          <button ref={first} className={`chooser-card${last === 'normal' ? ' last' : ''}`} onClick={() => onChoose('normal')}>
            <span className="chooser-k">Education</span>
            <b>Learn how we pick where to land</b>
            <span>Explore a 3D Moon built from NASA measurements, compare landing sites, and drive a rover through an ice-survey mission. Manage its battery and temperature while finding sunlight and Earth contact. A guided tour explains the science at each step.</span>
            <small>For students in grades 5 to 12, teachers and classrooms, and science outreach</small>
            {last === 'normal' && <em>Last used</em>}
          </button>
          <button ref={second} className={`chooser-card${last === 'expert' ? ' last' : ''}`} onClick={() => onChoose('expert')}>
            <span className="chooser-k">Scientific</span>
            <b>Plan and test missions on real terrain</b>
            <span>Sun and Earth clearance over the traced skyline, countdowns to sunrise and Earthset, site and date scenarios side by side, the mission equation solver, launch windows, rover range on battery, lander power and comms models, your own coordinates, and CSV or JSON export.</span>
            <small>For mission planners, engineers, researchers and developers</small>
            {last === 'expert' && <em>Last used</em>}
          </button>
        </div>
      </div>
    </div>
  );
}
