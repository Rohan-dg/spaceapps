import { describe, expect, it } from 'vitest';
import { mix } from '../theme';
describe('mix', () => {
  it('mixes hex and rgb() inputs', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)');
    expect(mix('rgb(0,0,0)', '#ff0000', 1)).toBe('rgb(255,0,0)');
  });
});
