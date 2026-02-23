import { describe, it, expect } from '@jest/globals';
import { createGmailService } from '../src/services/gmailService.js';

/**
 * Creates a mock Gmail API that returns the given messages.
 * Mirrors the shape of googleapis gmail.users.messages.
 *
 * @param {Object[]} messages - array of Gmail API message objects
 * @returns {Object} mock Gmail API
 */
function createMockGmailApi(messages = []) {
  return {
    users: {
      messages: {
        list: async () => ({
          data: {
            messages: messages.map((m) => ({ id: m.id })),
          },
        }),
        get: async ({ id }) => {
          const msg = messages.find((m) => m.id === id);
          if (!msg) throw new Error(`Message ${id} not found`);
          return { data: msg };
        },
      },
    },
  };
}

/**
 * Creates a Gmail message fixture for testing.
 */
function makeMessage({ id = 'msg1', subject = '', from = '', snippet = '' }) {
  return {
    id,
    snippet,
    payload: {
      headers: [
        { name: 'Subject', value: subject },
        { name: 'From', value: from },
      ],
    },
  };
}

describe('createGmailService', () => {
  describe('scanForInterviews', () => {
    it('returns empty array when no messages match the search', async () => {
      const gmailApi = createMockGmailApi([]);
      const service = createGmailService({}, { gmailApi });
      const results = await service.scanForInterviews();
      expect(results).toEqual([]);
    });

    it('returns scored results for interview-related emails', async () => {
      const messages = [
        makeMessage({
          id: 'msg1',
          subject: 'Interview Invitation - Software Engineer',
          from: 'HR <hr@google.com>',
          snippet: 'We would like to invite you for a technical interview on January 20, 2025 at 2:30 PM',
        }),
      ];
      const gmailApi = createMockGmailApi(messages);
      const service = createGmailService({}, { gmailApi, minScore: 0.1 });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].messageId).toBe('msg1');
      expect(results[0].subject).toBe('Interview Invitation - Software Engineer');
      expect(results[0].senderDomain).toBe('google.com');
      expect(results[0].companyName).toBe('google');
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].matchedKeywords.length).toBeGreaterThan(0);
    });

    it('filters out emails below the minimum score', async () => {
      const messages = [
        makeMessage({
          id: 'msg1',
          subject: 'Weekly team standup notes',
          from: 'bot@company.com',
          snippet: 'Here are the standup notes from last week',
        }),
      ];
      const gmailApi = createMockGmailApi(messages);
      const service = createGmailService({}, { gmailApi, minScore: 0.3 });

      const results = await service.scanForInterviews();
      expect(results).toEqual([]);
    });

    it('extracts date and time from email content', async () => {
      const messages = [
        makeMessage({
          id: 'msg1',
          subject: 'Technical Interview Scheduled',
          from: 'recruiter@company.com',
          snippet: 'Your technical interview is on January 20, 2025 at 3:00 PM via Zoom',
        }),
      ];
      const gmailApi = createMockGmailApi(messages);
      const service = createGmailService({}, { gmailApi, minScore: 0.1 });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].extractedDate).toBe('2025-01-20');
      expect(results[0].extractedTime).toBe('15:00');
    });

    it('sorts results by score descending', async () => {
      const messages = [
        makeMessage({
          id: 'low',
          subject: 'Your application status',
          from: 'hr@company.com',
          snippet: 'We received your application for the position',
        }),
        makeMessage({
          id: 'high',
          subject: 'Interview Invitation - Technical Interview',
          from: 'recruiter@greenhouse.io',
          snippet: 'Your coding challenge and technical assessment is scheduled with the hiring manager',
        }),
      ];
      const gmailApi = createMockGmailApi(messages);
      const service = createGmailService({}, { gmailApi, minScore: 0.05 });

      const results = await service.scanForInterviews();

      // High-scoring message should come first
      if (results.length >= 2) {
        expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      }
    });

    it('extracts sender domain and company name', async () => {
      const messages = [
        makeMessage({
          id: 'msg1',
          subject: 'Interview scheduled',
          from: 'Talent Team <talent@mail.microsoft.com>',
          snippet: 'Your phone screen is confirmed',
        }),
      ];
      const gmailApi = createMockGmailApi(messages);
      const service = createGmailService({}, { gmailApi, minScore: 0.1 });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].senderEmail).toBe('talent@mail.microsoft.com');
      expect(results[0].senderDomain).toBe('mail.microsoft.com');
      expect(results[0].companyName).toBe('microsoft');
    });

    it('extracts company name from email text when sender is a scheduling platform', async () => {
      const messages = [
        makeMessage({
          id: 'msg1',
          subject: 'your interview invitation at Dream',
          from: 'Scheduler <noreply@comeet-notifications.com>',
          snippet: 'You have been invited to an interview',
        }),
      ];
      const gmailApi = createMockGmailApi(messages);
      const service = createGmailService({}, { gmailApi, minScore: 0.1 });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].companyName).toBe('dream');
    });

    it('extracts duration from email content with time range', async () => {
      const messages = [
        makeMessage({
          id: 'msg1',
          subject: 'Technical Interview Scheduled',
          from: 'recruiter@company.com',
          snippet: 'Your interview is on January 20, 2025 from 3:00 PM to 3:45 PM via Zoom',
        }),
      ];
      const gmailApi = createMockGmailApi(messages);
      const service = createGmailService({}, { gmailApi, minScore: 0.1 });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].extractedDate).toBe('2025-01-20');
      expect(results[0].extractedTime).toBe('15:00');
      expect(results[0].extractedDuration).toBe(45);
    });

    it('returns null extractedDuration when email has no time range', async () => {
      const messages = [
        makeMessage({
          id: 'msg1',
          subject: 'Technical Interview Scheduled',
          from: 'recruiter@company.com',
          snippet: 'Your technical interview is on January 20, 2025 at 3:00 PM via Zoom',
        }),
      ];
      const gmailApi = createMockGmailApi(messages);
      const service = createGmailService({}, { gmailApi, minScore: 0.1 });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].extractedDuration).toBeNull();
    });

    it('throws a clear error on 401/403 from Gmail API', async () => {
      const gmailApi = {
        users: {
          messages: {
            list: async () => {
              const err = new Error('Unauthorized');
              err.code = 401;
              throw err;
            },
          },
        },
      };
      const service = createGmailService({}, { gmailApi });

      await expect(service.scanForInterviews()).rejects.toThrow('Gmail access denied');
    });

    it('handles individual message fetch failures gracefully', async () => {
      const mockApi = {
        users: {
          messages: {
            list: async () => ({
              data: { messages: [{ id: 'good' }, { id: 'bad' }] },
            }),
            get: async ({ id }) => {
              if (id === 'bad') throw new Error('Fetch failed');
              return {
                data: makeMessage({
                  id: 'good',
                  subject: 'Interview Invitation',
                  from: 'hr@company.com',
                  snippet: 'Technical interview scheduled',
                }),
              };
            },
          },
        },
      };

      const service = createGmailService({}, { gmailApi: mockApi, minScore: 0.1 });
      const results = await service.scanForInterviews();

      // Should return the successful message, skip the failed one
      expect(results.length).toBe(1);
      expect(results[0].messageId).toBe('good');
    });
  });
});
