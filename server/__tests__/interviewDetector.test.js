import { describe, it, expect } from '@jest/globals';
import { createInterviewDetector } from '../src/services/interviewDetector.js';

/**
 * Creates a mock gmail service returning the given results.
 */
function mockGmail(results = []) {
  return { scanForInterviews: async () => results };
}

/**
 * Creates a mock calendar service returning the given results.
 */
function mockCalendar(results = []) {
  return { scanForInterviews: async () => results };
}

/**
 * Creates a mock token store with the given dismissed IDs.
 */
function mockTokenStore(dismissed = []) {
  return { getDismissed: () => dismissed };
}

/** Fixed ID generator for deterministic test output. */
const fixedId = () => 1700000000000;

function makeEmailResult(overrides = {}) {
  return {
    messageId: 'msg1',
    subject: 'Interview Invitation',
    snippet: 'We would like to invite you...',
    from: 'HR <hr@google.com>',
    senderEmail: 'hr@google.com',
    senderDomain: 'google.com',
    companyName: 'google',
    score: 0.8,
    matchedKeywords: ['interview invitation'],
    extractedDate: '2025-01-20',
    extractedTime: '14:00',
    ...overrides,
  };
}

function makeCalendarResult(overrides = {}) {
  return {
    eventId: 'evt1',
    summary: 'Technical Interview - SWE',
    description: '',
    organizerEmail: 'recruiter@google.com',
    startDateTime: '2025-01-20T14:00:00Z',
    endDateTime: '2025-01-20T15:00:00Z',
    date: '2025-01-20',
    time: '14:00',
    score: 0.7,
    matchedKeywords: ['interview'],
    reasons: ['keyword-match', 'external-organizer'],
    hasVideoLink: false,
    companyName: '',
    ...overrides,
  };
}

describe('createInterviewDetector', () => {
  describe('detect — core cross-reference rule', () => {
    it('returns suggestions ONLY when both email and calendar match', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      expect(suggestions.length).toBe(1);
      expect(suggestions[0].source).toBe('gmail+calendar');
      expect(suggestions[0].emailMessageId).toBe('msg1');
      expect(suggestions[0].calendarEventId).toBe('evt1');
    });

    it('returns EMPTY when only email matches (no calendar events)', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('returns EMPTY when only calendar matches (no emails)', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('returns EMPTY when email and calendar exist but neither domain nor date match', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          senderDomain: 'apple.com',
          extractedDate: '2025-02-10',
        })]),
        calendarService: mockCalendar([makeCalendarResult({
          organizerEmail: 'hr@microsoft.com',
          date: '2025-01-20',
        })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });
  });

  describe('detect — suggestion shape', () => {
    it('produces a well-formed suggestion object', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();

      expect(s.id).toContain('suggestion_');
      expect(s.source).toBe('gmail+calendar');
      expect(s.confidence).toBeGreaterThan(0);
      expect(s.companyName).toBe('Google');
      expect(s.companyDomain).toBe('google.com');
      expect(typeof s.type).toBe('string');
      expect(s.date).toBe('2025-01-20');
      expect(s.time).toBe('14:00');
      expect(typeof s.subject).toBe('string');
      expect(typeof s.emailSnippet).toBe('string');
      expect(s.calendarEventId).toBe('evt1');
      expect(s.emailMessageId).toBe('msg1');
      expect(typeof s.detectedAt).toBe('string');
    });
  });

  describe('detect — deduplication', () => {
    it('does not produce duplicate suggestions for the same email+event pair', async () => {
      // Two emails from same company, one calendar event — only one match
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg1' }),
          makeEmailResult({ messageId: 'msg2' }),
        ]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      // Only one suggestion — the event is "used" after the first match
      expect(suggestions.length).toBe(1);
    });

    it('matches separate email+event pairs independently', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg1', senderDomain: 'google.com' }),
          makeEmailResult({ messageId: 'msg2', senderDomain: 'meta.com', extractedDate: '2025-01-21' }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({
            eventId: 'evt1',
            organizerEmail: 'hr@google.com',
            startDateTime: '2025-01-20T14:00:00Z',
          }),
          makeCalendarResult({
            eventId: 'evt2',
            organizerEmail: 'hr@meta.com',
            date: '2025-01-21',
            time: '10:00',
            startDateTime: '2025-01-21T10:00:00Z',
          }),
        ]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions.length).toBe(2);
    });
  });

  describe('detect — dismissed suggestions', () => {
    it('excludes previously dismissed suggestions', async () => {
      const dismissedId = 'suggestion_msg1_evt1';
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: mockTokenStore([dismissedId]),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });
  });

  describe('detect — interview type guessing', () => {
    it('guesses "Phone Interview" when email mentions phone', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ subject: 'Phone Screen with Team' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('Phone Interview');
    });

    it('guesses "Video Interview" when calendar event has video link', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ subject: 'Interview with Google' })]),
        calendarService: mockCalendar([makeCalendarResult({ hasVideoLink: true })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('Video Interview');
    });

    it('guesses "In-Person Interview" when email mentions onsite', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ subject: 'Onsite Interview at HQ' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('In-Person Interview');
    });
  });

  describe('detect — uses calendar date/time over email', () => {
    it('prefers calendar date/time when both are available', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ extractedDate: '2025-01-19', extractedTime: '09:00' })]),
        calendarService: mockCalendar([makeCalendarResult({ date: '2025-01-20', time: '14:00' })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.date).toBe('2025-01-20');
      expect(s.time).toBe('14:00');
    });
  });

  describe('detect — company name matching across sources', () => {
    it('matches email and calendar by company name when domains differ', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          senderDomain: 'comeet-notifications.com',
          companyName: 'torq',
          extractedDate: '2025-01-20',
        })]),
        calendarService: mockCalendar([makeCalendarResult({
          organizerEmail: 'noreply@group.calendar.google.com',
          companyName: 'torq',
          date: '2025-01-20',
        })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      expect(suggestions.length).toBe(1);
      expect(suggestions[0].companyName).toBe('Torq');
      expect(suggestions[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('uses calendar companyName when email companyName is a platform name', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          senderDomain: 'comeet-notifications.com',
          companyName: '',
          extractedDate: '2025-01-20',
        })]),
        calendarService: mockCalendar([makeCalendarResult({
          organizerEmail: 'noreply@group.calendar.google.com',
          companyName: 'pango',
          date: '2025-01-20',
        })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      expect(suggestions.length).toBe(1);
      // Email companyName is empty, so it falls back to calendar's companyName
      expect(suggestions[0].companyName).toBe('Pango');
    });
  });
});
