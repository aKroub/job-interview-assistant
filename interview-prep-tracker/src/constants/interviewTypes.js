/**
 * Closed set of interview types available when scheduling an interview.
 * Update this array to add or remove selectable interview types.
 */
export const INTERVIEW_TYPES = [
  'Phone Interview',
  'Video Interview',
  'Office Interview',
];

/**
 * Available duration options (in minutes) for scheduling interviews.
 * Also accepted from backend API when auto-detected from Gmail/Calendar.
 */
export const DURATION_OPTIONS = [30, 45, 60, 90, 120];
