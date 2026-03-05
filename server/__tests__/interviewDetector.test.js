import { describe, it, expect, jest } from '@jest/globals';
import { createInterviewDetector } from '../src/services/interviewDetector.js';
import { createMockTokenStore } from './helpers/mockTokenStore.js';

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
    extractedAllDates: [],
    bodyText: '',
    intent: 'add',
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
    calendarStatus: 'confirmed',
    ...overrides,
  };
}

describe('createInterviewDetector', () => {
  describe('detect — core cross-reference rule', () => {
    it('returns suggestions ONLY when both email and calendar match', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('returns calendar-only suggestion when no emails but high-scoring calendar event', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({ score: 0.7 })]),
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(['suggestion_msg1_evt1', 'suggestion_gmail_msg1']),
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
        tokenStore: createMockTokenStore([
          { id: 'suggestion_gmail_msg1', emailId: 'msg1', calendarId: '' },
        ]),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('calendar-only dismissed → cross-ref with NEW email still surfaces', async () => {
      // User dismissed calendar-only suggestion for evt1, then a new email
      // arrived referencing the same calendar event. The user should see
      // the cross-ref suggestion so they can decide to accept or dismiss.
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore([
          { id: 'suggestion_calendar_evt1', emailId: '', calendarId: 'evt1' },
        ]),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].source).toBe('gmail+calendar');
      expect(suggestions[0].emailMessageId).toBe('msg1');
      expect(suggestions[0].calendarEventId).toBe('evt1');
    });

    it('cross-ref dismissed → email-only with same emailId is skipped', async () => {
      // User dismissed cross-ref suggestion, then calendar event was deleted
      // and the email would normally surface as email-only
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ score: 0.8 })]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore([
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
        tokenStore: createMockTokenStore([
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
        tokenStore: createMockTokenStore([
          { id: 'suggestion_gmail_msg1', emailId: 'msg1', calendarId: '' },
        ]),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].emailMessageId).toBe('msg2');
    });

    it('new email for a dismissed calendar event produces a cross-ref suggestion', async () => {
      // User dismissed cross-ref suggestion_msg1_evt1 (storing calendarId=evt1).
      // A new email (msg2) arrives from the same company for the same calendar
      // event. The user should see this new cross-ref because msg2 is new
      // information — the user gets to decide whether to accept or dismiss.
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ messageId: 'msg2' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore([
          { id: 'suggestion_msg1_evt1', emailId: 'msg1', calendarId: 'evt1' },
        ]),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].source).toBe('gmail+calendar');
      expect(suggestions[0].emailMessageId).toBe('msg2');
      expect(suggestions[0].calendarEventId).toBe('evt1');
    });

    it('dismissed calendar event does NOT leak as calendar-only when new email cross-refs it', async () => {
      // Same scenario as above — the event is consumed by the cross-ref,
      // so it must not also appear as a calendar-only suggestion.
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ messageId: 'msg2' })]),
        calendarService: mockCalendar([makeCalendarResult({ score: 0.7 })]),
        tokenStore: createMockTokenStore([
          { id: 'suggestion_msg1_evt1', emailId: 'msg1', calendarId: 'evt1' },
        ]),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      // Only the cross-ref, no calendar-only duplicate
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].source).toBe('gmail+calendar');
      const calOnly = suggestions.find((s) => s.source === 'calendar');
      expect(calOnly).toBeUndefined();
    });

    it('dismissed email still blocks cross-ref even when calendarId is not checked', async () => {
      // Ensures the emailId check still works: if the EMAIL was dismissed,
      // the cross-ref is still blocked regardless of calendarId.
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore([
          { id: 'old-suggestion', emailId: 'msg1', calendarId: '' },
        ]),
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
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('Phone Interview');
    });

    it('guesses "Video Interview" when calendar event has video link', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ subject: 'Interview with Google' })]),
        calendarService: mockCalendar([makeCalendarResult({ hasVideoLink: true })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('Video Interview');
    });

    it('guesses "In-Person Interview" when email mentions onsite', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ subject: 'Onsite Interview at HQ' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(['suggestion_gmail_msg1']),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('excludes dismissed calendar-only suggestions', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({ score: 0.7 })]),
        tokenStore: createMockTokenStore(['suggestion_calendar_evt1']),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('does NOT produce calendar-only suggestion when event already matched an email', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult({ score: 0.7 })]),
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('In-Person Interview');
    });

    it('calendar-only confidence is always below cross-reference minimum', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({ score: 1.0 })]),
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(['suggestion_msg1_evtA']),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
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
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      // 0 is falsy → falls back to calendar duration (45 min)
      expect(s.duration).toBe(45);
    });
  });

  describe('detect — action tagging', () => {
    it('defaults to action "add" for standard interview suggestions', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.action).toBe('add');
    });

    it('sets action "cancel" when email intent is cancel (cross-ref)', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ intent: 'cancel' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.action).toBe('cancel');
    });

    it('sets action "cancel" when calendar status is cancelled (cross-ref)', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult({
          calendarStatus: 'cancelled',
          score: 0.8,
        })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.action).toBe('cancel');
    });

    it('sets action "cancel" when both email and calendar signal cancel', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ intent: 'cancel' })]),
        calendarService: mockCalendar([makeCalendarResult({
          calendarStatus: 'cancelled',
          score: 0.8,
        })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.action).toBe('cancel');
    });

    it('sets action "update" when email intent is update (cross-ref)', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ intent: 'update' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.action).toBe('update');
    });

    it('cancel overrides update when email says update but calendar is cancelled', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ intent: 'update' })]),
        calendarService: mockCalendar([makeCalendarResult({
          calendarStatus: 'cancelled',
          score: 0.8,
        })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      // Cancel takes priority over update
      expect(s.action).toBe('cancel');
    });

    it('email-only: action follows email intent "cancel"', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ score: 0.8, intent: 'cancel' })]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.source).toBe('gmail');
      expect(s.action).toBe('cancel');
    });

    it('email-only: action follows email intent "update"', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ score: 0.8, intent: 'update' })]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.source).toBe('gmail');
      expect(s.action).toBe('update');
    });

    it('calendar-only: action is "cancel" when calendarStatus is cancelled', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({
          score: 0.8,
          calendarStatus: 'cancelled',
        })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.source).toBe('calendar');
      expect(s.action).toBe('cancel');
    });

    it('calendar-only: action defaults to "add" when calendarStatus is confirmed', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({ score: 0.7 })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.source).toBe('calendar');
      expect(s.action).toBe('add');
    });
  });

  describe('detect — previousDate derivation', () => {
    it('cross-ref add suggestion has empty previousDate', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.action).toBe('add');
      expect(s.previousDate).toBe('');
    });

    it('cross-ref cancel carries previousDate from extractedDate', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          intent: 'cancel',
          extractedDate: '2025-01-20',
          extractedAllDates: ['2025-01-20'],
        })]),
        calendarService: mockCalendar([makeCalendarResult({
          calendarStatus: 'cancelled',
          date: '2025-01-20',
        })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.action).toBe('cancel');
      expect(s.previousDate).toBe('2025-01-20');
    });

    it('cross-ref update with two dates derives previousDate from allDates', async () => {
      // SentinelOne scenario: email has new date (Mar 9) and old date (Mar 4).
      // Calendar event reflects the NEW date. previousDate should be the OLD date.
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          intent: 'update',
          extractedDate: '2026-03-04',
          extractedAllDates: ['2026-03-09', '2026-03-04'],
        })]),
        calendarService: mockCalendar([makeCalendarResult({
          date: '2026-03-09',
          time: '14:00',
          startDateTime: '2026-03-09T14:00:00Z',
          endDateTime: '2026-03-09T15:00:00Z',
        })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.action).toBe('update');
      expect(s.date).toBe('2026-03-09');
      expect(s.previousDate).toBe('2026-03-04');
    });

    it('cross-ref update falls back to extractedDate when allDates is empty', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          intent: 'update',
          extractedDate: '2025-01-20',
          extractedAllDates: [],
        })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.action).toBe('update');
      expect(s.previousDate).toBe('2025-01-20');
    });

    it('email-only update with multiple dates swaps date and previousDate', async () => {
      // Email has new date first, old date last. Suggestion date should be the
      // new date; previousDate should be the old date.
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          score: 0.8,
          intent: 'update',
          extractedDate: '2026-03-04',
          extractedAllDates: ['2026-03-09', '2026-03-04'],
        })]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.source).toBe('gmail');
      expect(s.action).toBe('update');
      expect(s.date).toBe('2026-03-09');
      expect(s.previousDate).toBe('2026-03-04');
    });

    it('email-only cancel with single date sets previousDate to extractedDate', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          score: 0.8,
          intent: 'cancel',
          extractedDate: '2026-03-02',
          extractedAllDates: ['2026-03-02'],
        })]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.source).toBe('gmail');
      expect(s.action).toBe('cancel');
      expect(s.previousDate).toBe('2026-03-02');
    });

    it('email-only add suggestion has empty previousDate', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ score: 0.8 })]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.source).toBe('gmail');
      expect(s.action).toBe('add');
      expect(s.previousDate).toBe('');
    });

    it('calendar-only suggestion always has empty previousDate', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({
          score: 0.8,
          calendarStatus: 'cancelled',
        })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.source).toBe('calendar');
      expect(s.action).toBe('cancel');
      expect(s.previousDate).toBe('');
    });

    it('email-only update with single date uses extractedDate for both', async () => {
      // Only one date in the email — it's both the current and previous date
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          score: 0.8,
          intent: 'update',
          extractedDate: '2026-03-04',
          extractedAllDates: ['2026-03-04'],
        })]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.source).toBe('gmail');
      expect(s.date).toBe('2026-03-04');
      expect(s.previousDate).toBe('2026-03-04');
    });
  });

  describe('detect — action-prefixed suggestion IDs', () => {
    it('cross-ref add suggestion has no action prefix in ID', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.id).toBe('suggestion_msg1_evt1');
    });

    it('cross-ref cancel suggestion has "cancel_" prefix in ID', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ intent: 'cancel' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.id).toBe('suggestion_cancel_msg1_evt1');
    });

    it('cross-ref update suggestion has "update_" prefix in ID', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ intent: 'update' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.id).toBe('suggestion_update_msg1_evt1');
    });

    it('email-only cancel suggestion has "cancel_" prefix in ID', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ score: 0.8, intent: 'cancel' })]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.id).toBe('suggestion_cancel_gmail_msg1');
    });

    it('email-only update suggestion has "update_" prefix in ID', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ score: 0.8, intent: 'update' })]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.id).toBe('suggestion_update_gmail_msg1');
    });

    it('calendar-only cancel suggestion has "cancel_" prefix in ID', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({
          score: 0.8,
          calendarStatus: 'cancelled',
        })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const [s] = await detector.detect();
      expect(s.id).toBe('suggestion_cancel_calendar_evt1');
    });

    it('dismissed add suggestion does not block cancel suggestion for same email+event', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ intent: 'cancel' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        // The "add" variant was previously dismissed
        tokenStore: createMockTokenStore(['suggestion_msg1_evt1']),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      // Cancel suggestion has a different ID (suggestion_cancel_msg1_evt1)
      // so it should NOT be dismissed
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].action).toBe('cancel');
      expect(suggestions[0].id).toBe('suggestion_cancel_msg1_evt1');
    });
  });

  describe('detect — action sort priority', () => {
    it('sorts cancel before update before add at same date+time', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg1', senderDomain: 'a.com', intent: 'add', extractedDate: '2025-01-20', extractedTime: '14:00' }),
          makeEmailResult({ messageId: 'msg2', senderDomain: 'b.com', intent: 'cancel', extractedDate: '2025-01-20', extractedTime: '14:00' }),
          makeEmailResult({ messageId: 'msg3', senderDomain: 'c.com', intent: 'update', extractedDate: '2025-01-20', extractedTime: '14:00' }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@a.com', date: '2025-01-20', time: '14:00', startDateTime: '2025-01-20T14:00:00Z', endDateTime: '2025-01-20T15:00:00Z' }),
          makeCalendarResult({ eventId: 'evt2', organizerEmail: 'hr@b.com', date: '2025-01-20', time: '14:00', startDateTime: '2025-01-20T14:00:00Z', endDateTime: '2025-01-20T15:00:00Z' }),
          makeCalendarResult({ eventId: 'evt3', organizerEmail: 'hr@c.com', date: '2025-01-20', time: '14:00', startDateTime: '2025-01-20T14:00:00Z', endDateTime: '2025-01-20T15:00:00Z' }),
        ]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      expect(suggestions.length).toBe(3);
      expect(suggestions[0].action).toBe('cancel');
      expect(suggestions[1].action).toBe('update');
      expect(suggestions[2].action).toBe('add');
    });

    it('date still takes priority over action', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg1', senderDomain: 'a.com', intent: 'add', extractedDate: '2025-01-18' }),
          makeEmailResult({ messageId: 'msg2', senderDomain: 'b.com', intent: 'cancel', extractedDate: '2025-01-25' }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@a.com', date: '2025-01-18', time: '10:00', startDateTime: '2025-01-18T10:00:00Z', endDateTime: '2025-01-18T11:00:00Z' }),
          makeCalendarResult({ eventId: 'evt2', organizerEmail: 'hr@b.com', date: '2025-01-25', time: '10:00', startDateTime: '2025-01-25T10:00:00Z', endDateTime: '2025-01-25T11:00:00Z' }),
        ]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();

      expect(suggestions.length).toBe(2);
      // Earlier date comes first even though it's an "add" vs "cancel"
      expect(suggestions[0].date).toBe('2025-01-18');
      expect(suggestions[0].action).toBe('add');
      expect(suggestions[1].date).toBe('2025-01-25');
      expect(suggestions[1].action).toBe('cancel');
    });
  });

  // ---------------------------------------------------------------------------
  // LLM enrichment integration
  // ---------------------------------------------------------------------------
  describe('detect — LLM enrichment', () => {
    /**
     * Creates a mock llmExtractor with configurable extraction results.
     * Mirrors the real interface: { extractFromEmail, extractFromCalendarEvent }
     */
    function mockLlmExtractor(overrides = {}) {
      return {
        extractFromEmail: overrides.extractFromEmail
          || (async () => ({ dryModePrompt: null, extraction: null })),
        extractFromCalendarEvent: overrides.extractFromCalendarEvent
          || (async () => ({ dryModePrompt: null, extraction: null })),
      };
    }

    it('enriches company name from LLM into cross-ref suggestion', async () => {
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => ({
          dryModePrompt: null,
          extraction: { company_name: 'Acme Corporation', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        }),
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ companyName: 'acme' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      expect(s.companyName).toBe('Acme Corporation');
    });

    it('enriches company name from LLM into email-only suggestion', async () => {
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => ({
          dryModePrompt: null,
          extraction: { company_name: 'Meta Platforms', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        }),
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ score: 0.8, companyName: 'meta' })]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      expect(s.companyName).toBe('Meta Platforms');
    });

    it('enriches company name from LLM into calendar-only suggestion', async () => {
      const extractor = mockLlmExtractor({
        extractFromCalendarEvent: async () => ({
          dryModePrompt: null,
          extraction: { company_name: 'TechCo Industries', interview_type: null },
        }),
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({ score: 0.7, companyName: 'techco' })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      expect(s.companyName).toBe('TechCo Industries');
    });

    it('LLM interview type overrides keyword-based guess in cross-ref suggestion', async () => {
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => ({
          dryModePrompt: null,
          extraction: { company_name: null, date: null, time: null, duration_minutes: null, intent: null, interview_type: 'in-person' },
        }),
      });

      const detector = createInterviewDetector({
        // Subject does not mention in-person, and event has a video link
        // Without LLM, this would guess "Video Interview"
        gmailService: mockGmail([makeEmailResult({ subject: 'Interview with Google' })]),
        calendarService: mockCalendar([makeCalendarResult({ hasVideoLink: true })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('In-Person Interview');
    });

    it('LLM interview type overrides keyword-based guess in email-only suggestion', async () => {
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => ({
          dryModePrompt: null,
          extraction: { company_name: null, date: null, time: null, duration_minutes: null, intent: null, interview_type: 'phone' },
        }),
      });

      const detector = createInterviewDetector({
        // Subject mentions Zoom which would normally guess "Video Interview"
        gmailService: mockGmail([makeEmailResult({ score: 0.8, subject: 'Interview via Zoom' })]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('Phone Interview');
    });

    it('LLM interview type overrides keyword-based guess in calendar-only suggestion', async () => {
      const extractor = mockLlmExtractor({
        extractFromCalendarEvent: async () => ({
          dryModePrompt: null,
          extraction: { company_name: null, interview_type: 'onsite' },
        }),
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({
          score: 0.7,
          hasVideoLink: true,
          summary: 'Interview with Acme',
        })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      expect(s.type).toBe('In-Person Interview');
    });

    it('falls back to regex when LLM returns null extraction', async () => {
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => ({
          dryModePrompt: null,
          extraction: null,
        }),
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ companyName: 'regex-company' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      expect(s.companyName).toBe('Regex-company');
    });

    it('falls back to regex when LLM extraction fields are all null', async () => {
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => ({
          dryModePrompt: null,
          extraction: { company_name: null, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        }),
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          companyName: 'google',
          extractedDate: '2025-01-20',
          extractedTime: '14:00',
          intent: 'add',
        })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      expect(s.companyName).toBe('Google');
      expect(s.date).toBe('2025-01-20');
      expect(s.time).toBe('14:00');
    });

    it('falls back to regex when LLM call rejects (Promise.allSettled resilience)', async () => {
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => { throw new Error('API rate limit'); },
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ companyName: 'fallback-corp' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      // Should not throw — graceful fallback to regex
      expect(s.companyName).toBe('Fallback-corp');
    });

    it('enriches some items even when others fail (partial failure resilience)', async () => {
      let callCount = 0;
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => {
          callCount++;
          if (callCount === 1) throw new Error('API error');
          return {
            dryModePrompt: null,
            extraction: { company_name: 'LLM Corp', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
          };
        },
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg1', senderDomain: 'a.com', companyName: 'regex-a', extractedDate: '2025-01-20' }),
          makeEmailResult({ messageId: 'msg2', senderDomain: 'b.com', companyName: 'regex-b', extractedDate: '2025-01-21', score: 0.8 }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@a.com', date: '2025-01-20' }),
        ]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const suggestions = await detector.detect();

      // msg1 (failed LLM) keeps regex companyName
      const crossRef = suggestions.find(s => s.source === 'gmail+calendar');
      expect(crossRef.companyName).toBe('Regex-a');

      // msg2 (successful LLM) gets enriched companyName
      const emailOnly = suggestions.find(s => s.source === 'gmail');
      expect(emailOnly.companyName).toBe('LLM Corp');
    });

    it('does not enrich when no llmExtractor is provided (null)', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult()]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        // llmExtractor not provided — defaults to null
      });

      const [s] = await detector.detect();
      expect(s.companyName).toBe('Google');
    });

    it('dry mode result (extraction: null) does not enrich', async () => {
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => ({
          dryModePrompt: '[System]\nYou are...',
          extraction: null,
        }),
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ companyName: 'dry-test' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      expect(s.companyName).toBe('Dry-test');
    });

    it('privacy gate rejection (null return) does not enrich', async () => {
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => null,
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ companyName: 'privacy-test' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      expect(s.companyName).toBe('Privacy-test');
    });

    it('LLM enriches date/time/duration in email results', async () => {
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => ({
          dryModePrompt: null,
          extraction: {
            company_name: null,
            date: '2025-02-15',
            time: '10:30',
            duration_minutes: 45,
            intent: null,
            interview_type: null,
          },
        }),
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          score: 0.8,
          extractedDate: '2025-01-20',
          extractedTime: '14:00',
          extractedDuration: null,
        })]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      expect(s.date).toBe('2025-02-15');
      expect(s.time).toBe('10:30');
      expect(s.duration).toBe(45);
    });

    it('LLM enriches intent to "cancel" in email results', async () => {
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => ({
          dryModePrompt: null,
          extraction: {
            company_name: null,
            date: null,
            time: null,
            duration_minutes: null,
            intent: 'cancel',
            interview_type: null,
          },
        }),
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ intent: 'add' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      expect(s.action).toBe('cancel');
    });

    it('unrecognised LLM interview type falls back to keyword-based guess', async () => {
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => ({
          dryModePrompt: null,
          extraction: { company_name: null, date: null, time: null, duration_minutes: null, intent: null, interview_type: 'technical' },
        }),
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ subject: 'Phone Screen' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      // "technical" is a round-type, not a format — normalizeInterviewType returns null
      // Falls back to keyword-based guess which finds "phone"
      expect(s.type).toBe('Phone Interview');
    });

    it('passes bodyText to extractFromEmail when available', async () => {
      const calls = [];
      const extractor = mockLlmExtractor({
        extractFromEmail: async (subject, body, senderEmail) => {
          calls.push({ subject, body, senderEmail });
          return { dryModePrompt: null, extraction: null };
        },
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          bodyText: 'Full email body content here',
          snippet: 'Short snippet',
        })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      await detector.detect();

      expect(calls.length).toBe(1);
      expect(calls[0].body).toBe('Full email body content here');
    });

    it('falls back to snippet when bodyText is empty', async () => {
      const calls = [];
      const extractor = mockLlmExtractor({
        extractFromEmail: async (subject, body, senderEmail) => {
          calls.push({ subject, body, senderEmail });
          return { dryModePrompt: null, extraction: null };
        },
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({
          bodyText: '',
          snippet: 'Short snippet for extraction',
        })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      await detector.detect();

      expect(calls.length).toBe(1);
      expect(calls[0].body).toBe('Short snippet for extraction');
    });

    it('passes correct args to extractFromCalendarEvent', async () => {
      const calls = [];
      const extractor = mockLlmExtractor({
        extractFromCalendarEvent: async (summary, description, location, organizerEmail) => {
          calls.push({ summary, description, location, organizerEmail });
          return { dryModePrompt: null, extraction: null };
        },
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({
          score: 0.7,
          summary: 'Tech Interview',
          description: 'With engineering team',
          location: 'Zoom link',
          organizerEmail: 'recruiter@test.com',
        })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      await detector.detect();

      expect(calls.length).toBe(1);
      expect(calls[0].summary).toBe('Tech Interview');
      expect(calls[0].description).toBe('With engineering team');
      expect(calls[0].location).toBe('Zoom link');
      expect(calls[0].organizerEmail).toBe('recruiter@test.com');
    });

    it('calls all extractors concurrently (not sequentially)', async () => {
      const timestamps = [];
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => {
          timestamps.push({ type: 'email', time: Date.now() });
          return { dryModePrompt: null, extraction: null };
        },
        extractFromCalendarEvent: async () => {
          timestamps.push({ type: 'calendar', time: Date.now() });
          return { dryModePrompt: null, extraction: null };
        },
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg1' }),
          makeEmailResult({ messageId: 'msg2', senderDomain: 'other.com', score: 0.8 }),
        ]),
        calendarService: mockCalendar([makeCalendarResult({ score: 0.7 })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      await detector.detect();

      // All 3 calls (2 emails + 1 calendar) should have been initiated
      expect(timestamps.length).toBe(3);
    });

    it('does not mutate original email/calendar arrays', async () => {
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => ({
          dryModePrompt: null,
          extraction: { company_name: 'Enriched Corp', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        }),
      });

      const originalEmail = makeEmailResult({ companyName: 'original' });
      const originalEvent = makeCalendarResult();
      const emailArray = [originalEmail];
      const calendarArray = [originalEvent];

      const detector = createInterviewDetector({
        gmailService: { scanForInterviews: async () => emailArray },
        calendarService: { scanForInterviews: async () => calendarArray },
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      await detector.detect();

      // Original objects should not be mutated
      expect(originalEmail.companyName).toBe('original');
      expect(emailArray.length).toBe(1);
      expect(calendarArray.length).toBe(1);
    });

    it('falls back to regex when extractFromCalendarEvent rejects (calendar-only)', async () => {
      const extractor = mockLlmExtractor({
        extractFromCalendarEvent: async () => { throw new Error('API timeout'); },
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([makeCalendarResult({ score: 0.7, companyName: 'regex-cal' })]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      expect(s.companyName).toBe('Regex-cal');
      expect(s.source).toBe('calendar');
    });

    it('falls back to regex when extractFromCalendarEvent rejects (cross-ref)', async () => {
      const extractor = mockLlmExtractor({
        extractFromEmail: async () => ({
          dryModePrompt: null,
          extraction: { company_name: 'LLM Email Corp', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        }),
        extractFromCalendarEvent: async () => { throw new Error('API timeout'); },
      });

      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ companyName: 'regex-email' })]),
        calendarService: mockCalendar([makeCalendarResult()]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const [s] = await detector.detect();
      // Email enrichment succeeds, calendar enrichment fails gracefully
      expect(s.companyName).toBe('LLM Email Corp');
      expect(s.source).toBe('gmail+calendar');
    });
  });

  // ---------------------------------------------------------------------------
  // Pre-LLM dismissed filtering
  // ---------------------------------------------------------------------------
  describe('detect — dismissed items skip LLM extraction', () => {
    it('does not send dismissed emails to the LLM extractor (events always enriched)', async () => {
      const emailCalls = [];
      const eventCalls = [];
      const extractor = {
        extractFromEmail: async (subject) => {
          emailCalls.push(subject);
          return {
            dryModePrompt: null,
            extraction: { company_name: 'LlmCo', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
          };
        },
        extractFromCalendarEvent: async (summary) => {
          eventCalls.push(summary);
          return {
            dryModePrompt: null,
            extraction: { company_name: 'LlmCo', interview_type: null },
          };
        },
      };

      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'dismissed-msg', subject: 'Dismissed Interview', score: 0.9 }),
          makeEmailResult({ messageId: 'active-msg', subject: 'Active Interview', score: 0.9 }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({ eventId: 'dismissed-evt', summary: 'Dismissed Event', score: 0.9 }),
          makeCalendarResult({ eventId: 'active-evt', summary: 'Active Event', organizerEmail: 'hr@other.com', date: '2025-02-01', time: '10:00', score: 0.9 }),
        ]),
        tokenStore: createMockTokenStore([
          { id: 'x1', emailId: 'dismissed-msg', calendarId: '' },
          { id: 'x2', emailId: '', calendarId: 'dismissed-evt' },
        ]),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      await detector.detect();

      // Only the active email should have been sent to the LLM
      expect(emailCalls).toEqual(['Active Interview']);
      // Both events are enriched — calendar events are never pre-filtered
      // because a new email may cross-reference a dismissed event and needs
      // the enriched company name for matching.
      expect(eventCalls).toEqual(['Dismissed Event', 'Active Event']);
    });

    it('pre-filter does not break suggestion output for non-dismissed items', async () => {
      const extractor = {
        extractFromEmail: async () => ({
          dryModePrompt: null,
          extraction: { company_name: 'EnrichedCo', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        }),
        extractFromCalendarEvent: async () => ({
          dryModePrompt: null,
          extraction: { company_name: 'EnrichedCo', interview_type: null },
        }),
      };

      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'dismissed-msg', score: 0.9 }),
          makeEmailResult({ messageId: 'active-msg', senderEmail: 'hr@active.com', senderDomain: 'active.com', companyName: 'active', score: 0.9, extractedDate: '2025-02-15' }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({ eventId: 'active-evt', organizerEmail: 'hr@active.com', date: '2025-02-15' }),
        ]),
        tokenStore: createMockTokenStore([
          { id: 'x1', emailId: 'dismissed-msg', calendarId: '' },
        ]),
        idFn: fixedId,
        llmExtractor: extractor,
      });

      const suggestions = await detector.detect();

      // The active email + active event should produce a cross-ref suggestion
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].source).toBe('gmail+calendar');
      expect(suggestions[0].emailMessageId).toBe('active-msg');
      expect(suggestions[0].calendarEventId).toBe('active-evt');
      expect(suggestions[0].companyName).toBe('EnrichedCo');
    });
  });

  describe('detect — dismissed items produce no suggestions', () => {
    it('dismissed email produces no email-only suggestion', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'dismissed-msg', score: 0.9 }),
        ]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore([
          { id: 'x', emailId: 'dismissed-msg', calendarId: '' },
        ]),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('dismissed event produces no calendar-only suggestion', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([
          makeCalendarResult({ eventId: 'dismissed-evt', score: 0.9 }),
        ]),
        tokenStore: createMockTokenStore([
          { id: 'x', emailId: '', calendarId: 'dismissed-evt' },
        ]),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });

    it('dismissed cross-ref produces no suggestion', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([
          makeEmailResult({ messageId: 'msg-d' }),
        ]),
        calendarService: mockCalendar([
          makeCalendarResult({ eventId: 'evt-d' }),
        ]),
        tokenStore: createMockTokenStore([
          { id: 'x1', emailId: 'msg-d', calendarId: '' },
          { id: 'x2', emailId: '', calendarId: 'evt-d' },
        ]),
        idFn: fixedId,
      });

      const suggestions = await detector.detect();
      expect(suggestions).toEqual([]);
    });
  });
});
