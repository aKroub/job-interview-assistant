/**
 * Reproduction tests for Google Calendar cancellation email bug.
 *
 * Bug: A Google Calendar cancellation email with subject
 * "Cancelled event: Interview with Torq @ Mon 2 Mar 2026 15:15 – 16:45 (GMT+2)"
 * and body "This event has been cancelled and removed from your calendar."
 * is NOT being recognized as a cancellation by the app.
 *
 * Root cause investigation:
 * H1: Gmail search query misses "Cancelled event:" subject format
 * H2: scoreEmailForInterview scores too low (below 0.3 minScore)
 * H3: detectEmailIntent runs after score filtering — cancel intent is
 *     detected but the email is dropped because score < 0.3
 */

import { describe, it, expect } from '@jest/globals';
import {
  scoreEmailForInterview,
  detectEmailIntent,
} from '../src/utils/emailParser.js';
import { createGmailService } from '../src/services/gmailService.js';

// The exact email from the user's screenshot
const GCAL_CANCEL_SUBJECT =
  'Cancelled event: Interview with Torq @ Mon 2 Mar 2026 15:15 – 16:45 (GMT+2) (ayalkroub@gmail.com)';
const GCAL_CANCEL_BODY =
  'This event has been cancelled and removed from your calendar.';
const GCAL_CANCEL_SENDER = 'yeheli.noy@torq.io';

// -------------------------------------------------------------------------
// H1: Gmail search query must include "cancelled event" / "canceled event"
// -------------------------------------------------------------------------

describe('H1 — Gmail search query coverage for cancellation events', () => {
  it('buildSearchQuery includes "cancelled event" keyword', async () => {
    // Construct a mock Gmail API that captures the search query
    let capturedQuery = '';
    const mockGmailApi = {
      users: {
        messages: {
          list: async ({ q }) => {
            capturedQuery = q;
            return { data: { messages: [] } };
          },
        },
      },
    };

    const service = createGmailService({}, { gmailApi: mockGmailApi });
    await service.scanForInterviews();

    // The query MUST include "cancelled event" or "canceled event" to match
    // Google Calendar cancellation notifications
    expect(capturedQuery).toMatch(/cancelled event|canceled event/i);
  });
});

// -------------------------------------------------------------------------
// H2: scoreEmailForInterview must score this email above 0.3
// -------------------------------------------------------------------------

describe('H2 — scoreEmailForInterview must score GCal cancellation >= 0.3', () => {
  it('scores the exact GCal cancellation email above 0.3', () => {
    const { score, matchedKeywords } = scoreEmailForInterview(
      GCAL_CANCEL_SUBJECT,
      GCAL_CANCEL_BODY,
      GCAL_CANCEL_SENDER
    );

    // This email MUST pass the minScore threshold
    expect(score).toBeGreaterThanOrEqual(0.3);
    // "interview" should be matched at minimum
    expect(matchedKeywords).toContain('interview');
  });

  it('scores a US-spelling GCal cancellation above 0.3', () => {
    const { score } = scoreEmailForInterview(
      'Canceled event: Interview with Google @ Tue 3 Mar 2026 10:00 – 11:00 (GMT+2)',
      'This event has been canceled and removed from your calendar.',
      'recruiter@google.com'
    );
    expect(score).toBeGreaterThanOrEqual(0.3);
  });
});

// -------------------------------------------------------------------------
// H3: Cancellation intent must survive the full pipeline (not be dropped)
// -------------------------------------------------------------------------

describe('H3 — GCal cancellation email must survive the full pipeline', () => {
  it('detectEmailIntent correctly identifies it as cancel (sanity check)', () => {
    expect(detectEmailIntent(GCAL_CANCEL_SUBJECT, GCAL_CANCEL_BODY)).toBe('cancel');
  });

  it('scanForInterviews includes the GCal cancellation email with cancel intent', async () => {
    // Build a mock Gmail response that returns this exact email
    const mockMessage = {
      id: 'gcal-cancel-1',
      payload: {
        headers: [
          { name: 'Subject', value: GCAL_CANCEL_SUBJECT },
          { name: 'From', value: `Yeheli Noy <${GCAL_CANCEL_SENDER}>` },
        ],
        mimeType: 'text/plain',
        body: {
          data: Buffer.from(GCAL_CANCEL_BODY).toString('base64'),
        },
      },
      snippet: GCAL_CANCEL_BODY,
    };

    const mockGmailApi = {
      users: {
        messages: {
          list: async () => ({ data: { messages: [{ id: 'gcal-cancel-1' }] } }),
          get: async () => ({ data: mockMessage }),
        },
      },
    };

    const service = createGmailService({}, { gmailApi: mockGmailApi, minScore: 0.3 });
    const results = await service.scanForInterviews();

    // The cancellation email MUST appear in results
    expect(results.length).toBeGreaterThanOrEqual(1);

    const cancelResult = results.find((r) => r.messageId === 'gcal-cancel-1');
    expect(cancelResult).toBeDefined();
    expect(cancelResult.intent).toBe('cancel');
    expect(cancelResult.score).toBeGreaterThanOrEqual(0.3);
  });
});
