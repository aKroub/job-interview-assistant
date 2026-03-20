import { describe, it, expect } from '@jest/globals';
import {
  isTypicalInterviewDuration,
  scoreCalendarEvent,
} from '../src/utils/matchingUtils.js';

// ---------------------------------------------------------------------------
// Hypothesis 2: Backend matching utils with edge-case durations near the
// new 480-minute ceiling
//
// Now that MAX_INTERVIEW_DURATION_MINS is 480, we need to verify:
//   - Boundary at exactly 480 minutes (should be accepted)
//   - 481 minutes (should be rejected)
//   - 479 minutes (should be accepted)
//   - Very long events (24 hours) are still rejected
//   - Zero-length events (start === end)
//   - Negative durations (end before start)
//   - Fractional-minute durations at the boundaries
//   - scoreCalendarEvent correctly awards/withholds the "typical-duration" bonus
// ---------------------------------------------------------------------------

/**
 * Creates ISO datetime strings with a given duration in minutes.
 * @param {number} durationMins - duration in minutes
 * @returns {{ start: string, end: string }}
 */
function makeEventTimes(durationMins) {
  const start = new Date('2025-06-15T09:00:00Z');
  const end = new Date(start.getTime() + durationMins * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

describe('isTypicalInterviewDuration — stress tests around 480-min ceiling', () => {
  // --- Exact boundaries ---------------------------------------------------
  it('accepts exactly 480 minutes (full-day)', () => {
    const { start, end } = makeEventTimes(480);
    expect(isTypicalInterviewDuration(start, end)).toBe(true);
  });

  it('rejects 481 minutes (just over the ceiling)', () => {
    const { start, end } = makeEventTimes(481);
    expect(isTypicalInterviewDuration(start, end)).toBe(false);
  });

  it('accepts 479 minutes (just under the ceiling)', () => {
    const { start, end } = makeEventTimes(479);
    expect(isTypicalInterviewDuration(start, end)).toBe(true);
  });

  it('accepts exactly 15 minutes (the floor)', () => {
    const { start, end } = makeEventTimes(15);
    expect(isTypicalInterviewDuration(start, end)).toBe(true);
  });

  it('rejects 14 minutes (just under the floor)', () => {
    const { start, end } = makeEventTimes(14);
    expect(isTypicalInterviewDuration(start, end)).toBe(false);
  });

  // --- Far outside the range ----------------------------------------------
  it('rejects a 24-hour event (1440 min)', () => {
    const { start, end } = makeEventTimes(1440);
    expect(isTypicalInterviewDuration(start, end)).toBe(false);
  });

  it('rejects a 0-minute event (start === end)', () => {
    const { start, end } = makeEventTimes(0);
    expect(isTypicalInterviewDuration(start, end)).toBe(false);
  });

  it('rejects a negative-duration event (end before start)', () => {
    const { start, end } = makeEventTimes(-60);
    expect(isTypicalInterviewDuration(start, end)).toBe(false);
  });

  // --- Fractional minutes at boundaries -----------------------------------
  it('accepts 15.5 minutes (just over the floor)', () => {
    const { start, end } = makeEventTimes(15.5);
    expect(isTypicalInterviewDuration(start, end)).toBe(true);
  });

  it('accepts 479.9 minutes (just under the ceiling)', () => {
    const { start, end } = makeEventTimes(479.9);
    expect(isTypicalInterviewDuration(start, end)).toBe(true);
  });

  it('rejects 480.1 minutes (just over the ceiling)', () => {
    const { start, end } = makeEventTimes(480.1);
    expect(isTypicalInterviewDuration(start, end)).toBe(false);
  });

  // --- Various mid-range values that should now be accepted ----------------
  it.each([180, 240, 300, 360, 420, 480])(
    'accepts %i minutes (previously some of these were over old 180-min cap)',
    (mins) => {
      const { start, end } = makeEventTimes(mins);
      expect(isTypicalInterviewDuration(start, end)).toBe(true);
    }
  );
});

describe('scoreCalendarEvent — typical-duration bonus with 480-min ceiling', () => {
  /**
   * Creates a minimal calendar event object for scoring.
   */
  function makeEvent(overrides = {}) {
    return {
      summary: 'Technical Interview',
      description: '',
      organizer: { email: 'recruiter@company.com' },
      start: { dateTime: '2025-06-15T09:00:00Z' },
      end: { dateTime: '2025-06-15T17:00:00Z' }, // 480 min
      ...overrides,
    };
  }

  it('awards typical-duration reason for a 480-min interview event', () => {
    const event = makeEvent(); // 480 min
    const result = scoreCalendarEvent(event, 'me@gmail.com');
    expect(result.reasons).toContain('typical-duration');
  });

  it('does NOT award typical-duration for a 481-min event', () => {
    const event = makeEvent({
      start: { dateTime: '2025-06-15T09:00:00Z' },
      end: { dateTime: '2025-06-15T17:01:00Z' }, // 481 min
    });
    const result = scoreCalendarEvent(event, 'me@gmail.com');
    expect(result.reasons).not.toContain('typical-duration');
  });

  it('awards typical-duration for a 4-hour (240 min) event', () => {
    const event = makeEvent({
      end: { dateTime: '2025-06-15T13:00:00Z' }, // 240 min
    });
    const result = scoreCalendarEvent(event, 'me@gmail.com');
    expect(result.reasons).toContain('typical-duration');
  });

  it('does NOT award typical-duration for a 10-min event', () => {
    const event = makeEvent({
      end: { dateTime: '2025-06-15T09:10:00Z' }, // 10 min
    });
    const result = scoreCalendarEvent(event, 'me@gmail.com');
    expect(result.reasons).not.toContain('typical-duration');
  });

  it('score is higher for a 480-min event than a 600-min event (all else equal)', () => {
    const event480 = makeEvent(); // 480 min — typical
    const event600 = makeEvent({
      end: { dateTime: '2025-06-15T19:00:00Z' }, // 600 min — atypical
    });
    const score480 = scoreCalendarEvent(event480, 'me@gmail.com').score;
    const score600 = scoreCalendarEvent(event600, 'me@gmail.com').score;
    expect(score480).toBeGreaterThan(score600);
  });
});
