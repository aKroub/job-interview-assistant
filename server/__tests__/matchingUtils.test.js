import { describe, it, expect } from '@jest/globals';
import {
  matchesInterviewKeywords,
  isTypicalInterviewDuration,
  isExternalOrganizer,
  isRecurringEvent,
  scoreCalendarEvent,
  crossReferenceEmailAndEvent,
} from '../src/utils/matchingUtils.js';

describe('matchesInterviewKeywords', () => {
  it('matches "interview" in summary', () => {
    const { isMatch, matchedKeywords } = matchesInterviewKeywords('Technical Interview', '');
    expect(isMatch).toBe(true);
    expect(matchedKeywords).toContain('interview');
  });

  it('matches "coding challenge" in description', () => {
    const { isMatch } = matchesInterviewKeywords('', 'Please complete this coding challenge');
    expect(isMatch).toBe(true);
  });

  it('returns false for unrelated content', () => {
    const { isMatch } = matchesInterviewKeywords('Weekly standup', 'Discuss project status');
    expect(isMatch).toBe(false);
  });

  it('is case-insensitive', () => {
    const { isMatch } = matchesInterviewKeywords('INTERVIEW with team', '');
    expect(isMatch).toBe(true);
  });

  it('handles null inputs gracefully', () => {
    const { isMatch, matchedKeywords } = matchesInterviewKeywords(null, null);
    expect(isMatch).toBe(false);
    expect(matchedKeywords).toEqual([]);
  });

  it('matches multiple keywords', () => {
    const { matchedKeywords } = matchesInterviewKeywords(
      'Technical Interview - Final Round',
      'Meet with the hiring manager'
    );
    expect(matchedKeywords.length).toBeGreaterThanOrEqual(2);
  });
});

describe('isTypicalInterviewDuration', () => {
  it('returns true for a 30-minute event', () => {
    expect(isTypicalInterviewDuration(
      '2025-01-15T14:00:00Z',
      '2025-01-15T14:30:00Z'
    )).toBe(true);
  });

  it('returns true for a 60-minute event', () => {
    expect(isTypicalInterviewDuration(
      '2025-01-15T14:00:00Z',
      '2025-01-15T15:00:00Z'
    )).toBe(true);
  });

  it('returns true for a 90-minute event', () => {
    expect(isTypicalInterviewDuration(
      '2025-01-15T14:00:00Z',
      '2025-01-15T15:30:00Z'
    )).toBe(true);
  });

  it('returns false for a 5-minute event (too short)', () => {
    expect(isTypicalInterviewDuration(
      '2025-01-15T14:00:00Z',
      '2025-01-15T14:05:00Z'
    )).toBe(false);
  });

  it('returns false for a 4-hour event (too long)', () => {
    expect(isTypicalInterviewDuration(
      '2025-01-15T14:00:00Z',
      '2025-01-15T18:00:00Z'
    )).toBe(false);
  });

  it('returns false for null inputs', () => {
    expect(isTypicalInterviewDuration(null, null)).toBe(false);
  });

  it('returns false for invalid date strings', () => {
    expect(isTypicalInterviewDuration('not-a-date', 'also-not')).toBe(false);
  });
});

describe('isExternalOrganizer', () => {
  it('returns true when domains differ', () => {
    expect(isExternalOrganizer('recruiter@google.com', 'me@gmail.com')).toBe(true);
  });

  it('returns false when domains match', () => {
    expect(isExternalOrganizer('colleague@company.com', 'me@company.com')).toBe(false);
  });

  it('returns false for null inputs', () => {
    expect(isExternalOrganizer(null, null)).toBe(false);
  });

  it('returns false for empty strings', () => {
    expect(isExternalOrganizer('', '')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isExternalOrganizer('HR@COMPANY.COM', 'me@company.com')).toBe(false);
  });
});

describe('isRecurringEvent', () => {
  it('returns true when recurringEventId is present', () => {
    expect(isRecurringEvent({ recurringEventId: 'abc123' })).toBe(true);
  });

  it('returns true when recurrence is present', () => {
    expect(isRecurringEvent({ recurrence: ['RRULE:FREQ=WEEKLY'] })).toBe(true);
  });

  it('returns false for a one-time event', () => {
    expect(isRecurringEvent({ summary: 'Interview' })).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isRecurringEvent({})).toBe(false);
  });
});

describe('scoreCalendarEvent', () => {
  function makeEvent(overrides = {}) {
    return {
      summary: 'Technical Interview',
      description: '',
      organizer: { email: 'recruiter@google.com' },
      start: { dateTime: '2025-01-15T14:00:00Z' },
      end: { dateTime: '2025-01-15T15:00:00Z' },
      ...overrides,
    };
  }

  it('scores high for an interview keyword + external organizer + typical duration', () => {
    const { score } = scoreCalendarEvent(makeEvent(), 'me@gmail.com');
    expect(score).toBeGreaterThanOrEqual(0.5);
  });

  it('scores near zero for a recurring event', () => {
    const event = makeEvent({ recurringEventId: 'abc', summary: 'Weekly Interview Prep' });
    const { score, reasons } = scoreCalendarEvent(event, 'me@gmail.com');
    expect(score).toBeLessThanOrEqual(0.1);
    expect(reasons).toContain('recurring-event');
  });

  it('gives bonus for video link (hangoutLink)', () => {
    const withVideo = makeEvent({ hangoutLink: 'https://meet.google.com/abc' });
    const withoutVideo = makeEvent();
    const scoreWith = scoreCalendarEvent(withVideo, 'me@gmail.com').score;
    const scoreWithout = scoreCalendarEvent(withoutVideo, 'me@gmail.com').score;
    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it('gives bonus for video link in description (Zoom)', () => {
    const event = makeEvent({ description: 'Join at https://zoom.us/j/123456' });
    const { reasons } = scoreCalendarEvent(event, 'me@gmail.com');
    expect(reasons).toContain('video-link');
  });

  it('penalises self-organized events', () => {
    const selfOrg = makeEvent({ organizer: { email: 'me@gmail.com' } });
    const external = makeEvent({ organizer: { email: 'recruiter@google.com' } });
    const selfScore = scoreCalendarEvent(selfOrg, 'me@gmail.com').score;
    const extScore = scoreCalendarEvent(external, 'me@gmail.com').score;
    expect(selfScore).toBeLessThan(extScore);
  });

  it('returns matchedKeywords and reasons arrays', () => {
    const { matchedKeywords, reasons } = scoreCalendarEvent(makeEvent(), 'me@gmail.com');
    expect(Array.isArray(matchedKeywords)).toBe(true);
    expect(Array.isArray(reasons)).toBe(true);
  });

  it('caps score at 1.0', () => {
    const event = makeEvent({
      summary: 'Final Round Panel Interview - Technical Assessment',
      description: 'Hiring manager and recruiter call. Join at https://zoom.us/j/123',
      hangoutLink: 'https://meet.google.com/abc',
      conferenceData: {},
    });
    const { score } = scoreCalendarEvent(event, 'me@gmail.com');
    expect(score).toBeLessThanOrEqual(1.0);
  });
});

describe('crossReferenceEmailAndEvent', () => {
  function makeEmailResult(overrides = {}) {
    return {
      senderDomain: 'google.com',
      extractedDate: '2025-01-15',
      companyName: '',
      ...overrides,
    };
  }

  function makeCalendarResult(overrides = {}) {
    return {
      organizerEmail: 'recruiter@google.com',
      startDateTime: '2025-01-15T14:00:00Z',
      date: '2025-01-15',
      companyName: '',
      ...overrides,
    };
  }

  it('returns high confidence when domain and date both match', () => {
    const result = crossReferenceEmailAndEvent(makeEmailResult(), makeCalendarResult());
    expect(result.isMatch).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('returns medium confidence when only domain matches', () => {
    const email = makeEmailResult({ extractedDate: '2025-02-20' });
    const result = crossReferenceEmailAndEvent(email, makeCalendarResult());
    expect(result.isMatch).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result.confidence).toBeLessThan(0.9);
  });

  it('returns lower confidence when only date matches', () => {
    const email = makeEmailResult({ senderDomain: 'otherdomain.com' });
    const event = makeCalendarResult({ organizerEmail: 'hr@differentcompany.com' });
    const result = crossReferenceEmailAndEvent(email, event);
    expect(result.isMatch).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it('returns no match when neither domain nor date match', () => {
    const email = makeEmailResult({ senderDomain: 'other.com', extractedDate: '2025-03-01' });
    const event = makeCalendarResult({ organizerEmail: 'hr@different.com', date: '2025-01-15' });
    const result = crossReferenceEmailAndEvent(email, event);
    expect(result.isMatch).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('handles missing email date gracefully', () => {
    const email = makeEmailResult({ extractedDate: null });
    const result = crossReferenceEmailAndEvent(email, makeCalendarResult());
    // Domain still matches
    expect(result.isMatch).toBe(true);
  });

  it('handles event with date-only start (all-day event)', () => {
    const event = makeCalendarResult({
      date: '2025-01-15',
      startDateTime: '',
      organizerEmail: 'hr@other.com',
    });
    const email = makeEmailResult({ senderDomain: 'other.com' });
    const result = crossReferenceEmailAndEvent(email, event);
    expect(result.isMatch).toBe(true);
  });

  it('rejects substring domain matches that are not proper subdomains', () => {
    const email = makeEmailResult({ senderDomain: 'google.com', extractedDate: '2025-01-16' });
    const event = makeCalendarResult({ organizerEmail: 'hr@notgoogle.com' });
    const result = crossReferenceEmailAndEvent(email, event);
    expect(result.isMatch).toBe(false);
  });

  it('accepts subdomain matches (jobs.google.com matches google.com)', () => {
    const email = makeEmailResult({ senderDomain: 'google.com', extractedDate: '2025-01-16' });
    const event = makeCalendarResult({ organizerEmail: 'hr@jobs.google.com' });
    const result = crossReferenceEmailAndEvent(email, event);
    expect(result.isMatch).toBe(true);
  });

  it('accepts subdomain matches (google.com matches jobs.google.com)', () => {
    const email = makeEmailResult({ senderDomain: 'jobs.google.com' });
    const event = makeCalendarResult({ organizerEmail: 'hr@google.com' });
    const result = crossReferenceEmailAndEvent(email, event);
    expect(result.isMatch).toBe(true);
  });

  it('returns 0.9 confidence when company name and date both match (scheduling platform organizer)', () => {
    const email = makeEmailResult({
      senderDomain: 'comeet-notifications.com',
      companyName: 'torq',
      extractedDate: '2025-01-15',
    });
    const event = makeCalendarResult({
      organizerEmail: 'noreply@group.calendar.google.com',
      companyName: 'torq',
      date: '2025-01-15',
    });
    const result = crossReferenceEmailAndEvent(email, event);
    expect(result.isMatch).toBe(true);
    expect(result.confidence).toBe(0.9);
  });

  it('returns 0.65 confidence when only company name matches', () => {
    const email = makeEmailResult({
      senderDomain: 'comeet-notifications.com',
      companyName: 'torq',
      extractedDate: '2025-02-10',
    });
    const event = makeCalendarResult({
      organizerEmail: 'noreply@group.calendar.google.com',
      companyName: 'torq',
      date: '2025-01-15',
    });
    const result = crossReferenceEmailAndEvent(email, event);
    expect(result.isMatch).toBe(true);
    expect(result.confidence).toBe(0.65);
  });

  it('does not domain-match against scheduling platform organizer domains', () => {
    const email = makeEmailResult({
      senderDomain: 'group.calendar.google.com',
      extractedDate: '2025-02-10',
      companyName: '',
    });
    const event = makeCalendarResult({
      organizerEmail: 'noreply@group.calendar.google.com',
      date: '2025-01-15',
      companyName: '',
    });
    const result = crossReferenceEmailAndEvent(email, event);
    // Neither domain (scheduling platform) nor date nor companyName match
    expect(result.isMatch).toBe(false);
  });

  it('uses substring match for company names (sentinelone contains sentinel)', () => {
    const email = makeEmailResult({
      senderDomain: 'other.com',
      companyName: 'sentinelone',
      extractedDate: '2025-02-10',
    });
    const event = makeCalendarResult({
      organizerEmail: 'hr@different.com',
      companyName: 'sentinel',
      date: '2025-02-10',
    });
    const result = crossReferenceEmailAndEvent(email, event);
    expect(result.isMatch).toBe(true);
    expect(result.confidence).toBe(0.9);
  });

  it('does not match different company names', () => {
    const email = makeEmailResult({
      senderDomain: 'comeet-notifications.com',
      companyName: 'torq',
      extractedDate: '2025-02-10',
    });
    const event = makeCalendarResult({
      organizerEmail: 'noreply@group.calendar.google.com',
      companyName: 'pango',
      date: '2025-03-01',
    });
    const result = crossReferenceEmailAndEvent(email, event);
    expect(result.isMatch).toBe(false);
  });

  it('prefers domain+date (0.95) over companyName+date (0.9) when both could match', () => {
    const email = makeEmailResult({
      senderDomain: 'torq.io',
      companyName: 'torq',
      extractedDate: '2025-01-15',
    });
    const event = makeCalendarResult({
      organizerEmail: 'recruiter@torq.io',
      companyName: 'torq',
      date: '2025-01-15',
    });
    const result = crossReferenceEmailAndEvent(email, event);
    expect(result.isMatch).toBe(true);
    expect(result.confidence).toBe(0.95);
  });

  it('boosts confidence when date and time both match', () => {
    const email = makeEmailResult({
      senderDomain: 'otherdomain.com',
      extractedDate: '2025-01-15',
      extractedTime: '14:00',
    });
    const event = makeCalendarResult({
      organizerEmail: 'hr@differentcompany.com',
      date: '2025-01-15',
      time: '14:00',
    });
    const result = crossReferenceEmailAndEvent(email, event);
    expect(result.isMatch).toBe(true);
    expect(result.confidence).toBe(0.75);
  });

  it('returns date-only confidence (0.5) when date matches but time does not', () => {
    const email = makeEmailResult({
      senderDomain: 'otherdomain.com',
      extractedDate: '2025-01-15',
      extractedTime: '15:00',
    });
    const event = makeCalendarResult({
      organizerEmail: 'hr@differentcompany.com',
      date: '2025-01-15',
      time: '10:00',
    });
    const result = crossReferenceEmailAndEvent(email, event);
    expect(result.isMatch).toBe(true);
    expect(result.confidence).toBe(0.5);
  });

  it('returns 0.97 confidence when domain, date, and time all match', () => {
    const email = makeEmailResult({
      senderDomain: 'google.com',
      extractedDate: '2025-01-15',
      extractedTime: '14:00',
    });
    const event = makeCalendarResult({
      organizerEmail: 'recruiter@google.com',
      date: '2025-01-15',
      time: '14:00',
    });
    const result = crossReferenceEmailAndEvent(email, event);
    expect(result.isMatch).toBe(true);
    expect(result.confidence).toBe(0.97);
  });
});
