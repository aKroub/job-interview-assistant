import { describe, it, expect } from '@jest/globals';
import { createInterviewDetector } from '../src/services/interviewDetector.js';
import { createMockTokenStore } from './helpers/mockTokenStore.js';

// ---------------------------------------------------------------------------
// Shared test helpers (same pattern as interviewDetector.stress.test.js)
// ---------------------------------------------------------------------------

function mockGmail(results = []) {
  return { scanForInterviews: async () => results };
}

function mockCalendar(results = []) {
  return { scanForInterviews: async () => results };
}

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

/**
 * Creates a mock LLM extractor with configurable per-call behavior.
 *
 * @param {Object} options
 * @param {Function} [options.emailHandler] - (subject, body, sender) => return value
 * @param {Function} [options.eventHandler] - (summary, desc, loc, organizer) => return value
 * @returns {{ extractFromEmail: Function, extractFromCalendarEvent: Function }}
 */
function mockLlmExtractor({ emailHandler, eventHandler } = {}) {
  const defaultEmailHandler = () => ({
    dryModePrompt: null,
    extraction: { company_name: 'LlmCompany', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
  });
  const defaultEventHandler = () => ({
    dryModePrompt: null,
    extraction: { company_name: 'LlmCompany', interview_type: null },
  });

  return {
    extractFromEmail: async (...args) => (emailHandler || defaultEmailHandler)(...args),
    extractFromCalendarEvent: async (...args) => (eventHandler || defaultEventHandler)(...args),
  };
}

/**
 * Creates a spy-capable mock llmExtractor that tracks calls.
 */
function spyLlmExtractor({ emailHandler, eventHandler } = {}) {
  const emailCalls = [];
  const eventCalls = [];

  const defaultReturn = { dryModePrompt: null, extraction: null };

  return {
    extractFromEmail: async (subject, body, sender) => {
      emailCalls.push({ subject, body, sender });
      return emailHandler ? emailHandler(subject, body, sender) : defaultReturn;
    },
    extractFromCalendarEvent: async (summary, desc, loc, organizer) => {
      eventCalls.push({ summary, desc, loc, organizer });
      return eventHandler ? eventHandler(summary, desc, loc, organizer) : defaultReturn;
    },
    emailCalls,
    eventCalls,
  };
}

// ===========================================================================
// H1: Cache eviction — oldest entries evicted when cache exceeds maxCacheSize
// ===========================================================================
describe('H1: cache eviction — oldest entries evicted when maxCacheSize exceeded', () => {
  it('with maxCacheSize=3, fourth unique item evicts the first cached entry', async () => {
    // Track which items go through the LLM (uncached)
    const llmEmailCalls = [];

    const extractor = mockLlmExtractor({
      emailHandler: (_subject, _body, sender) => {
        llmEmailCalls.push(sender);
        return {
          dryModePrompt: null,
          extraction: { company_name: `Enriched_${sender}`, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => null, // no calendar enrichment to keep test focused
    });

    // Cycle 1: 3 emails — all get cached (maxCacheSize=3, fits exactly)
    const emails1 = [0, 1, 2].map(i => makeEmailResult({
      messageId: `msg${i}`,
      senderEmail: `hr@co${i}.com`,
      senderDomain: `co${i}.com`,
      companyName: `co${i}`,
      score: 0.9,
    }));
    const events1 = [0, 1, 2].map(i => makeCalendarResult({
      eventId: `evt${i}`,
      organizerEmail: `hr@co${i}.com`,
      date: `2025-02-0${i + 1}`,
      time: '14:00',
      startDateTime: `2025-02-0${i + 1}T14:00:00Z`,
      endDateTime: `2025-02-0${i + 1}T15:00:00Z`,
    }));

    // Use a single detector instance across cycles to test cache persistence
    let currentEmails = emails1;
    let currentEvents = events1;

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
      maxCacheSize: 3,
    });

    // Cycle 1: all 3 emails are uncached — LLM called for all
    await detector.detect();
    expect(llmEmailCalls).toHaveLength(3);

    // Cycle 2: same 3 emails — all cached, no new LLM calls
    llmEmailCalls.length = 0;
    await detector.detect();
    expect(llmEmailCalls).toHaveLength(0);

    // Cycle 3: add a 4th email — msg0 (oldest) should be evicted
    const email3 = makeEmailResult({
      messageId: 'msg3',
      senderEmail: 'hr@co3.com',
      senderDomain: 'co3.com',
      companyName: 'co3',
      score: 0.9,
    });
    const evt3 = makeCalendarResult({
      eventId: 'evt3',
      organizerEmail: 'hr@co3.com',
      date: '2025-02-04',
      time: '14:00',
      startDateTime: '2025-02-04T14:00:00Z',
      endDateTime: '2025-02-04T15:00:00Z',
    });

    currentEmails = [...emails1, email3];
    currentEvents = [...events1, evt3];
    llmEmailCalls.length = 0;

    await detector.detect();
    // Only msg3 should be a fresh LLM call (msg0, msg1, msg2 still cached)
    expect(llmEmailCalls).toHaveLength(1);
    expect(llmEmailCalls[0]).toBe('hr@co3.com');

    // Cycle 4: now msg0's cache should have been evicted (cache has msg1, msg2, msg3)
    // Present msg0 again — should require a new LLM call
    currentEmails = [emails1[0]]; // only msg0
    currentEvents = [events1[0]]; // only evt0
    llmEmailCalls.length = 0;

    await detector.detect();
    // msg0 was evicted, so LLM should be called again
    expect(llmEmailCalls).toHaveLength(1);
    expect(llmEmailCalls[0]).toBe('hr@co0.com');
  });

  it('with maxCacheSize=2, rapid insertions always keep only the 2 newest', async () => {
    const llmCalls = [];

    const extractor = spyLlmExtractor({
      emailHandler: (_subject, _body, sender) => {
        llmCalls.push(sender);
        return {
          dryModePrompt: null,
          extraction: { company_name: `E_${sender}`, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => null,
    });

    let currentEmails = [];
    let currentEvents = [];

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
      maxCacheSize: 2,
    });

    // Insert 5 items one at a time via separate detect() calls
    for (let i = 0; i < 5; i++) {
      currentEmails = [makeEmailResult({
        messageId: `msg${i}`,
        senderEmail: `hr@co${i}.com`,
        senderDomain: `co${i}.com`,
        companyName: `co${i}`,
        score: 0.9,
      })];
      currentEvents = [makeCalendarResult({
        eventId: `evt${i}`,
        organizerEmail: `hr@co${i}.com`,
        date: `2025-03-0${i + 1}`,
        time: '14:00',
        startDateTime: `2025-03-0${i + 1}T14:00:00Z`,
        endDateTime: `2025-03-0${i + 1}T15:00:00Z`,
      })];

      await detector.detect();
    }

    // 5 calls total — one per unique email
    expect(extractor.emailCalls).toHaveLength(5);

    // Now, msg3 and msg4 should be cached (the 2 newest), msg0-msg2 evicted
    extractor.emailCalls.length = 0;

    // Verify msg4 is cached (no LLM call)
    currentEmails = [makeEmailResult({
      messageId: 'msg4',
      senderEmail: 'hr@co4.com',
      senderDomain: 'co4.com',
      companyName: 'co4',
      score: 0.9,
    })];
    currentEvents = [makeCalendarResult({
      eventId: 'evt4',
      organizerEmail: 'hr@co4.com',
      date: '2025-03-05',
      time: '14:00',
      startDateTime: '2025-03-05T14:00:00Z',
      endDateTime: '2025-03-05T15:00:00Z',
    })];

    await detector.detect();
    expect(extractor.emailCalls).toHaveLength(0); // cached

    // Verify msg0 was evicted (requires new LLM call)
    extractor.emailCalls.length = 0;
    currentEmails = [makeEmailResult({
      messageId: 'msg0',
      senderEmail: 'hr@co0.com',
      senderDomain: 'co0.com',
      companyName: 'co0',
      score: 0.9,
    })];
    currentEvents = [makeCalendarResult({
      eventId: 'evt0',
      organizerEmail: 'hr@co0.com',
      date: '2025-03-01',
      time: '14:00',
      startDateTime: '2025-03-01T14:00:00Z',
      endDateTime: '2025-03-01T15:00:00Z',
    })];

    await detector.detect();
    expect(extractor.emailCalls).toHaveLength(1); // evicted, re-fetched
  });

  it('eviction preserves calendar event cache entries independently from email cache', async () => {
    const emailLlmCalls = [];
    const eventLlmCalls = [];

    const extractor = mockLlmExtractor({
      emailHandler: (_subject, _body, sender) => {
        emailLlmCalls.push(sender);
        return {
          dryModePrompt: null,
          extraction: { company_name: `E_${sender}`, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: (_summary, _desc, _loc, organizer) => {
        eventLlmCalls.push(organizer);
        return {
          dryModePrompt: null,
          extraction: { company_name: `C_${organizer}`, interview_type: null },
        };
      },
    });

    let currentEmails = [];
    let currentEvents = [];

    // maxCacheSize=3 — shared between email and event caches (same Map)
    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
      maxCacheSize: 3,
    });

    // Cycle 1: 1 email + 1 event = 2 cache entries
    currentEmails = [makeEmailResult({ messageId: 'msgA', senderEmail: 'hr@a.com', senderDomain: 'a.com', companyName: 'a', score: 0.9 })];
    currentEvents = [makeCalendarResult({ eventId: 'evtA', organizerEmail: 'hr@a.com', date: '2025-04-01' })];
    await detector.detect();

    expect(emailLlmCalls).toHaveLength(1);
    expect(eventLlmCalls).toHaveLength(1);

    // Cycle 2: 2 new emails (no events) = 2 new email entries, total 4 exceeds maxCacheSize=3
    // The oldest entry (email:msgA) should be evicted
    emailLlmCalls.length = 0;
    eventLlmCalls.length = 0;

    currentEmails = [
      makeEmailResult({ messageId: 'msgB', senderEmail: 'hr@b.com', senderDomain: 'b.com', companyName: 'b', score: 0.9 }),
      makeEmailResult({ messageId: 'msgC', senderEmail: 'hr@c.com', senderDomain: 'c.com', companyName: 'c', score: 0.9 }),
    ];
    currentEvents = [
      makeCalendarResult({ eventId: 'evtB', organizerEmail: 'hr@b.com', date: '2025-04-02' }),
      makeCalendarResult({ eventId: 'evtC', organizerEmail: 'hr@c.com', date: '2025-04-03' }),
    ];
    await detector.detect();

    expect(emailLlmCalls).toHaveLength(2); // msgB, msgC
    expect(eventLlmCalls).toHaveLength(2); // evtB, evtC

    // Cycle 3: re-present evtA — it should have been evicted by now (cache has 3 of the newer entries)
    emailLlmCalls.length = 0;
    eventLlmCalls.length = 0;

    currentEmails = [makeEmailResult({ messageId: 'msgA', senderEmail: 'hr@a.com', senderDomain: 'a.com', companyName: 'a', score: 0.9 })];
    currentEvents = [makeCalendarResult({ eventId: 'evtA', organizerEmail: 'hr@a.com', date: '2025-04-01' })];
    await detector.detect();

    // Both msgA and evtA should require new LLM calls (both were evicted)
    expect(emailLlmCalls).toHaveLength(1);
    expect(eventLlmCalls).toHaveLength(1);
  });
});

// ===========================================================================
// H2: Circuit breaker with cached items — breaker counts only uncached API calls
// ===========================================================================
describe('H2: circuit breaker with cached items — breaker counts uncached API calls only', () => {
  it('cached items do not count toward breaker failure threshold', async () => {
    let emailCallCount = 0;

    const extractor = mockLlmExtractor({
      emailHandler: () => {
        emailCallCount++;
        // First 2 calls succeed (cycle 1), all subsequent calls fail
        if (emailCallCount <= 2) {
          return {
            dryModePrompt: null,
            extraction: { company_name: 'GoodCo', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
          };
        }
        // API returns null extraction (failure) but result is not null (API call counted)
        return { dryModePrompt: null, extraction: null };
      },
      eventHandler: () => null,
    });

    // 2 cached emails + 1 new failing email per cycle
    const cachedEmail0 = makeEmailResult({ messageId: 'cached0', senderEmail: 'hr@a.com', senderDomain: 'a.com', companyName: 'a', score: 0.9 });
    const cachedEmail1 = makeEmailResult({ messageId: 'cached1', senderEmail: 'hr@b.com', senderDomain: 'b.com', companyName: 'b', score: 0.9 });
    const cachedEvt0 = makeCalendarResult({ eventId: 'evt0', organizerEmail: 'hr@a.com', date: '2025-05-01' });
    const cachedEvt1 = makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@b.com', date: '2025-05-02' });

    let currentEmails = [cachedEmail0, cachedEmail1];
    let currentEvents = [cachedEvt0, cachedEvt1];

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
      breakerThreshold: 2,
    });

    // Cycle 1: 2 emails uncached — both succeed → cached
    await detector.detect();
    expect(emailCallCount).toBe(2);

    // Cycle 2: 2 cached emails + 1 new failing email
    // The new email fails (null extraction). batch has 1 API call, 0 successes → all-fail batch #1
    const failingEmail1 = makeEmailResult({ messageId: 'fail1', senderEmail: 'hr@fail1.com', senderDomain: 'fail1.com', companyName: 'fail1', score: 0.9 });
    const failingEvt1 = makeCalendarResult({ eventId: 'evtFail1', organizerEmail: 'hr@fail1.com', date: '2025-05-03' });
    currentEmails = [cachedEmail0, cachedEmail1, failingEmail1];
    currentEvents = [cachedEvt0, cachedEvt1, failingEvt1];

    emailCallCount = 2; // reset relative count
    await detector.detect();
    // Only 1 new LLM call for failingEmail1 (cached0, cached1 are cached)
    expect(emailCallCount).toBe(3);

    // Cycle 3: same setup with another new failing email → all-fail batch #2
    const failingEmail2 = makeEmailResult({ messageId: 'fail2', senderEmail: 'hr@fail2.com', senderDomain: 'fail2.com', companyName: 'fail2', score: 0.9 });
    const failingEvt2 = makeCalendarResult({ eventId: 'evtFail2', organizerEmail: 'hr@fail2.com', date: '2025-05-04' });
    currentEmails = [cachedEmail0, cachedEmail1, failingEmail2];
    currentEvents = [cachedEvt0, cachedEvt1, failingEvt2];

    await detector.detect();
    // fail2 triggers 1 more LLM call (fail1 from last cycle is also uncached since it failed)
    // After this cycle: consecutiveAllFailBatches = 2 → breaker opens next cycle

    // Cycle 4: breaker should be OPEN — no LLM calls at all
    const preBreakerCallCount = emailCallCount;
    const failingEmail3 = makeEmailResult({ messageId: 'fail3', senderEmail: 'hr@fail3.com', senderDomain: 'fail3.com', companyName: 'fail3', score: 0.9 });
    const failingEvt3 = makeCalendarResult({ eventId: 'evtFail3', organizerEmail: 'hr@fail3.com', date: '2025-05-05' });
    currentEmails = [cachedEmail0, failingEmail3];
    currentEvents = [cachedEvt0, failingEvt3];

    await detector.detect();
    // Breaker open — NO new LLM calls (even for uncached items)
    expect(emailCallCount).toBe(preBreakerCallCount);
  });

  it('one success in a mixed batch resets the breaker counter', async () => {
    let emailCallIdx = 0;

    const extractor = mockLlmExtractor({
      emailHandler: () => {
        emailCallIdx++;
        // Odd calls succeed, even calls fail
        if (emailCallIdx % 2 === 1) {
          return {
            dryModePrompt: null,
            extraction: { company_name: `Co${emailCallIdx}`, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
          };
        }
        return { dryModePrompt: null, extraction: null };
      },
      eventHandler: () => null,
    });

    let currentEmails = [];
    let currentEvents = [];

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
      breakerThreshold: 2,
    });

    // Run 10 cycles, each with 2 new uncached emails (one succeeds, one fails)
    // The batch always has at least 1 success → breaker should NEVER open
    for (let cycle = 0; cycle < 10; cycle++) {
      currentEmails = [
        makeEmailResult({ messageId: `msgA${cycle}`, senderEmail: `hr@a${cycle}.com`, senderDomain: `a${cycle}.com`, companyName: `a${cycle}`, score: 0.9 }),
        makeEmailResult({ messageId: `msgB${cycle}`, senderEmail: `hr@b${cycle}.com`, senderDomain: `b${cycle}.com`, companyName: `b${cycle}`, score: 0.9 }),
      ];
      currentEvents = [
        makeCalendarResult({ eventId: `evtA${cycle}`, organizerEmail: `hr@a${cycle}.com`, date: `2025-06-${String(cycle + 1).padStart(2, '0')}` }),
        makeCalendarResult({ eventId: `evtB${cycle}`, organizerEmail: `hr@b${cycle}.com`, date: `2025-06-${String(cycle + 11).padStart(2, '0')}` }),
      ];

      const suggestions = await detector.detect();
      // At least one suggestion should always be produced (breaker never opened)
      expect(suggestions.length).toBeGreaterThan(0);
    }

    // All 20 emails should have triggered LLM calls (breaker never skipped)
    expect(emailCallIdx).toBe(20);
  });

  it('breaker resets after one open cycle and retries on the next', async () => {
    let emailCallIdx = 0;
    const extractor = mockLlmExtractor({
      emailHandler: () => {
        emailCallIdx++;
        // First 3 calls fail, then all succeed
        if (emailCallIdx <= 3) {
          return { dryModePrompt: null, extraction: null };
        }
        return {
          dryModePrompt: null,
          extraction: { company_name: `Recovered${emailCallIdx}`, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => null,
    });

    let currentEmails = [];
    let currentEvents = [];

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
      breakerThreshold: 2,
    });

    // Cycle 1: 1 email fails → all-fail batch #1
    currentEmails = [makeEmailResult({ messageId: 'r1', senderEmail: 'hr@r1.com', senderDomain: 'r1.com', companyName: 'r1', score: 0.9 })];
    currentEvents = [makeCalendarResult({ eventId: 'evtR1', organizerEmail: 'hr@r1.com', date: '2025-07-01' })];
    await detector.detect();
    expect(emailCallIdx).toBe(1);

    // Cycle 2: 1 email fails → all-fail batch #2 → breaker opens
    currentEmails = [makeEmailResult({ messageId: 'r2', senderEmail: 'hr@r2.com', senderDomain: 'r2.com', companyName: 'r2', score: 0.9 })];
    currentEvents = [makeCalendarResult({ eventId: 'evtR2', organizerEmail: 'hr@r2.com', date: '2025-07-02' })];
    await detector.detect();
    expect(emailCallIdx).toBe(2);

    // Cycle 3: breaker OPEN — skips LLM entirely, counter resets to 0
    currentEmails = [makeEmailResult({ messageId: 'r3', senderEmail: 'hr@r3.com', senderDomain: 'r3.com', companyName: 'r3', score: 0.9 })];
    currentEvents = [makeCalendarResult({ eventId: 'evtR3', organizerEmail: 'hr@r3.com', date: '2025-07-03' })];
    await detector.detect();
    expect(emailCallIdx).toBe(2); // no new calls — breaker skipped

    // Cycle 4: breaker reset — retries. Call #3 fails but counter is now at 1 (not 2)
    currentEmails = [makeEmailResult({ messageId: 'r4', senderEmail: 'hr@r4.com', senderDomain: 'r4.com', companyName: 'r4', score: 0.9 })];
    currentEvents = [makeCalendarResult({ eventId: 'evtR4', organizerEmail: 'hr@r4.com', date: '2025-07-04' })];
    await detector.detect();
    expect(emailCallIdx).toBe(3); // 1 new call (failed, but counter = 1)

    // Cycle 5: call #4 succeeds! (emailCallIdx > 3) → counter resets to 0
    currentEmails = [makeEmailResult({ messageId: 'r5', senderEmail: 'hr@r5.com', senderDomain: 'r5.com', companyName: 'r5', score: 0.9 })];
    currentEvents = [makeCalendarResult({ eventId: 'evtR5', organizerEmail: 'hr@r5.com', date: '2025-07-05' })];
    const result = await detector.detect();
    expect(emailCallIdx).toBe(4);

    // Verify the recovered extraction made it through
    const s = result.find(s => s.emailMessageId === 'r5');
    expect(s).toBeDefined();
    expect(s.companyName).toBe('Recovered4');
  });
});

// ===========================================================================
// H3: Cache key collision — special characters in messageId/eventId
// ===========================================================================
describe('H3: cache key collision — special characters in IDs', () => {
  it('messageId containing colon prefix does not collide with event cache key', async () => {
    // If messageId = "event:abc", the cache key becomes "email:event:abc"
    // which differs from "event:abc" — verify no cross-contamination
    const emailLlmCalls = [];
    const eventLlmCalls = [];

    const extractor = mockLlmExtractor({
      emailHandler: (_subject, _body, sender) => {
        emailLlmCalls.push(sender);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'EmailExtracted', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: (_summary, _desc, _loc, organizer) => {
        eventLlmCalls.push(organizer);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'EventExtracted', interview_type: null },
        };
      },
    });

    // Email with messageId that looks like an event cache key
    const tricky = makeEmailResult({
      messageId: 'event:evt-tricky',
      senderEmail: 'hr@tricky.com',
      senderDomain: 'tricky.com',
      companyName: 'tricky',
      score: 0.9,
    });

    // Real event whose eventId would match the messageId without prefix
    const realEvent = makeCalendarResult({
      eventId: 'evt-tricky',
      organizerEmail: 'hr@tricky.com',
      date: '2025-08-01',
    });

    let currentEmails = [tricky];
    let currentEvents = [realEvent];

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: both items should be individually extracted (no collision)
    await detector.detect();
    expect(emailLlmCalls).toHaveLength(1);
    expect(eventLlmCalls).toHaveLength(1);

    // Cycle 2: both should be cached separately
    emailLlmCalls.length = 0;
    eventLlmCalls.length = 0;
    await detector.detect();
    expect(emailLlmCalls).toHaveLength(0);
    expect(eventLlmCalls).toHaveLength(0);
  });

  it('messageId with spaces, unicode, and special chars cached correctly', async () => {
    const llmCalls = [];

    const extractor = spyLlmExtractor({
      emailHandler: () => {
        llmCalls.push(true);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'SpecialCo', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => null,
    });

    const specialIds = [
      'msg with spaces',
      'msg/with/slashes',
      'msg:with:colons',
      'msg\u00e9\u00e0\u00fc',     // unicode accents
      'msg<html>tag</html>',
    ];

    let currentEmails = [];
    let currentEvents = [];

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: all special IDs need LLM calls
    currentEmails = specialIds.map((id, i) => makeEmailResult({
      messageId: id,
      senderEmail: `hr@co${i}.com`,
      senderDomain: `co${i}.com`,
      companyName: `co${i}`,
      score: 0.9,
    }));
    currentEvents = specialIds.map((_, i) => makeCalendarResult({
      eventId: `evt${i}`,
      organizerEmail: `hr@co${i}.com`,
      date: `2025-09-0${i + 1}`,
    }));

    await detector.detect();
    expect(llmCalls).toHaveLength(specialIds.length);

    // Cycle 2: all should be cached — no new LLM calls
    llmCalls.length = 0;
    await detector.detect();
    expect(llmCalls).toHaveLength(0);
  });

  it('eventId matching email cache key prefix does not retrieve wrong data', async () => {
    // eventId = "email:msg-real" → cache key = "event:email:msg-real"
    // Ensure it does not accidentally match "email:msg-real" (a different item)
    const extractor = spyLlmExtractor({
      emailHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: 'FromEmail', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
      }),
      eventHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: 'FromEvent', interview_type: null },
      }),
    });

    const email = makeEmailResult({
      messageId: 'msg-real',
      senderEmail: 'hr@x.com',
      senderDomain: 'x.com',
      companyName: 'x',
      score: 0.9,
    });
    const event = makeCalendarResult({
      eventId: 'email:msg-real', // tricky eventId
      organizerEmail: 'hr@x.com',
      date: '2025-10-01',
    });

    let currentEmails = [email];
    let currentEvents = [event];

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: both should require individual LLM calls
    await detector.detect();
    expect(extractor.emailCalls).toHaveLength(1);
    expect(extractor.eventCalls).toHaveLength(1);

    // Cycle 2: both cached — no new calls
    extractor.emailCalls.length = 0;
    extractor.eventCalls.length = 0;
    await detector.detect();
    expect(extractor.emailCalls).toHaveLength(0);
    expect(extractor.eventCalls).toHaveLength(0);
  });
});

// ===========================================================================
// H4: Mixed cached/uncached items — parallel enrichment correctness
// ===========================================================================
describe('H4: mixed cached/uncached items — enrichment merges correctly', () => {
  it('cached emails enriched with stored data while new emails go through LLM', async () => {
    let emailCallCount = 0;

    const extractor = mockLlmExtractor({
      emailHandler: (_subject, _body, sender) => {
        emailCallCount++;
        return {
          dryModePrompt: null,
          extraction: { company_name: `LLM_${sender}_call${emailCallCount}`, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => null,
    });

    const email0 = makeEmailResult({ messageId: 'msg0', senderEmail: 'hr@a.com', senderDomain: 'a.com', companyName: 'a', score: 0.9 });
    const email1 = makeEmailResult({ messageId: 'msg1', senderEmail: 'hr@b.com', senderDomain: 'b.com', companyName: 'b', score: 0.9 });
    const email2 = makeEmailResult({ messageId: 'msg2', senderEmail: 'hr@c.com', senderDomain: 'c.com', companyName: 'c', score: 0.9 });

    const evt0 = makeCalendarResult({ eventId: 'evt0', organizerEmail: 'hr@a.com', date: '2025-11-01' });
    const evt1 = makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@b.com', date: '2025-11-02' });
    const evt2 = makeCalendarResult({ eventId: 'evt2', organizerEmail: 'hr@c.com', date: '2025-11-03' });

    let currentEmails = [email0, email1];
    let currentEvents = [evt0, evt1];

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: msg0, msg1 → both uncached, LLM called
    const result1 = await detector.detect();
    expect(emailCallCount).toBe(2);

    const s0_c1 = result1.find(s => s.emailMessageId === 'msg0');
    const s1_c1 = result1.find(s => s.emailMessageId === 'msg1');
    expect(s0_c1.companyName).toMatch(/^LLM_hr@a\.com/);
    expect(s1_c1.companyName).toMatch(/^LLM_hr@b\.com/);

    // Cycle 2: msg0 (cached), msg1 (cached), msg2 (new)
    currentEmails = [email0, email1, email2];
    currentEvents = [evt0, evt1, evt2];
    emailCallCount = 0;

    const result2 = await detector.detect();
    // Only msg2 should trigger LLM call
    expect(emailCallCount).toBe(1);

    // Cached items should use the same extraction from cycle 1
    const s0_c2 = result2.find(s => s.emailMessageId === 'msg0');
    const s1_c2 = result2.find(s => s.emailMessageId === 'msg1');
    const s2_c2 = result2.find(s => s.emailMessageId === 'msg2');

    expect(s0_c2.companyName).toBe(s0_c1.companyName); // same cached value
    expect(s1_c2.companyName).toBe(s1_c1.companyName); // same cached value
    expect(s2_c2.companyName).toMatch(/^LLM_hr@c\.com/); // fresh LLM call
  });

  it('failed LLM extractions are NOT cached — retried on next cycle', async () => {
    let callCount = 0;

    const extractor = mockLlmExtractor({
      emailHandler: () => {
        callCount++;
        if (callCount === 1) {
          // First call: API returns result but extraction is null (failure)
          return { dryModePrompt: null, extraction: null };
        }
        // Subsequent calls: success
        return {
          dryModePrompt: null,
          extraction: { company_name: 'RecoveredCo', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => null,
    });

    let currentEmails = [makeEmailResult({ messageId: 'retry-msg', senderEmail: 'hr@retry.com', senderDomain: 'retry.com', companyName: 'retry', score: 0.9 })];
    let currentEvents = [makeCalendarResult({ eventId: 'evt-retry', organizerEmail: 'hr@retry.com', date: '2025-12-01' })];

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: extraction fails (null) — NOT cached
    const result1 = await detector.detect();
    expect(callCount).toBe(1);
    const s1 = result1.find(s => s.emailMessageId === 'retry-msg');
    // companyName falls back to regex ('retry' capitalised)
    expect(s1.companyName).toBe('Retry');

    // Cycle 2: same email retried (not cached), this time succeeds
    const result2 = await detector.detect();
    expect(callCount).toBe(2);
    const s2 = result2.find(s => s.emailMessageId === 'retry-msg');
    expect(s2.companyName).toBe('RecoveredCo');

    // Cycle 3: now it should be cached — no new LLM call
    const result3 = await detector.detect();
    expect(callCount).toBe(2); // unchanged
    const s3 = result3.find(s => s.emailMessageId === 'retry-msg');
    expect(s3.companyName).toBe('RecoveredCo'); // same cached value
  });

  it('all items cached skips LLM entirely — fast path', async () => {
    let llmCalls = 0;

    const extractor = mockLlmExtractor({
      emailHandler: () => {
        llmCalls++;
        return {
          dryModePrompt: null,
          extraction: { company_name: 'CachedCo', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => {
        llmCalls++;
        return {
          dryModePrompt: null,
          extraction: { company_name: 'CachedEvtCo', interview_type: null },
        };
      },
    });

    const emails = [
      makeEmailResult({ messageId: 'fast0', senderEmail: 'hr@f0.com', senderDomain: 'f0.com', companyName: 'f0', score: 0.9 }),
      makeEmailResult({ messageId: 'fast1', senderEmail: 'hr@f1.com', senderDomain: 'f1.com', companyName: 'f1', score: 0.9 }),
    ];
    const events = [
      makeCalendarResult({ eventId: 'evtF0', organizerEmail: 'hr@f0.com', date: '2025-12-10' }),
      makeCalendarResult({ eventId: 'evtF1', organizerEmail: 'hr@f1.com', date: '2025-12-11' }),
    ];

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => emails },
      calendarService: { scanForInterviews: async () => events },
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: populate cache
    await detector.detect();
    const initialCalls = llmCalls;
    expect(initialCalls).toBe(4); // 2 emails + 2 events

    // Cycles 2-5: all cached — zero new LLM calls
    for (let i = 0; i < 4; i++) {
      await detector.detect();
    }
    expect(llmCalls).toBe(initialCalls); // unchanged
  });
});

// ===========================================================================
// H5: Reset does not affect extraction cache
// ===========================================================================
describe('H5: reset clears tokenStore dismissed state but NOT extraction cache', () => {
  it('clearDismissed makes previously dismissed items reappear, using cached extraction', async () => {
    let emailCallCount = 0;

    const extractor = mockLlmExtractor({
      emailHandler: () => {
        emailCallCount++;
        return {
          dryModePrompt: null,
          extraction: { company_name: 'LlmExtracted', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: null, interview_type: null },
      }),
    });

    const tokenStore = createMockTokenStore([
      { id: 'suggestion_msg1_evt1', emailId: 'msg1', calendarId: 'evt1' },
    ]);

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult()]),
      calendarService: mockCalendar([makeCalendarResult()]),
      tokenStore,
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: dismissed — no suggestions, but LLM extraction still happens and is cached
    const result1 = await detector.detect();
    expect(result1).toHaveLength(0);
    expect(emailCallCount).toBe(1); // LLM was called (enrichment happens before dismiss filter)

    // Simulate reset: clear dismissed state
    await tokenStore.clearDismissed();

    // Cycle 2: after reset — suggestion reappears, using CACHED extraction (no new LLM call)
    const result2 = await detector.detect();
    expect(result2).toHaveLength(1);
    expect(result2[0].companyName).toBe('LlmExtracted'); // from cache
    expect(emailCallCount).toBe(1); // no new LLM call — cache is intact
  });

  it('reset followed by new items: cached items skip LLM, new items call LLM', async () => {
    let emailCallCount = 0;

    const extractor = mockLlmExtractor({
      emailHandler: (_subject, _body, sender) => {
        emailCallCount++;
        return {
          dryModePrompt: null,
          extraction: { company_name: `LLM_${sender}`, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => null,
    });

    const tokenStore = createMockTokenStore([
      { id: 'suggestion_msg0_evt0', emailId: 'msg0', calendarId: 'evt0' },
    ]);

    const email0 = makeEmailResult({ messageId: 'msg0', senderEmail: 'hr@a.com', senderDomain: 'a.com', companyName: 'a', score: 0.9 });
    const evt0 = makeCalendarResult({ eventId: 'evt0', organizerEmail: 'hr@a.com', date: '2025-12-20' });

    let currentEmails = [email0];
    let currentEvents = [evt0];

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore,
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: msg0 dismissed but extracted + cached
    await detector.detect();
    expect(emailCallCount).toBe(1);

    // Reset dismissed state
    await tokenStore.clearDismissed();

    // Add a new email + event
    const email1 = makeEmailResult({ messageId: 'msg1', senderEmail: 'hr@b.com', senderDomain: 'b.com', companyName: 'b', score: 0.9 });
    const evt1 = makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@b.com', date: '2025-12-21' });

    currentEmails = [email0, email1];
    currentEvents = [evt0, evt1];
    emailCallCount = 0;

    // Cycle 2: msg0 from cache (no call), msg1 new (1 call)
    const result = await detector.detect();
    expect(emailCallCount).toBe(1); // only msg1
    expect(result).toHaveLength(2);

    const s0 = result.find(s => s.emailMessageId === 'msg0');
    const s1 = result.find(s => s.emailMessageId === 'msg1');
    expect(s0.companyName).toBe('LLM_hr@a.com'); // from cache
    expect(s1.companyName).toBe('LLM_hr@b.com'); // fresh
  });

  it('extraction cache survives multiple reset cycles', async () => {
    let emailCallCount = 0;

    const extractor = mockLlmExtractor({
      emailHandler: () => {
        emailCallCount++;
        return {
          dryModePrompt: null,
          extraction: { company_name: 'Persistent', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => null,
    });

    const tokenStore = createMockTokenStore();

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ score: 0.9 })]),
      calendarService: mockCalendar([makeCalendarResult()]),
      tokenStore,
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: populate cache
    await detector.detect();
    expect(emailCallCount).toBe(1);

    // 5 reset cycles — extraction cache should remain intact throughout
    for (let i = 0; i < 5; i++) {
      await tokenStore.clearDismissed();
      emailCallCount = 0;
      const result = await detector.detect();
      expect(emailCallCount).toBe(0); // always cached
      expect(result[0].companyName).toBe('Persistent');
    }
  });
});
