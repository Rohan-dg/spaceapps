import { describe, expect, it } from 'vitest';
import { toCSV } from '../export';
describe('CSV export', () => {
  it('escapes commas, quotes and newlines', () => {
    expect(toCSV([{ a: 1, b: 'x, "y"', c: null }])).toBe('a,b,c\n1,"x, ""y""",\n');
  });
});

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
