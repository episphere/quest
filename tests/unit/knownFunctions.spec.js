import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { knownFunctions } from '../../knownFunctions.js';

describe('knownFunctions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('evaluates boolean composition', () => {
    expect(knownFunctions.and(true, 'value')).toBe('value');
    expect(knownFunctions.and(false, 'value')).toBe(false);
    expect(knownFunctions.or('', 'fallback')).toBe('fallback');
    expect(knownFunctions.or('first', 'fallback')).toBe('first');
    expect(knownFunctions.isNotDefined('')).toBe(true);
    expect(knownFunctions.isNotDefined('set')).toBe(false);
    expect(knownFunctions.setFalse('ignored', 'ignored')).toBe(false);
  });

  it('resolves defined values, numeric fallbacks, and state-backed identifiers', () => {
    const appState = { findResponseValue: vi.fn((key) => key === 'KNOWN' ? 'stored' : undefined) };

    expect(knownFunctions.isDefined('4', '9', appState)).toBe('4');
    expect(knownFunctions.isDefined('', '9', appState)).toBe('9');
    expect(knownFunctions.isDefined('KNOWN', 'fallback', appState)).toBe('stored');
    expect(knownFunctions.isDefined('MISSING', 'fallback', appState)).toBe('fallback');
  });

  it('calculates minimum and maximum while ignoring nonnumeric operands', () => {
    expect(knownFunctions.min('', '')).toBe('');
    expect(knownFunctions.max('', '')).toBe('');
    expect(knownFunctions.min('3.5', '7')).toBe(3.5);
    expect(knownFunctions.min('unknown', '7')).toBe(7);
    expect(knownFunctions.max('3.5', '7')).toBe(7);
    expect(knownFunctions.max('3.5', 'unknown')).toBe(3.5);
  });

  it('compares scalar, array, boolean, undefined, quoted, and current-date values', () => {
    expect(knownFunctions.equals(undefined, 'undefined')).toBe(true);
    expect(knownFunctions.doesNotEqual(undefined, 'undefined')).toBe(false);
    expect(knownFunctions.equals('hello', '"hello"')).toBe(true);
    expect(knownFunctions.equals(true, 'true')).toBe(true);
    expect(knownFunctions.equals(false, 'false')).toBe(true);
    expect(knownFunctions.doesNotEqual(false, 'true')).toBe(true);
    expect(knownFunctions.doesNotEqual(true, 'false')).toBe(true);
    expect(knownFunctions.equals('2026-01-15', '_TODAY_')).toBe(true);
    expect(knownFunctions.doesNotEqual('2026-01-14', '_TODAY_')).toBe(true);
    expect(knownFunctions.equals(['1', '2'], '2')).toBe(true);
    expect(knownFunctions.doesNotEqual(['1', '2'], '3')).toBe(true);
    expect(knownFunctions.equals('1', '2')).toBe(false);
    expect(knownFunctions.doesNotEqual('1', '1')).toBe(false);
  });

  it('evaluates numeric comparisons and arithmetic', () => {
    expect(knownFunctions.lessThan('1', '2')).toBe(true);
    expect(knownFunctions.lessThanOrEqual('2', '2')).toBe(true);
    expect(knownFunctions.greaterThan('3', '2')).toBe(true);
    expect(knownFunctions.greaterThanOrEqual('3', '3')).toBe(true);
    expect(knownFunctions.difference('10', '3')).toBe(7);
    expect(knownFunctions.sum('10', '3')).toBe(13);
    expect(knownFunctions.percentDiff('10', '3')).toBeCloseTo(0.7);
  });

  it('returns NaN for invalid percentage inputs and counts choices safely', () => {
    expect(knownFunctions.percentDiff(null, '2')).toBeNaN();
    expect(knownFunctions.percentDiff('2', null)).toBeNaN();
    expect(knownFunctions.percentDiff(2, '1')).toBeNaN();
    expect(knownFunctions.numberOfChoicesSelected(undefined)).toBe(0);
    expect(knownFunctions.numberOfChoicesSelected(['a', 'b'])).toBe(2);
  });
});
