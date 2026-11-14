import { describe, expect, it } from 'vitest';
import {
  decodeI16, encodeI16, encodeRuns, findRun, isUp, longestGap, longestRun, nextRise, nextSet, upCount, upFraction,
} from '../series';

//            0 1 2 3 4 5 6 7 8 9
const flags = [0, 1, 1, 1, 0, 0, 1, 1, 0, 0];
const runs = encodeRuns(flags);
const n = flags.length;

describe('run-length encoding', () => {
  it('encodes half-open runs', () => {
    expect(runs).toEqual([1, 4, 6, 8]);
    expect(encodeRuns([1, 1, 0, 1])).toEqual([0, 2, 3, 4]);
    expect(encodeRuns([0, 0])).toEqual([]);
  });
  it('round-trips through isUp', () => {
    flags.forEach((f, i) => expect(isUp(runs, i)).toBe(!!f));
  });
  it('findRun reports containing run or insertion point', () => {
    expect(findRun(runs, 2)).toBe(0);
    expect(findRun(runs, 7)).toBe(1);
    expect(findRun(runs, 0)).toBe(-1);
    expect(findRun(runs, 5)).toBe(-2);
    expect(findRun(runs, 9)).toBe(-3);
  });
});

describe('sunset / sunrise countdown', () => {
  it('while up: next set is end of current run, next rise is start of following run', () => {
    expect(nextSet(runs, 2, n)).toEqual({ index: 4, beyondRange: false });
    expect(nextRise(runs, 2)).toEqual({ index: 6, beyondRange: false });
  });
  it('while down: next rise is start of next run, next set is end of that run', () => {
    expect(nextRise(runs, 4.5)).toEqual({ index: 6, beyondRange: false });
    expect(nextSet(runs, 4.5, n)).toEqual({ index: 8, beyondRange: false });
  });
  it('at the exact rise sample the body is up; next rise is the following run', () => {
    expect(isUp(runs, 6)).toBe(true);
    expect(nextRise(runs, 6).beyondRange).toBe(true);
  });
  it('reports beyond-range when no event remains', () => {
    expect(nextRise(runs, 8)).toEqual({ index: null, beyondRange: true });
    expect(nextSet(runs, 8, n)).toEqual({ index: null, beyondRange: true });
    // a run that lasts until the end of data: the set is unknown, not "at the end"
    const r2 = encodeRuns([0, 1, 1]);
    expect(nextSet(r2, 1, 3)).toEqual({ index: null, beyondRange: true });
  });
  it('fractional index is floored to the sample it belongs to', () => {
    expect(nextSet(runs, 3.9, n).index).toBe(4);
  });
});

describe('window statistics', () => {
  it('counts up samples in a window', () => {
    expect(upCount(runs, 0, 10)).toBe(5);
    expect(upCount(runs, 2, 7)).toBe(3);
    expect(upFraction(runs, 0, 10)).toBe(0.5);
  });
  it('longest gap including window edges', () => {
    expect(longestGap(runs, 0, 10)).toEqual({ length: 2, start: 4, clipped: false });
    expect(longestGap(runs, 7, 10)).toEqual({ length: 2, start: 8, clipped: true });
    expect(longestGap([], 0, 10)).toEqual({ length: 10, start: 0, clipped: true });
  });
  it('longest run clipped to window', () => {
    expect(longestRun(runs, 0, 10)).toBe(3);
    expect(longestRun(runs, 2, 10)).toBe(2);
  });
});

describe('int16 base64 codec', () => {
  it('round-trips', () => {
    const a = new Int16Array([0, -1, 150, -9000, 32767]);
    expect(Array.from(decodeI16(encodeI16(a)))).toEqual(Array.from(a));
  });
});
