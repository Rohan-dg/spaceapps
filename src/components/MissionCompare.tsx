/**
 * Mission comparison sidebar: pick any two missions from the site catalogue (flown, crashed, planned, candidate)
 * and compare them on the same criteria, with a long-run verdict.
 *
 * Works for whatever the catalogue holds: new uploads appear automatically. A mission whose precomputed files are
 * missing is computed in the browser from its coordinates, so every criterion exists for every mission.
 */
import { useEffect, useMemo, useState } from 'react';
import { computeSite } from '../lib/customSite';
import { loadSite, type SiteData, type SiteInfo, type SitesDoc } from '../lib/data';
import { ROWS, better, criteriaOf, eraOf, longRunScore, separationKm, verdict, yearOf, type Criteria, type Era } from '../lib/missionCompare';
import { ArrowRight, Search, X } from './Icons';

const PROGRAM: Record<string, string> = { artemis: 'Artemis III', clps: 'NASA CLPS', apollo: 'Apollo', nasa: 'NASA robotic', commercial: 'Private', international: 'Other countries', reference: 'Reference' };
const STATUS: Record<string, string> = { landed: 'Landed', crashed: 'Crashed', impact: 'Impact', target: 'Failed (target)', planned: 'Planned', candidate: 'Candidate', reference: 'Reference' };
const ERA: Record<Era, string> = { past: 'Past', future: 'Future', reference: 'Reference' };
const fmtLat = (lat: number, lon: number) => {
  const l = ((lon % 360) + 360) % 360;
  return `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'} ${l > 180 ? `${(360 - l).toFixed(2)}°W` : `${l.toFixed(2)}°E`}`;
};
const programOf = (s: SiteInfo) => (s.approximate ? 'custom' : s.program ?? 'reference');
type Info = SiteInfo & { date?: string };

/** Load a mission's data; fall back to computing it in the browser when its files are missing. */
function useMission(doc: SitesDoc, info: Info | null) {
  const [state, setState] = useState<{ id: string; data: SiteData | null; busy: string | null; err: string | null }>({ id: '', data: null, busy: null, err: null });
  useEffect(() => {
    if (!info) return;
    let live = true;
    loadSite(info.id)
      .catch(() => computeSite(doc, info.lat, info.lon, (m) => live && setState({ id: info.id, data: null, busy: `Computing from coordinates: ${m}`, err: null }))
        .then((d) => ({ ...d, info })))
      .then((d) => { if (live) setState({ id: info.id, data: d, busy: null, err: null }); })
      .catch((e) => { if (live) setState({ id: info.id, data: null, busy: null, err: String(e?.message ?? e) }); });
    return () => { live = false; };
  }, [doc, info]);
  return state.id === info?.id ? state : { id: '', data: null, busy: info ? 'Loading…' : null, err: null };
}

export interface MissionPair { a: string | null; b: string | null; active: 'a' | 'b' }
interface Props { doc: SitesDoc; sites: SiteInfo[]; pair: MissionPair; onPair: (p: MissionPair) => void; onClose: () => void; onOpenSite: (id: string) => void; onPlanLaunch?: (id: string) => void }

export default function MissionCompare({ doc, sites, pair, onPair, onClose, onOpenSite, onPlanLaunch }: Props) {
  const [era, setEra] = useState<Era | 'all'>('all');
  const [prog, setProg] = useState('all');
  const [q, setQ] = useState('');
  const byId = useMemo(() => new Map(sites.map((s) => [s.id, s as Info])), [sites]);
  const infoA = pair.a ? byId.get(pair.a) ?? null : null, infoB = pair.b ? byId.get(pair.b) ?? null : null;
  const A = useMission(doc, infoA), B = useMission(doc, infoB);
  const ca = useMemo(() => (A.data ? criteriaOf(A.data) : null), [A.data]);
  const cb = useMemo(() => (B.data ? criteriaOf(B.data) : null), [B.data]);
  const v = ca && cb && infoA && infoB ? verdict(ca, cb, infoA.short, infoB.short) : null;
  const sameSite = infoA && infoB && infoA.id !== infoB.id && separationKm(infoA, infoB) < 2;

  const counts = useMemo(() => {
    const c = { all: sites.length, past: 0, future: 0, reference: 0 } as Record<Era | 'all', number>;
    for (const s of sites) c[eraOf(s)]++;
    return c;
  }, [sites]);
  const programs = useMemo(() => [...new Set(sites.map(programOf))], [sites]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sites
      .filter((s) => (era === 'all' || eraOf(s) === era) && (prog === 'all' || programOf(s) === prog))
      .filter((s) => !needle || `${s.name} ${s.short} ${s.mission ?? ''} ${PROGRAM[s.program ?? ''] ?? ''}`.toLowerCase().includes(needle))
      .map((s) => ({ s: s as Info, era: eraOf(s), year: yearOf(s as Info) }))
      // future first, soonest first; then past, most recent first; then reference
      .sort((x, y) => {
        const rank = { future: 0, past: 1, reference: 2 } as const;
        if (rank[x.era] !== rank[y.era]) return rank[x.era] - rank[y.era];
        const ya = x.year ?? 9999, yb = y.year ?? 9999;
        return x.era === 'past' ? yb - ya : ya - yb;
      });
  }, [sites, era, prog, q]);

  const choose = (id: string) => onPair(pair.active === 'a' ? { a: id, b: pair.b, active: 'b' } : { a: pair.a, b: id, active: 'a' });

  return (
    <aside className="mc" aria-label="Mission comparison">
      <header className="mc-head">
        <div>
          <h2>Mission comparison</h2>
          <p className="muted small">{sites.length} missions and sites, past and future. Pick two to compare.</p>
        </div>
        <button className="mc-close" onClick={onClose} aria-label="Close mission comparison"><X size={16} /></button>
      </header>

      <div className="mc-slots" role="radiogroup" aria-label="Which side to fill">
        {(['a', 'b'] as const).map((k) => {
          const info = k === 'a' ? infoA : infoB, st = k === 'a' ? A : B;
          return (
            <button key={k} role="radio" aria-checked={pair.active === k} className={`mc-slot${pair.active === k ? ' on' : ''}`} onClick={() => onPair({ ...pair, active: k })}>
              <span className={`mc-tag ${k}`}>{k.toUpperCase()}</span>
              <span className="mc-slot-text">
                <b>{info ? info.short : 'Choose a mission'}</b>
                <small>{info ? `${ERA[eraOf(info)]} · ${STATUS[info.status ?? 'reference'] ?? info.status} · ${yearOf(info) ?? 'year n/a'}` : pair.active === k ? 'Pick from the list or click a site on the Moon' : 'Select to fill'}</small>
                {st.busy && <small className="mc-busy">{st.busy}</small>}
                {st.err && <small className="err">{st.err}</small>}
              </span>
            </button>
          );
        })}
        <button className="mc-swap" onClick={() => onPair({ a: pair.b, b: pair.a, active: pair.active })} disabled={!pair.a && !pair.b} title="Swap A and B" aria-label="Swap A and B">⇄</button>
      </div>

      {infoA && infoB && (
        <section className="mc-result" aria-live="polite">
          {sameSite && <p className="mc-note">These two share a site (under 2 km apart), so their criteria match. The missions differ, not the place.</p>}
          {v ? (
            <div className={`mc-verdict ${v.winner}`}>
              <span className="eyebrow">Long-run efficiency</span>
              <p className="mc-verdict-line">
                {v.winner === 'tie' ? <><b>Evenly matched</b> ({v.scoreA.toFixed(1)} vs {v.scoreB.toFixed(1)})</>
                  : <><b>{v.winner === 'a' ? infoA.short : infoB.short}</b> is better in the long run: {Math.max(v.scoreA, v.scoreB).toFixed(1)} vs {Math.min(v.scoreA, v.scoreB).toFixed(1)} out of 100</>}
              </p>
              <p className="muted small">Wins {v.winsA} criteria to {v.winsB}{ROWS.length - v.winsA - v.winsB ? `, ${ROWS.length - v.winsA - v.winsB} even` : ''}.</p>
              {v.reasons.length > 0 && <ul className="mc-reasons">{v.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
              <ScoreBars a={ca!} b={cb!} />
            </div>
          ) : <p className="muted small">Working out the comparison…</p>}

          <table className="mc-table">
            <thead><tr><th>Criterion</th><th className="a">A</th><th className="b">B</th></tr></thead>
            <tbody>
              <tr><th>Mission</th><td>{infoA.mission ?? '-'}</td><td>{infoB.mission ?? '-'}</td></tr>
              <tr><th>Program · status</th><td>{PROGRAM[infoA.program ?? ''] ?? 'Your point'} · {STATUS[infoA.status ?? 'reference'] ?? infoA.status}</td><td>{PROGRAM[infoB.program ?? ''] ?? 'Your point'} · {STATUS[infoB.status ?? 'reference'] ?? infoB.status}</td></tr>
              <tr><th>Location</th><td className="num">{fmtLat(infoA.lat, infoA.lon)}</td><td className="num">{fmtLat(infoB.lat, infoB.lon)}</td></tr>
              {ca && cb && ROWS.map((r) => {
                const w = better(r, ca[r.key], cb[r.key]);
                const fmt = (x: number) => (r.key === 'longestNightH' || r.key === 'longestBlackoutH') && x >= ca.rangeH - 1 ? 'whole range' : x.toFixed(r.digits);
                return (
                  <tr key={r.key}>
                    <th>{r.label}<small>{r.higherIsBetter ? 'higher is better' : 'lower is better'}</small></th>
                    <td className={`num${w === 'a' ? ' win' : ''}`}>{fmt(ca[r.key])} <small>{r.unit}</small></td>
                    <td className={`num${w === 'b' ? ' win' : ''}`}>{fmt(cb[r.key])} <small>{r.unit}</small></td>
                  </tr>
                );
              })}
              <tr><th>Terrain data</th><td>{infoA.dem}{infoA.demResolutionM ? `, ${infoA.demResolutionM} m/px` : ''}{infoA.verify ? ' · coordinate to verify' : ''}</td><td>{infoB.dem}{infoB.demResolutionM ? `, ${infoB.demResolutionM} m/px` : ''}{infoB.verify ? ' · coordinate to verify' : ''}</td></tr>
            </tbody>
          </table>
          <div className="mc-open">
            <button onClick={() => onOpenSite(infoA.id)}>Open A on the Moon <ArrowRight size={14} /></button>
            <button onClick={() => onOpenSite(infoB.id)}>Open B on the Moon <ArrowRight size={14} /></button>
            {onPlanLaunch && <button onClick={() => onPlanLaunch(infoA.id)}>Plan launch to A <ArrowRight size={14} /></button>}
            {onPlanLaunch && <button onClick={() => onPlanLaunch(infoB.id)}>Plan launch to B <ArrowRight size={14} /></button>}
          </div>
        </section>
      )}

      <section className="mc-pick" aria-label="Missions">
        <div className="mc-filters">
          <div className="seg" role="radiogroup" aria-label="Past or future">
            {(['all', 'past', 'future', 'reference'] as const).map((e) => (
              <button key={e} role="radio" aria-checked={era === e} onClick={() => setEra(e)}>{e === 'all' ? 'All' : ERA[e]} <span className="num">{counts[e]}</span></button>
            ))}
          </div>
          <select id="mc-program" aria-label="Program" value={prog} onChange={(e) => setProg(e.target.value)}>
            <option value="all">All programs</option>
            {programs.map((p) => <option key={p} value={p}>{PROGRAM[p] ?? (p === 'custom' ? 'Your points' : p)}</option>)}
          </select>
          <label className="mc-search"><Search size={14} /><input id="mc-search" placeholder="Search missions" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        </div>
        <p className="muted small mc-hint">Filling <b>{pair.active.toUpperCase()}</b>. Click a mission, or click a site on the 3D Moon.</p>
        <ul className="mc-list">
          {list.map(({ s, era: e, year }) => (
            <li key={s.id}>
              <button className={`mc-row${s.id === pair.a ? ' is-a' : ''}${s.id === pair.b ? ' is-b' : ''}`} onClick={() => choose(s.id)}>
                <span className="mc-row-main">
                  <b>{s.short}</b>
                  <small>{PROGRAM[s.program ?? ''] ?? 'Your point'} · {STATUS[s.status ?? 'reference'] ?? s.status} · {year ?? 'year n/a'} · {fmtLat(s.lat, s.lon)}</small>
                </span>
                <span className={`mc-era ${e}`}>{ERA[e]}</span>
                <span className="mc-row-stats num" title="Sunlight and Earth in view, share of 2027 to 2029">
                  <span className="t-sun">{Number.isFinite(s.stats?.sunPct) ? `${Math.round(s.stats.sunPct)}%` : '…'}</span>
                  <span className="t-earth">{Number.isFinite(s.stats?.earthPct) ? `${Math.round(s.stats.earthPct)}%` : '…'}</span>
                </span>
                {(s.id === pair.a || s.id === pair.b) && <span className={`mc-tag ${s.id === pair.a ? 'a' : 'b'}`}>{s.id === pair.a ? 'A' : 'B'}</span>}
              </button>
            </li>
          ))}
          {!list.length && <li className="muted small">No missions match.</li>}
        </ul>
      </section>

      <p className="mc-foot small muted">
        Every criterion comes from the terrain skyline and the Sun and Earth over 2027 to 2029, so every mission gets every one. The long-run score weights sunlight 35%, Earth contact 25%,
        the longest night 20%, radio blackouts 10% and good landing days 10%, each on a fixed scale. Planned targets are shown at their published regions; coordinates marked to verify are approximate.
      </p>
    </aside>
  );
}

function ScoreBars({ a, b }: { a: Criteria; b: Criteria }) {
  const sa = longRunScore(a), sb = longRunScore(b);
  return (
    <div className="mc-bars" aria-label="Score breakdown">
      {sa.parts.map((p, i) => (
        <div key={p.key} className="mc-bar-row">
          <span className="mc-bar-label">{p.label} <small>{Math.round(p.weight * 100)}%</small></span>
          <span className="mc-bar a" title={`A: ${(p.value * 100).toFixed(0)}%`}><i style={{ width: `${p.value * 100}%` }} /></span>
          <span className="mc-bar b" title={`B: ${(sb.parts[i].value * 100).toFixed(0)}%`}><i style={{ width: `${sb.parts[i].value * 100}%` }} /></span>
        </div>
      ))}
      <div className="mc-bar-key small muted"><span><i className="a" /> A</span><span><i className="b" /> B</span></div>
    </div>
  );
}
