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
 * Creates a mock token store with the given dismissed entries.
 *
 * Accepts either plain string IDs (backward compat) or objects with
 * { id, emailId, calendarId }. Returns getDismissed() in the new
 * structured format: { ids, emailIds, calendarIds }.
 *
 * @param {Array<string | { id: string, emailId?: string, calendarId?: string }>} dismissed
 */
function mockTokenStore(dismissed = []) {
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
  };
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
    extractedDuration: null,
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
    location: '',
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

    it('returns email-only suggestion when email exists but no calendar events and score >= 0.5', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ score: 0.8 })]),
        calendarService: mockCalendar([]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].source).toBe('gmail');
    });

    it('returns EMPTY when only email exists but score is below email-only threshold', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ score: 0.35 })]),
        calendarService: mockCalendar([]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('returns calendar-only suggestion when no emails but high-scoring calendar event', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({ score: 0.7 })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].source).toBe('calendar');
    });

    it('returns EMPTY when email and calendar exist but neither domain nor date match', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          senderDomain: 'apple.com',
          extractedDate: '2025-02-10',
          score: 0.35, // below email-only threshold — tests cross-ref logic only
        })]),
        calendarService: mockCalendar([makeCalendarResult({
          organizerEmail: 'hr@microsoft.com',
          date: '2025-01-20',
          score: 0.3, // below calendar-only threshold
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
      expect(s.duration).toBe(60);
      expect(typeof s.subject).toBe('string');
      expect(typeof s.emailSnippet).toBe('string');
      expect(s.calendarEventId).toBe('evt1');
      expect(s.emailMessageId).toBe('msg1');
      expect(typeof s.detectedAt).toBe('string');
    });
  });

  describe('detect — deduplication', () => {
    it('does not produce duplicate suggestions for the same email+event pair', async () => {
      // Two emails from same company, one calendar event — only one cross-ref match.
      // Second email has low score so it does not surface as email-only either.
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg1' }),
          makeEmailResult({ messageId: 'msg2', score: 0.35 }),
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
      // Dismiss both the cross-ref ID and the email-only ID so neither surfaces
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: mockTokenStore(['suggestion_msg1_evt1', 'suggestion_gmail_msg1']),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });
  });

  describe('detect — cross-source dismissal via component IDs', () => {
    it('email-only dismissed → cross-ref with same emailId is skipped', async () => {
      // User dismissed email-only suggestion, then calendar event appeared
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: mockTokenStore([
          { id: 'suggestion_gmail_msg1', emailId: 'msg1', calendarId: '' },
        ]),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('calendar-only dismissed → cross-ref with same calendarId is skipped', async () => {
      // User dismissed calendar-only suggestion, then email arrived
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: mockTokenStore([
          { id: 'suggestion_calendar_evt1', emailId: '', calendarId: 'evt1' },
        ]),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('cross-ref dismissed → email-only with same emailId is skipped', async () => {
      // User dismissed cross-ref suggestion, then calendar event was deleted
      // and the email would normally surface as email-only
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ score: 0.8 })]),
        calendarService: mockCalendar([]),
        tokenStore: mockTokenStore([
          { id: 'suggestion_msg1_evt1', emailId: 'msg1', calendarId: 'evt1' },
        ]),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('cross-ref dismissed → calendar-only with same calendarId is skipped', async () => {
      // User dismissed cross-ref suggestion, then email was deleted
      // and the calendar event would normally surface as calendar-only
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({ score: 0.7 })]),
        tokenStore: mockTokenStore([
          { id: 'suggestion_msg1_evt1', emailId: 'msg1', calendarId: 'evt1' },
        ]),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('does NOT suppress unrelated suggestions when a component ID is dismissed', async () => {
      // A different email (msg2) should still produce suggestions even though
      // msg1's emailId is dismissed
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg2', senderDomain: 'meta.com', score: 0.8 }),
        ]),
        calendarService: mockCalendar([]),
        tokenStore: mockTokenStore([
          { id: 'suggestion_gmail_msg1', emailId: 'msg1', calendarId: '' },
        ]),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].emailMessageId).toBe('msg2');
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

    it('guesses "In-Person Interview" when event has a physical location even with video link', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ subject: 'Interview with Google' })]),
        calendarService: mockCalendar([makeCalendarResult({
          hasVideoLink: true,
          location: '3 HaMelacha St., Floor 10, Tel-Aviv',
        })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('In-Person Interview');
    });

    it('guesses "Video Interview" when event location is a Zoom URL', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ subject: 'Interview with Google' })]),
        calendarService: mockCalendar([makeCalendarResult({
          hasVideoLink: true,
          location: 'https://zoom.us/j/123456',
        })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('Video Interview');
    });

    it('guesses "In-Person Interview" when email mentions "office" even with video link', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          subject: 'Interview at Google',
          snippet: 'Please come to our office at 10 AM',
        })]),
        calendarService: mockCalendar([makeCalendarResult({ hasVideoLink: true })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('In-Person Interview');
    });

    it('guesses "In-Person Interview" when text mentions floor number', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          subject: 'Interview with Google',
          snippet: 'Conference Room, Floor 10',
        })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('In-Person Interview');
    });

    it('email-only: guesses "In-Person Interview" when email mentions on-site', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          score: 0.8,
          subject: 'On-site Interview at HQ',
        })]),
        calendarService: mockCalendar([]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('In-Person Interview');
    });

    it('email-only: in-person keywords take priority over video keywords', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          score: 0.8,
          subject: 'Interview at our office',
          snippet: 'Zoom room 5 on the 3rd floor',
        })]),
        calendarService: mockCalendar([]),
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

  describe('detect — duration extraction from calendar', () => {
    it('computes 90-minute duration from a 10:00–11:30 calendar event', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult({
          startDateTime: '2025-01-20T10:00:00Z',
          endDateTime:   '2025-01-20T11:30:00Z',
        })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.duration).toBe(90);
    });

    it('computes 45-minute duration from a 45-minute calendar event', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult({
          startDateTime: '2025-01-20T14:00:00Z',
          endDateTime:   '2025-01-20T14:45:00Z',
        })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.duration).toBe(45);
    });

    it('returns null duration when endDateTime is missing', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult({
          startDateTime: '2025-01-20T14:00:00Z',
          endDateTime:   '',
        })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.duration).toBeNull();
    });

    it('returns null duration when startDateTime is missing', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult({
          startDateTime: '',
          endDateTime:   '2025-01-20T15:00:00Z',
        })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.duration).toBeNull();
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

  describe('detect — email-only suggestions', () => {
    it('produces an email-only suggestion with correct shape', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          score: 0.8,
          extractedDate: '2025-02-10',
          extractedTime: '15:30',
        })]),
        calendarService: mockCalendar([]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();

      expect(s.id).toBe('suggestion_gmail_msg1');
      expect(s.source).toBe('gmail');
      expect(s.confidence).toBeCloseTo(0.48); // 0.8 * 0.6
      expect(s.calendarEventId).toBe('');
      expect(s.duration).toBeNull();
      expect(s.date).toBe('2025-02-10');
      expect(s.time).toBe('15:30');
      expect(s.emailMessageId).toBe('msg1');
      expect(s.companyName).toBe('Google');
      expect(typeof s.detectedAt).toBe('string');
    });

    it('does NOT produce email-only suggestion when email already matched a calendar event', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ score: 0.8 })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      // Only the cross-referenced suggestion, not an additional email-only one
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].source).toBe('gmail+calendar');
    });

    it('excludes dismissed email-only suggestions', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ score: 0.8 })]),
        calendarService: mockCalendar([]),
        tokenStore: mockTokenStore(['suggestion_gmail_msg1']),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('guesses interview type from email text (no calendar signals)', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          score: 0.8,
          subject: 'Phone Screen with Hiring Manager',
        })]),
        calendarService: mockCalendar([]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('Phone Interview');
    });

    it('email-only suggestions sort by date alongside cross-referenced ones', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg1', senderDomain: 'a.com', extractedDate: '2025-01-25', score: 0.8 }),
          makeEmailResult({ messageId: 'msg2', senderDomain: 'b.com', extractedDate: '2025-01-20', score: 0.8 }),
        ]),
        calendarService: mockCalendar([
          // Only msg1 matches a calendar event (by domain)
          makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@a.com', date: '2025-01-25', time: '10:00', startDateTime: '2025-01-25T10:00:00Z', endDateTime: '2025-01-25T11:00:00Z' }),
        ]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      expect(suggestions.length).toBe(2);
      // msg2 (email-only, date 2025-01-20) comes before msg1 (cross-ref, date 2025-01-25)
      expect(suggestions[0].date).toBe('2025-01-20');
      expect(suggestions[0].source).toBe('gmail');
      expect(suggestions[1].date).toBe('2025-01-25');
      expect(suggestions[1].source).toBe('gmail+calendar');
    });

    it('uses extractedDuration from email when available', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          score: 0.8,
          extractedDate: '2025-02-10',
          extractedTime: '11:30',
          extractedDuration: 15,
        })]),
        calendarService: mockCalendar([]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();

      expect(s.source).toBe('gmail');
      expect(s.time).toBe('11:30');
      expect(s.duration).toBe(15);
    });

    it('email-only confidence is always below cross-reference minimum', async () => {
      // Even a perfect email score (1.0) yields confidence 0.6, which is
      // below the cross-reference minimum (0.5 for date-only match in practice
      // always combined with other signals producing >= 0.65).
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ score: 1.0 })]),
        calendarService: mockCalendar([]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.confidence).toBeLessThanOrEqual(0.6);
    });
  });

  describe('detect — calendar-only suggestions', () => {
    it('produces a calendar-only suggestion with correct shape', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({
          score: 0.7,
          date: '2025-03-01',
          time: '12:30',
          startDateTime: '2025-03-01T12:30:00Z',
          endDateTime: '2025-03-01T12:45:00Z',
          summary: 'Your phone interview with Kela',
          companyName: 'kela',
        })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();

      expect(s.id).toBe('suggestion_calendar_evt1');
      expect(s.source).toBe('calendar');
      expect(s.confidence).toBeCloseTo(0.42); // 0.7 * 0.6
      expect(s.emailMessageId).toBe('');
      expect(s.calendarEventId).toBe('evt1');
      expect(s.date).toBe('2025-03-01');
      expect(s.time).toBe('12:30');
      expect(s.duration).toBe(15);
      expect(s.companyName).toBe('Kela');
      expect(s.subject).toBe('Your phone interview with Kela');
      expect(typeof s.detectedAt).toBe('string');
    });

    it('skips calendar-only suggestions when event score is below threshold', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({ score: 0.3 })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('excludes dismissed calendar-only suggestions', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({ score: 0.7 })]),
        tokenStore: mockTokenStore(['suggestion_calendar_evt1']),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('does NOT produce calendar-only suggestion when event already matched an email', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult({ score: 0.7 })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      expect(suggestions.length).toBe(1);
      expect(suggestions[0].source).toBe('gmail+calendar');
    });

    it('guesses "Phone Interview" from calendar summary', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({
          score: 0.7,
          summary: 'Phone interview with Kela',
        })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('Phone Interview');
    });

    it('guesses "Video Interview" when calendar event has video link', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({
          score: 0.7,
          summary: 'Interview with Acme',
          hasVideoLink: true,
        })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('Video Interview');
    });

    it('guesses "In-Person Interview" when calendar event has physical location', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({
          score: 0.7,
          summary: 'Interview with Acme',
          location: '123 Main St, Tel Aviv',
        })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('In-Person Interview');
    });

    it('calendar-only confidence is always below cross-reference minimum', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({ score: 1.0 })]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.confidence).toBeLessThanOrEqual(0.6);
    });
  });

  describe('detect — sorting by date (soonest first)', () => {
    it('sorts suggestions by date ascending (soonest interview first)', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg1', senderDomain: 'a.com', extractedDate: '2025-01-25' }),
          makeEmailResult({ messageId: 'msg2', senderDomain: 'b.com', extractedDate: '2025-01-20' }),
          makeEmailResult({ messageId: 'msg3', senderDomain: 'c.com', extractedDate: '2025-01-22' }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@a.com', date: '2025-01-25', time: '10:00', startDateTime: '2025-01-25T10:00:00Z', endDateTime: '2025-01-25T11:00:00Z' }),
          makeCalendarResult({ eventId: 'evt2', organizerEmail: 'hr@b.com', date: '2025-01-20', time: '14:00', startDateTime: '2025-01-20T14:00:00Z', endDateTime: '2025-01-20T15:00:00Z' }),
          makeCalendarResult({ eventId: 'evt3', organizerEmail: 'hr@c.com', date: '2025-01-22', time: '09:00', startDateTime: '2025-01-22T09:00:00Z', endDateTime: '2025-01-22T10:00:00Z' }),
        ]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      expect(suggestions.length).toBe(3);
      expect(suggestions[0].date).toBe('2025-01-20');
      expect(suggestions[1].date).toBe('2025-01-22');
      expect(suggestions[2].date).toBe('2025-01-25');
    });

    it('pushes suggestions without a date to the bottom', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg1', senderDomain: 'a.com', extractedDate: '' }),
          makeEmailResult({ messageId: 'msg2', senderDomain: 'b.com', extractedDate: '2025-01-20' }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@a.com', date: '', time: '' }),
          makeCalendarResult({ eventId: 'evt2', organizerEmail: 'hr@b.com', date: '2025-01-20', time: '14:00', startDateTime: '2025-01-20T14:00:00Z', endDateTime: '2025-01-20T15:00:00Z' }),
        ]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      expect(suggestions.length).toBe(2);
      expect(suggestions[0].date).toBe('2025-01-20');
      expect(suggestions[1].date).toBe('');
    });

    it('sorts by time ascending when dates are equal', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg1', senderDomain: 'a.com', extractedDate: '2025-01-20' }),
          makeEmailResult({ messageId: 'msg2', senderDomain: 'b.com', extractedDate: '2025-01-20' }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@a.com', date: '2025-01-20', time: '14:00', startDateTime: '2025-01-20T14:00:00Z', endDateTime: '2025-01-20T15:00:00Z' }),
          makeCalendarResult({ eventId: 'evt2', organizerEmail: 'hr@b.com', date: '2025-01-20', time: '09:00', startDateTime: '2025-01-20T09:00:00Z', endDateTime: '2025-01-20T10:00:00Z' }),
        ]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      expect(suggestions.length).toBe(2);
      expect(suggestions[0].time).toBe('09:00');
      expect(suggestions[1].time).toBe('14:00');
    });

    it('picks the best-matching event when multiple events match the same email', async () => {
      // Two events on the same date, but only the second one has a time matching the email
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({
            messageId: 'msg1',
            senderDomain: 'other.com',
            extractedDate: '2025-01-20',
            extractedTime: '15:00',
            extractedDuration: 20,
          }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({
            eventId: 'wrong',
            organizerEmail: 'hr@different.com',
            date: '2025-01-20',
            time: '10:00',
            startDateTime: '2025-01-20T10:00:00Z',
            endDateTime: '2025-01-20T11:30:00Z',
          }),
          makeCalendarResult({
            eventId: 'correct',
            organizerEmail: 'hr@different.com',
            date: '2025-01-20',
            time: '15:00',
            startDateTime: '2025-01-20T15:00:00Z',
            endDateTime: '2025-01-20T15:20:00Z',
          }),
        ]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      expect(suggestions.length).toBe(1);
      expect(suggestions[0].calendarEventId).toBe('correct');
      expect(suggestions[0].time).toBe('15:00');
      expect(suggestions[0].duration).toBe(20);
    });

    it('prefers email-extracted duration over calendar slot duration', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({
            extractedDuration: 20,
          }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({
            startDateTime: '2025-01-20T14:00:00Z',
            endDateTime: '2025-01-20T15:30:00Z',
          }),
        ]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      // Email says 20 min, calendar slot is 90 min — email wins
      expect(s.duration).toBe(20);
    });

    it('falls back to calendar duration when email has no extractedDuration', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({
            extractedDuration: null,
          }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({
            startDateTime: '2025-01-20T14:00:00Z',
            endDateTime: '2025-01-20T15:00:00Z',
          }),
        ]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.duration).toBe(60);
    });

    it('breaks date+time ties by confidence descending', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg1', senderDomain: 'a.com', extractedDate: '2025-01-20' }),
          makeEmailResult({ messageId: 'msg2', senderDomain: 'b.com', extractedDate: '2025-01-20', companyName: 'b' }),
        ]),
        calendarService: mockCalendar([
          // evt1 matches by domain only (confidence ~0.7)
          makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@a.com', date: '2025-01-20', time: '14:00', startDateTime: '2025-01-20T14:00:00Z', endDateTime: '2025-01-20T15:00:00Z' }),
          // evt2 matches by domain + date (confidence ~0.95)
          makeCalendarResult({ eventId: 'evt2', organizerEmail: 'hr@b.com', date: '2025-01-20', time: '14:00', startDateTime: '2025-01-20T14:00:00Z', endDateTime: '2025-01-20T15:00:00Z', companyName: 'b' }),
        ]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      expect(suggestions.length).toBe(2);
      // Higher confidence first when date+time are equal
      expect(suggestions[0].confidence).toBeGreaterThanOrEqual(suggestions[1].confidence);
    });

    it('best-match skips dismissed suggestions and picks next best', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({
            messageId: 'msg1',
            senderDomain: 'other.com',
            extractedDate: '2025-01-20',
            extractedTime: '15:00',
          }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({
            eventId: 'evtA',
            organizerEmail: 'hr@different.com',
            date: '2025-01-20',
            time: '15:00',
          }),
          makeCalendarResult({
            eventId: 'evtB',
            organizerEmail: 'hr@different.com',
            date: '2025-01-20',
            time: '10:00',
          }),
        ]),
        // Best match (msg1 + evtA) is dismissed → falls back to evtB
        tokenStore: mockTokenStore(['suggestion_msg1_evtA']),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      expect(suggestions.length).toBe(1);
      expect(suggestions[0].calendarEventId).toBe('evtB');
    });

    it('each email matches at most one event (no double-counting)', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg1', extractedDate: '2025-01-20', extractedTime: '14:00' }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({ eventId: 'evt1', date: '2025-01-20', time: '14:00' }),
          makeCalendarResult({ eventId: 'evt2', date: '2025-01-20', time: '14:00' }),
        ]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      // Only one suggestion per email, even though two events match
      expect(suggestions.length).toBe(1);
    });

    it('matched events are not reused for other emails', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg1', senderDomain: 'google.com', extractedDate: '2025-01-20', extractedTime: '14:00' }),
          makeEmailResult({ messageId: 'msg2', senderDomain: 'other.com', extractedDate: '2025-01-20', extractedTime: '14:00' }),
        ]),
        calendarService: mockCalendar([
          // Only one event matching both emails by date+time
          makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@google.com', date: '2025-01-20', time: '14:00' }),
        ]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      // evt1 gets consumed by msg1 (domain+date+time match); msg2 has no event left
      const crossRef = suggestions.filter(s => s.source === 'gmail+calendar');
      expect(crossRef.length).toBe(1);
      expect(crossRef[0].emailMessageId).toBe('msg1');
    });

    it('uses email-extracted company name from text over scheduling platform domain', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({
            messageId: 'msg1',
            senderDomain: 'comeet-notifications.com',
            companyName: 'dream',
            extractedDate: '2025-01-20',
          }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({
            eventId: 'evt1',
            organizerEmail: 'noreply@group.calendar.google.com',
            companyName: 'dream',
            date: '2025-01-20',
          }),
        ]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.companyName).toBe('Dream');
    });

    it('zero-duration email (extractedDuration = 0) still falls back to calendar', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ extractedDuration: 0 }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({
            startDateTime: '2025-01-20T14:00:00Z',
            endDateTime: '2025-01-20T14:45:00Z',
          }),
        ]),
        tokenStore: mockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      // 0 is falsy → falls back to calendar duration (45 min)
      expect(s.duration).toBe(45);
    });
  });
});
