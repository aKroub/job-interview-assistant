import { describe, it, expect } from '@jest/globals';
import {
  extractDomain,
  extractCompanyFromDomain,
  scoreEmailForInterview,
  extractDateTimeFromText,
  parseGmailMessage,
  extractEmailFromHeader,
  extractCompanyNameFromText,
  normalizeCompanyName,
  extractPlainTextBody,
  extractCalendarData,
  detectEmailIntent,
  extractVideoCallUrl,
  SCHEDULING_PLATFORM_DOMAINS,
} from '../src/utils/emailParser.js';

describe('extractDomain', () => {
  it('extracts domain from a standard email', () => {
    expect(extractDomain('recruiter@google.com')).toBe('google.com');
  });

  it('lowercases the domain', () => {
    expect(extractDomain('HR@APPLE.COM')).toBe('apple.com');
  });

  it('handles subdomains', () => {
    expect(extractDomain('noreply@mail.greenhouse.io')).toBe('mail.greenhouse.io');
  });

  it('returns empty string for null', () => {
    expect(extractDomain(null)).toBe('');
  });

  it('returns empty string for invalid email', () => {
    expect(extractDomain('not-an-email')).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(extractDomain('')).toBe('');
  });
});

describe('extractCompanyFromDomain', () => {
  it('extracts company name from a simple domain', () => {
    expect(extractCompanyFromDomain('google.com')).toBe('google');
  });

  it('strips mail subdomain', () => {
    expect(extractCompanyFromDomain('mail.google.com')).toBe('google');
  });

  it('handles .io TLD', () => {
    expect(extractCompanyFromDomain('greenhouse.io')).toBe('greenhouse');
  });

  it('handles .co TLD', () => {
    expect(extractCompanyFromDomain('lever.co')).toBe('lever');
  });

  it('returns empty string for null', () => {
    expect(extractCompanyFromDomain(null)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(extractCompanyFromDomain('')).toBe('');
  });
});

describe('scoreEmailForInterview', () => {
  it('returns high score for subject with strong interview keyword', () => {
    const { score } = scoreEmailForInterview(
      'Interview Invitation - Software Engineer',
      'We are pleased to invite you...',
      'recruiter@google.com'
    );
    expect(score).toBeGreaterThanOrEqual(0.3);
  });

  it('returns low score for noise domain (linkedin)', () => {
    const { score } = scoreEmailForInterview(
      'Interview tips for your job search',
      'Here are some interview tips...',
      'noreply@linkedin.com'
    );
    expect(score).toBeLessThanOrEqual(0.15);
  });

  it('returns higher score when recruiting platform is sender', () => {
    const fromRecruiting = scoreEmailForInterview(
      'Interview scheduled',
      'Your interview is confirmed',
      'no-reply@greenhouse.io'
    );
    const fromGeneric = scoreEmailForInterview(
      'Interview scheduled',
      'Your interview is confirmed',
      'hr@randomcompany.com'
    );
    expect(fromRecruiting.score).toBeGreaterThan(fromGeneric.score);
  });

  it('gives bonus for video link mention', () => {
    const withZoom = scoreEmailForInterview(
      'Interview scheduled',
      'Join via Zoom at...',
      'hr@company.com'
    );
    const withoutZoom = scoreEmailForInterview(
      'Interview scheduled',
      'Please arrive at the office.',
      'hr@company.com'
    );
    expect(withZoom.score).toBeGreaterThan(withoutZoom.score);
  });

  it('gives bonus for date/time mention', () => {
    const withDate = scoreEmailForInterview(
      'Interview scheduled',
      'Your interview is on 01/15/2025 at 2:30 PM',
      'hr@company.com'
    );
    const withoutDate = scoreEmailForInterview(
      'Interview scheduled',
      'We will follow up with details.',
      'hr@company.com'
    );
    expect(withDate.score).toBeGreaterThan(withoutDate.score);
  });

  it('caps score at 1.0', () => {
    const { score } = scoreEmailForInterview(
      'Interview Invitation - Technical Interview - Phone Screen scheduled',
      'Your technical assessment and coding challenge with the hiring manager is confirmed. Join via Zoom on 01/15/2025 at 2:30 PM.',
      'noreply@greenhouse.io'
    );
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('returns matchedKeywords array', () => {
    const { matchedKeywords } = scoreEmailForInterview(
      'Technical Interview Invitation',
      'Please join the coding challenge',
      'hr@company.com'
    );
    expect(Array.isArray(matchedKeywords)).toBe(true);
    expect(matchedKeywords.length).toBeGreaterThan(0);
  });

  it('handles null/empty inputs gracefully', () => {
    const { score, matchedKeywords } = scoreEmailForInterview(null, null, null);
    expect(score).toBe(0);
    expect(matchedKeywords).toEqual([]);
  });

  it('does not penalize emails from comeet-notifications.com as noise', () => {
    const { score } = scoreEmailForInterview(
      'Interview Scheduled',
      'Your interview has been confirmed',
      'noreply@comeet-notifications.com'
    );
    // Should NOT be penalized to 0.1 like noise domains
    expect(score).toBeGreaterThan(0.1);
  });

  it('gives recruiting platform bonus to comeet-notifications.com sender', () => {
    const { matchedKeywords } = scoreEmailForInterview(
      'Interview Scheduled',
      'Your interview has been confirmed',
      'noreply@comeet-notifications.com'
    );
    const hasPlatformBonus = matchedKeywords.some(
      (kw) => kw.startsWith('recruiting-platform:')
    );
    expect(hasPlatformBonus).toBe(true);
  });

  it('scores "phone interview" as a strong keyword', () => {
    const { score, matchedKeywords } = scoreEmailForInterview(
      'Your phone interview with Acme',
      'Hi, we are pleased to confirm your phone interview.',
      'recruiter@acme.com'
    );
    expect(score).toBeGreaterThanOrEqual(0.25);
    expect(matchedKeywords).toContain('phone interview');
  });

  it('gives recruiting platform bonus to sparkhire.com sender', () => {
    const fromSparkHire = scoreEmailForInterview(
      'Your phone interview with Kela',
      'Hi Ayal, your interview has been scheduled.',
      'noreply@sparkhire.com'
    );
    const fromGeneric = scoreEmailForInterview(
      'Your phone interview with Kela',
      'Hi Ayal, your interview has been scheduled.',
      'hr@kela.com'
    );
    expect(fromSparkHire.score).toBeGreaterThan(fromGeneric.score);
    expect(fromSparkHire.matchedKeywords).toContainEqual(
      expect.stringContaining('recruiting-platform:')
    );
  });
});

describe('extractDateTimeFromText', () => {
  it('extracts date from "January 15, 2025" format', () => {
    const { date } = extractDateTimeFromText('Your interview is on January 15, 2025');
    expect(date).toBe('2025-01-15');
  });

  it('extracts date from "Jan 15 2025" format', () => {
    const { date } = extractDateTimeFromText('Meeting on Jan 15 2025');
    expect(date).toBe('2025-01-15');
  });

  it('extracts date from ISO format "2025-01-15"', () => {
    const { date } = extractDateTimeFromText('Scheduled for 2025-01-15');
    expect(date).toBe('2025-01-15');
  });

  it('extracts date from slash format "01/15/2025"', () => {
    const { date } = extractDateTimeFromText('Date: 01/15/2025');
    expect(date).toBe('2025-01-15');
  });

  it('extracts date from day-month-year "2 Mar 2026" format', () => {
    const { date } = extractDateTimeFromText(
      'Cancelled event: Interview with Torq @ Mon 2 Mar 2026 15:15 - 16:45'
    );
    expect(date).toBe('2026-03-02');
  });

  it('extracts date from day-month-year "9 March 2026" format', () => {
    const { date } = extractDateTimeFromText(
      'When: Monday 9 March 2026 · 09:30 – 11:00 (Israel Time)'
    );
    expect(date).toBe('2026-03-09');
  });

  it('uses last date when mixing month-day-year and day-month-year formats', () => {
    const { date } = extractDateTimeFromText(
      'Changed: Time. Was March 4, 2026 now 9 Mar 2026'
    );
    expect(date).toBe('2026-03-09');
  });

  it('extracts date and time from Google Calendar cancel notification', () => {
    const result = extractDateTimeFromText(
      'Cancelled event: Interview with Torq @ Mon 2 Mar 2026 15:15 - 16:45 (GMT+2) ' +
      'This event has been cancelled and removed from your calendar. ' +
      'When: Monday 2 Mar 2026 · 15:15 – 16:45 (Israel Time)'
    );
    expect(result.date).toBe('2026-03-02');
    expect(result.time).toBe('15:15');
    expect(result.duration).toBe(90);
  });

  it('extracts date from ordinal "January 15th, 2025" format', () => {
    const { date } = extractDateTimeFromText('Your interview is on January 15th, 2025');
    expect(date).toBe('2025-01-15');
  });

  it('extracts date from ordinal "2nd March 2026" (day-month-year) format', () => {
    const { date } = extractDateTimeFromText('Scheduled for 2nd March 2026');
    expect(date).toBe('2026-03-02');
  });

  it('extracts date from ordinal "March 1st 2026" (month-day-year) format', () => {
    const { date } = extractDateTimeFromText('Interview on March 1st 2026 at the office');
    expect(date).toBe('2026-03-01');
  });

  it('extracts date from "2025/01/15" (YYYY/MM/DD) format', () => {
    const { date } = extractDateTimeFromText('Date: 2025/01/15');
    expect(date).toBe('2025-01-15');
  });

  it('extracts date from "15.01.2025" (DD.MM.YYYY) format', () => {
    const { date } = extractDateTimeFromText('Termin: 15.01.2025');
    expect(date).toBe('2025-01-15');
  });

  it('prefers month-name format over numeric fallbacks', () => {
    const { date } = extractDateTimeFromText(
      'Originally 01/10/2025, rescheduled to January 18, 2025'
    );
    expect(date).toBe('2025-01-18');
  });

  it('extracts new date from Google Calendar update notification', () => {
    const result = extractDateTimeFromText(
      'Updated invitation: Interview with SentinelOne ' +
      'This event has been updated. Changed: Time ' +
      'Monday 9 Mar 2026 · 09:30 – 11:00 (Israel Time) ' +
      'Wednesday 4 Mar 2026 · 09:30 – 11:00 (Israel Time)'
    );
    // Last date in the text is the old date (4 Mar) — but the new date (9 Mar)
    // appears first. Both are extracted; last-match policy returns 4 Mar.
    // This is acceptable because the update flow uses previousDate extraction
    // (a separate concern) for matching, and the suggestion date is overridden
    // by the calendar event date when cross-referenced.
    expect(result.date).toBe('2026-03-04');
    expect(result.time).toBe('09:30');
    expect(result.duration).toBe(90);
    expect(result.allDates).toEqual(['2026-03-09', '2026-03-04']);
  });

  it('returns allDates with all dates found in text order', () => {
    const result = extractDateTimeFromText(
      'Originally scheduled for January 15, 2025, but rescheduled to January 22, 2025'
    );
    expect(result.date).toBe('2025-01-22');
    expect(result.allDates).toEqual(['2025-01-15', '2025-01-22']);
  });

  it('returns allDates with single date when only one found', () => {
    const result = extractDateTimeFromText('Interview on 2 Mar 2026');
    expect(result.allDates).toEqual(['2026-03-02']);
  });

  it('extracts time from "2:30 PM" format', () => {
    const { time } = extractDateTimeFromText('Interview at 2:30 PM');
    expect(time).toBe('14:30');
  });

  it('extracts time from "14:30" (24h) format', () => {
    const { time } = extractDateTimeFromText('Starts at 14:30');
    expect(time).toBe('14:30');
  });

  it('extracts time from "9:00 am" format', () => {
    const { time } = extractDateTimeFromText('Call at 9:00 am');
    expect(time).toBe('09:00');
  });

  it('handles 12:00 PM correctly', () => {
    const { time } = extractDateTimeFromText('Lunch meeting at 12:00 PM');
    expect(time).toBe('12:00');
  });

  it('handles 12:00 AM correctly', () => {
    const { time } = extractDateTimeFromText('Event at 12:00 AM');
    expect(time).toBe('00:00');
  });

  it('returns nulls when no date or time found', () => {
    const result = extractDateTimeFromText('No specific details provided');
    expect(result).toEqual({ date: null, time: null, duration: null, allDates: [] });
  });

  it('returns nulls for null input', () => {
    expect(extractDateTimeFromText(null)).toEqual({ date: null, time: null, duration: null, allDates: [] });
  });

  it('extracts both date and time from combined text', () => {
    const result = extractDateTimeFromText(
      'Your interview is scheduled for January 20, 2025 at 3:00 PM.'
    );
    expect(result.date).toBe('2025-01-20');
    expect(result.time).toBe('15:00');
  });

  it('uses the last date when multiple dates appear in text', () => {
    const result = extractDateTimeFromText(
      'Originally scheduled for January 15, 2025, but rescheduled to January 22, 2025'
    );
    expect(result.date).toBe('2025-01-22');
  });

  it('uses the last date with ISO format when multiple dates appear', () => {
    const result = extractDateTimeFromText(
      'Previous date was 2025-01-10, new date is 2025-01-18'
    );
    expect(result.date).toBe('2025-01-18');
  });

  it('uses the last date with slash format when multiple dates appear', () => {
    const result = extractDateTimeFromText(
      'Was 01/10/2025, now 01/18/2025'
    );
    expect(result.date).toBe('2025-01-18');
  });

  it('uses the last time when multiple times appear in rescheduling context', () => {
    const result = extractDateTimeFromText(
      'Originally 2:00 PM, changed to 3:30 PM'
    );
    expect(result.time).toBe('15:30');
    expect(result.duration).toBeNull();
  });

  // --- Time range detection ---

  it('extracts start time and duration from "11:30 until 11:45"', () => {
    const result = extractDateTimeFromText('Interview from 11:30 until 11:45');
    expect(result.time).toBe('11:30');
    expect(result.duration).toBe(15);
  });

  it('extracts start time and duration from "2:00 PM to 2:45 PM"', () => {
    const result = extractDateTimeFromText('Meeting 2:00 PM to 2:45 PM');
    expect(result.time).toBe('14:00');
    expect(result.duration).toBe(45);
  });

  it('extracts start time and duration from hyphen range "10:00-10:30"', () => {
    const result = extractDateTimeFromText('Call scheduled 10:00-10:30');
    expect(result.time).toBe('10:00');
    expect(result.duration).toBe(30);
  });

  it('extracts start time and duration from en-dash range "14:00\u201314:45"', () => {
    const result = extractDateTimeFromText('Interview 14:00\u201314:45');
    expect(result.time).toBe('14:00');
    expect(result.duration).toBe(45);
  });

  it('extracts start time and duration from "9:00 AM till 9:30 AM"', () => {
    const result = extractDateTimeFromText('Screen from 9:00 AM till 9:30 AM');
    expect(result.time).toBe('09:00');
    expect(result.duration).toBe(30);
  });

  // --- Rescheduling still uses last time ---

  it('uses last time for rescheduling with "rescheduled to"', () => {
    const result = extractDateTimeFromText('Was 10:00 AM, rescheduled to 11:00 AM');
    expect(result.time).toBe('11:00');
    expect(result.duration).toBeNull();
  });

  it('uses last time for rescheduling with "moved to"', () => {
    const result = extractDateTimeFromText('Meeting moved from 2:00 PM to 4:00 PM');
    expect(result.time).toBe('16:00');
    expect(result.duration).toBeNull();
  });

  // --- Edge cases ---

  it('returns null duration when only one time is present', () => {
    const result = extractDateTimeFromText('Interview at 3:00 PM');
    expect(result.time).toBe('15:00');
    expect(result.duration).toBeNull();
  });

  it('returns null duration when end time is before start time', () => {
    const result = extractDateTimeFromText('Call 14:00 to 09:00');
    expect(result.time).toBe('09:00');
    expect(result.duration).toBeNull();
  });

  it('returns null duration when times are separated by non-range text', () => {
    const result = extractDateTimeFromText('Interview at 2:00 PM. Please confirm by 3:00 PM');
    expect(result.time).toBe('15:00');
    expect(result.duration).toBeNull();
  });

  // --- Multi-time range detection (third time after range) ---

  it('extracts range when a third time follows the range', () => {
    const result = extractDateTimeFromText(
      'Interview 3:15 PM - 4:45 PM. Please arrive by 3:00 PM.'
    );
    expect(result.time).toBe('15:15');
    expect(result.duration).toBe(90);
  });

  it('extracts range when extra time precedes the range', () => {
    const result = extractDateTimeFromText(
      'Confirmation at 9:00 AM. Interview 10:00 - 11:30'
    );
    expect(result.time).toBe('10:00');
    expect(result.duration).toBe(90);
  });

  it('extracts range from 24h format with extra trailing time', () => {
    const result = extractDateTimeFromText(
      'Interview 15:15 - 16:45. Please confirm by 12:00'
    );
    expect(result.time).toBe('15:15');
    expect(result.duration).toBe(90);
  });
});

describe('parseGmailMessage', () => {
  it('extracts subject, snippet, from, and messageId', () => {
    const message = {
      id: 'msg123',
      snippet: 'We would like to invite you...',
      payload: {
        headers: [
          { name: 'Subject', value: 'Interview Invitation' },
          { name: 'From', value: 'HR <hr@google.com>' },
        ],
      },
    };
    const result = parseGmailMessage(message);
    expect(result).toEqual({
      subject: 'Interview Invitation',
      snippet: 'We would like to invite you...',
      from: 'HR <hr@google.com>',
      messageId: 'msg123',
    });
  });

  it('returns empty strings for missing fields', () => {
    const result = parseGmailMessage({ payload: {} });
    expect(result.subject).toBe('');
    expect(result.snippet).toBe('');
    expect(result.from).toBe('');
    expect(result.messageId).toBe('');
  });

  it('handles missing payload gracefully', () => {
    const result = parseGmailMessage({});
    expect(result.subject).toBe('');
    expect(result.from).toBe('');
  });
});

describe('extractEmailFromHeader', () => {
  it('extracts email from "Name <email>" format', () => {
    expect(extractEmailFromHeader('John Doe <john@example.com>')).toBe('john@example.com');
  });

  it('returns plain email as-is', () => {
    expect(extractEmailFromHeader('john@example.com')).toBe('john@example.com');
  });

  it('handles quoted names', () => {
    expect(extractEmailFromHeader('"Doe, John" <john@example.com>')).toBe('john@example.com');
  });

  it('returns empty string for null', () => {
    expect(extractEmailFromHeader(null)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(extractEmailFromHeader('')).toBe('');
  });
});

describe('extractCompanyNameFromText', () => {
  it('extracts "torq" from "Interview with Torq"', () => {
    expect(extractCompanyNameFromText('Interview with Torq')).toBe('torq');
  });

  it('extracts "pango" from "Your in-person interview with Pango"', () => {
    expect(extractCompanyNameFromText('Your in-person interview with Pango')).toBe('pango');
  });

  it('extracts "sentinelone" from "SentinelOne Interview Confirmation for Ayal"', () => {
    expect(extractCompanyNameFromText('SentinelOne Interview Confirmation for Ayal')).toBe('sentinelone');
  });

  it('extracts company from "Interview at Google"', () => {
    expect(extractCompanyNameFromText('Interview at Google')).toBe('google');
  });

  it('extracts company from "Interview - Google"', () => {
    expect(extractCompanyNameFromText('Interview - Google')).toBe('google');
  });

  it('returns empty string for text with no company pattern', () => {
    expect(extractCompanyNameFromText('Shai <> Ayal')).toBe('');
  });

  it('returns empty string for null/undefined input', () => {
    expect(extractCompanyNameFromText(null)).toBe('');
    expect(extractCompanyNameFromText(undefined)).toBe('');
  });

  it('handles multi-word names', () => {
    expect(extractCompanyNameFromText('Red Hat Interview Confirmation')).toBe('red hat');
  });

  it('extracts "dream" from "your interview invitation at Dream"', () => {
    expect(extractCompanyNameFromText('your interview invitation at Dream')).toBe('dream');
  });

  it('extracts company when a word separates keyword and preposition', () => {
    expect(extractCompanyNameFromText('interview scheduled with Google')).toBe('google');
  });

  it('extracts company from long subject with role description before "at"', () => {
    expect(extractCompanyNameFromText(
      'Your Phone Interview for the Engineering Team Leader - AI Application Foundation role at Dream'
    )).toBe('dream');
  });

  it('extracts company when subject has pipe delimiter after name', () => {
    expect(extractCompanyNameFromText(
      'Your Phone Interview for the Engineering Team Leader role at Dream | Liron & Ayal'
    )).toBe('dream');
  });

  it('extracts company from "meeting with" pattern', () => {
    expect(extractCompanyNameFromText('meeting with Pango')).toBe('pango');
  });

  it('extracts company from "call with" pattern', () => {
    expect(extractCompanyNameFromText('call with Meta')).toBe('meta');
  });

  it('extracts company from "screen with" pattern', () => {
    expect(extractCompanyNameFromText('screen with Netflix')).toBe('netflix');
  });

  it('extracts company from "chat with" pattern', () => {
    expect(extractCompanyNameFromText('chat with Spotify')).toBe('spotify');
  });

  it('extracts company from "Interview Scheduled" suffix pattern', () => {
    expect(extractCompanyNameFromText('Google Interview Scheduled')).toBe('google');
  });

  it('extracts company from en-dash separator "Company – Interview"', () => {
    expect(extractCompanyNameFromText('Amazon \u2013 Interview')).toBe('amazon');
  });

  it('extracts company from "Technical Screen – Company"', () => {
    expect(extractCompanyNameFromText('Technical Screen \u2013 Amazon')).toBe('amazon');
  });

  it('stops at dot when extracting company name (dot is a delimiter)', () => {
    // Dots act as delimiters in tail patterns — "Check.Point" captures only "Check"
    expect(extractCompanyNameFromText('Interview with Check.Point')).toBe('check');
  });

  it('extracts company with hyphen in name', () => {
    expect(extractCompanyNameFromText('Interview with Coca-Cola')).toBe('coca-cola');
  });

  it('strips "Ltd" suffix from company name', () => {
    expect(extractCompanyNameFromText('Interview with Acme Ltd')).toBe('acme');
  });

  it('strips "Inc" suffix from company name', () => {
    expect(extractCompanyNameFromText('Interview with Acme Inc')).toBe('acme');
  });

  it('does not extract from unrelated text mentioning "at"', () => {
    expect(extractCompanyNameFromText('looking at the forecast for tomorrow')).toBe('');
  });

  it('does not extract from text with "with" in non-interview context', () => {
    expect(extractCompanyNameFromText('coffee with friends')).toBe('');
  });

  it('handles concatenated subject+snippet without leaking into snippet', () => {
    expect(extractCompanyNameFromText(
      'Interview with Torq We are pleased to invite you to the next round'
    )).toBe('torq');
  });

  it('returns empty string for empty string input', () => {
    expect(extractCompanyNameFromText('')).toBe('');
  });

  it('is case-insensitive for the keyword', () => {
    expect(extractCompanyNameFromText('INTERVIEW with Torq')).toBe('torq');
    expect(extractCompanyNameFromText('Interview WITH Torq')).toBe('torq');
  });

  it('extracts company when subject has comma after name', () => {
    expect(extractCompanyNameFromText('Interview with Google, please confirm')).toBe('google');
  });

  it('extracts company when subject has exclamation after name', () => {
    expect(extractCompanyNameFromText('Interview with Google!')).toBe('google');
  });
});

describe('normalizeCompanyName', () => {
  it('normalizes "Torq" to "torq"', () => {
    expect(normalizeCompanyName('Torq')).toBe('torq');
  });

  it('normalizes "SentinelOne" to "sentinelone"', () => {
    expect(normalizeCompanyName('SentinelOne')).toBe('sentinelone');
  });

  it('strips dots and hyphens', () => {
    expect(normalizeCompanyName('sentinel.one')).toBe('sentinelone');
  });

  it('strips common suffixes', () => {
    expect(normalizeCompanyName('torq inc')).toBe('torq');
  });

  it('returns empty string for null/empty', () => {
    expect(normalizeCompanyName(null)).toBe('');
    expect(normalizeCompanyName('')).toBe('');
  });
});

describe('SCHEDULING_PLATFORM_DOMAINS', () => {
  it('includes calendar.google.com', () => {
    expect(SCHEDULING_PLATFORM_DOMAINS).toContain('calendar.google.com');
  });

  it('includes comeet-notifications.com', () => {
    expect(SCHEDULING_PLATFORM_DOMAINS).toContain('comeet-notifications.com');
  });
});

describe('extractPlainTextBody', () => {
  /** Helper: base64url-encode a UTF-8 string. */
  function encode(text) {
    return Buffer.from(text, 'utf-8').toString('base64url');
  }

  it('extracts body from a simple text/plain message', () => {
    const message = {
      payload: {
        mimeType: 'text/plain',
        body: { data: encode('Hello, your interview is confirmed.') },
      },
    };
    expect(extractPlainTextBody(message)).toBe('Hello, your interview is confirmed.');
  });

  it('extracts text/plain from a multipart/alternative message', () => {
    const message = {
      payload: {
        mimeType: 'multipart/alternative',
        body: {},
        parts: [
          { mimeType: 'text/plain', body: { data: encode('Plain text body') } },
          { mimeType: 'text/html', body: { data: encode('<p>HTML body</p>') } },
        ],
      },
    };
    expect(extractPlainTextBody(message)).toBe('Plain text body');
  });

  it('extracts text/plain from nested multipart/mixed structure', () => {
    const message = {
      payload: {
        mimeType: 'multipart/mixed',
        body: {},
        parts: [
          {
            mimeType: 'multipart/alternative',
            body: {},
            parts: [
              { mimeType: 'text/plain', body: { data: encode('Nested plain text') } },
              { mimeType: 'text/html', body: { data: encode('<p>HTML</p>') } },
            ],
          },
          { mimeType: 'application/pdf', body: {} },
        ],
      },
    };
    expect(extractPlainTextBody(message)).toBe('Nested plain text');
  });

  it('returns empty string when no text/plain part exists', () => {
    const message = {
      payload: {
        mimeType: 'text/html',
        body: { data: encode('<p>Only HTML</p>') },
      },
    };
    expect(extractPlainTextBody(message)).toBe('');
  });

  it('returns empty string for missing payload', () => {
    expect(extractPlainTextBody({})).toBe('');
    expect(extractPlainTextBody(null)).toBe('');
  });

  it('handles UTF-8 content correctly', () => {
    const hebrew = 'שלום, הראיון שלך אושר';
    const message = {
      payload: {
        mimeType: 'text/plain',
        body: { data: encode(hebrew) },
      },
    };
    expect(extractPlainTextBody(message)).toBe(hebrew);
  });
});

describe('detectEmailIntent', () => {
  it('returns "cancel" for "interview has been cancelled"', () => {
    expect(detectEmailIntent('Interview update', 'Your interview has been cancelled.')).toBe('cancel');
  });

  it('returns "cancel" for "no longer moving forward"', () => {
    expect(detectEmailIntent('Application update', 'We are no longer moving forward with your application.')).toBe('cancel');
  });

  it('returns "cancel" for "position has been filled"', () => {
    expect(detectEmailIntent('Update', 'Unfortunately, the position has been filled.')).toBe('cancel');
  });

  it('returns "cancel" for "decided not to proceed"', () => {
    expect(detectEmailIntent('', 'After careful consideration, we have decided not to proceed.')).toBe('cancel');
  });

  it('returns "cancel" for "regret to inform"', () => {
    expect(detectEmailIntent('Interview status', 'We regret to inform you that we will not be continuing.')).toBe('cancel');
  });

  it('returns "cancel" for "we will not be moving forward"', () => {
    expect(detectEmailIntent('', 'Thank you for your time. We will not be moving forward.')).toBe('cancel');
  });

  it('returns "cancel" for US spelling "canceled"', () => {
    expect(detectEmailIntent('', 'Your interview has been canceled.')).toBe('cancel');
  });

  it('returns "cancel" for "withdrawn"', () => {
    expect(detectEmailIntent('Application withdrawn', 'Your application has been withdrawn.')).toBe('cancel');
  });

  it('returns "update" for "rescheduled"', () => {
    expect(detectEmailIntent('Interview rescheduled', 'Your interview has been rescheduled to January 25.')).toBe('update');
  });

  it('returns "update" for "new time"', () => {
    expect(detectEmailIntent('Interview update', 'There is a new time for your interview: 3:00 PM.')).toBe('update');
  });

  it('returns "update" for "moved to"', () => {
    expect(detectEmailIntent('', 'Your interview has been moved to Thursday at 2:00 PM.')).toBe('update');
  });

  it('returns "update" for "time has been changed"', () => {
    expect(detectEmailIntent('', 'The time has been changed for your upcoming interview.')).toBe('update');
  });

  it('returns "update" for "interview has been updated"', () => {
    expect(detectEmailIntent('', 'Your interview has been updated. Please check the new details.')).toBe('update');
  });

  it('returns "add" for a standard invitation', () => {
    expect(detectEmailIntent('Interview Invitation', 'Your interview is scheduled for next Monday.')).toBe('add');
  });

  it('returns "add" for empty/null input', () => {
    expect(detectEmailIntent(null, null)).toBe('add');
    expect(detectEmailIntent('', '')).toBe('add');
  });

  it('cancel takes priority over update when both keywords present', () => {
    expect(detectEmailIntent(
      'Interview cancelled',
      'Your interview has been cancelled. We will reschedule at a later date.',
    )).toBe('cancel');
  });

  it('detects cancel in subject only', () => {
    expect(detectEmailIntent('Interview has been cancelled', 'Please disregard the previous invite.')).toBe('cancel');
  });

  it('detects update in subject only', () => {
    expect(detectEmailIntent('Interview rescheduled to Friday', '')).toBe('update');
  });
});

/** Helper: base64url-encode a UTF-8 string. */
function encode(text) {
  return Buffer.from(text, 'utf-8').toString('base64url');
}

describe('extractCalendarData', () => {
  it('extracts date, start/end times, and duration from a standard ICS attachment', () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART:20260315T150000Z',
      'DTEND:20260315T160000Z',
      'SUMMARY:Interview with Dream',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const message = {
      payload: {
        mimeType: 'multipart/mixed',
        parts: [
          { mimeType: 'text/plain', body: { data: encode('Hello') } },
          { mimeType: 'text/calendar', body: { data: encode(icsContent) } },
        ],
      },
    };

    const result = extractCalendarData(message);
    expect(result).toEqual({
      date: '2026-03-15',
      startTime: '15:00',
      endTime: '16:00',
      duration: 60,
    });
  });

  it('handles DTSTART with TZID parameter', () => {
    const icsContent = [
      'BEGIN:VEVENT',
      'DTSTART;TZID=Asia/Jerusalem:20260315T150000',
      'DTEND;TZID=Asia/Jerusalem:20260315T152000',
      'END:VEVENT',
    ].join('\r\n');

    const message = {
      payload: {
        mimeType: 'text/calendar',
        body: { data: encode(icsContent) },
      },
    };

    const result = extractCalendarData(message);
    expect(result).toEqual({
      date: '2026-03-15',
      startTime: '15:00',
      endTime: '15:20',
      duration: 20,
    });
  });

  it('handles DTSTART with VALUE=DATE-TIME parameter', () => {
    const icsContent = [
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE-TIME:20260120T093000',
      'DTEND;VALUE=DATE-TIME:20260120T103000',
      'END:VEVENT',
    ].join('\r\n');

    const message = {
      payload: {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/html', body: { data: encode('<p>Hi</p>') } },
          { mimeType: 'text/calendar', body: { data: encode(icsContent) } },
        ],
      },
    };

    expect(extractCalendarData(message)).toEqual({
      date: '2026-01-20',
      startTime: '09:30',
      endTime: '10:30',
      duration: 60,
    });
  });

  it('returns partial result when DTEND is missing', () => {
    const icsContent = 'BEGIN:VEVENT\r\nDTSTART:20260315T140000Z\r\nEND:VEVENT';

    const message = {
      payload: { mimeType: 'text/calendar', body: { data: encode(icsContent) } },
    };

    expect(extractCalendarData(message)).toEqual({
      date: '2026-03-15',
      startTime: '14:00',
      endTime: null,
      duration: null,
    });
  });

  it('returns null when no text/calendar part exists', () => {
    const message = {
      payload: {
        mimeType: 'text/plain',
        body: { data: encode('Just a plain email') },
      },
    };

    expect(extractCalendarData(message)).toBeNull();
  });

  it('returns null for null/undefined message', () => {
    expect(extractCalendarData(null)).toBeNull();
    expect(extractCalendarData(undefined)).toBeNull();
    expect(extractCalendarData({})).toBeNull();
  });

  it('returns null when ICS content has no DTSTART', () => {
    const icsContent = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Meeting\r\nEND:VEVENT\r\nEND:VCALENDAR';

    const message = {
      payload: { mimeType: 'text/calendar', body: { data: encode(icsContent) } },
    };

    expect(extractCalendarData(message)).toBeNull();
  });

  it('finds text/calendar nested deep in multipart MIME tree', () => {
    const icsContent = 'BEGIN:VEVENT\r\nDTSTART:20260401T100000\r\nDTEND:20260401T110000\r\nEND:VEVENT';

    const message = {
      payload: {
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              { mimeType: 'text/plain', body: { data: encode('body') } },
              { mimeType: 'text/html', body: { data: encode('<p>body</p>') } },
            ],
          },
          { mimeType: 'text/calendar', body: { data: encode(icsContent) } },
        ],
      },
    };

    expect(extractCalendarData(message)).toEqual({
      date: '2026-04-01',
      startTime: '10:00',
      endTime: '11:00',
      duration: 60,
    });
  });

  it('returns null duration when end is before start (overnight event)', () => {
    const icsContent = 'BEGIN:VEVENT\r\nDTSTART:20260315T230000\r\nDTEND:20260316T010000\r\nEND:VEVENT';

    const message = {
      payload: { mimeType: 'text/calendar', body: { data: encode(icsContent) } },
    };

    const result = extractCalendarData(message);
    // End time is on a different day, so same-day duration calc returns null
    expect(result.duration).toBeNull();
    expect(result.startTime).toBe('23:00');
    expect(result.endTime).toBe('01:00');
  });

  it('handles RFC 5545 line folding (CRLF + whitespace continuation)', () => {
    // Per RFC 5545 §3.1, long lines may be folded with CRLF + space/tab
    const icsContent = [
      'BEGIN:VEVENT',
      'DTSTART;TZID=America/New_',
      ' York:20260315T150000',
      'DTEND;TZID=America/New_',
      ' York:20260315T160000',
      'END:VEVENT',
    ].join('\r\n');

    const message = {
      payload: { mimeType: 'text/calendar', body: { data: encode(icsContent) } },
    };

    expect(extractCalendarData(message)).toEqual({
      date: '2026-03-15',
      startTime: '15:00',
      endTime: '16:00',
      duration: 60,
    });
  });

  it('extracts first DTSTART/DTEND when multiple VEVENTs are present', () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART:20260315T100000',
      'DTEND:20260315T110000',
      'SUMMARY:First interview',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTSTART:20260316T140000',
      'DTEND:20260316T150000',
      'SUMMARY:Second interview',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const message = {
      payload: { mimeType: 'text/calendar', body: { data: encode(icsContent) } },
    };

    // First VEVENT wins
    expect(extractCalendarData(message)).toEqual({
      date: '2026-03-15',
      startTime: '10:00',
      endTime: '11:00',
      duration: 60,
    });
  });
});

describe('extractVideoCallUrl', () => {
  it('extracts a Zoom meeting URL', () => {
    const text = 'Join the meeting at https://zoom.us/j/123456789?pwd=abc123 on time.';
    expect(extractVideoCallUrl(text)).toBe('https://zoom.us/j/123456789?pwd=abc123');
  });

  it('extracts a Google Meet URL', () => {
    const text = 'Your interview is at https://meet.google.com/abc-defg-hij please be on time.';
    expect(extractVideoCallUrl(text)).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('extracts a Microsoft Teams meetup-join URL', () => {
    const text = 'Click here: https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc to join.';
    expect(extractVideoCallUrl(text)).toBe('https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc');
  });

  it('extracts a Microsoft Teams /meet/ URL', () => {
    const text = 'Join at https://teams.microsoft.com/meet/36805220047055?p=hoWTC85qsijw6wk3EA for the interview.';
    expect(extractVideoCallUrl(text)).toBe('https://teams.microsoft.com/meet/36805220047055?p=hoWTC85qsijw6wk3EA');
  });

  it('extracts a WebEx URL', () => {
    const text = 'Join at https://company.webex.com/meet/john.doe for the interview.';
    expect(extractVideoCallUrl(text)).toBe('https://company.webex.com/meet/john.doe');
  });

  it('returns empty string when no video URL is found', () => {
    expect(extractVideoCallUrl('No video links here, just text.')).toBe('');
  });

  it('returns empty string for null/undefined input', () => {
    expect(extractVideoCallUrl(null)).toBe('');
    expect(extractVideoCallUrl(undefined)).toBe('');
    expect(extractVideoCallUrl('')).toBe('');
  });

  it('returns the first video URL when multiple are present', () => {
    const text = 'Primary: https://zoom.us/j/111 Backup: https://meet.google.com/aaa-bbbb-ccc';
    expect(extractVideoCallUrl(text)).toBe('https://zoom.us/j/111');
  });

  it('handles Zoom URL with subdomain', () => {
    const text = 'Join https://acme.zoom.us/j/99999 for the call.';
    expect(extractVideoCallUrl(text)).toBe('https://acme.zoom.us/j/99999');
  });

  it('extracts the inner Zoom URL from a tracking wrapper URL', () => {
    // The regex requires zoom.us in the hostname, so it skips the tracking domain
    const text = 'Click https://tracking.example.com/redirect?url=https://zoom.us/j/12345';
    const result = extractVideoCallUrl(text);
    expect(result).toBe('https://zoom.us/j/12345');
  });

  it('extracts a Spark Hire URL', () => {
    const text = 'Complete your interview at https://app.sparkhire.com/interview/abc123 before the deadline.';
    expect(extractVideoCallUrl(text)).toBe('https://app.sparkhire.com/interview/abc123');
  });

  it('extracts a Spark Hire URL with www subdomain', () => {
    const text = 'Visit https://www.sparkhire.com/video/xyz789 to start.';
    expect(extractVideoCallUrl(text)).toBe('https://www.sparkhire.com/video/xyz789');
  });

  it('extracts a Hireflix URL', () => {
    const text = 'Your interview: https://app.hireflix.com/interview/def456 — good luck!';
    expect(extractVideoCallUrl(text)).toBe('https://app.hireflix.com/interview/def456');
  });

  it('extracts a myInterview URL', () => {
    const text = 'Please complete https://app.myinterview.com/interview/ghi789 at your convenience.';
    expect(extractVideoCallUrl(text)).toBe('https://app.myinterview.com/interview/ghi789');
  });
});
