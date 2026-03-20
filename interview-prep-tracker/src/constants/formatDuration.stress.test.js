import { describe, it, expect } from 'vitest';
import { formatDuration, DURATION_OPTIONS } from './interviewTypes';

// ---------------------------------------------------------------------------
// Hypothesis 1: formatDuration edge cases
//
// The function handles the happy-path DURATION_OPTIONS values, but what
// happens with boundary/pathological inputs?
//   - 0 minutes
//   - Negative values
//   - Non-integer values (e.g. 45.5)
//   - Very large values (e.g. 10000)
//   - NaN, undefined, null, strings
//   - Values just above/below the hour boundary (59, 61)
//   - Multi-hour values that are NOT exact multiples of 60 (e.g. 150)
// ---------------------------------------------------------------------------

describe('formatDuration — stress tests', () => {
  // --- Happy path: all DURATION_OPTIONS produce non-empty strings ----------
  it('returns a non-empty string for every value in DURATION_OPTIONS', () => {
    for (const d of DURATION_OPTIONS) {
      const result = formatDuration(d);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });

  // --- Specific known outputs for DURATION_OPTIONS -------------------------
  it.each([
    [15,  '15 min'],
    [30,  '30 min'],
    [45,  '45 min'],
    [60,  '1 hr'],
    [90,  '90 min'],   // 90 is not a whole number of hours
    [120, '2 hrs'],
    [480, 'Full day (8 hrs)'],
  ])('formatDuration(%i) === %s', (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });

  // --- Zero ----------------------------------------------------------------
  it('handles 0 minutes without throwing', () => {
    const result = formatDuration(0);
    expect(typeof result).toBe('string');
    // "0 min" is the most reasonable output
    expect(result).toBe('0 min');
  });

  // --- Negative values -----------------------------------------------------
  it('handles negative values without throwing', () => {
    const result = formatDuration(-30);
    expect(typeof result).toBe('string');
    // Falls through to `${minutes} min` branch → "-30 min"
    expect(result).toBe('-30 min');
  });

  // --- Non-integer values --------------------------------------------------
  it('handles fractional minutes without throwing', () => {
    const result = formatDuration(45.5);
    expect(typeof result).toBe('string');
    // 45.5 >= 60 is false, so falls to `${minutes} min`
    expect(result).toBe('45.5 min');
  });

  it('handles 60.5 (>= 60 but not evenly divisible)', () => {
    const result = formatDuration(60.5);
    expect(typeof result).toBe('string');
    // 60.5 % 60 !== 0, so falls to `${minutes} min`
    expect(result).toBe('60.5 min');
  });

  // --- Very large values ---------------------------------------------------
  it('handles very large values (10000 min) without throwing', () => {
    const result = formatDuration(10000);
    expect(typeof result).toBe('string');
    // 10000 is not 480, but 10000 % 60 === 40, so falls to min branch
    expect(result).toBe('10000 min');
  });

  it('formats 180 as "3 hrs"', () => {
    expect(formatDuration(180)).toBe('3 hrs');
  });

  it('formats 240 as "4 hrs"', () => {
    expect(formatDuration(240)).toBe('4 hrs');
  });

  it('formats 300 as "5 hrs"', () => {
    expect(formatDuration(300)).toBe('5 hrs');
  });

  // --- Boundary around 60 -------------------------------------------------
  it('formats 59 as "59 min" (just under 1 hour)', () => {
    expect(formatDuration(59)).toBe('59 min');
  });

  it('formats 61 as "61 min" (just over 1 hour, not evenly divisible)', () => {
    expect(formatDuration(61)).toBe('61 min');
  });

  // --- Mixed non-hour-multiple durations above 60 -------------------------
  it('formats 90 as "90 min" (1.5 hours, not evenly divisible by 60)', () => {
    expect(formatDuration(90)).toBe('90 min');
  });

  it('formats 150 as "150 min" (2.5 hours, not evenly divisible by 60)', () => {
    expect(formatDuration(150)).toBe('150 min');
  });

  // --- NaN, undefined, null, string ----------------------------------------
  it('handles NaN without throwing', () => {
    const result = formatDuration(NaN);
    expect(typeof result).toBe('string');
    // NaN === 480 is false, NaN >= 60 is false → "NaN min"
    expect(result).toBe('NaN min');
  });

  it('handles undefined without throwing', () => {
    const result = formatDuration(undefined);
    expect(typeof result).toBe('string');
    // undefined === 480 is false, undefined >= 60 is false → "undefined min"
    expect(result).toBe('undefined min');
  });

  it('handles null without throwing', () => {
    const result = formatDuration(null);
    expect(typeof result).toBe('string');
    // null === 480 false, null >= 60 false → template literal "${null} min" → "null min"
    expect(result).toBe('null min');
  });

  it('handles a string number without throwing', () => {
    const result = formatDuration('60');
    expect(typeof result).toBe('string');
    // '60' === 480 is false, '60' >= 60 is true (string coercion), '60' % 60 === 0
    // hours = '60' / 60 = 1 → "1 hr"
    expect(result).toBe('1 hr');
  });

  // --- Idempotence: calling twice yields the same result -------------------
  it('is idempotent — same input always returns same output', () => {
    for (const d of DURATION_OPTIONS) {
      expect(formatDuration(d)).toBe(formatDuration(d));
    }
  });
});
