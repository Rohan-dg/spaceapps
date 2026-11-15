import { ChevronRight } from './Icons';
import { useRef, useState } from 'react';
import { registerSite, type SiteData, type SitesDoc } from '../lib/data';
import { upFraction, type Series } from '../lib/series';
import type { CustomRequest } from '../workers/customSite';

interface Props { doc: SitesDoc; onReady: (d: SiteData) => void }

/** P2: custom coordinates → approximate horizon + series computed in a Web Worker. */
export default function CustomSite({ doc, onReady }: Props) {
  const [lat, setLat] = useState('-89.30');
  const [lon, setLon] = useState('130.00');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);

  const run = () => {
    const la = lat.trim() === '' ? NaN : Number(lat), lo = lon.trim() === '' ? NaN : Number(lon);
    if (!isFinite(lo)) { setErr('Enter a longitude in degrees east.'); return; }
    if (!isFinite(la) || la > -80.5 || la < -90) { setErr('Latitude has to be between −90 and −80.5. Terrain is only loaded for the south polar cap.'); return; }
    setErr(null); setBusy('Starting…');
    worker.current ??= new Worker(new URL('../workers/customSite.ts', import.meta.url), { type: 'module' });
    const stepMin = doc.range.stepMin;
    const n = Math.floor((Date.parse(doc.range.end) - Date.parse(doc.range.start)) / (stepMin * 60000)) + 1;
    const base = new URL(import.meta.env.BASE_URL, location.href).href;
    const req: CustomRequest = { lat: la, lon: lo, demUrl: `${base}dem/south_polar_400m.json`, start: doc.range.start, n, stepMin };
    worker.current.onmessage = (e) => {
      const m = e.data;
      if (m.progress) setBusy(m.progress);
      if (m.error) { setBusy(null); setErr(m.error); }
      if (m.done) {
        const { hz, sunEl, earthEl, sunFrac, sunUp, earthUp } = m.done;
        const series: Series = { id: '', t0: Date.parse(doc.range.start), stepMs: stepMin * 60000, n, synthetic: false, sunUp, earthUp, sunEl, earthEl, sunFrac };
        const id = `custom_${la.toFixed(3)}_${lo.toFixed(3)}`;
        series.id = id;
        const d: SiteData = {
          info: {
            id, name: `Custom site ${Math.abs(la).toFixed(3)}°S ${(((lo % 360) + 360) % 360).toFixed(3)}°E`, short: `Custom ${Math.abs(la).toFixed(2)}°S`,
            lat: la, lon: lo, citedLat: la, citedLon: lo, snappedM: 0, region: 'south-pole', mission: 'User-entered coordinates (approximate)',
            description: 'Horizon ray-marched in your browser on a 400 m/px downsample of LOLA LDEM_80S_40M. Approximate: compared with the 40 m pipeline the horizon differs by 0.1–0.6° on average and up to ~2° on sharp ridges.',
            source: 'User input', verify: false, siteHeightM: hz.siteHeightM, dem: 'LDEM_80S_40M → 400 m (in-browser)', demResolutionM: 400, synthetic: false, approximate: true,
            stats: { sunPct: upFraction(sunUp, 0, n) * 100, sunDiskPct: NaN, earthPct: upFraction(earthUp, 0, n) * 100 },
          },
          horizon: { id, lat: la, lon: lo, synthetic: false, dem: 'LDEM_80S_40M (400 m downsample)', demResolutionM: 400, siteHeightM: hz.siteHeightM, observerHeightM: 2, maxRangeKm: 150, horizonDeg: hz.horizonDeg, horizonDistKm: hz.horizonDistKm },
          series,
        };
        registerSite(d);
        setBusy(null);
        onReady(d);
      }
    };
    worker.current.postMessage(req);
  };

  return (
    <details className="custom-site">
      <summary><ChevronRight size={14} aria-hidden /> Custom coordinates</summary>
      <div className="custom-row">
        <label>Lat ° (−90 to −80.5)<input id="custom-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
        <label>Lon ° E<input id="custom-lon" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} /></label>
        <button className="btn-primary" onClick={run} disabled={!!busy}>{busy ? 'Computing' : 'Compute'}</button>
      </div>
      {busy && <p className="small" aria-live="polite">{busy}</p>}
      {err && <p className="small err" role="alert">{err}</p>}
    </details>
  );
}
