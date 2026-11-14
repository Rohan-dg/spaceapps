/** Ready-made scenarios for first-time visitors and judges. Each one tells a single story in one click. */
export interface Preset {
  id: string;
  title: string;
  /** One line: what you'll see when you click it. */
  blurb: string;
  mode: 'explore' | 'compare';
  siteId: string;
  t: number;
  /** For compare presets: the site in each column (all at `t`). */
  compare?: string[];
}

const D = (iso: string) => Date.parse(iso);

export const PRESETS: Preset[] = [
  {
    id: 'ridge', title: 'Sunny ridge near the pole', mode: 'explore', siteId: 'connecting-ridge', t: D('2027-07-08T00:00:00Z'),
    blurb: 'An Artemis III candidate site. The Sun sits below the flat horizon but still shines on the site, because the ridge looks down over lower ground.',
  },
  {
    id: 'wait', title: 'Wait 10 days, flip the answer', mode: 'explore', siteId: 'connecting-ridge', t: D('2027-07-18T00:00:00Z'),
    blurb: 'Same ridge, ten days later. Power goes from Marginal to Good. Timing matters as much as location.',
  },
  {
    id: 'vs', title: 'Ridge vs. crater rim', mode: 'compare', siteId: 'connecting-ridge', t: D('2027-07-08T00:00:00Z'),
    compare: ['connecting-ridge', 'de-gerlache-rim'],
    blurb: 'Two sites about 40 km apart at the same moment. One is in sunlight, the other is days from sunrise.',
  },
  {
    id: 'tradeoff', title: 'Power vs. radio trade-off', mode: 'compare', siteId: 'connecting-ridge', t: D('2027-07-08T00:00:00Z'),
    compare: ['connecting-ridge', 'malapert', 'change-4'],
    blurb: 'A sunny ridge, a mountain that always sees Earth, and the far side, where Earth never rises.',
  },
  {
    id: 'dark', title: 'Never-lit crater floor', mode: 'explore', siteId: 'shackleton-floor', t: D('2027-07-08T00:00:00Z'),
    blurb: 'Inside Shackleton crater. The walls block the Sun all the time. This permanent shadow is where water ice can survive.',
  },
  {
    id: 'farside', title: 'Far side: no view of Earth', mode: 'explore', siteId: 'change-4', t: D('2027-07-08T00:00:00Z'),
    blurb: "China's Chang'e-4 landing site. Earth never rises here, so all radio has to go through a relay satellite.",
  },
];
