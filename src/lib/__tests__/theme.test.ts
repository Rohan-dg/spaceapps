import { describe, expect, it } from 'vitest';
import { mix } from '../theme';
describe('mix', () => {
  it('mixes hex and rgb() inputs', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)');
    expect(mix('rgb(0,0,0)', '#ff0000', 1)).toBe('rgb(255,0,0)');
  });
  it('accepts the 3-digit hex a CSS minifier produces', () => {
    expect(mix('#fff', '#000000', 0)).toBe('rgb(255,255,255)');
    expect(mix('#fff', '#1c2127', 0.1)).toBe(mix('#ffffff', '#1c2127', 0.1));
  });
});
