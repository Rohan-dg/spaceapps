import { useEffect, useMemo, useRef, useState } from 'react';
import type { SiteData } from '../lib/data';
import {
  EARTH_R_M, MOON_R_M, MOON_SUN_RATE, declination, earthDayLengthH, earthNoonEl, earthSunEl, horizonDistKm, sunriseDurationH,
} from '../lib/earthCompare';
import { formatDuration, type Metrics } from '../lib/metrics';
import { surfaceTempK } from '../lib/mission';
import { indexAt, SYNODIC_DAYS } from '../lib/series';
import { useTheme } from '../lib/theme';
import { fitCanvas, useDpr } from './useDpr';

const DAY = 86400_000;
const CHART_DAYS = 7;
const h = (x: number) => formatDuration(x * 3600_000);
const c2 = (k: number) => `${Math.round(k - 273.15)} °C`;
const latTxt = (lat: number) => `${Math.abs(lat).toFixed(1)}° ${lat < 0 ? 'S' : 'N'}`;

/**
 * Moon vs Earth at the same latitude: the selected site's real Sun elevation over a week next to the same
 * latitude on Earth, and a short table of the differences that drive lunar mission planning.
 */
export default function MoonEarth({ data, t, m }: { data: SiteData; t: number; m: Metrics }) {
  const s = data.series, lat = data.info.lat, lon = data.info.lon;
  const day0 = Math.floor(t / DAY) * DAY;

  const facts = useMemo(() => {
    const i0 = Math.max(0, Math.floor(indexAt(s, t)));
    const i1 = Math.min(s.n, i0 + Math.round(SYNODIC_DAYS * DAY / s.stepMs));
    let sunMax = -90, eMin = 90, eMax = -90;
    for (let i = i0; i < i1; i++) {
      sunMax = Math.max(sunMax, s.sunEl[i] / 100);
      eMin = Math.min(eMin, s.earthEl[i] / 100); eMax = Math.max(eMax, s.earthEl[i] / 100);
    }
    const dec = declination(t);
    const frac = m.sunUp ? s.sunFrac[Math.min(s.n - 1, i0)] / 250 : 0;
    return {
      sunMax, eMin, eMax, dec,
      earthNoon: earthNoonEl(lat, t),
      earthNight: 24 - earthDayLengthH(lat, t),
      moonRise: sunriseDurationH(lat, 0, MOON_SUN_RATE),
      earthRise: sunriseDurationH(lat, dec, 15),
      tempNow: surfaceTempK(m.sky.sun.el, frac, m.sunPct === 0),
    };
  }, [s, t, lat, m]);

  const rows: [string, string, string][] = [
    ['Length of one day', `${SYNODIC_DAYS.toFixed(1)} Earth days`, '24 hours'],
    ['Longest time without sunlight', m.sunPct === 0 ? 'the whole cycle (permanent shadow)' : m.longestDarkH > 0 ? `${h(m.longestDarkH)}${m.longestDarkClipped ? ' or more' : ''} in the next lunar day` : 'none in the next lunar day',
      facts.earthNight >= 24 ? 'polar night: no sunrise today' : facts.earthNight <= 0 ? 'none today (midnight sun)' : `${h(facts.earthNight)} tonight`],
    ['Highest Sun', `${facts.sunMax.toFixed(1)}° over the next lunar day`, `${facts.earthNoon.toFixed(1)}° at noon today${facts.earthNoon < 0 ? ' (below the horizon)' : ''}`],
    ['Time for the Sun to rise fully', facts.moonRise >= 24 * 29 ? 'it never clears: the Sun skims the horizon' : `about ${h(facts.moonRise)}`, `about ${h(facts.earthRise)}`],
    ['Sky in daytime', 'black, stars visible, no twilight', 'blue, with twilight before sunrise and after sunset'],
    ['Light bending at the horizon', 'none: no atmosphere, so the terrain skyline is exact', 'about 0.57°: the Sun is seen ~2–3 minutes before it truly rises'],
    ['Surface temperature', `about ${c2(facts.tempNow)} here now; +120 °C in full sun to −170 °C at night, −240 °C in permanent shadow`, '−89 °C to +57 °C (world records)'],
    ['Earth or Moon in the sky', facts.eMax < -1 ? 'Earth never rises (far side)' : `Earth hangs almost still, between ${facts.eMin.toFixed(1)}° and ${facts.eMax.toFixed(1)}° (libration)`, 'the Moon rises and sets about every 24 h 50 m'],
    ['Distance to the horizon, 2 m mast, flat ground', `${horizonDistKm(2, MOON_R_M).toFixed(1)} km`, `${horizonDistKm(2, EARTH_R_M).toFixed(1)} km`],
  ];

  return (
    <div className="me">
      <Chart data={data} day0={day0} t={t} lat={lat} lon={lon} />
      <div className="table-scroll">
        <table className="me-table">
          <thead><tr><th scope="col"><span className="sr-only">Quantity</span></th><th scope="col">Moon, at this site</th><th scope="col">Earth, same latitude ({latTxt(lat)})</th></tr></thead>
          <tbody>{rows.map(([k, a, b]) => <tr key={k}><th scope="row">{k}</th><td>{a}</td><td>{b}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function Chart({ data, day0, t, lat, lon }: { data: SiteData; day0: number; t: number; lat: number; lon: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(800);
  const { c } = useTheme();
  const dpr = useDpr();
  const H = 200, padL = 44, padR = 12, padT = 10, padB = 24;
  const t1 = day0 + CHART_DAYS * DAY;

  const lines = useMemo(() => {
    const s = data.series, step = 30 * 60_000;
    const moon: number[] = [], earth: number[] = [];
    for (let tt = day0; tt <= t1; tt += step) {
      const i = Math.floor(indexAt(s, tt));
      moon.push(i >= 0 && i < s.n ? s.sunEl[i] / 100 : NaN);
      earth.push(earthSunEl(lat, lon, tt));
    }
    return { moon, earth, step };
  }, [data, day0, t1, lat, lon]);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cnv = cv.current; if (!cnv) return;
    const g = fitCanvas(cnv, w, H, dpr);
    g.clearRect(0, 0, w, H);
    const all = [...lines.moon, ...lines.earth].filter(isFinite);
    let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
    const pad = Math.max(2, (hi - lo) * 0.08); lo -= pad; hi += pad;
    const pw = w - padL - padR, ph = H - padT - padB;
    const X = (tt: number) => padL + ((tt - day0) / (t1 - day0)) * pw;
    const Y = (e: number) => padT + (1 - (e - lo) / (hi - lo)) * ph;
    // axes and grid
    g.font = `400 10px ${c.font}`; g.textAlign = 'right'; g.textBaseline = 'middle';
    const span = hi - lo, stepDeg = span > 120 ? 30 : span > 60 ? 20 : span > 24 ? 10 : span > 10 ? 5 : 2;
    for (let e = Math.ceil(lo / stepDeg) * stepDeg; e <= hi; e += stepDeg) {
      g.fillStyle = e === 0 ? c.ink2 : c.line; g.fillRect(padL, Math.round(Y(e)) + 0.5, pw, e === 0 ? 1 : 0.6);
      g.fillStyle = c.ink2; g.fillText(`${e}°`, padL - 6, Y(e));
    }
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (let d = 0; d <= CHART_DAYS; d++) {
      const x = X(day0 + d * DAY), dt = new Date(day0 + d * DAY);
      g.fillStyle = c.line; g.fillRect(Math.round(x), padT, 0.6, ph);
      if (d < CHART_DAYS) { g.fillStyle = c.ink2; g.fillText(`${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`, x + pw / CHART_DAYS / 2, H - 6); }
    }
    const draw = (vals: number[], color: string, width: number) => {
      g.strokeStyle = color; g.lineWidth = width; g.beginPath();
      let pen = false;
      vals.forEach((v, k) => {
        if (!isFinite(v)) { pen = false; return; }
        const x = X(day0 + k * lines.step), y = Y(v);
        if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
      });
      g.stroke();
    };
    draw(lines.earth, c.earth, 1.5);
    draw(lines.moon, c.ink, 2.25);
    g.fillStyle = c.accent; g.fillRect(Math.round(X(t)) - 1, padT, 2, ph);
    g.save(); g.translate(11, padT + ph / 2); g.rotate(-Math.PI / 2); g.fillStyle = c.ink2; g.textAlign = 'center'; g.fillText('Sun elevation (deg)', 0, 0); g.restore();
  }, [w, dpr, lines, day0, t1, t, c]);

  return (
    <div className="me-chart" ref={wrap}>
      <ul className="chart-legend" aria-label="Legend">
        <li><span className="swatch" style={{ background: 'var(--ink)' }} aria-hidden /> Moon, this site</li>
        <li><span className="swatch" style={{ background: 'var(--earth)' }} aria-hidden /> Earth, same latitude and longitude</li>
        <li><span className="swatch" style={{ background: 'var(--accent)', width: 3 }} aria-hidden /> Now</li>
      </ul>
      <canvas ref={cv} style={{ width: w, height: H }} role="img"
        aria-label={`Sun elevation over ${CHART_DAYS} days: on the Moon it changes slowly over a 29.5-day cycle; on Earth it rises and sets every day.`} />
    </div>
  );
}
