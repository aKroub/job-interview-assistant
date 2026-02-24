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

/** Helper: base64url-encode a UTF-8 string. */
function encode(text) {
  return Buffer.from(text, 'utf-8').toString('base64url');
}

/**
 * Creates a Gmail message fixture for testing.
 * When `body` is provided, the payload includes a text/plain part
 * to simulate `format: 'full'` responses.
 */
function makeMessage({ id = 'msg1', subject = '', from = '', snippet = '', body = '' }) {
  const payload = body
    ? {
      mimeType: 'multipart/alternative',
      headers: [
        { name: 'Subject', value: subject },
        { name: 'From', value: from },
      ],
      parts: [
        { mimeType: 'text/plain', body: { data: encode(body) } },
        { mimeType: 'text/html', body: { data: encode(`<p>${body}</p>`) } },
      ],
    }
    : {
      headers: [
        { name: 'Subject', value: subject },
        { name: 'From', value: from },
      ],
    };

  return { id, snippet, payload };
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

    it('extracts company from long subject with role description', async () => {
      const messages = [
        makeMessage({
          id: 'msg1',
          subject: 'Your Phone Interview for the Engineering Team Leader role at Dream | Liron & Ayal',
          from: 'Scheduler <noreply@comeet-notifications.com>',
          snippet: 'Please confirm your attendance',
        }),
      ];
      const gmailApi = createMockGmailApi(messages);
      const service = createGmailService({}, { gmailApi, minScore: 0.1 });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].companyName).toBe('dream');
    });

    it('prefers text-extracted company over domain-extracted company', async () => {
      const messages = [
        makeMessage({
          id: 'msg1',
          subject: 'Interview with Torq',
          from: 'Talent <talent@greenhouse.io>',
          snippet: 'Your interview has been confirmed',
        }),
      ];
      const gmailApi = createMockGmailApi(messages);
      const service = createGmailService({}, { gmailApi, minScore: 0.1 });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      // "torq" from text wins over "greenhouse" from domain
      expect(results[0].companyName).toBe('torq');
    });

    it('falls back to domain when no company pattern in text', async () => {
      const messages = [
        makeMessage({
          id: 'msg1',
          subject: 'Interview scheduled',
          from: 'HR <hr@google.com>',
          snippet: 'Your next round is confirmed',
        }),
      ];
      const gmailApi = createMockGmailApi(messages);
      const service = createGmailService({}, { gmailApi, minScore: 0.1 });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      // No text pattern → falls back to domain extraction
      expect(results[0].companyName).toBe('google');
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

    it('extracts date and duration from email body when snippet is truncated', async () => {
      const messages = [
        makeMessage({
          id: 'msg1',
          subject: 'Interview Invitation',
          from: 'recruiter@company.com',
          // Snippet is truncated — no date or time range visible
          snippet: 'We are pleased to invite you to an interview at our offices. Please see the details below regarding your upcoming',
          // Full body contains the date and time range
          body: 'We are pleased to invite you to an interview at our offices. Please see the details below regarding your upcoming interview.\n\nDate: January 20, 2025\nTime: 3:15 PM - 4:45 PM\nLocation: 3 HaMelacha St., Floor 10, Tel-Aviv',
        }),
      ];
      const gmailApi = createMockGmailApi(messages);
      const service = createGmailService({}, { gmailApi, minScore: 0.1 });

      const results = await service.scanForInterviews();

      expect(results.length).toBe(1);
      expect(results[0].extractedDate).toBe('2025-01-20');
      expect(results[0].extractedTime).toBe('15:15');
      expect(results[0].extractedDuration).toBe(90);
    });

    it('falls back to snippet when body is not available', async () => {
      const messages = [
        makeMessage({
          id: 'msg1',
          subject: 'Technical Interview Scheduled',
          from: 'recruiter@company.com',
          snippet: 'Your interview is on January 20, 2025 from 3:00 PM to 3:45 PM via Zoom',
          // No body provided — metadata-only format
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
