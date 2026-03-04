import { describe, it, expect, jest } from '@jest/globals';
import { createInterviewDetector } from '../src/services/interviewDetector.js';
import { createLlmExtractor } from '../src/services/llmExtractor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockGmail(results = []) {
  return { scanForInterviews: jest.fn(async () => results) };
}

function mockCalendar(results = []) {
  return { scanForInterviews: jest.fn(async () => results) };
}

function mockTokenStore(dismissed = []) {
  return {
    getDismissed: () => {
      const ids = new Set();
      const emailIds = new Set();
      const calendarIds = new Set();
      for (const entry of dismissed) {
        if (typeof entry === 'string') ids.add(entry);
        else {
          ids.add(entry.id);
          if (entry.emailId) emailIds.add(entry.emailId);
          if (entry.calendarId) calendarIds.add(entry.calendarId);
        }
      }
      return { ids, emailIds, calendarIds };
    },
  };
}

const fixedId = () => 1700000000000;

function makeEmailResult(overrides = {}) {
  return {
    messageId: 'msg1',
    subject: 'Interview Invitation',
    snippet: 'We would like to invite you...',
    from: 'HR <hr@acme.com>',
    senderEmail: 'hr@acme.com',
    senderDomain: 'acme.com',
    companyName: 'acme',
    score: 0.8,
    matchedKeywords: ['interview invitation'],
    extractedDate: '2026-03-09',
    extractedTime: '14:00',
    extractedDuration: null,
    extractedAllDates: [],
    bodyText: 'You are invited to an interview on March 9.',
    intent: 'add',
    ...overrides,
  };
}

function makeCalendarResult(overrides = {}) {
  return {
    eventId: 'evt1',
    summary: 'Technical Interview - SWE',
    description: '',
    organizerEmail: 'recruiter@acme.com',
    startDateTime: '2026-03-09T14:00:00Z',
    endDateTime: '2026-03-09T15:00:00Z',
    date: '2026-03-09',
    time: '14:00',
    hasVideoLink: false,
    location: '',
    companyName: 'acme',
    score: 0.7,
    calendarStatus: 'confirmed',
    ...overrides,
  };
}

/**
 * Creates a mock Anthropic client that tracks call count and returns
 * a valid extraction response.
 */
function createTrackingMockClient() {
  const calls = [];
  return {
    calls,
    messages: {
      create: jest.fn(async (params) => {
        calls.push(params);
        return {
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [{
            type: 'text',
            text: JSON.stringify({
              company_name: 'Acme',
              date: '2026-03-09',
              time: '14:00',
              duration_minutes: 60,
              intent: 'add',
              interview_type: 'technical',
            }),
          }],
        };
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// H1: Extraction cache — successful LLM results are cached, not re-requested
// ---------------------------------------------------------------------------
describe('H1: Extraction cache prevents redundant LLM calls', () => {
  it('second detect() reuses cached extractions; 0 new LLM calls', async () => {
    const mockClient = createTrackingMockClient();
    const emails = [
      makeEmailResult({ messageId: 'msg1', subject: 'Interview at Acme', bodyText: 'interview body 1' }),
      makeEmailResult({ messageId: 'msg2', subject: 'Interview at Beta', bodyText: 'interview body 2', senderEmail: 'hr@beta.com', senderDomain: 'beta.com', companyName: 'beta' }),
      makeEmailResult({ messageId: 'msg3', subject: 'Interview at Gamma', bodyText: 'interview body 3', senderEmail: 'hr@gamma.com', senderDomain: 'gamma.com', companyName: 'gamma' }),
    ];
    const events = [
      makeCalendarResult({ eventId: 'evt1' }),
    ];

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
      maxConcurrency: 5,
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail(emails),
      calendarService: mockCalendar(events),
      tokenStore: mockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // First detect — all 4 items go through LLM enrichment
    const firstResult = await detector.detect();
    expect(mockClient.messages.create.mock.calls.length).toBe(4);
    expect(firstResult.length).toBeGreaterThan(0);

    // Second detect — cached extractions reused, no new API calls.
    // Suggestions are still returned (not filtered out).
    const secondResult = await detector.detect();
    expect(mockClient.messages.create.mock.calls.length).toBe(4); // No new calls
    expect(secondResult.length).toBe(firstResult.length); // Same suggestions
  });

  it('10 poll cycles with 10 items = only 10 LLM calls (first cycle)', async () => {
    const mockClient = createTrackingMockClient();
    const emails = [];
    for (let i = 0; i < 8; i++) {
      emails.push(makeEmailResult({
        messageId: `msg${i}`,
        subject: `Interview ${i}`,
        senderEmail: `hr@company${i}.com`,
        senderDomain: `company${i}.com`,
        companyName: `company${i}`,
      }));
    }
    const events = [
      makeCalendarResult({ eventId: 'evt1' }),
      makeCalendarResult({ eventId: 'evt2', summary: 'Interview - Design', organizerEmail: 'r@other.com', companyName: 'other' }),
    ];

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
      maxConcurrency: 5,
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail(emails),
      calendarService: mockCalendar(events),
      tokenStore: mockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Simulate 10 poll cycles
    for (let cycle = 0; cycle < 10; cycle++) {
      await detector.detect();
    }

    // Only 10 calls (first cycle), not 100 (every cycle)
    const totalCalls = mockClient.messages.create.mock.calls.length;
    expect(totalCalls).toBe(10);
  });

  it('failed extractions are NOT cached — retried next cycle', async () => {
    let callCount = 0;
    let shouldFail = true;
    const mockClient = {
      messages: {
        create: jest.fn(async () => {
          callCount++;
          if (shouldFail) {
            const err = new Error('529 Overloaded');
            err.status = 529;
            throw err;
          }
          return {
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 50 },
            content: [{
              type: 'text',
              text: JSON.stringify({
                company_name: 'Acme',
                date: '2026-03-09',
                time: '14:00',
                duration_minutes: 60,
                intent: 'add',
                interview_type: 'technical',
              }),
            }],
          };
        }),
      },
    };

    const emails = [makeEmailResult({ messageId: 'msg1' })];
    const events = [makeCalendarResult({ eventId: 'evt1' })];

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
      maxConcurrency: 5,
      maxRetries: 0,
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail(emails),
      calendarService: mockCalendar(events),
      tokenStore: mockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: both items fail — not cached
    await detector.detect();
    expect(callCount).toBe(2);

    // Cycle 2: still failing — retried (not cached from cycle 1)
    await detector.detect();
    expect(callCount).toBe(4);

    // API recovers
    shouldFail = false;

    // Cycle 3: circuit breaker opens (2 consecutive all-fail batches) — 0 calls
    await detector.detect();
    expect(callCount).toBe(4);

    // Cycle 4: breaker resets, succeeds — items now cached
    await detector.detect();
    expect(callCount).toBe(6);

    // Cycle 5: cached — 0 new calls
    await detector.detect();
    expect(callCount).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// H2: Circuit breaker — skips LLM enrichment after persistent failures
// ---------------------------------------------------------------------------
describe('H2: Circuit breaker prevents thundering herd on persistent 529', () => {
  it('opens after 2 consecutive all-fail batches and skips the third', async () => {
    let callCount = 0;
    const mockClient = {
      messages: {
        create: jest.fn(async () => {
          callCount++;
          const err = new Error('529 Overloaded');
          err.status = 529;
          throw err;
        }),
      },
    };

    const emails = [
      makeEmailResult({ messageId: 'msg1' }),
      makeEmailResult({ messageId: 'msg2', senderEmail: 'hr@beta.com', companyName: 'beta' }),
    ];

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
      maxConcurrency: 5,
      maxRetries: 0,
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail(emails),
      calendarService: mockCalendar([]),
      tokenStore: mockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: all 2 items fail — consecutiveAllFailBatches = 1
    await detector.detect();
    expect(callCount).toBe(2);

    // Cycle 2: all 2 items fail again — consecutiveAllFailBatches = 2
    await detector.detect();
    expect(callCount).toBe(4);

    // Cycle 3: circuit breaker opens — 0 new calls, skips enrichment
    await detector.detect();
    expect(callCount).toBe(4); // No new calls!

    // Cycle 4: breaker resets — retries (2 more calls)
    await detector.detect();
    expect(callCount).toBe(6);
  });

  it('resets the breaker when any call succeeds', async () => {
    let callCount = 0;
    let shouldFail = true;
    const mockClient = {
      messages: {
        create: jest.fn(async () => {
          callCount++;
          if (shouldFail) {
            const err = new Error('529 Overloaded');
            err.status = 529;
            throw err;
          }
          return {
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 50 },
            content: [{
              type: 'text',
              text: JSON.stringify({ company_name: 'Acme', date: '2026-03-09', time: '14:00', duration_minutes: 60, intent: 'add', interview_type: 'technical' }),
            }],
          };
        }),
      },
    };

    const emails = [makeEmailResult({ messageId: 'msg1' })];
    const events = [makeCalendarResult({ eventId: 'evt1' })];

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
      maxConcurrency: 5,
      maxRetries: 0,
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail(emails),
      calendarService: mockCalendar(events),
      tokenStore: mockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: fail — counter = 1
    await detector.detect();
    expect(callCount).toBe(2);

    // Make API recover
    shouldFail = false;

    // Cycle 2: succeeds — counter resets to 0, items cached
    await detector.detect();
    expect(callCount).toBe(4);

    // Cycle 3+: all cached — 0 new calls regardless
    await detector.detect();
    expect(callCount).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// H3: Concurrent polls — extraction cache prevents duplicate API calls
// ---------------------------------------------------------------------------
describe('H3: Extraction cache prevents duplicate work across concurrent polls', () => {
  it('concurrent detect() calls share cache; third call makes 0 LLM calls', async () => {
    const mockClient = createTrackingMockClient();
    // Make each LLM call take 100ms to simulate API latency
    mockClient.messages.create = jest.fn(async (params) => {
      await new Promise((r) => setTimeout(r, 100));
      return {
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
        content: [{
          type: 'text',
          text: JSON.stringify({
            company_name: 'Acme',
            date: '2026-03-09',
            time: '14:00',
            duration_minutes: 60,
            intent: 'add',
            interview_type: 'technical',
          }),
        }],
      };
    });

    const emails = [
      makeEmailResult({ messageId: 'msg1' }),
      makeEmailResult({ messageId: 'msg2', senderEmail: 'hr@beta.com', senderDomain: 'beta.com', companyName: 'beta' }),
    ];
    const events = [makeCalendarResult()];

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
      maxConcurrency: 2,
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail(emails),
      calendarService: mockCalendar(events),
      tokenStore: mockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Fire two detect() calls concurrently (simulating overlapping polls).
    // Both may fire LLM calls, but both cache successful extractions.
    await Promise.all([
      detector.detect(),
      detector.detect(),
    ]);

    // After both complete, a third call should make ZERO new LLM calls
    // because all items are cached.
    const callsBefore = mockClient.messages.create.mock.calls.length;
    await detector.detect();
    const callsAfter = mockClient.messages.create.mock.calls.length;
    expect(callsAfter).toBe(callsBefore); // Third call — all cached
  });
});
