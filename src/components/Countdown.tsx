import { Earth, Sun, SunDim } from './Icons';
import { tMinus, type Event, type Metrics } from '../lib/metrics';

/**
 * Always-visible operations strip: solar elevation (the power metric), whether the site is lit and has a radio
 * path to Earth, and a live countdown to the next sunset / Earthset (or rise, when the body is down).
 * `t` is the live (not deferred) time so the clock ticks smoothly while the panels catch up.
 */
export default function Countdown({ m, t, name }: { m: Metrics; t: number; name: string }) {
  const sunE = m.sunUp ? m.nextSunset : m.nextSunrise;
  const earthE = m.earthUp ? m.nextEarthset : m.nextEarthrise;
  const urgent = (e: Event, up: boolean) => up && e.t !== null && e.t - t < 24 * 3600_000;
  return (
    <div className="cd" role="status" aria-label={`Live status for ${name}`}>
      <b className="cd-name">{name}</b>
      <span className={`cd-item${m.sunUp ? ' sun' : ' off'}`}>
        {m.sunUp ? <Sun size={15} aria-hidden /> : <SunDim size={15} aria-hidden />}
        <span className="cd-k">Sun elevation</span>
        <b className="num cd-big">{m.sky.sun.el.toFixed(2)}°</b>
        <span className="cd-sub num">{m.sunUp ? 'lit' : 'shadow'}, skyline {m.sunHorizon.toFixed(1)}°</span>
      </span>
      <span className={`cd-item${urgent(sunE, m.sunUp) ? ' urgent' : ''}`}>
        <span className="cd-k">{m.sunUp ? 'Sunset' : 'Sunrise'}</span>
        <b className="num cd-big">{tMinus(sunE, t)}</b>
      </span>
      <span className={`cd-item${m.earthUp ? ' earth' : ' off'}`}>
        <Earth size={15} aria-hidden />
        <span className="cd-k">{m.earthUp ? 'Earthset' : 'Earthrise'}</span>
        <b className={`num cd-big${urgent(earthE, m.earthUp) ? ' urgent' : ''}`}>{tMinus(earthE, t)}</b>
      </span>
    </div>
  );
}
