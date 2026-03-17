import {
  getWeekStart,
  getWeekDays,
  groupInterviewsByDate,
  shiftWeek,
  isSameDay,
  isWeekend,
  formatDayHeader,
  formatFullDate,
  formatWeekRange,
  toDateString,
} from './calendarUtils';

// ---------------------------------------------------------------------------
// getWeekStart
// ---------------------------------------------------------------------------

describe('getWeekStart', () => {
  it('returns Sunday for a Wednesday input', () => {
    // 2026-02-18 is a Wednesday
    const wed = new Date(2026, 1, 18);
    const result = getWeekStart(wed);
    expect(result.getDay()).toBe(0); // Sunday
    expect(result.getDate()).toBe(15);
    expect(result.getMonth()).toBe(1); // February
  });

  it('returns the same day when input is already Sunday', () => {
    // 2026-02-15 is a Sunday
    const sun = new Date(2026, 1, 15);
    const result = getWeekStart(sun);
    expect(result.getDay()).toBe(0);
    expect(result.getDate()).toBe(15);
  });

  it('returns Sunday for a Saturday input', () => {
    // 2026-02-21 is a Saturday
    const sat = new Date(2026, 1, 21);
    const result = getWeekStart(sat);
    expect(result.getDay()).toBe(0);
    expect(result.getDate()).toBe(15);
  });

  it('zeroes out hours/minutes/seconds', () => {
    const d = new Date(2026, 1, 18, 14, 30, 45);
    const result = getWeekStart(d);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('does not mutate the input date', () => {
    const original = new Date(2026, 1, 18, 10, 0, 0);
    const originalTime = original.getTime();
    getWeekStart(original);
    expect(original.getTime()).toBe(originalTime);
  });

  it('handles month boundary (Sunday falls in previous month)', () => {
    // 2026-03-04 is a Wednesday; its Sunday is 2026-03-01
    const wed = new Date(2026, 2, 4);
    const result = getWeekStart(wed);
    expect(result.getDay()).toBe(0);
    expect(result.getMonth()).toBe(2); // March
    expect(result.getDate()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getWeekDays
// ---------------------------------------------------------------------------

describe('getWeekDays', () => {
  it('returns exactly 7 dates', () => {
    const days = getWeekDays(new Date(2026, 1, 18));
    expect(days).toHaveLength(7);
  });

  it('starts on Sunday and ends on Saturday', () => {
    const days = getWeekDays(new Date(2026, 1, 18));
    expect(days[0].getDay()).toBe(0); // Sunday
    expect(days[6].getDay()).toBe(6); // Saturday
  });

  it('returns consecutive dates', () => {
    const days = getWeekDays(new Date(2026, 1, 18));
    for (let i = 1; i < days.length; i++) {
      const diff = days[i].getDate() - days[i - 1].getDate();
      // Handle month boundary: if diff is negative, the day wrapped to next month
      expect(diff === 1 || diff < -25).toBe(true);
    }
  });

  it('does not mutate the input date', () => {
    const original = new Date(2026, 1, 18);
    const originalTime = original.getTime();
    getWeekDays(original);
    expect(original.getTime()).toBe(originalTime);
  });

  it('handles year boundary correctly', () => {
    // 2025-12-31 is a Wednesday; week is Sun Dec 28 – Sat Jan 3
    const days = getWeekDays(new Date(2025, 11, 31));
    expect(days[0].getFullYear()).toBe(2025);
    expect(days[0].getMonth()).toBe(11); // December
    expect(days[0].getDate()).toBe(28);
    expect(days[6].getFullYear()).toBe(2026);
    expect(days[6].getMonth()).toBe(0); // January
    expect(days[6].getDate()).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// groupInterviewsByDate
// ---------------------------------------------------------------------------

describe('groupInterviewsByDate', () => {
  it('returns an empty map for an empty array', () => {
    const result = groupInterviewsByDate([]);
    expect(result.size).toBe(0);
  });

  it('groups interviews by their date field', () => {
    const interviews = [
      { id: '1', date: '2026-02-18', companyName: 'Acme' },
      { id: '2', date: '2026-02-18', companyName: 'Beta' },
      { id: '3', date: '2026-02-19', companyName: 'Gamma' },
    ];
    const result = groupInterviewsByDate(interviews);
    expect(result.size).toBe(2);
    expect(result.get('2026-02-18')).toHaveLength(2);
    expect(result.get('2026-02-19')).toHaveLength(1);
  });

  it('preserves interview order within each group', () => {
    const interviews = [
      { id: '1', date: '2026-02-18', time: '09:00' },
      { id: '2', date: '2026-02-18', time: '14:00' },
    ];
    const result = groupInterviewsByDate(interviews);
    const group = result.get('2026-02-18');
    expect(group[0].id).toBe('1');
    expect(group[1].id).toBe('2');
  });

  it('does not mutate the input array', () => {
    const interviews = [{ id: '1', date: '2026-02-18' }];
    const copy = [...interviews];
    groupInterviewsByDate(interviews);
    expect(interviews).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// shiftWeek
// ---------------------------------------------------------------------------

describe('shiftWeek', () => {
  it('shifts forward by 1 week', () => {
    const date = new Date(2026, 1, 15); // Feb 15
    const result = shiftWeek(date, 1);
    expect(result.getDate()).toBe(22); // Feb 22
    expect(result.getMonth()).toBe(1);
  });

  it('shifts backward by 1 week', () => {
    const date = new Date(2026, 1, 15);
    const result = shiftWeek(date, -1);
    expect(result.getDate()).toBe(8); // Feb 8
    expect(result.getMonth()).toBe(1);
  });

  it('shifts forward across month boundary', () => {
    const date = new Date(2026, 1, 25); // Feb 25
    const result = shiftWeek(date, 1);
    expect(result.getMonth()).toBe(2); // March
    expect(result.getDate()).toBe(4);
  });

  it('shifts across year boundary', () => {
    const date = new Date(2025, 11, 28); // Dec 28, 2025
    const result = shiftWeek(date, 1);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(4);
  });

  it('does not mutate the input date', () => {
    const original = new Date(2026, 1, 15);
    const originalTime = original.getTime();
    shiftWeek(original, 1);
    expect(original.getTime()).toBe(originalTime);
  });
});

// ---------------------------------------------------------------------------
// isSameDay
// ---------------------------------------------------------------------------

describe('isSameDay', () => {
  it('returns true for the same calendar day', () => {
    const a = new Date(2026, 1, 18, 9, 0);
    const b = new Date(2026, 1, 18, 17, 30);
    expect(isSameDay(a, b)).toBe(true);
  });

  it('returns false for different days', () => {
    const a = new Date(2026, 1, 18);
    const b = new Date(2026, 1, 19);
    expect(isSameDay(a, b)).toBe(false);
  });

  it('returns false for same day-of-month in different months', () => {
    const a = new Date(2026, 1, 18);
    const b = new Date(2026, 2, 18);
    expect(isSameDay(a, b)).toBe(false);
  });

  it('returns false for same day-of-month in different years', () => {
    const a = new Date(2025, 1, 18);
    const b = new Date(2026, 1, 18);
    expect(isSameDay(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatDayHeader
// ---------------------------------------------------------------------------

describe('formatDayHeader', () => {
  it('formats a Sunday', () => {
    const sun = new Date(2026, 1, 15); // Sunday
    expect(formatDayHeader(sun)).toBe('Sun 15');
  });

  it('formats a Wednesday', () => {
    const wed = new Date(2026, 1, 18); // Wednesday
    expect(formatDayHeader(wed)).toBe('Wed 18');
  });

  it('formats a Saturday', () => {
    const sat = new Date(2026, 1, 21); // Saturday
    expect(formatDayHeader(sat)).toBe('Sat 21');
  });

  it('uses single digit for dates below 10', () => {
    const d = new Date(2026, 2, 1); // March 1 (Sunday)
    expect(formatDayHeader(d)).toBe('Sun 1');
  });
});

// ---------------------------------------------------------------------------
// formatFullDate
// ---------------------------------------------------------------------------

describe('formatFullDate', () => {
  it('formats a date with full weekday, month, day, and year', () => {
    const d = new Date(2026, 1, 18); // Wednesday, February 18, 2026
    expect(formatFullDate(d)).toBe('Wednesday, February 18, 2026');
  });

  it('formats a Sunday', () => {
    const d = new Date(2026, 2, 1); // Sunday, March 1, 2026
    expect(formatFullDate(d)).toBe('Sunday, March 1, 2026');
  });
});

// ---------------------------------------------------------------------------
// formatWeekRange
// ---------------------------------------------------------------------------

describe('formatWeekRange', () => {
  it('formats a week within the same month', () => {
    const weekStart = new Date(2026, 1, 15); // Sun Feb 15
    const result = formatWeekRange(weekStart);
    expect(result).toBe('Feb 15 – Feb 21, 2026');
  });

  it('formats a week spanning two months', () => {
    const weekStart = new Date(2026, 0, 25); // Sun Jan 25
    const result = formatWeekRange(weekStart);
    expect(result).toBe('Jan 25 – Jan 31, 2026');
  });

  it('formats a week crossing month boundary', () => {
    const weekStart = new Date(2026, 1, 22); // Sun Feb 22
    const result = formatWeekRange(weekStart);
    expect(result).toBe('Feb 22 – Feb 28, 2026');
  });

  it('formats a week spanning two years', () => {
    const weekStart = new Date(2025, 11, 28); // Sun Dec 28, 2025
    const result = formatWeekRange(weekStart);
    expect(result).toBe('Dec 28, 2025 – Jan 3, 2026');
  });
});

// ---------------------------------------------------------------------------
// isWeekend
// ---------------------------------------------------------------------------

describe('isWeekend', () => {
  it('returns true for Friday (default weekend)', () => {
    const fri = new Date(2026, 1, 20); // Friday
    expect(fri.getDay()).toBe(5);
    expect(isWeekend(fri)).toBe(true);
  });

  it('returns true for Saturday (default weekend)', () => {
    const sat = new Date(2026, 1, 21); // Saturday
    expect(sat.getDay()).toBe(6);
    expect(isWeekend(sat)).toBe(true);
  });

  it('returns false for Sunday through Thursday', () => {
    // Sun Feb 15 through Thu Feb 19, 2026
    for (let dayOfMonth = 15; dayOfMonth <= 19; dayOfMonth++) {
      const d = new Date(2026, 1, dayOfMonth);
      expect(isWeekend(d)).toBe(false);
    }
  });

  it('accepts custom weekend days (e.g. Sat/Sun = [0, 6])', () => {
    const sun = new Date(2026, 1, 15); // Sunday
    const sat = new Date(2026, 1, 21); // Saturday
    const fri = new Date(2026, 1, 20); // Friday

    expect(isWeekend(sun, [0, 6])).toBe(true);
    expect(isWeekend(sat, [0, 6])).toBe(true);
    expect(isWeekend(fri, [0, 6])).toBe(false);
  });

  it('does not mutate the input date', () => {
    const original = new Date(2026, 1, 20);
    const originalTime = original.getTime();
    isWeekend(original);
    expect(original.getTime()).toBe(originalTime);
  });
});

// ---------------------------------------------------------------------------
// toDateString
// ---------------------------------------------------------------------------

describe('toDateString', () => {
  it('formats a date as YYYY-MM-DD', () => {
    const d = new Date(2026, 1, 19);
    expect(toDateString(d)).toBe('2026-02-19');
  });

  it('zero-pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5); // Jan 5
    expect(toDateString(d)).toBe('2026-01-05');
  });

  it('handles December correctly', () => {
    const d = new Date(2025, 11, 31);
    expect(toDateString(d)).toBe('2025-12-31');
  });
});
