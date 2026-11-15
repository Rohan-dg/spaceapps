import { Earth, Pause, Play, Sun, SunDim } from './Icons';
import type { Level } from '../config/thresholds';
import type { SiteData } from '../lib/data';
import { MOON_SUN_RATE, declination, sunriseDurationH } from '../lib/earthCompare';
import type { ScenarioResult } from '../lib/useScenario';
import FirstPerson from './FirstPerson';
import TimeLeft from './TimeLeft';
import Timeline from './Timeline';

const inDays = (h: number) => (h >= 48 ? `${Math.round(h / 24)} days` : h >= 2 ? `${Math.round(h)} hours` : `${Math.round(h * 60)} minutes`);
const longDate = (t: number) => new Date(t).toLocaleString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' UTC';

const POWER: Record<Level, string> = {
  green: 'Plenty of sunlight for solar power',
  amber: 'Some sunlight, with long dark spells',
  red: 'Too little sunlight for solar power',
};
const RADIO: Record<Level, string> = {
  green: 'Earth stays in view for radio contact',
  amber: 'Earth is often hidden, so contact has gaps',
  red: 'Earth is mostly hidden, so it would need a relay satellite',
};
const MARK: Record<Level, string> = { green: 'Good', amber: 'OK', red: 'Poor' };

function verdict(r: ScenarioResult): string {
  const p = r.power.level, c = r.comms.level;
  if (p === 'green' && c === 'green') return 'Yes, a great spot this month.';
  if (p === 'red' && c === 'red') return 'No, not this month.';
  if (p === 'red') return 'Not for a solar-powered lander.';
  if (c === 'red') return 'Only with a relay satellite.';
  return 'Possible, with careful planning.';
}

function nowLine(sun: boolean, earth: boolean): string {
  if (sun && earth) return 'Sunny, and Earth is in view.';
  if (sun) return 'Sunny, but Earth is hidden.';
  if (earth) return 'Dark, but Earth is in view.';
  return 'Dark, and Earth is hidden.';
}

/** Where a site is, in words: pole, near side or far side. */
function whereWords(lat: number, lon: number): string {
  const l = ((lon % 360) + 360) % 360;
  if (lat < -80) return 'Near the south pole';
  if (lat > 80) return 'Near the north pole';
  return `${l > 90 && l < 270 ? 'Far side' : 'Near side'}, ${Math.abs(lat).toFixed(0)}° ${lat < 0 ? 'south' : 'north'}`;
}

interface Props {
  data: SiteData; r: ScenarioResult; t: number; tLive: number; t0: number; t1: number;
  onT: (t: number) => void; playing: boolean; onPlaying: (p: boolean) => void;
}

/**
 * Education mode: one reading column for a general audience. The place, what it is like right now and for how long,
 * whether it is a good place to land, what you would see standing there, the month ahead, and three facts that make
 * it unlike Earth. Every figure comes from the same calculation as Scientific mode.
 */
export default function SimpleView({ data, r, t, tLive, t0, t1, onT, playing, onPlaying }: Props) {
  const m = r.metrics, info = data.info;
  const step = (d: number) => onT(Math.max(t0, Math.min(t1, tLive + d * 86400_000)));
  const sunE = m.sunUp ? m.nextSunset : m.nextSunrise;
  const moonRise = sunriseDurationH(info.lat, 0, MOON_SUN_RATE);
  const earthRise = sunriseDurationH(info.lat, declination(t), 15);

  return (
    <article className="sv">
      <header className="sv-hero">
        <h2>{info.name}</h2>
        {info.description && <p className="sv-lede">{info.description}</p>}
        <ul className="sv-facts">
          <li>{whereWords(info.lat, info.lon)}</li>
          <li>{Math.abs(info.siteHeightM).toLocaleString('en-US', { maximumFractionDigits: 0 })} m {info.siteHeightM >= 0 ? 'above' : 'below'} the Moon's average level</li>
          {info.mission && <li>{info.mission}</li>}
        </ul>
      </header>

      <section className="sv-sec sv-now" aria-label="Right now">
        <div className="sv-row"><span className="sv-k">Right now</span><span className="sv-date">{longDate(tLive)}</span></div>
        <p className="sv-big">
          <span className="sv-icons" aria-hidden>
            {m.sunUp ? <Sun size={20} className="sv-ico sun" /> : <SunDim size={20} className="sv-ico off" />}
            <Earth size={20} className={`sv-ico ${m.earthUp ? 'earth' : 'off'}`} />
          </span>
          {nowLine(m.sunUp, m.earthUp)}
        </p>
        <TimeLeft s={data.series} m={m} t={t} plain />
        <div className="sv-time">
          <button className="sv-play" onClick={() => onPlaying(!playing)} aria-pressed={playing}>
            {playing ? <><Pause size={14} aria-hidden /> Pause</> : <><Play size={14} aria-hidden /> Play</>}
          </button>
          <button onClick={() => step(-1)} aria-label="Previous day">‹ Day</button>
          <button onClick={() => step(1)} aria-label="Next day">Day ›</button>
          {sunE.t !== null && m.sunPct > 0 && (
            <button className="sv-link" onClick={() => { onPlaying(false); onT(Math.min(t1, (sunE.t as number) + 60_000)); }}>Skip to {m.sunUp ? 'sunset' : 'sunrise'}</button>
          )}
        </div>
      </section>

      <section className="sv-sec sv-land" aria-label="Is it a good place to land?">
        <span className="sv-k">Good place to land?</span>
        <p className="sv-big">{verdict(r)}</p>
        <ul className="sv-why">
          <li className={`lv-${r.power.level}`}><b>{MARK[r.power.level]}</b><span>{POWER[r.power.level]}: sunny {m.sunPct.toFixed(0)}% of the next month{m.longestDarkH > 0 ? `, longest darkness ${inDays(m.longestDarkH)}` : ''}.</span></li>
          <li className={`lv-${r.comms.level}`}><b>{MARK[r.comms.level]}</b><span>{RADIO[r.comms.level]}: in view {m.earthPct.toFixed(0)}% of the time.</span></li>
        </ul>
      </section>

      <section className="sv-sec sv-see" aria-label="What you would see">
        <span className="sv-k">Standing here</span>
        <p className="sv-note">Drag to look around. The hills are real terrain measured by NASA's Lunar Reconnaissance Orbiter.</p>
        <FirstPerson data={data} t={t} height={280} />
      </section>

      <section className="sv-sec sv-month" aria-label="The month ahead">
        <span className="sv-k">The month ahead</span>
        <p className="sv-note"><i className="sv-sw sun" aria-hidden />Sunny <i className="sv-sw earth" aria-hidden />Earth in view. Click to jump to a day.</p>
        <Timeline data={data} t={t} onSeek={onT} />
      </section>

      <section className="sv-sec sv-earth" aria-label="Why it is not like Earth">
        <span className="sv-k">Not like Earth</span>
        <dl className="sv-diff">
          <div><dt>One day lasts</dt><dd>29.5 Earth days</dd><p>About two weeks of light, then two of dark{info.lat < -80 ? '. Near the pole the Sun just circles the horizon' : ''}.</p></div>
          <div><dt>Sunrise takes</dt><dd>{moonRise >= 24 * 29 ? 'days' : `about ${inDays(moonRise)}`}</dd><p>On Earth at this latitude: about {inDays(earthRise)}.</p></div>
          <div><dt>The sky is</dt><dd>black all day</dd><p>No air means no blue sky, no twilight, and no bending of sunlight at the horizon.</p></div>
        </dl>
      </section>
    </article>
  );
}
