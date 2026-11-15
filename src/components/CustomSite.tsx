import { ChevronRight } from './Icons';
import { useState } from 'react';
import { computeSite, validateLatLon } from '../lib/customSite';
import type { SiteData, SitesDoc } from '../lib/data';

interface Props { doc: SitesDoc; onReady: (d: SiteData) => void }

/** Custom coordinates anywhere on the Moon → approximate skyline + three-year Sun/Earth series, in a Web Worker. */
export default function CustomSite({ doc, onReady }: Props) {
  const [lat, setLat] = useState('-89.30');
  const [lon, setLon] = useState('130.00');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = () => {
    const la = lat.trim() === '' ? NaN : Number(lat), lo = lon.trim() === '' ? NaN : Number(lon);
    const bad = validateLatLon(la, lo);
    if (bad) { setErr(bad); return; }
    setErr(null); setBusy('Starting…');
    computeSite(doc, la, lo, setBusy).then((d) => { setBusy(null); onReady(d); }, (e) => { setBusy(null); setErr(String(e.message ?? e)); });
  };

  return (
    <details className="custom-site">
      <summary><ChevronRight size={14} aria-hidden /> Custom coordinates</summary>
      <div className="custom-row">
        <label>Lat ° (−90 to 90)<input id="custom-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
        <label>Lon ° E<input id="custom-lon" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} /></label>
        <button className="btn-primary" onClick={run} disabled={!!busy} aria-busy={!!busy}>{busy ? 'Computing' : 'Compute'}</button>
      </div>
      <p className="small muted">Any point on the Moon. South of 80.5°S the skyline uses 400 m terrain; elsewhere the global 2.7 km map, so results there are rougher.</p>
      {busy && <p className="small" aria-live="polite">{busy}</p>}
      {err && <p className="small err" role="alert">{err}</p>}
    </details>
  );
}
