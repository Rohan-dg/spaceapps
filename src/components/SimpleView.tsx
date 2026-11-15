import { Earth, Pause, Play, Sun, SunDim } from './Icons';
import type { Level } from '../config/thresholds';
import type { SiteData } from '../lib/data';
import { inWords, type Event } from '../lib/metrics';
import type { ScenarioResult } from '../lib/useScenario';
import { fromInput, SPEEDS, toInput } from './TimeControls';
import TimeLeft from './TimeLeft';

const sunHeight = (el: number) => el > 30 ? 'high in the sky' : el > 10 ? 'fairly low in the sky' : el > 3 ? 'low over the horizon' : 'skimming the horizon';
const longDate = (t: number) => new Date(t).toLocaleString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' UTC';

const POWER: Record<Level, string> = {
  green: 'Plenty of sunlight for solar power',
  amber: 'Some sunlight, but with long dark spells',
  red: 'Not enough sunlight for solar power',
};
const RADIO: Record<Level, string> = {
  green: 'Earth stays in view, so it can radio home',
  amber: 'Earth is often hidden, so radio contact has gaps',
  red: 'Earth is hidden most of the time: it would need a relay satellite',
};
const MARK: Record<Level, string> = { green: 'Good', amber: 'OK', red: 'Poor' };

function overall(r: ScenarioResult): { word: string; line: string } {
  const p = r.power.level, c = r.comms.level;
  if (p === 'green' && c === 'green') return { word: 'Yes, a great spot right now', line: 'Lots of sunlight for power, and Earth stays in view for radio.' };
  if (p === 'red' && c === 'red') return { word: 'No, not at this time', line: 'Too little sunlight and Earth is mostly out of sight.' };
  if (p === 'red') return { word: 'Not for a solar-powered lander', line: 'The Sun is blocked too much of the time here.' };
  if (c === 'red') return { word: 'Only with a relay satellite', line: 'There is sunlight, but Earth is out of sight, so it cannot call home directly.' };
  return { word: 'Possible, with careful planning', line: 'It would have to get through dark spells or gaps in radio contact.' };
}

const days = (h: number) => (h >= 48 ? `${Math.round(h / 24)} days` : `${Math.round(h)} hours`);

interface Props {
  data: SiteData; r: ScenarioResult; t: number; tLive: number; t0: number; t1: number;
  onT: (t: number) => void; playing: boolean; onPlaying: (p: boolean) => void; speed: number; onSpeed: (s: number) => void;
}

/**
 * Normal mode: the selected site in plain language for a general audience. Answers three questions
 * (is it sunny, can it talk to Earth, is it a good place to land), with a look-around view, the next month at
 * a glance and the Moon-vs-Earth comparison. Every figure comes from the same calculation as Expert mode.
 */
export default function SimpleView({ data, r, t, tLive, t0, t1, onT, playing, onPlaying, speed, onSpeed }: Props) {
  const m = r.metrics, info = data.info;
  const sunE = m.sunUp ? m.nextSunset : m.nextSunrise;
  const earthE = m.earthUp ? m.nextEarthset : m.nextEarthrise;
  const o = overall(r);
  const step = (d: number) => onT(Math.max(t0, Math.min(t1, tLive + d * 86400_000)));
  const jump = (e: Event) => { if (e.t !== null) { onPlaying(false); onT(Math.min(t1, e.t + 60_000)); } };

  return (
    <div className="simple">
      <header className="simple-hero">
        <h2>{info.name}</h2>
      </header>

      <section className="simple-time" aria-label="Time">
        <button className="btn-primary play" onClick={() => onPlaying(!playing)} aria-pressed={playing}>
          {playing ? <><Pause size={15} aria-hidden /> Pause</> : <><Play size={15} aria-hidden /> Play</>}
        </button>
        <button onClick={() => step(-1)}>Day before</button>
        <button onClick={() => step(1)}>Next day</button>
        <label className="simple-pick">
          <span className="sr-only">Date and time (UTC)</span>
          <input type="datetime-local" value={toInput(tLive)} min={toInput(t0)} max={toInput(t1)} step={60}
            onChange={(e) => { const v = fromInput(e.target.value); if (isFinite(v)) onT(Math.max(t0, Math.min(t1, v))); }} />
        </label>
        <label className="simple-speed">
          <span>Play speed</span>
          <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
            {SPEEDS.map((sp, i) => <option key={sp.label} value={i}>{sp.label.replace(' / s', ' per second')}</option>)}
          </select>
        </label>
        <span className="simple-date">{longDate(tLive)}</span>
      </section>

      <section className="simple-now" aria-label="Right now">
        <div className={`simple-tile${m.sunUp ? ' on' : ''}`}>
          {m.sunUp ? <Sun size={30} aria-hidden /> : <SunDim size={30} aria-hidden />}
          <h3>{m.sunUp ? 'The Sun is up' : 'It is dark'}</h3>
          <p>{m.sunUp ? `The Sun is ${sunHeight(m.sky.sun.el)}. It sets ${inWords(sunE, t)}.` : m.sunPct === 0 ? 'The Sun never reaches this spot: the surrounding terrain always blocks it.' : `The Sun is behind the horizon or hills. It comes back ${inWords(sunE, t)}.`}</p>
          {sunE.t !== null && m.sunPct > 0 && <button className="link" onClick={() => jump(sunE)}>Skip to {m.sunUp ? 'sunset' : 'sunrise'}</button>}
        </div>
        <div className={`simple-tile${m.earthUp ? ' on earth' : ''}`}>
          <Earth size={30} aria-hidden />
          <h3>{m.earthUp ? 'Earth is in view' : 'Earth is hidden'}</h3>
          <p>{m.earthUp ? `A lander here could radio home directly. Earth stays up ${earthE.t === null ? 'for the whole period we have data for' : `and sets ${inWords(earthE, t)}`}.`
            : m.earthPct === 0 ? 'Earth never rises here, so a lander would need a relay satellite to talk to us.' : `A lander here can't radio home right now. Earth rises ${inWords(earthE, t)}.`}</p>
          {earthE.t !== null && m.earthPct > 0 && <button className="link" onClick={() => jump(earthE)}>Skip to {m.earthUp ? 'Earthset' : 'Earthrise'}</button>}
        </div>
      </section>

      <section className="simple-block" aria-label="Time left">
        <h3>How long until it changes</h3>
        <TimeLeft s={data.series} m={m} t={t} plain />
      </section>

      <section className="simple-verdict" aria-label="Is it a good place to land?">
        <span className="overline">Good place to land, over the next month?</span>
        <h3>{o.word}</h3>
        <p>{o.line}</p>
        <ul>
          <li className={`lv-${r.power.level}`}><b>{MARK[r.power.level]}</b> {POWER[r.power.level]}: sunlit {m.sunPct.toFixed(0)}% of the time{m.longestDarkH > 0 ? `, longest darkness ${days(m.longestDarkH)}` : ''}.</li>
          <li className={`lv-${r.comms.level}`}><b>{MARK[r.comms.level]}</b> {RADIO[r.comms.level]}: in view {m.earthPct.toFixed(0)}% of the time.</li>
        </ul>
      </section>

    </div>
  );
}
