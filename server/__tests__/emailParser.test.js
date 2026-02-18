import { describe, it, expect } from '@jest/globals';
import {
  extractDomain,
  extractCompanyFromDomain,
  scoreEmailForInterview,
  extractDateTimeFromText,
  parseGmailMessage,
  extractEmailFromHeader,
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
    expect(result).toEqual({ date: null, time: null });
  });

  it('returns nulls for null input', () => {
    expect(extractDateTimeFromText(null)).toEqual({ date: null, time: null });
  });

  it('extracts both date and time from combined text', () => {
    const result = extractDateTimeFromText(
      'Your interview is scheduled for January 20, 2025 at 3:00 PM.'
    );
    expect(result.date).toBe('2025-01-20');
    expect(result.time).toBe('15:00');
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
