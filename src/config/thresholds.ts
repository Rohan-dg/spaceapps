/**
 * Verdict thresholds. All windows are "the next lunar cycle" (29.53 days from the selected time).
 * Tune here; the UI explains whichever rule fired.
 */
export const THRESHOLDS = {
  power: {
    // GREEN if sunlit ≥ greenPct AND longest dark ≤ greenMaxDarkH
    greenPct: 70,
    greenMaxDarkH: 100, // ~4 days: survivable with batteries + heaters on a small lander
    // AMBER if sunlit ≥ amberPct OR longest dark ≤ amberMaxDarkH; otherwise RED
    amberPct: 40,
    amberMaxDarkH: 200,
  },
  comms: {
    // Direct-to-Earth: GREEN if visible ≥ greenPct AND longest gap ≤ greenMaxGapH
    greenPct: 90,
    greenMaxGapH: 24,
    amberPct: 40,
    amberMaxGapH: 120,
  },
} as const;

export type Level = 'green' | 'amber' | 'red';
