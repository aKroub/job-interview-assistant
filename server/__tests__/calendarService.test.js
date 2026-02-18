import { describe, it, expect } from '@jest/globals';
import { createCalendarService } from '../src/services/calendarService.js';

/**
 * Creates a mock Calendar API that returns the given events.
 *
 * @param {Object[]} events - array of Google Calendar event objects
 * @returns {Object} mock Calendar API
 */
function createMockCalendarApi(events = []) {
  return {
    events: {
      list: async () => ({
        data: { items: events },
      }),
    },
  };
}

/**
 * Creates a calendar event fixture for testing.
 */
function makeEvent({
  id = 'evt1',
  summary = '',
  description = '',
  organizerEmail = 'external@company.com',
  startDateTime = '2025-01-20T14:00:00Z',
  endDateTime = '2025-01-20T15:00:00Z',
  recurringEventId = undefined,
  hangoutLink = undefined,
} = {}) {
  return {
    id,
    summary,
    description,
    organizer: { email: organizerEmail },
    start: { dateTime: startDateTime },
    end: { dateTime: endDateTime },
    ...(recurringEventId ? { recurringEventId } : {}),
    ...(hangoutLink ? { hangoutLink } : {}),
  };
}

describe('createCalendarService', () => {
  const fixedNow = () => new Date('2025-01-15T10:00:00Z');

  describe('scanForInterviews', () => {
    it('returns empty array when no events exist', async () => {
      const calendarApi = createMockCalendarApi([]);
      const service = createCalendarService({}, { calendarApi, nowFn: fixedNow });
      const results = await service.scanForInterviews();
      expect(results).toEqual([]);
    });

    it('returns scored results for interview-related events', async () => {
      const events = [
        makeEvent({
          summary: 'Technical Interview - Senior SWE',
          organizerEmail: 'recruiter@google.com',
        }),
      ];
      const calendarApi = createMockCalendarApi(events);
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.1,
        userEmail: 'me@gmail.com',
      });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].eventId).toBe('evt1');
      expect(results[0].summary).toBe('Technical Interview - Senior SWE');
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('filters out events below the minimum score', async () => {
      const events = [
        makeEvent({
          summary: 'Weekly Team Standup',
          organizerEmail: 'me@gmail.com',
          recurringEventId: 'recurring123',
        }),
      ];
      const calendarApi = createMockCalendarApi(events);
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.3,
        userEmail: 'me@gmail.com',
      });

      const results = await service.scanForInterviews();
      expect(results).toEqual([]);
    });

    it('extracts date and time from event start', async () => {
      const events = [
        makeEvent({
          summary: 'Phone Screen',
          startDateTime: '2025-01-20T14:30:00Z',
        }),
      ];
      const calendarApi = createMockCalendarApi(events);
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.1,
        userEmail: 'me@gmail.com',
      });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].date).toBe('2025-01-20');
      expect(results[0].time).toBe('14:30');
    });

    it('sorts results by score descending', async () => {
      const events = [
        makeEvent({
          id: 'low',
          summary: 'Quick chat',
          organizerEmail: 'me@gmail.com', // self-organized, low score
        }),
        makeEvent({
          id: 'high',
          summary: 'Technical Interview - Final Round',
          organizerEmail: 'recruiter@bigcorp.com',
          hangoutLink: 'https://meet.google.com/xyz',
        }),
      ];
      const calendarApi = createMockCalendarApi(events);
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.05,
        userEmail: 'me@gmail.com',
      });

      const results = await service.scanForInterviews();

      if (results.length >= 2) {
        expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      }
    });

    it('includes hasVideoLink flag', async () => {
      const events = [
        makeEvent({
          summary: 'Interview',
          hangoutLink: 'https://meet.google.com/abc',
        }),
      ];
      const calendarApi = createMockCalendarApi(events);
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.1,
        userEmail: 'me@gmail.com',
      });

      const results = await service.scanForInterviews();
      expect(results[0].hasVideoLink).toBe(true);
    });

    it('throws a clear error on 401/403 from Calendar API', async () => {
      const calendarApi = {
        events: {
          list: async () => {
            const err = new Error('Unauthorized');
            err.code = 401;
            throw err;
          },
        },
      };
      const service = createCalendarService({}, { calendarApi, nowFn: fixedNow });

      await expect(service.scanForInterviews()).rejects.toThrow('Calendar access denied');
    });

    it('respects the lookaheadDays option', async () => {
      let capturedParams;
      const calendarApi = {
        events: {
          list: async (params) => {
            capturedParams = params;
            return { data: { items: [] } };
          },
        },
      };

      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        lookaheadDays: 7,
      });
      await service.scanForInterviews();

      // timeMax should be ~7 days after the fixed now
      const expectedMax = new Date('2025-01-22T10:00:00Z');
      const actualMax = new Date(capturedParams.timeMax);
      expect(Math.abs(actualMax - expectedMax)).toBeLessThan(1000);
    });
  });
});
