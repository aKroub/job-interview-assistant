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
  location = undefined,
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
    ...(location ? { location } : {}),
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
        getUserEmail: async () => 'me@gmail.com',
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
        getUserEmail: async () => 'me@gmail.com',
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
        getUserEmail: async () => 'me@gmail.com',
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
        getUserEmail: async () => 'me@gmail.com',
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
        getUserEmail: async () => 'me@gmail.com',
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

    it('uses getUserEmail for external organizer detection', async () => {
      const events = [
        makeEvent({
          summary: 'Technical Interview',
          organizerEmail: 'recruiter@company.com',
        }),
      ];
      const calendarApi = createMockCalendarApi(events);
      const getUserEmail = async () => 'me@otherdomain.com';
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.1,
        getUserEmail,
      });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      // Score should include external-organizer bonus
      expect(results[0].reasons).toContain('external-organizer');
    });

    it('includes companyName extracted from event summary', async () => {
      const events = [
        makeEvent({
          summary: 'Interview with Torq',
          organizerEmail: 'noreply@group.calendar.google.com',
        }),
      ];
      const calendarApi = createMockCalendarApi(events);
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.1,
        getUserEmail: async () => 'me@gmail.com',
      });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].companyName).toBe('torq');
    });

    it('includes location field from calendar event', async () => {
      const events = [
        makeEvent({
          summary: 'Interview with Torq',
          location: '3 HaMelacha St., Floor 10, Tel-Aviv',
          organizerEmail: 'recruiter@company.com',
        }),
      ];
      const calendarApi = createMockCalendarApi(events);
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.1,
        getUserEmail: async () => 'me@gmail.com',
      });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].location).toBe('3 HaMelacha St., Floor 10, Tel-Aviv');
    });

    it('returns empty location when event has no location', async () => {
      const events = [
        makeEvent({
          summary: 'Technical Interview',
          organizerEmail: 'recruiter@company.com',
        }),
      ];
      const calendarApi = createMockCalendarApi(events);
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.1,
        getUserEmail: async () => 'me@gmail.com',
      });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].location).toBe('');
    });

    it('returns empty companyName when no company pattern found', async () => {
      const events = [
        makeEvent({
          summary: 'Technical Interview',
          organizerEmail: 'recruiter@company.com',
        }),
      ];
      const calendarApi = createMockCalendarApi(events);
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.1,
        getUserEmail: async () => 'me@gmail.com',
      });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].companyName).toBe('');
    });

    it('includes calendarStatus "confirmed" for active events', async () => {
      const events = [
        makeEvent({
          summary: 'Technical Interview',
          organizerEmail: 'recruiter@company.com',
        }),
      ];
      const calendarApi = createMockCalendarApi(events);
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.1,
        getUserEmail: async () => 'me@gmail.com',
      });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].calendarStatus).toBe('confirmed');
    });

    it('includes cancelled events with calendarStatus "cancelled"', async () => {
      const events = [
        {
          ...makeEvent({
            id: 'cancelled1',
            summary: 'Interview with Torq',
            startDateTime: '2025-01-20T14:00:00Z',
            endDateTime: '2025-01-20T15:00:00Z',
          }),
          status: 'cancelled',
        },
      ];
      const calendarApi = createMockCalendarApi(events);
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.1,
        getUserEmail: async () => 'me@gmail.com',
      });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].eventId).toBe('cancelled1');
      expect(results[0].calendarStatus).toBe('cancelled');
      expect(results[0].date).toBe('2025-01-20');
      expect(results[0].reasons).toContain('cancelled-event');
    });

    it('skips cancelled events without a start date', async () => {
      const events = [
        {
          id: 'no-start',
          summary: 'Interview with Torq',
          organizer: { email: 'recruiter@torq.io' },
          start: {},
          end: {},
          status: 'cancelled',
        },
      ];
      const calendarApi = createMockCalendarApi(events);
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.1,
        getUserEmail: async () => 'me@gmail.com',
      });

      const results = await service.scanForInterviews();
      expect(results).toEqual([]);
    });

    it('skips cancelled events without interview keywords', async () => {
      const events = [
        {
          ...makeEvent({
            id: 'cancelled-no-kw',
            summary: 'Team lunch',
            startDateTime: '2025-01-20T12:00:00Z',
            endDateTime: '2025-01-20T13:00:00Z',
          }),
          status: 'cancelled',
        },
      ];
      const calendarApi = createMockCalendarApi(events);
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.1,
        getUserEmail: async () => 'me@gmail.com',
      });

      const results = await service.scanForInterviews();
      expect(results).toEqual([]);
    });

    it('passes showDeleted: true to the Calendar API', async () => {
      let capturedParams;
      const calendarApi = {
        events: {
          list: async (params) => {
            capturedParams = params;
            return { data: { items: [] } };
          },
        },
      };

      const service = createCalendarService({}, { calendarApi, nowFn: fixedNow });
      await service.scanForInterviews();

      expect(capturedParams.showDeleted).toBe(true);
    });

    it('returns both active and cancelled events in one scan', async () => {
      const events = [
        makeEvent({
          id: 'active1',
          summary: 'Technical Interview',
          organizerEmail: 'recruiter@company.com',
        }),
        {
          ...makeEvent({
            id: 'cancelled1',
            summary: 'Interview with Google',
            startDateTime: '2025-01-22T10:00:00Z',
            endDateTime: '2025-01-22T11:00:00Z',
          }),
          status: 'cancelled',
        },
      ];
      const calendarApi = createMockCalendarApi(events);
      const service = createCalendarService({}, {
        calendarApi,
        nowFn: fixedNow,
        minScore: 0.1,
        getUserEmail: async () => 'me@gmail.com',
      });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(2);
      const statuses = results.map((r) => r.calendarStatus);
      expect(statuses).toContain('confirmed');
      expect(statuses).toContain('cancelled');
    });
  });
});
