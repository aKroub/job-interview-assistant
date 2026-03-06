import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createInterviewDetector } from '../src/services/interviewDetector.js';
import { createMockTokenStore } from './helpers/mockTokenStore.js';

// ---------------------------------------------------------------------------
// Shared test helpers (same pattern as interviewDetector.test.js)
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

/**
 * Creates a mock LLM extractor with configurable per-call behavior.
 */
function mockLlmExtractor({ emailHandler, eventHandler } = {}) {
  const defaultEmailHandler = () => ({
    dryModePrompt: null,
    extraction: { company_name: 'LlmCo', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
  });
  const defaultEventHandler = () => ({
    dryModePrompt: null,
    extraction: { company_name: 'LlmCo', interview_type: null },
  });

  return {
    extractFromEmail: jest.fn(async (...args) => (emailHandler || defaultEmailHandler)(...args)),
    extractFromCalendarEvent: jest.fn(async (...args) => (eventHandler || defaultEventHandler)(...args)),
  };
}

// ---------------------------------------------------------------------------
// Shared console.log spy — set up / torn down per test
// ---------------------------------------------------------------------------
let logSpy;

beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

/** Returns all console.log calls whose first argument contains `needle`. */
function logCallsContaining(needle) {
  return logSpy.mock.calls.filter(
    (args) => typeof args[0] === 'string' && args[0].includes(needle),
  );
}

// ===========================================================================
// H1: logLevel param is threaded through — every call site respects it
//
// All 4 gated log sites must be silent at 'info' (default) and fire at 'debug'.
// This tests each gated log site INDIVIDUALLY.
// ===========================================================================
describe('H1: logLevel param is threaded through all 4 gated log sites', () => {
  // --- Gated site 1: LOW-SCORE email log (lines 495-502) ---
  describe('LOW-SCORE email log', () => {
    it('is silent at default logLevel (info)', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ messageId: 'low-email-1', score: 0.2 })]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        // logLevel defaults to 'info'
      });

      await detector.detect();

      expect(logCallsContaining('LOW-SCORE email')).toHaveLength(0);
    });

    it('fires at logLevel debug', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([makeEmailResult({ messageId: 'low-email-2', score: 0.2 })]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        logLevel: 'debug',
      });

      await detector.detect();

      const calls = logCallsContaining('LOW-SCORE email');
      expect(calls.length).toBeGreaterThanOrEqual(1);
      // Verify the log contains the messageId for traceability
      expect(calls[0][0]).toContain('low-email-2');
    });
  });

  // --- Gated site 2: LOW-SCORE event log (lines 544-551) ---
  describe('LOW-SCORE event log', () => {
    it('is silent at default logLevel (info)', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([
          makeCalendarResult({ eventId: 'low-evt-1', score: 0.2 }),
        ]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        // logLevel defaults to 'info'
      });

      await detector.detect();

      expect(logCallsContaining('LOW-SCORE event')).toHaveLength(0);
    });

    it('fires at logLevel debug', async () => {
      const detector = createInterviewDetector({
        gmailService: mockGmail([]),
        calendarService: mockCalendar([
          makeCalendarResult({ eventId: 'low-evt-2', score: 0.2 }),
        ]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        logLevel: 'debug',
      });

      await detector.detect();

      const calls = logCallsContaining('LOW-SCORE event');
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0][0]).toContain('low-evt-2');
    });
  });

  // --- Gated site 3: CROSS-REF-MATCHED event log (lines 516-524) ---
  // This fires for calendar events that matched an email via cross-reference
  // but didn't produce a standalone suggestion (e.g. the cross-ref was dismissed).
  describe('CROSS-REF-MATCHED event log', () => {
    it('is silent at default logLevel (info)', async () => {
      // Create a cross-ref match, then dismiss it so the event falls into the
      // "matchedEventIds but no suggestion" path.
      const email = makeEmailResult({ messageId: 'cross-msg-1' });
      const event = makeCalendarResult({ eventId: 'cross-evt-1' });

      const detector = createInterviewDetector({
        gmailService: mockGmail([email]),
        calendarService: mockCalendar([event]),
        tokenStore: createMockTokenStore([
          { id: 'suggestion_cross-msg-1_cross-evt-1', emailId: 'cross-msg-1', calendarId: '' },
        ]),
        idFn: fixedId,
        // logLevel defaults to 'info'
      });

      await detector.detect();

      expect(logCallsContaining('CROSS-REF-MATCHED')).toHaveLength(0);
    });

    it('fires at logLevel debug', async () => {
      const email = makeEmailResult({ messageId: 'cross-msg-2' });
      const event = makeCalendarResult({ eventId: 'cross-evt-2' });

      const detector = createInterviewDetector({
        gmailService: mockGmail([email]),
        calendarService: mockCalendar([event]),
        tokenStore: createMockTokenStore([
          { id: 'suggestion_cross-msg-2_cross-evt-2', emailId: 'cross-msg-2', calendarId: '' },
        ]),
        idFn: fixedId,
        logLevel: 'debug',
      });

      await detector.detect();

      const calls = logCallsContaining('CROSS-REF-MATCHED');
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0][0]).toContain('cross-evt-2');
    });
  });

  // --- Gated site 4: Skipped LLM extraction log (lines 175-179) ---
  // This fires when lowScoreEmailIds/lowScoreEventIds cause LLM skips.
  describe('Skipped LLM extraction log', () => {
    it('is silent at default logLevel (info)', async () => {
      const extractor = mockLlmExtractor();
      const lowEmail = makeEmailResult({ messageId: 'skip-llm-1', score: 0.2 });

      const detector = createInterviewDetector({
        gmailService: mockGmail([lowEmail]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
        // logLevel defaults to 'info'
      });

      // Cycle 1: email gets scored low and added to lowScoreEmailIds
      await detector.detect();
      // Cycle 2: same email triggers "Skipped LLM extraction" path
      await detector.detect();

      expect(logCallsContaining('Skipped LLM extraction')).toHaveLength(0);
    });

    it('fires at logLevel debug', async () => {
      const extractor = mockLlmExtractor();
      const lowEmail = makeEmailResult({ messageId: 'skip-llm-2', score: 0.2 });

      const detector = createInterviewDetector({
        gmailService: mockGmail([lowEmail]),
        calendarService: mockCalendar([]),
        tokenStore: createMockTokenStore(),
        idFn: fixedId,
        llmExtractor: extractor,
        logLevel: 'debug',
      });

      // Cycle 1: email gets scored low and added to lowScoreEmailIds
      await detector.detect();
      logSpy.mockClear();
      // Cycle 2: same email triggers "Skipped LLM extraction" path
      await detector.detect();

      const calls = logCallsContaining('Skipped LLM extraction');
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0][0]).toContain('low-score email');
    });
  });
});

// ===========================================================================
// H2: existing tests that don't pass logLevel still work (default 'info')
//
// The default value must be 'info', not undefined or 'debug'. Verify that
// constructing a detector with no logLevel behaves identically to passing
// logLevel: 'info' — suggestions are identical and no debug logs leak.
// ===========================================================================
describe('H2: default logLevel is info — no debug logs without explicit opt-in', () => {
  it('produces identical suggestions with default vs explicit info logLevel', async () => {
    const email = makeEmailResult({ score: 0.8 });
    const event = makeCalendarResult();

    const detectorDefault = createInterviewDetector({
      gmailService: mockGmail([email]),
      calendarService: mockCalendar([event]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
    });

    const detectorExplicitInfo = createInterviewDetector({
      gmailService: mockGmail([email]),
      calendarService: mockCalendar([event]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      logLevel: 'info',
    });

    const suggestionsDefault = await detectorDefault.detect();
    const suggestionsInfo = await detectorExplicitInfo.detect();

    expect(suggestionsDefault).toEqual(suggestionsInfo);
  });

  it('emits zero debug-gated logs when logLevel is omitted', async () => {
    // Scenario that would produce ALL 4 gated log categories:
    // - Low-score email → LOW-SCORE email
    // - Low-score event → LOW-SCORE event
    // - Cross-ref dismissed event → CROSS-REF-MATCHED
    // - Second cycle low-score with LLM → Skipped LLM extraction
    const lowEmail = makeEmailResult({ messageId: 'h2-email', score: 0.2 });
    const lowEvent = makeCalendarResult({ eventId: 'h2-event', score: 0.2 });
    const crossEmail = makeEmailResult({ messageId: 'h2-cross-email', score: 0.8 });
    const crossEvent = makeCalendarResult({ eventId: 'h2-cross-event', score: 0.7 });

    const extractor = mockLlmExtractor();

    const detector = createInterviewDetector({
      gmailService: mockGmail([lowEmail, crossEmail]),
      calendarService: mockCalendar([lowEvent, crossEvent]),
      tokenStore: createMockTokenStore([
        { id: 'suggestion_h2-cross-email_h2-cross-event', emailId: 'h2-cross-email', calendarId: '' },
      ]),
      idFn: fixedId,
      llmExtractor: extractor,
      // logLevel omitted — must default to 'info'
    });

    // Two cycles to trigger the "Skipped LLM" path as well
    await detector.detect();
    await detector.detect();

    const debugPatterns = ['LOW-SCORE email', 'LOW-SCORE event', 'CROSS-REF-MATCHED', 'Skipped LLM extraction'];
    for (const pattern of debugPatterns) {
      expect(logCallsContaining(pattern)).toHaveLength(0);
    }
  });

  it('does NOT break suggestion generation — cross-ref still works', async () => {
    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult()]),
      calendarService: mockCalendar([makeCalendarResult()]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      // No logLevel — default 'info'
    });

    const suggestions = await detector.detect();

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].source).toBe('gmail+calendar');
    expect(suggestions[0].companyName).toBe('Google');
  });
});

// ===========================================================================
// H3: DISMISSED event log (not gated) still fires correctly at info level
//
// The DISMISSED event log on lines 533-540 is intentionally NOT gated by
// logLevel — it should fire at both 'info' and 'debug' levels.
// ===========================================================================
describe('H3: DISMISSED event log fires regardless of logLevel', () => {
  /**
   * Creates a detector with a dismissed calendar-only event that triggers the
   * DISMISSED event log path. The event must:
   * - Not match any email (no cross-ref)
   * - Not be in usedEventIds or matchedEventIds
   * - Have its calendarId in dismissed.calendarIds
   * - Score below CALENDAR_ONLY_MIN_SCORE or be dismissed via component check
   */
  function createDismissedEventScenario(logLevelOverride) {
    // Event with score above the calendar-only threshold but dismissed by calendarId
    const event = makeCalendarResult({
      eventId: 'dismissed-evt-h3',
      score: 0.7,
    });

    const opts = {
      gmailService: mockGmail([]),
      calendarService: mockCalendar([event]),
      tokenStore: createMockTokenStore([
        { id: 'suggestion_calendar_dismissed-evt-h3', emailId: '', calendarId: 'dismissed-evt-h3' },
      ]),
      idFn: fixedId,
    };

    if (logLevelOverride !== undefined) {
      opts.logLevel = logLevelOverride;
    }

    return createInterviewDetector(opts);
  }

  it('fires DISMISSED log at default logLevel (info)', async () => {
    const detector = createDismissedEventScenario();

    await detector.detect();

    const calls = logCallsContaining('DISMISSED event');
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toContain('dismissed-evt-h3');
  });

  it('fires DISMISSED log at logLevel debug', async () => {
    const detector = createDismissedEventScenario('debug');

    await detector.detect();

    const calls = logCallsContaining('DISMISSED event');
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toContain('dismissed-evt-h3');
  });

  it('fires DISMISSED log at explicit logLevel info', async () => {
    const detector = createDismissedEventScenario('info');

    await detector.detect();

    const calls = logCallsContaining('DISMISSED event');
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toContain('dismissed-evt-h3');
  });
});

// ===========================================================================
// H4: circuit breaker log (not gated) still fires correctly
//
// The circuit breaker OPEN log on lines 134-138 is NOT gated by logLevel.
// It should fire at both 'info' and 'debug' when the breaker threshold is hit.
// ===========================================================================
describe('H4: circuit breaker OPEN log fires regardless of logLevel', () => {
  /**
   * The circuit breaker counts "API calls" as fulfilled promises where
   * result !== null. Throwing an error yields status=rejected which is
   * skipped entirely. To trigger the breaker, the mock must return a
   * fulfilled promise with extraction: null (API call made, but failed).
   *
   * Each cycle must provide NEW (uncached) items, otherwise the cache
   * returns immediately and no API calls are made (batchApiCalls=0).
   */
  function createBreakerScenario(logLevelOverride) {
    const failingExtractor = mockLlmExtractor({
      emailHandler: () => ({ dryModePrompt: null, extraction: null }),
      eventHandler: () => ({ dryModePrompt: null, extraction: null }),
    });

    // Provide unique email/event IDs each cycle so nothing is cached
    let cycle = 0;
    const gmailPerCycle = {
      scanForInterviews: async () => {
        cycle++;
        return [makeEmailResult({ messageId: `brk-email-${cycle}`, score: 0.8 })];
      },
    };
    const calPerCycle = {
      scanForInterviews: async () =>
        [makeCalendarResult({ eventId: `brk-evt-${cycle}`, score: 0.7 })],
    };

    const opts = {
      gmailService: gmailPerCycle,
      calendarService: calPerCycle,
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: failingExtractor,
      breakerThreshold: 2, // Opens after 2 consecutive all-fail batches
    };

    if (logLevelOverride !== undefined) {
      opts.logLevel = logLevelOverride;
    }

    return createInterviewDetector(opts);
  }

  it('fires circuit breaker log at default logLevel (info)', async () => {
    const detector = createBreakerScenario();

    // Cycle 1: enrichWithLlm runs, null extractions → batchApiCalls > 0,
    //   batchSuccesses = 0 → consecutiveAllFailBatches = 1
    // Cycle 2: same → consecutiveAllFailBatches = 2 (= threshold)
    await detector.detect();
    await detector.detect();
    logSpy.mockClear();

    // Cycle 3: breaker check runs BEFORE LLM calls →
    //   consecutiveAllFailBatches (2) >= breakerThreshold (2) → logs & skips
    await detector.detect();

    const calls = logCallsContaining('Circuit breaker OPEN');
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('fires circuit breaker log at logLevel debug', async () => {
    const detector = createBreakerScenario('debug');

    await detector.detect();
    await detector.detect();
    logSpy.mockClear();

    await detector.detect();

    const calls = logCallsContaining('Circuit breaker OPEN');
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('fires circuit breaker log at explicit logLevel info', async () => {
    const detector = createBreakerScenario('info');

    await detector.detect();
    await detector.detect();
    logSpy.mockClear();

    await detector.detect();

    const calls = logCallsContaining('Circuit breaker OPEN');
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// H5: logLevel is closure-captured, not mutable — no race condition
//
// logLevel is a destructured parameter captured in the closure at construction
// time. Verify that:
// (a) Two detectors with different logLevels running concurrently don't
//     interfere with each other.
// (b) The logLevel cannot be changed after construction.
// ===========================================================================
describe('H5: logLevel is immutably closure-captured — no cross-instance interference', () => {
  it('two concurrent detectors with different logLevels do not interfere', async () => {
    // Scenario: low-score email that triggers LOW-SCORE email log
    const lowEmail = makeEmailResult({ messageId: 'h5-low', score: 0.2 });

    const detectorInfo = createInterviewDetector({
      gmailService: mockGmail([lowEmail]),
      calendarService: mockCalendar([]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      logLevel: 'info',
    });

    const detectorDebug = createInterviewDetector({
      gmailService: mockGmail([lowEmail]),
      calendarService: mockCalendar([]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      logLevel: 'debug',
    });

    // Run both concurrently
    const [infoSuggestions, debugSuggestions] = await Promise.all([
      detectorInfo.detect(),
      detectorDebug.detect(),
    ]);

    // Both produce the same result (no suggestions — low score)
    expect(infoSuggestions).toEqual([]);
    expect(debugSuggestions).toEqual([]);

    // Only the debug detector should have produced LOW-SCORE logs.
    // The info detector must NOT have leaked any.
    const lowScoreCalls = logCallsContaining('LOW-SCORE email');
    // Exactly 1 from the debug detector (the info one is silent)
    expect(lowScoreCalls).toHaveLength(1);
  });

  it('logLevel is not exposed or mutable on the detector object', () => {
    const detector = createInterviewDetector({
      gmailService: mockGmail([]),
      calendarService: mockCalendar([]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      logLevel: 'info',
    });

    // The detector only exposes { detect }, not logLevel
    expect(Object.keys(detector)).toEqual(['detect']);
    expect(detector.logLevel).toBeUndefined();
  });

  it('multiple sequential cycles on the same detector maintain logLevel', async () => {
    const extractor = mockLlmExtractor();

    // Feed a different low-score email each cycle (unique messageIds) so each
    // cycle produces a fresh LOW-SCORE log, not deduplicated by lowScoreEmailIds.
    let cycleCounter = 0;

    function gmailPerCycle() {
      return {
        scanForInterviews: async () => {
          cycleCounter++;
          return [makeEmailResult({ messageId: `seq-${cycleCounter}`, score: 0.2 })];
        },
      };
    }

    const detector = createInterviewDetector({
      gmailService: gmailPerCycle(),
      calendarService: mockCalendar([]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
      logLevel: 'debug',
    });

    // 5 cycles, each with a unique low-score email
    for (let i = 0; i < 5; i++) {
      await detector.detect();
    }

    // Each cycle should produce exactly one LOW-SCORE email log
    const calls = logCallsContaining('LOW-SCORE email');
    expect(calls).toHaveLength(5);
  });

  it('logLevel info detector stays silent even after running alongside debug detector', async () => {
    // Interleaved execution: info → debug → info → debug
    // Use a messageId prefix that is NOT a substring of the debug detector's IDs
    const infoDetector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ messageId: 'info-only-x', score: 0.2 })]),
      calendarService: mockCalendar([]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      logLevel: 'info',
    });

    let debugCycle = 0;
    const debugGmail = {
      scanForInterviews: async () => {
        debugCycle++;
        return [makeEmailResult({ messageId: `dbg-cycle-${debugCycle}`, score: 0.2 })];
      },
    };

    const debugDetector = createInterviewDetector({
      gmailService: debugGmail,
      calendarService: mockCalendar([]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      logLevel: 'debug',
    });

    // Interleave: info, debug, info (second info cycle — email already in lowScoreEmailIds, no re-log)
    await infoDetector.detect();
    await debugDetector.detect();
    await infoDetector.detect();
    await debugDetector.detect();

    // Only the debug detector's logs should appear
    const lowScoreCalls = logCallsContaining('LOW-SCORE email');
    for (const call of lowScoreCalls) {
      expect(call[0]).toContain('dbg-cycle');
      expect(call[0]).not.toContain('info-only-x');
    }
  });
});
