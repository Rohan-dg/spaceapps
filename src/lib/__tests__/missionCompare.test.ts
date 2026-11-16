import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SiteData, SiteInfo } from '../data';
import { ROWS, better, criteriaOf, eraOf, longRunScore, separationKm, verdict, yearOf } from '../missionCompare';
import { parseSeries } from '../series';

const doc = JSON.parse(readFileSync('public/sites.json', 'utf8')) as { sites: SiteInfo[] };
const load = (id: string): SiteData => ({
  info: doc.sites.find((s) => s.id === id)!,
  horizon: JSON.parse(readFileSync(`public/horizons/${id}.json`, 'utf8')),
  series: parseSeries(JSON.parse(readFileSync(`public/series/${id}.json`, 'utf8'))),
});

describe('mission comparison', () => {
  it('every catalogue mission with data gets every criterion as a finite number', () => {
    for (const s of doc.sites) {
      const c = criteriaOf(load(s.id));
      for (const r of ROWS) expect(Number.isFinite(c[r.key]), `${s.id} ${r.key}`).toBe(true);
      const { score } = longRunScore(c);
      expect(score).toBeGreaterThanOrEqual(0); expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('criteria match the published site statistics', () => {
    for (const id of ['connecting-ridge', 'apollo-11', 'change-4']) {
      const s = doc.sites.find((x) => x.id === id)!, c = criteriaOf(load(id));
      expect(c.sunPct).toBeCloseTo(s.stats.sunPct, 1);
      expect(c.earthPct).toBeCloseTo(s.stats.earthPct, 1);
    }
  });

  it('physical sanity: far side never sees Earth, a shadowed floor never sees the Sun', () => {
    const far = criteriaOf(load('change-4')), floor = criteriaOf(load('shackleton-floor'));
    expect(far.earthPct).toBe(0); expect(far.goodDaysPerYear).toBe(0);
    expect(floor.sunPct).toBe(0); expect(floor.longestNightH).toBeCloseTo(floor.rangeH, 0);
    expect(longRunScore(floor).parts.find((p) => p.key === 'night')!.value).toBe(0);
  });

  it('the sunlit ridge beats the shadowed crater floor in the long run', () => {
    const v = verdict(criteriaOf(load('connecting-ridge')), criteriaOf(load('shackleton-floor')), 'ridge', 'floor');
    expect(v.winner).toBe('a');
    expect(v.scoreA).toBeGreaterThan(v.scoreB);
    expect(v.reasons.length).toBeGreaterThan(0);
    expect(v.reasons[0]).toMatch(/ridge ahead/);
  });

  it('identical sites tie', () => {
    const c = criteriaOf(load('malapert'));
    const v = verdict(c, c, 'x', 'y');
    expect(v.winner).toBe('tie'); expect(v.winsA).toBe(0); expect(v.winsB).toBe(0);
    for (const r of ROWS) expect(better(r, c[r.key], c[r.key])).toBe('tie');
  });

  it('lower is better for nights, higher for sunlight', () => {
    const night = ROWS.find((r) => r.key === 'longestNightH')!, sun = ROWS.find((r) => r.key === 'sunPct')!;
    expect(better(night, 100, 300)).toBe('a');
    expect(better(sun, 40, 80)).toBe('b');
  });

  it('eras, years and distances', () => {
    expect(eraOf({ status: 'landed' })).toBe('past');
    expect(eraOf({ status: 'target' })).toBe('past');
    expect(eraOf({ status: 'crashed' })).toBe('past');
    expect(eraOf({ status: 'impact' })).toBe('past');
    expect(eraOf({ status: 'planned' })).toBe('future');
    expect(eraOf({ status: 'candidate' })).toBe('future');
    expect(eraOf({})).toBe('reference');
    expect(yearOf({ mission: 'Apollo 11, July 1969' })).toBe(1969);
    expect(yearOf({ mission: 'x', date: '2028' })).toBe(2028);
    expect(yearOf({ mission: 'no year' })).toBeNull();
    expect(separationKm({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
    expect(separationKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(30.32, 1);
  });
});

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 2 commits), under the team's direction. Attribution from the commit history.
