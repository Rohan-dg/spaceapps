import { useMemo, useState } from 'react';
import type { Level } from '../config/thresholds';
import type { SiteData } from '../lib/data';
import { formatDuration, tMinus } from '../lib/metrics';
import { scenarioFor, type ScenarioResult } from '../lib/useScenario';
import { LevelIcon } from './Metrics';

const DAY = 86400_000;
const STEP_H = 12;
const FROM_D = -15, TO_D = 30;
const ROWS = [-7, -3, -1, 1, 3, 7, 14];
const WORD: Record<Level, string> = { green: 'Good', amber: 'Marginal', red: 'Poor' };
const RANK: Record<Level, number> = { green: 2, amber: 1, red: 0 };

interface Props { data: SiteData; t: number; t0: number; t1: number; onSeek: (t: number) => void; playing?: boolean }

const sd = (d: number) => (d === 0 ? 'planned' : `${d > 0 ? '+' : '−'}${Math.abs(d) % 1 ? Math.abs(d).toFixed(1) : Math.abs(d)} d`);
const date = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');

/** Longest run of offsets around 0 where `ok` holds, as [first, last] day offsets (null if 0 itself fails). */
function tolerance(cells: { d: number; r: ScenarioResult | null }[], ok: (r: ScenarioResult) => boolean): [number, number] | null {
  const i0 = cells.findIndex((c) => c.d === 0);
  if (i0 < 0 || !cells[i0].r || !ok(cells[i0].r)) return null;
  let a = i0, b = i0;
  while (a > 0 && cells[a - 1].r && ok(cells[a - 1].r!)) a--;
  while (b < cells.length - 1 && cells[b + 1].r && ok(cells[b + 1].r!)) b++;
  return [cells[a].d, cells[b].d];
}

/**
 * "What if the landing slips?": the same site evaluated at earlier and later landing dates. A strip shows the
 * power and radio rating for every 12 h from −15 to +30 days, with the tolerance window around the planned
 * date; a table compares typical slips against the plan. Answers the brief's schedule-change question.
 */
export default function SlipPanel({ data, t: tLive, t0, t1, onSeek, playing = false }: Props) {
  // ~100 scenarios cost ~150 ms, so the panel holds its last date while time plays and catches up on pause
  const [held, setHeld] = useState(tLive);
  if (!playing && held !== tLive) setHeld(tLive);
  const t = playing ? held : tLive;
  const tq = Math.floor(t / (6 * 3600_000)) * 6 * 3600_000;
  const cells = useMemo(() => {
    const out: { d: number; t: number; r: ScenarioResult | null }[] = [];
    for (let h = FROM_D * 24; h <= TO_D * 24; h += STEP_H) {
      const tt = tq + h * 3600_000;
      out.push({ d: h / 24, t: tt, r: tt >= t0 && tt <= t1 ? scenarioFor(data, tt) : null });
    }
    return out;
  }, [data, tq, t0, t1]);
  const base = useMemo(() => scenarioFor(data, t), [data, t]);
  const rows = useMemo(() => ROWS.map((d) => {
    const tt = t + d * DAY;
    return { d, t: tt, r: tt >= t0 && tt <= t1 ? scenarioFor(data, tt) : null };
  }), [data, t, t0, t1]);

  const pw = tolerance(cells, (r) => r.power.level === base.power.level);
  const both = tolerance(cells, (r) => r.power.level === 'green' && r.comms.level === 'green');
  const nextBoth = cells.find((c) => c.d > 0 && c.r && c.r.power.level === 'green' && c.r.comms.level === 'green');
  const m = base.metrics;
  const win = (w: [number, number]) => `${sd(w[0])} to ${sd(w[1])}`;

  return (
    <div className={`slip${playing ? ' held' : ''}`}>
      {playing && <p className="slip-held">Showing {date(t)} UTC. Updates when you pause.</p>}
      <p className="slip-lead">
        {pw ? <>Power stays <b>{WORD[base.power.level]}</b> if the landing moves anywhere from <b className="num">{win(pw)}</b>{pw[0] === FROM_D || pw[1] === TO_D ? ' (or further)' : ''}.</> : null}{' '}
        {both ? <>Power and radio are both Good from <b className="num">{win(both)}</b>.</>
          : nextBoth ? <>Power and radio are not both Good on the planned date; the first such slot is <button className="link num" onClick={() => onSeek(nextBoth.t)}>{sd(nextBoth.d)}</button> ({date(nextBoth.t)} UTC).</>
          : <>No date in the next {TO_D} days gives Good power and radio together at this site.</>}
      </p>

      <div className="slip-strip" role="group" aria-label="Rating for each landing date, 12-hour steps">
        {(['power', 'comms'] as const).map((k) => (
          <div className="slip-row" key={k}>
            <span className="slip-lab">{k === 'power' ? 'Power' : 'Radio'}</span>
            <div className="slip-cells">
              {cells.map((c) => (
                <button key={c.d} className={`slip-cell ${c.r ? `lv-${c.r[k].level}` : 'na'}${c.d === 0 ? ' zero' : ''}`} disabled={!c.r}
                  onClick={() => onSeek(c.t)} title={`${sd(c.d)} (${date(c.t)} UTC): ${c.r ? WORD[c.r[k].level] : 'outside data range'}`}
                  aria-label={`${sd(c.d)}: ${c.r ? WORD[c.r[k].level] : 'no data'}`} />
              ))}
            </div>
          </div>
        ))}
        <div className="slip-axis" aria-hidden>
          <span className="slip-lab" />
          <div className="slip-cells">
            {cells.map((c) => <span key={c.d} className="slip-tick">{c.d % 5 === 0 ? (c.d === 0 ? '0' : `${c.d > 0 ? '+' : ''}${c.d}`) : ''}</span>)}
          </div>
        </div>
        <ul className="chart-legend slip-legend">
          <li><span className="slip-cell lv-green" aria-hidden /> Good</li>
          <li><span className="slip-cell lv-amber" aria-hidden /> Marginal</li>
          <li><span className="slip-cell lv-red" aria-hidden /> Poor</li>
          <li>Days from the planned landing. Click a slot to move there.</li>
        </ul>
      </div>

      <div className="table-scroll">
        <table className="slip-table">
          <thead>
            <tr><th scope="col">Landing</th><th scope="col">Date (UTC)</th><th scope="col">Sun elevation</th><th scope="col">Power</th><th scope="col">Radio</th><th scope="col">Sunlit, next lunar day</th><th scope="col">Longest dark</th><th scope="col">Next sunset</th></tr>
          </thead>
          <tbody>
            <Row label="Planned" t={t} r={base} base={m} onSeek={onSeek} />
            {rows.map((x) => x.r ? <Row key={x.d} label={sd(x.d)} t={x.t} r={x.r} base={m} baseR={base} onSeek={onSeek} />
              : <tr key={x.d}><th scope="row">{sd(x.d)}</th><td colSpan={7} className="muted">Outside the data range</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, t, r, base, baseR, onSeek }: { label: string; t: number; r: ScenarioResult; base: ScenarioResult['metrics']; baseR?: ScenarioResult; onSeek: (t: number) => void }) {
  const m = r.metrics;
  const delta = (k: 'power' | 'comms') => !baseR ? '' : RANK[r[k].level] > RANK[baseR[k].level] ? ' better' : RANK[r[k].level] < RANK[baseR[k].level] ? ' worse' : '';
  const dp = m.sunPct - base.sunPct;
  const sunset = m.sunUp ? m.nextSunset : m.nextSunrise;
  return (
    <tr className={baseR ? '' : 'base'}>
      <th scope="row">{baseR ? <button className="link" onClick={() => onSeek(t)}>{label}</button> : label}</th>
      <td className="num">{date(t)}</td>
      <td className="num">{m.sky.sun.el.toFixed(2)}°<small>{m.sunUp ? ' lit' : ' shadow'}</small></td>
      <td className={delta('power')}><LevelIcon level={r.power.level} size={15} /> {WORD[r.power.level]}</td>
      <td className={delta('comms')}><LevelIcon level={r.comms.level} size={15} /> {WORD[r.comms.level]}</td>
      <td className="num">{m.sunPct.toFixed(0)}%{baseR && Math.abs(dp) >= 1 && <small> {dp > 0 ? '+' : '−'}{Math.abs(dp).toFixed(0)}</small>}</td>
      <td className="num">{m.longestDarkH > 0 ? formatDuration(m.longestDarkH * 3600_000) : 'none'}</td>
      <td className="num">{m.sunUp ? tMinus(sunset, t) : <span className="muted">rises {tMinus(sunset, t)}</span>}</td>
    </tr>
  );
}
