import { useMemo } from 'react';
import type { LaunchOption } from '../lib/launch';
import { planFlight, type FlightPlan } from '../lib/trajectory';

const utc = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const since = (t: number, t0: number) => {
  const m = Math.round((t - t0) / 60000);
  if (m < 120) return `T+${m} min`;
  const h = m / 60;
  return h < 48 ? `T+${h.toFixed(1)} h` : `T+${(h / 24).toFixed(2)} d`;
};
const km = (x: number) => `${Math.round(x).toLocaleString('en-US')} km`;

const W = 640, H = 360, PAD = 34;

/** The transfer drawn in its own orbital plane: x toward the Moon at arrival, Earth at the origin. */
function Plot({ f }: { f: FlightPlan }) {
  const { x, y } = f.frame;
  const proj = (p: number[]) => [p[0] * x[0] + p[1] * x[1] + p[2] * x[2], p[0] * y[0] + p[1] * y[1] + p[2] * y[2]];
  const tr = f.transfer.map((q) => proj(q.pos)), mp = f.moonPath.map((q) => proj(q.pos));
  const all = [[0, 0], ...tr, ...mp];
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const k = Math.min((W - 2 * PAD) / (maxX - minX || 1), (H - 2 * PAD) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * k) / 2 - minX * k, oy = (H - (maxY - minY) * k) / 2 + maxY * k;
  const sx = (p: number[]) => ox + p[0] * k, sy = (p: number[]) => oy - p[1] * k;
  const line = (pts: number[][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p).toFixed(1)},${sy(p).toFixed(1)}`).join('');
  const earth = [0, 0], moonEnd = mp[mp.length - 1], moonStart = mp[0];
  // a dot for each whole day after TLI, interpolated along the path in time
  const ticks: { p: number[]; d: number }[] = [];
  for (let d = 1; f.tli + d * 86400000 < f.loi; d++) {
    const t = f.tli + d * 86400000, j = f.transfer.findIndex((q) => q.t >= t);
    if (j > 0) {
      const a = f.transfer[j - 1], b = f.transfer[j], u = (t - a.t) / (b.t - a.t);
      ticks.push({ p: proj(a.pos.map((v, i) => v + (b.pos[i] - v) * u)), d });
    }
  }
  const er = Math.max(6, 6378 * k), mr = Math.max(4, 1737 * k);
  return (
    <svg className="fp-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Transfer from Earth to the Moon in ${(f.transferH / 24).toFixed(1)} days, drawn in the plane of the orbit.`}>
      <path className="fp-moonpath" d={line(mp)} />
      <path className="fp-transfer" d={line(tr)} />
      {ticks.map((q) => (
        <g key={q.d}>
          <circle className="fp-tick" cx={sx(q.p)} cy={sy(q.p)} r={3} />
          {Math.hypot(sx(q.p) - sx(moonEnd), sy(q.p) - sy(moonEnd)) > 46 && <text className="fp-label" x={sx(q.p)} y={sy(q.p) - 8} textAnchor="middle">Day {q.d}</text>}
        </g>
      ))}
      <circle className="fp-earth" cx={sx(earth)} cy={sy(earth)} r={er} />
      <text className="fp-label strong" x={sx(earth)} y={sy(earth) + er + 14} textAnchor="middle">Earth · TLI</text>
      <circle className="fp-moon ghost" cx={sx(moonStart)} cy={sy(moonStart)} r={mr} />
      <text className="fp-label" x={sx(moonStart)} y={sy(moonStart) + mr + 13} textAnchor="middle">Moon at TLI</text>
      <circle className="fp-moon" cx={sx(moonEnd)} cy={sy(moonEnd)} r={mr} />
      <text className="fp-label strong" x={sx(moonEnd)} y={sy(moonEnd) - mr - 7} textAnchor="middle">Moon at arrival</text>
    </svg>
  );
}

export default function FlightPath({ option, landing }: { option: LaunchOption; landing: number }) {
  const f = useMemo(() => planFlight(option.site, option.window!.t, landing, option.window!.boostMs / 1000), [option, landing]);
  const steps: [string, number, string][] = [
    ['Launch', f.launch, `${option.site.name}, ${option.site.pad}. Heading ${option.window!.azimuth.toFixed(1)}° from north.`],
    ['Parking orbit', f.insertion, `${185} km circular orbit, inclined ${f.inclination.toFixed(1)}°, about 1,900 km downrange.`],
    ['Trans-lunar injection', f.tli, `After ${f.coastMin.toFixed(0)} min coasting in parking orbit, burn ${f.dv.tli.toFixed(2)} km/s to leave for the Moon.`],
    ['Coast to the Moon', f.tli, `${(f.transferH / 24).toFixed(2)} days on the transfer orbit${f.apogeeKm ? ` (apogee ${km(f.apogeeKm)})` : ' (faster than a bound orbit)'}. Small mid-course corrections in practice.`],
    ['Lunar orbit insertion', f.loi, `Arrive ${f.vInfMoon.toFixed(2)} km/s relative to the Moon; burn ${f.dv.loi.toFixed(2)} km/s into a 100 km orbit.`],
    ['Descent and landing', f.landing, `${f.lunarOrbitH.toFixed(f.lunarOrbitH < 48 ? 0 : 1)} h in lunar orbit, then about ${f.dv.descent.toFixed(1)} km/s to land.`],
  ];
  return (
    <section className="fp" aria-label="Estimated flight path">
      <div className="fp-head">
        <h3>Estimated flight path</h3>
        <p className="muted small">Launch {utc(f.launch)} UTC from {option.site.short} · lands {utc(f.landing)} UTC</p>
      </div>
      <div className="fp-body">
        <div className="fp-plot-wrap"><Plot f={f} /></div>
        <div className="fp-side">
          <ol className="fp-steps">
            {steps.map(([name, t, what]) => (
              <li key={name}>
                <div className="fp-step-head"><b>{name}</b><span className="num muted">{utc(t)} · {since(t, f.launch)}</span></div>
                <p className="small">{what}</p>
              </li>
            ))}
          </ol>
          <table className="fp-dv">
            <caption>Speed changes (Δv)</caption>
            <tbody>
              <tr><th>Ascent to orbit</th><td className="num">{f.dv.ascent.toFixed(2)} km/s</td></tr>
              <tr><th>Trans-lunar injection</th><td className="num">{f.dv.tli.toFixed(2)} km/s</td></tr>
              <tr><th>Lunar orbit insertion</th><td className="num">{f.dv.loi.toFixed(2)} km/s</td></tr>
              <tr><th>Descent</th><td className="num">{f.dv.descent.toFixed(2)} km/s</td></tr>
              <tr className="total"><th>Total</th><td className="num">{f.dv.total.toFixed(2)} km/s</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      {f.longTransfer && <p className="small muted">The requested time is longer than the slowest direct transfer, so the extra time is spent in lunar orbit before descent.</p>}
      <p className="small muted fp-note">Estimate only: patched conics, two-body Earth gravity on the way out and the Moon's on arrival, timed so the craft reaches the Moon exactly when the Moon gets there. Ascent and descent burns are typical values, including losses. Real missions refine this with a full trajectory design.</p>
    </section>
  );
}
