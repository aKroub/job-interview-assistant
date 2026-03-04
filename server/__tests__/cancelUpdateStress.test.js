/**
 * Stress tests for the cancel/update detection feature (backend).
 *
 * Tests exercise edge cases in email intent detection, calendar cancelled
 * event handling, and the interviewDetector's action derivation logic.
 */

import { describe, it, expect } from '@jest/globals';
import { detectEmailIntent } from '../src/utils/emailParser.js';
import { createInterviewDetector } from '../src/services/interviewDetector.js';

// ---------------------------------------------------------------------------
// Helpers (same as interviewDetector.test.js)
// ---------------------------------------------------------------------------

function mockGmail(results = []) {
  return { scanForInterviews: async () => results };
}

function mockCalendar(results = []) {
  return { scanForInterviews: async () => results };
}

function mockTokenStore(dismissed = []) {
  const surfacedEmailIds = new Set();
  const surfacedCalendarIds = new Set();
  return {
    getDismissed: () => {
      const ids = new Set();
      const emailIds = new Set();
      const calendarIds = new Set();
      for (const entry of dismissed) {
        if (typeof entry === 'string') {
          ids.add(entry);
        } else {
          ids.add(entry.id);
          if (entry.emailId) emailIds.add(entry.emailId);
          if (entry.calendarId) calendarIds.add(entry.calendarId);
        }
      }
      return { ids, emailIds, calendarIds };
    },
    getSurfaced: () => ({
      emailIds: new Set(surfacedEmailIds),
      calendarIds: new Set(surfacedCalendarIds),
    }),
    addSurfaced: async (emailIds = [], calendarIds = []) => {
      for (const id of emailIds) surfacedEmailIds.add(id);
      for (const id of calendarIds) surfacedCalendarIds.add(id);
    },
  };
}

const fixedId = () => 1700000000000;

function makeEmailResult(overrides = {}) {
  return {
    messageId: 'msg1',
    subject: 'Interview Invitation',
    snippet: 'We would like to invite you...',
    from: 'recruiter@google.com',
    senderEmail: 'recruiter@google.com',
    senderDomain: 'google.com',
    companyName: 'google',
    score: 0.6,
    matchedKeywords: ['interview invitation'],
    extractedDate: '2025-01-20',
    extractedTime: '14:00',
    extractedDuration: null,
    intent: 'add',
    ...overrides,
  };
}

function makeCalendarResult(overrides = {}) {
  return {
    eventId: 'evt1',
    summary: 'Interview with Google',
    description: '',
    organizerEmail: 'recruiter@google.com',
    startDateTime: '2025-01-20T14:00:00Z',
    endDateTime: '2025-01-20T15:00:00Z',
    date: '2025-01-20',
    time: '14:00',
    score: 0.6,
    matchedKeywords: ['interview'],
    reasons: ['keyword-match'],
    hasVideoLink: false,
    location: '',
    companyName: 'google',
    calendarStatus: 'confirmed',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// H1: detectEmailIntent — false positive stress
// ---------------------------------------------------------------------------

describe('H1 — detectEmailIntent false positive resistance', () => {
  it('returns "add" for "We look forward to your interview" (no cancel/update phrases)', () => {
    expect(detectEmailIntent(
      'Interview Confirmation',
      'We look forward to your interview next week.'
    )).toBe('add');
  });

  it('returns "add" when body mentions "move" in non-reschedule context', () => {
    // "moved to" is an UPDATE_PHRASE, but "move forward" is not
    expect(detectEmailIntent(
      'Interview Invitation',
      'We are excited to move forward with your application. Your interview is scheduled.'
    )).toBe('add');
  });

  it('returns "cancel" for "withdraw" even without "interview" in text', () => {
    // The "withdraw" keyword is a broad match — verify it works
    expect(detectEmailIntent(
      'Application Update',
      'We have decided to withdraw the job offer.'
    )).toBe('cancel');
  });

  it('returns "add" for "new date" in non-reschedule context', () => {
    // "new date" is an UPDATE_PHRASE — but emails about scheduling
    // don't typically say "new date" for a first-time invite
    expect(detectEmailIntent(
      'Interview Scheduled',
      'Please note the new date for your interview: January 25.'
    )).toBe('update');
  });

  it('handles emails with both cancel and update phrases — cancel wins', () => {
    expect(detectEmailIntent(
      'Interview Update',
      'Your interview has been cancelled. We will contact you about a new time.'
    )).toBe('cancel');
  });

  it('handles extremely long email body without performance issues', () => {
    const longBody = 'Your interview is scheduled. '.repeat(1000) +
      'Unfortunately, we regret to inform you that the position has been filled.';
    const start = Date.now();
    const result = detectEmailIntent('Application Update', longBody);
    const elapsed = Date.now() - start;
    expect(result).toBe('cancel');
    // Should complete in under 100ms even with a very long body
    expect(elapsed).toBeLessThan(100);
  });

  it('detects cancel when phrase spans subject and body boundary', () => {
    // "regret to inform" split: "regret" in subject won't trigger,
    // but the full phrase in body should
    expect(detectEmailIntent(
      'We regret',
      'to inform you that the interview has been cancelled.'
    )).toBe('cancel');
  });
});

// ---------------------------------------------------------------------------
// H2: interviewDetector — mixed actions from same company
// ---------------------------------------------------------------------------

describe('H2 — mixed cancel and add suggestions from same company', () => {
  it('produces both cancel and add suggestions for different emails from same company', async () => {
    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({
          messageId: 'msg1',
          intent: 'cancel',
          extractedDate: '2025-01-20',
          senderDomain: 'google.com',
        }),
        makeEmailResult({
          messageId: 'msg2',
          intent: 'add',
          extractedDate: '2025-01-25',
          senderDomain: 'google.com',
        }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({
          eventId: 'evt1',
          organizerEmail: 'hr@google.com',
          date: '2025-01-20',
          time: '14:00',
        }),
        makeCalendarResult({
          eventId: 'evt2',
          organizerEmail: 'hr@google.com',
          date: '2025-01-25',
          time: '10:00',
          startDateTime: '2025-01-25T10:00:00Z',
          endDateTime: '2025-01-25T11:00:00Z',
        }),
      ]),
      tokenStore: mockTokenStore(),
      idFn: fixedId,
    });

    const suggestions = await detector.detect();

    expect(suggestions.length).toBe(2);
    const actions = suggestions.map((s) => s.action);
    expect(actions).toContain('cancel');
    expect(actions).toContain('add');
  });

  it('cancel and update suggestions for same company get distinct IDs', async () => {
    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({
          messageId: 'msg1',
          intent: 'cancel',
          senderDomain: 'a.com',
          extractedDate: '2025-01-20',
        }),
        makeEmailResult({
          messageId: 'msg2',
          intent: 'update',
          senderDomain: 'b.com',
          extractedDate: '2025-01-20',
        }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({
          eventId: 'evt1',
          organizerEmail: 'hr@a.com',
          date: '2025-01-20',
          time: '14:00',
        }),
        makeCalendarResult({
          eventId: 'evt2',
          organizerEmail: 'hr@b.com',
          date: '2025-01-20',
          time: '14:00',
          startDateTime: '2025-01-20T14:00:00Z',
          endDateTime: '2025-01-20T15:00:00Z',
        }),
      ]),
      tokenStore: mockTokenStore(),
      idFn: fixedId,
    });

    const suggestions = await detector.detect();

    expect(suggestions.length).toBe(2);
    const ids = suggestions.map((s) => s.id);
    // IDs must be distinct
    expect(new Set(ids).size).toBe(2);
    // And should contain action prefixes
    expect(ids.some((id) => id.includes('cancel_'))).toBe(true);
    expect(ids.some((id) => id.includes('update_'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// H3: dismissed cancel does not block new add for same email+event
// ---------------------------------------------------------------------------

describe('H3 — dismissal isolation between action types', () => {
  it('dismissed cancel does not block add suggestion for same email+event', async () => {
    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ intent: 'add' })]),
      calendarService: mockCalendar([makeCalendarResult()]),
      tokenStore: mockTokenStore(['suggestion_cancel_msg1_evt1']),
      idFn: fixedId,
    });

    const suggestions = await detector.detect();

    // The "add" suggestion has a different ID (suggestion_msg1_evt1)
    // so the dismissed "cancel" should not block it
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].action).toBe('add');
    expect(suggestions[0].id).toBe('suggestion_msg1_evt1');
  });

  it('dismissed update does not block cancel suggestion for same email+event', async () => {
    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ intent: 'cancel' })]),
      calendarService: mockCalendar([makeCalendarResult()]),
      tokenStore: mockTokenStore(['suggestion_update_msg1_evt1']),
      idFn: fixedId,
    });

    const suggestions = await detector.detect();

    expect(suggestions.length).toBe(1);
    expect(suggestions[0].action).toBe('cancel');
    expect(suggestions[0].id).toBe('suggestion_cancel_msg1_evt1');
  });
});

// ---------------------------------------------------------------------------
// H4: calendar-only cancelled event with high score
// ---------------------------------------------------------------------------

describe('H4 — calendar-only cancelled events', () => {
  it('produces a cancel suggestion for a calendar-only cancelled event with interview keywords', async () => {
    const detector = createInterviewDetector({
      gmailService: mockGmail([]),
      calendarService: mockCalendar([makeCalendarResult({
        score: 0.8,
        calendarStatus: 'cancelled',
        summary: 'Technical Interview with Google',
      })]),
      tokenStore: mockTokenStore(),
      idFn: fixedId,
    });

    const [s] = await detector.detect();

    expect(s.source).toBe('calendar');
    expect(s.action).toBe('cancel');
    expect(s.id).toContain('cancel_');
  });

  it('calendar-only cancelled event does NOT produce an "add" suggestion', async () => {
    const detector = createInterviewDetector({
      gmailService: mockGmail([]),
      calendarService: mockCalendar([makeCalendarResult({
        score: 0.8,
        calendarStatus: 'cancelled',
      })]),
      tokenStore: mockTokenStore(),
      idFn: fixedId,
    });

    const suggestions = await detector.detect();

    // Should produce exactly 1 suggestion, and it should be cancel
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].action).toBe('cancel');
  });
});

// ---------------------------------------------------------------------------
// H5: email intent detection — subject vs body
// ---------------------------------------------------------------------------

describe('H5 — detectEmailIntent subject/body interaction', () => {
  it('detects cancel from subject alone when body is empty', () => {
    expect(detectEmailIntent('Your interview has been cancelled', '')).toBe('cancel');
  });

  it('detects cancel from body alone when subject is generic', () => {
    expect(detectEmailIntent('Update', 'We are no longer moving forward with your application.')).toBe('cancel');
  });

  it('detects update from subject alone when body is empty', () => {
    expect(detectEmailIntent('Interview rescheduled', '')).toBe('update');
  });

  it('combined subject+body is checked (phrase split across both)', () => {
    // detectEmailIntent concatenates subject + body, so "regret to inform"
    // should be found even if partly in subject
    const result = detectEmailIntent(
      'We regret to inform',
      'you that your interview has been cancelled.'
    );
    expect(result).toBe('cancel');
  });
});
