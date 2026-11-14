import { readFileSync } from 'node:fs';
import { parseSeries } from '../src/lib/series';
import { computeMetrics, formatDuration } from '../src/lib/metrics';
import { powerVerdict, commsVerdict } from '../src/lib/verdict';
const show = (id: string, iso: string) => {
  const hz = JSON.parse(readFileSync(`public/horizons/${id}.json`, 'utf8'));
  const s = parseSeries(JSON.parse(readFileSync(`public/series/${id}.json`, 'utf8')));
  const site = { lat: hz.lat, lon: hz.lon, heightM: hz.siteHeightM + hz.observerHeightM };
  const t = Date.parse(iso); const m = computeMetrics(site, hz.horizonDeg, s, t);
  const p = powerVerdict(m, site, hz.horizonDeg, s), c = commsVerdict(m, site, hz.horizonDeg, s);
  console.log(`${id} ${iso}: sun ${m.sky.sun.el.toFixed(2)}° up=${m.sunUp} next ${m.sunUp ? 'set' : 'rise'} ${m.sunUp ? (m.nextSunset.t ? formatDuration(m.nextSunset.t - t) : '-') : (m.nextSunrise.t ? formatDuration(m.nextSunrise.t - t) : '-')}; earth ${m.sky.earth.el.toFixed(2)}° up=${m.earthUp}\n   POWER ${p.level}: ${p.reason}\n   COMMS ${c.level}: ${c.reason}`);
};
for (const a of process.argv.slice(2)) { const [id, iso] = a.split('@'); show(id, iso); }
