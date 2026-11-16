import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyse, parseWhen, sitesIn, type AnalystApi } from '../analyst';
import { parseSeries } from '../series';
import type { SiteData, SitesDoc } from '../data';

const doc = JSON.parse(readFileSync('public/sites.json', 'utf8')) as SitesDoc;
const load = async (id: string): Promise<SiteData> => {
  if (!existsSync(`public/series/${id}.json`)) throw new Error('no data');
  return { info: doc.sites.find((s) => s.id === id)!, horizon: JSON.parse(readFileSync(`public/horizons/${id}.json`, 'utf8')), series: parseSeries(JSON.parse(readFileSync(`public/series/${id}.json`, 'utf8'))) };
};
const range: [number, number] = [Date.parse(doc.range.start), Date.parse(doc.range.end) - 1800000];
const api = (currentId: string | null = null): AnalystApi => ({ sites: doc.sites, t: Date.UTC(2028, 2, 1), range, currentId, load });
const id = (short: string) => doc.sites.find((s) => s.short === short)!.id;

describe('parseWhen', () => {
  const now = Date.UTC(2028, 0, 1);
  it('reads dates in several forms', () => {
    expect(parseWhen('on 2028-03-12', now)?.t).toBe(Date.UTC(2028, 2, 12));
    expect(parseWhen('12 March 2028', now)?.t).toBe(Date.UTC(2028, 2, 12));
    expect(parseWhen('March 12th, 2028', now)?.t).toBe(Date.UTC(2028, 2, 12));
    expect(parseWhen('in 3 days', now)?.t).toBe(now + 3 * 86400_000);
    expect(parseWhen('tomorrow', now)?.t).toBe(now + 86400_000);
    expect(parseWhen('nothing here', now)).toBeNull();
  });
  it('reads a month as a span', () => {
    expect(parseWhen('best day in June 2028', now)?.span).toEqual([Date.UTC(2028, 5, 1), Date.UTC(2028, 6, 1)]);
  });
});

describe('sitesIn', () => {
  it('finds named sites in order and prefers the longest name', () => {
    expect(sitesIn('compare Malapert and Shackleton rim', doc.sites).map((s) => s.short)).toEqual(['Malapert', 'Shackleton rim']);
    expect(sitesIn('is apollo 11 sunlit', doc.sites).map((s) => s.short)).toEqual(['Apollo 11']);
    expect(sitesIn("how about chang'e 4", doc.sites).map((s) => s.short)).toEqual(["Chang'e-4"]);
  });
});

describe('analyse', () => {
  it('answers the state of a named site at a date', async () => {
    const f = await analyse('Is Apollo 11 sunlit on 2028-03-05?', api(), null);
    expect(f?.text).toMatch(/Apollo 11 at 2028-03-05 00:00 UTC: in (sunlight|shadow)/);
    expect(f?.actions.some((a) => a.type === 'time')).toBe(true);
  });
  it('compares two sites and offers the comparison', async () => {
    const f = await analyse('Malapert vs Shackleton rim', api(), null);
    expect(f?.text).toMatch(/comes out ahead/);
    expect(f?.actions[0]).toMatchObject({ type: 'pair', a: id('Malapert'), b: id('Shackleton rim') });
  });
  it('ranks sites', async () => {
    const f = await analyse('Which site has the most sunlight?', api(), null);
    expect(f?.text).toMatch(/^Best for sunlight/);
    expect(f?.text).toMatch(/1\. /);
  }, 30000);
  it('finds the best landing day in a month', async () => {
    const f = await analyse('Best day to land at Malapert in June 2028', api(), null);
    expect(f?.text).toMatch(/best landing time at Malapert in June 2028 is 2028-06/);
  });
  it('follows on from the last site', async () => {
    const f = await analyse('what about tomorrow?', api(), id('Apollo 15'));
    expect(f?.text).toMatch(/^Apollo 15 at/);
  });
  it('lists sites by program and measures distance', async () => {
    expect((await analyse('Which sites are Apollo?', api(), null))?.text).toMatch(/^6 Apollo landing sites/);
    expect((await analyse('How far is Apollo 11 from Apollo 17?', api(), null))?.text).toMatch(/km apart/);
  });
  it('leaves explanations to the topic model', async () => {
    expect(await analyse('What does the power rating mean?', api(id('Malapert')), null)).toBeNull();
    expect(await analyse('How do I change the date?', api(id('Malapert')), null)).toBeNull();
  });
});
