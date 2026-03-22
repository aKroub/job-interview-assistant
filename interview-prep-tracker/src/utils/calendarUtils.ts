import type { FlattenedInterview } from '../types';

/**
 * Pure utility functions for week-based calendar calculations.
 *
 * All functions are stateless and free of React or browser globals,
 * making them trivially unit-testable without any setup.
 *
 * Date parsing note: YYYY-MM-DD strings are split and constructed via
 * new Date(year, month - 1, day) to avoid UTC-midnight pitfalls that
 * can shift dates in negative-UTC timezones.
 */

/**
 * Returns the start of the week (Sunday 00:00:00 local time) for a given date.
 *
 * @param date
 * @returns Sunday at midnight for the week containing `date`
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/**
 * Returns an array of 7 Date objects (Sun–Sat) for the week containing `date`.
 *
 * @param date - any date within the target week
 * @returns seven dates from Sunday to Saturday
 */
export function getWeekDays(date: Date): Date[] {
  const start = getWeekStart(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/**
 * Groups a flat sorted interview array by date string (YYYY-MM-DD).
 *
 * @param interviews - output of flattenAndSortInterviews
 * @returns keyed by date string, values are interview arrays
 */
export function groupInterviewsByDate(interviews: FlattenedInterview[]): Map<string, FlattenedInterview[]> {
  const map = new Map<string, FlattenedInterview[]>();
  for (const interview of interviews) {
    const key = interview.date;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(interview);
  }
  return map;
}

/**
 * Shifts a date forward or backward by the specified number of weeks.
 *
 * @param date
 * @param weeks - positive = forward, negative = backward
 * @returns new date shifted by `weeks` weeks
 */
export function shiftWeek(date: Date, weeks: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

/**
 * Returns true if two dates fall on the same calendar day (local time).
 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Formats a date as a short column header label (e.g. "Sun 19").
 */
export function formatDayHeader(date: Date): string {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${dayNames[date.getDay()]} ${date.getDate()}`;
}

/**
 * Formats a week range string for the calendar header.
 * Example: "Feb 17 – Feb 23, 2026"
 *
 * When the week spans two months: "Jan 29 – Feb 4, 2026"
 * When the week spans two years:  "Dec 29, 2025 – Jan 4, 2026"
 *
 * @param weekStart - the Sunday that begins the week
 */
export function formatWeekRange(weekStart: Date): string {
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const startMonth = monthNames[weekStart.getMonth()];
  const endMonth = monthNames[weekEnd.getMonth()];
  const startYear = weekStart.getFullYear();
  const endYear = weekEnd.getFullYear();

  if (startYear !== endYear) {
    return `${startMonth} ${weekStart.getDate()}, ${startYear} – ${endMonth} ${weekEnd.getDate()}, ${endYear}`;
  }

  return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${weekEnd.getDate()}, ${endYear}`;
}

/**
 * Formats a date as a full accessible label (e.g. "Wednesday, February 19, 2026").
 */
export function formatFullDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Returns true if the given date falls on a weekend day.
 *
 * Defaults to Friday (getDay()=5) and Saturday (getDay()=6) to match the
 * local work-week. Pass a different array for other locales — e.g.
 * `[0, 6]` for the common Saturday/Sunday weekend.
 *
 * @param date
 * @param weekendDays - day-of-week indices (0=Sun … 6=Sat)
 */
export function isWeekend(date: Date, weekendDays: number[] = [5, 6]): boolean {
  return weekendDays.includes(date.getDay());
}

/**
 * Converts a Date to a YYYY-MM-DD string in local time.
 * Used as a key for groupInterviewsByDate lookups.
 *
 * @param date
 * @returns e.g. "2026-02-19"
 */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
