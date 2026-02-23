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
    expect(result).toEqual({ date: null, time: null, duration: null });
  });

  it('returns nulls for null input', () => {
    expect(extractDateTimeFromText(null)).toEqual({ date: null, time: null, duration: null });
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
