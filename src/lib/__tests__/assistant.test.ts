import { describe, expect, it } from 'vitest';
import { MIN_CONFIDENCE, TOPICS, answer, buildModel, findSite } from '../assistant';

const model = buildModel();
const sites = [
  { id: 'malapert', name: 'Malapert Massif', short: 'Malapert' },
  { id: 'apollo-15', name: 'Apollo 15 (Hadley-Apennine)', short: 'Apollo 15' },
  { id: 'apollo-11', name: 'Apollo 11 (Tranquility Base)', short: 'Apollo 11' },
  { id: 'shackleton-rim', name: 'Shackleton crater rim', short: 'Shackleton rim' },
];

describe('on-device helper', () => {
  it('every example maps back to its own topic', () => {
    for (const t of TOPICS) for (const e of t.examples) expect(answer(model, e).topic?.id, e).toBe(t.id);
  });

  it('understands new phrasings it was not given', () => {
    const cases: [string, string][] = [
      ['how can I see which mission is more efficient long term', 'missions'],
      ['what time should the rocket take off from florida', 'launch'],
      ['how do i make the moon bigger', 'moon-controls'],
      ['when will the sun go down at this site', 'sunlit'],
      ['where do your numbers come from', 'data'],
      ['can i get the results as a spreadsheet', 'export'],
      ['i want to talk to a real human', 'human'],
      ['which dates are the best to land', 'calendar'],
    ];
    for (const [q, id] of cases) expect(answer(model, q).topic?.id, q).toBe(id);
  });

  it('tolerates typos', () => {
    expect(answer(model, 'misison comparsion').topic?.id).toBe('missions');
    expect(answer(model, 'lanch planer').topic?.id).toBe('launch');
  });

  it('admits when it does not know and offers a person', () => {
    for (const q of ['what is the capital of france', 'write me a poem about cats', 'asdf qwerty']) {
      const r = answer(model, q);
      expect(r.topic, q).toBeNull();
      expect(r.support).toBe(true);
      expect(r.confidence).toBeLessThan(MIN_CONFIDENCE);
    }
  });

  it('navigates to a named site', () => {
    const r = answer(model, 'show me Apollo 15', sites);
    expect(r.site?.id).toBe('apollo-15');
    expect(r.actions[0]).toEqual({ type: 'site', id: 'apollo-15', label: 'Open Apollo 15' });
    expect(findSite('take me to the shackleton rim please', sites)?.id).toBe('shackleton-rim');
    expect(findSite('apollo 11', sites)?.id).toBe('apollo-11');
    expect(findSite('apollo 1', sites)).toBeNull();
  });

  it('asking for a person always surfaces support', () => {
    expect(answer(model, 'contact support').support).toBe(true);
  });
});
