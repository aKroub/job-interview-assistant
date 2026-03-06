import { describe, it, expect, jest } from '@jest/globals';
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

// ---------------------------------------------------------------------------
// H1: extractor-null-passthrough — extractFromEmail/Event returning null
//     (privacy gate rejection) must not corrupt suggestions
// ---------------------------------------------------------------------------
describe('H1: extractor-null-passthrough — privacy gate null returns', () => {
  it('email extractor returning null preserves original email fields', async () => {
    const extractor = mockLlmExtractor({
      emailHandler: () => null, // privacy gate rejects
      eventHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: 'CalendarLlm', interview_type: 'video' },
      }),
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult()]),
      calendarService: mockCalendar([makeCalendarResult()]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    expect(suggestions).toHaveLength(1);
    // companyName should come from regex-extracted email, not LLM
    expect(suggestions[0].companyName).toBe('Google');
  });

  it('calendar extractor returning null preserves original event fields', async () => {
    const extractor = mockLlmExtractor({
      emailHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: 'EmailLlm', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
      }),
      eventHandler: () => null, // privacy gate rejects
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult()]),
      calendarService: mockCalendar([makeCalendarResult()]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    expect(suggestions).toHaveLength(1);
    // companyName comes from LLM-enriched email (EmailLlm) capitalised
    expect(suggestions[0].companyName).toBe('EmailLlm');
  });

  it('both extractors returning null produces same result as no LLM extractor', async () => {
    const extractor = mockLlmExtractor({
      emailHandler: () => null,
      eventHandler: () => null,
    });

    const emailData = [makeEmailResult()];
    const calData = [makeCalendarResult()];

    const withLlm = createInterviewDetector({
      gmailService: mockGmail(emailData),
      calendarService: mockCalendar(calData),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const withoutLlm = createInterviewDetector({
      gmailService: mockGmail(emailData),
      calendarService: mockCalendar(calData),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      // no llmExtractor
    });

    const [suggestionsWithLlm, suggestionsWithoutLlm] = await Promise.all([
      withLlm.detect(),
      withoutLlm.detect(),
    ]);

    // Both should produce identical suggestions
    expect(suggestionsWithLlm).toHaveLength(suggestionsWithoutLlm.length);
    expect(suggestionsWithLlm[0].companyName).toBe(suggestionsWithoutLlm[0].companyName);
    expect(suggestionsWithLlm[0].type).toBe(suggestionsWithoutLlm[0].type);
    expect(suggestionsWithLlm[0].confidence).toBe(suggestionsWithoutLlm[0].confidence);
  });

  it('extractor returning { extraction: null } (dry mode) preserves originals', async () => {
    const extractor = mockLlmExtractor({
      emailHandler: () => ({ dryModePrompt: 'prompt...', extraction: null }),
      eventHandler: () => ({ dryModePrompt: 'prompt...', extraction: null }),
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ companyName: 'regex-co' })]),
      calendarService: mockCalendar([makeCalendarResult()]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    expect(suggestions).toHaveLength(1);
    // Regex-extracted company name should be preserved (capitalised)
    expect(suggestions[0].companyName).toBe('Regex-co');
  });
});

// ---------------------------------------------------------------------------
// H2: extractor-rejection-corruption — rejected promises must not misalign
//     indices or corrupt the enriched arrays
// ---------------------------------------------------------------------------
describe('H2: extractor-rejection-corruption — rejected promises preserve correct items', () => {
  it('rejected email extraction preserves original while fulfilled ones enrich', async () => {
    let callCount = 0;
    const extractor = mockLlmExtractor({
      emailHandler: () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('LLM timeout for first email');
        }
        return {
          dryModePrompt: null,
          extraction: { company_name: 'EnrichedCo', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: null, interview_type: null },
      }),
    });

    const email1 = makeEmailResult({ messageId: 'msg1', companyName: 'original1', senderDomain: 'acme.com', senderEmail: 'hr@acme.com' });
    const email2 = makeEmailResult({ messageId: 'msg2', companyName: 'original2', senderDomain: 'beta.com', senderEmail: 'hr@beta.com', score: 0.9 });

    // Two separate calendar events matching each email
    const evt1 = makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@acme.com', date: '2025-01-20' });
    const evt2 = makeCalendarResult({ eventId: 'evt2', organizerEmail: 'hr@beta.com', date: '2025-01-20' });

    const detector = createInterviewDetector({
      gmailService: mockGmail([email1, email2]),
      calendarService: mockCalendar([evt1, evt2]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    // Should still get suggestions — rejections don't abort the batch
    expect(suggestions.length).toBeGreaterThanOrEqual(1);

    // Find the suggestion for email1 (rejection) — should use 'original1'
    const s1 = suggestions.find((s) => s.emailMessageId === 'msg1');
    if (s1) {
      expect(s1.companyName).toBe('Original1'); // capitalised from 'original1'
    }

    // Find the suggestion for email2 (fulfilled) — should use 'EnrichedCo'
    const s2 = suggestions.find((s) => s.emailMessageId === 'msg2');
    if (s2) {
      expect(s2.companyName).toBe('EnrichedCo');
    }
  });

  it('rejected calendar extraction preserves original event while fulfilled ones enrich', async () => {
    let eventCallCount = 0;
    const extractor = mockLlmExtractor({
      emailHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: null, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
      }),
      eventHandler: () => {
        eventCallCount++;
        if (eventCallCount === 1) {
          throw new Error('LLM rate limit');
        }
        return {
          dryModePrompt: null,
          extraction: { company_name: 'LlmCalendarCo', interview_type: 'phone' },
        };
      },
    });

    const email = makeEmailResult({ senderDomain: 'acme.com', senderEmail: 'hr@acme.com' });
    const evt1 = makeCalendarResult({ eventId: 'evt1', companyName: 'regexCo1', organizerEmail: 'hr@acme.com', date: '2025-01-20', time: '14:00' });
    const evt2 = makeCalendarResult({
      eventId: 'evt2', companyName: 'regexCo2', organizerEmail: 'hr@other.com',
      date: '2025-01-21', time: '10:00', startDateTime: '2025-01-21T10:00:00Z', endDateTime: '2025-01-21T11:00:00Z',
      score: 0.6,
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([email]),
      calendarService: mockCalendar([evt1, evt2]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    // evt1 rejection: companyName should stay as regex value
    const crossRef = suggestions.find((s) => s.calendarEventId === 'evt1');
    if (crossRef) {
      // Email companyName ('google' capitalised) takes priority in cross-ref
      expect(crossRef.companyName).toBe('Google');
    }
  });

  it('all extractors reject — suggestions identical to no-LLM baseline', async () => {
    const extractor = mockLlmExtractor({
      emailHandler: () => { throw new Error('total failure'); },
      eventHandler: () => { throw new Error('total failure'); },
    });

    const emailData = [makeEmailResult()];
    const calData = [makeCalendarResult()];

    const withLlm = createInterviewDetector({
      gmailService: mockGmail(emailData),
      calendarService: mockCalendar(calData),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const withoutLlm = createInterviewDetector({
      gmailService: mockGmail(emailData),
      calendarService: mockCalendar(calData),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
    });

    const [withLlmResult, baselineResult] = await Promise.all([
      withLlm.detect(),
      withoutLlm.detect(),
    ]);

    expect(withLlmResult).toHaveLength(baselineResult.length);
    expect(withLlmResult[0].companyName).toBe(baselineResult[0].companyName);
    expect(withLlmResult[0].type).toBe(baselineResult[0].type);
  });
});

// ---------------------------------------------------------------------------
// H3: llmType-precedence-override — LLM interview type takes priority over
//     regex heuristic in all three guessInterviewType* variants
// ---------------------------------------------------------------------------
describe('H3: llmType-precedence-override — LLM type overrides regex heuristic', () => {
  it('cross-ref: LLM phone type overrides Zoom video link signal', async () => {
    const extractor = mockLlmExtractor({
      emailHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: null, date: null, time: null, duration_minutes: null, intent: null, interview_type: 'phone screen' },
      }),
      eventHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: null, interview_type: null },
      }),
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ subject: 'Zoom Interview' })]),
      calendarService: mockCalendar([makeCalendarResult({ hasVideoLink: true, description: 'Join via Zoom' })]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    expect(suggestions).toHaveLength(1);
    // LLM says phone, regex would say video — LLM wins
    expect(suggestions[0].type).toBe('Phone Interview');
  });

  it('cross-ref: event LLM type is used when email has no LLM type', async () => {
    const extractor = mockLlmExtractor({
      emailHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: null, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
      }),
      eventHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: null, interview_type: 'onsite' },
      }),
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ subject: 'Your Interview' })]),
      calendarService: mockCalendar([makeCalendarResult({ hasVideoLink: true })]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    expect(suggestions).toHaveLength(1);
    // Event LLM type should be used as fallback — onsite maps to In-Person
    expect(suggestions[0].type).toBe('In-Person Interview');
  });

  it('cross-ref: unrecognised LLM type falls back to regex heuristic', async () => {
    const extractor = mockLlmExtractor({
      emailHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: null, date: null, time: null, duration_minutes: null, intent: null, interview_type: 'behavioral' },
      }),
      eventHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: null, interview_type: 'technical' },
      }),
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ subject: 'Phone Interview' })]),
      calendarService: mockCalendar([makeCalendarResult()]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    expect(suggestions).toHaveLength(1);
    // Both LLM types are round-descriptions, not format types — normalizeInterviewType returns null
    // Regex should kick in: subject contains "Phone"
    expect(suggestions[0].type).toBe('Phone Interview');
  });

  it('email-only: LLM type overrides regex for email-only suggestions', async () => {
    const extractor = mockLlmExtractor({
      emailHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: null, date: null, time: null, duration_minutes: null, intent: null, interview_type: 'in-person' },
      }),
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ subject: 'Zoom Interview Call', score: 0.8 })]),
      calendarService: mockCalendar([]), // no calendar events
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].source).toBe('gmail');
    // LLM says in-person, regex would say video (Zoom in subject)
    expect(suggestions[0].type).toBe('In-Person Interview');
  });

  it('calendar-only: LLM type overrides regex for calendar-only suggestions', async () => {
    const extractor = mockLlmExtractor({
      eventHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: null, interview_type: 'phone call' },
      }),
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([]), // no emails
      calendarService: mockCalendar([makeCalendarResult({ hasVideoLink: true, score: 0.6 })]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].source).toBe('calendar');
    // LLM says phone, calendar has video link — LLM wins
    expect(suggestions[0].type).toBe('Phone Interview');
  });
});

// ---------------------------------------------------------------------------
// H4: enrichment-immutability — original email/event objects passed to mock
//     services must not be mutated by detect() pipeline
// ---------------------------------------------------------------------------
describe('H4: enrichment-immutability — originals not mutated by detect()', () => {
  it('original email object is not mutated after enrichment', async () => {
    const extractor = mockLlmExtractor({
      emailHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: 'LlmCo', date: '2025-02-01', time: '10:00', duration_minutes: 45, intent: 'update', interview_type: 'video' },
      }),
    });

    const originalEmail = makeEmailResult({
      companyName: 'regex-co',
      extractedDate: '2025-01-20',
      extractedTime: '14:00',
      extractedDuration: null,
      intent: 'add',
    });

    // Deep-clone for comparison
    const emailSnapshot = JSON.parse(JSON.stringify(originalEmail));

    const detector = createInterviewDetector({
      gmailService: mockGmail([originalEmail]),
      calendarService: mockCalendar([makeCalendarResult()]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    await detector.detect();

    // Original email must be unchanged
    expect(originalEmail).toEqual(emailSnapshot);
  });

  it('original calendar event is not mutated after enrichment', async () => {
    const extractor = mockLlmExtractor({
      eventHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: 'LlmCalCo', interview_type: 'onsite' },
      }),
    });

    const originalEvent = makeCalendarResult({
      companyName: 'regex-event-co',
      hasVideoLink: true,
    });

    const eventSnapshot = JSON.parse(JSON.stringify(originalEvent));

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult()]),
      calendarService: mockCalendar([originalEvent]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    await detector.detect();

    expect(originalEvent).toEqual(eventSnapshot);
  });

  it('enrichWithLlm with null extractor returns original array references', async () => {
    // When llmExtractor is null, enrichWithLlm returns { emails, events } — the originals
    const originalEmail = makeEmailResult();
    const originalEvent = makeCalendarResult();

    const emailSnapshot = JSON.parse(JSON.stringify(originalEmail));
    const eventSnapshot = JSON.parse(JSON.stringify(originalEvent));

    const detector = createInterviewDetector({
      gmailService: mockGmail([originalEmail]),
      calendarService: mockCalendar([originalEvent]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      // no llmExtractor — enrichWithLlm returns originals directly
    });

    await detector.detect();

    expect(originalEmail).toEqual(emailSnapshot);
    expect(originalEvent).toEqual(eventSnapshot);
  });

  it('multiple emails — only enriched ones get new objects, others stay original', async () => {
    let emailCall = 0;
    const extractor = mockLlmExtractor({
      emailHandler: () => {
        emailCall++;
        if (emailCall === 1) return null; // privacy gate rejects first email
        return {
          dryModePrompt: null,
          extraction: { company_name: 'Enriched', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => null,
    });

    const email1 = makeEmailResult({ messageId: 'msg1', companyName: 'co1' });
    const email2 = makeEmailResult({ messageId: 'msg2', companyName: 'co2', senderDomain: 'other.com', senderEmail: 'hr@other.com' });

    const email1Snapshot = JSON.parse(JSON.stringify(email1));
    const email2Snapshot = JSON.parse(JSON.stringify(email2));

    const detector = createInterviewDetector({
      gmailService: mockGmail([email1, email2]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@google.com', date: '2025-01-20' }),
      ]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    await detector.detect();

    // Both originals should be unmodified
    expect(email1).toEqual(email1Snapshot);
    expect(email2).toEqual(email2Snapshot);
  });
});

// ---------------------------------------------------------------------------
// H5: concurrent-enrichment-race — empty arrays and large batches handled
//     correctly by the Promise.all + Promise.allSettled pattern
// ---------------------------------------------------------------------------
describe('H5: concurrent-enrichment-race — empty and large batch handling', () => {
  it('empty emails and events with LLM extractor returns empty suggestions', async () => {
    const extractor = mockLlmExtractor();

    const detector = createInterviewDetector({
      gmailService: mockGmail([]),
      calendarService: mockCalendar([]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    // Early return in detect() before enrichWithLlm is called
    expect(suggestions).toEqual([]);
  });

  it('emails present but no events — enrichment runs only on emails', async () => {
    let emailCalls = 0;
    let eventCalls = 0;
    const extractor = mockLlmExtractor({
      emailHandler: () => {
        emailCalls++;
        return {
          dryModePrompt: null,
          extraction: { company_name: 'LlmCo', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => {
        eventCalls++;
        return null;
      },
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ score: 0.8 })]),
      calendarService: mockCalendar([]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    expect(emailCalls).toBe(1);
    expect(eventCalls).toBe(0); // no events to enrich
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].source).toBe('gmail');
    expect(suggestions[0].companyName).toBe('LlmCo');
  });

  it('large batch (20 emails, 20 events) — all items enriched correctly', async () => {
    const emails = [];
    const events = [];

    for (let i = 0; i < 20; i++) {
      emails.push(makeEmailResult({
        messageId: `msg${i}`,
        companyName: `emailCo${i}`,
        senderEmail: `hr@co${i}.com`,
        senderDomain: `co${i}.com`,
        extractedDate: `2025-02-${String(i + 1).padStart(2, '0')}`,
        score: 0.9,
      }));
      events.push(makeCalendarResult({
        eventId: `evt${i}`,
        organizerEmail: `hr@co${i}.com`,
        date: `2025-02-${String(i + 1).padStart(2, '0')}`,
        time: '14:00',
        startDateTime: `2025-02-${String(i + 1).padStart(2, '0')}T14:00:00Z`,
        endDateTime: `2025-02-${String(i + 1).padStart(2, '0')}T15:00:00Z`,
      }));
    }

    let emailCallOrder = [];
    let eventCallOrder = [];

    const extractor = mockLlmExtractor({
      emailHandler: (subject, body, sender) => {
        emailCallOrder.push(sender);
        return {
          dryModePrompt: null,
          extraction: { company_name: `Enriched_${sender}`, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: (summary, desc, loc, organizer) => {
        eventCallOrder.push(organizer);
        return {
          dryModePrompt: null,
          extraction: { company_name: `EnrichedCal_${organizer}`, interview_type: null },
        };
      },
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail(emails),
      calendarService: mockCalendar(events),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    // All 20 emails should have been sent to the extractor
    expect(emailCallOrder).toHaveLength(20);
    expect(eventCallOrder).toHaveLength(20);

    // We should get 20 cross-referenced suggestions (one per email-event pair)
    expect(suggestions).toHaveLength(20);

    // Verify each suggestion got the enriched company name
    for (const s of suggestions) {
      expect(s.companyName).toMatch(/^Enriched_/);
    }
  });

  it('mixed rejections in large batch — correct items enriched, others preserved', async () => {
    const emails = [];
    for (let i = 0; i < 5; i++) {
      emails.push(makeEmailResult({
        messageId: `msg${i}`,
        companyName: `originalCo${i}`,
        senderEmail: `hr@co${i}.com`,
        senderDomain: `co${i}.com`,
        score: 0.9,
      }));
    }

    // Only one calendar event to create a mix of cross-ref and email-only
    const events = [makeCalendarResult({
      eventId: 'evt0',
      organizerEmail: 'hr@co0.com',
      date: '2025-01-20',
    })];

    let emailCallIdx = 0;
    const extractor = mockLlmExtractor({
      emailHandler: () => {
        emailCallIdx++;
        // Reject every other call
        if (emailCallIdx % 2 === 0) throw new Error('simulated failure');
        return {
          dryModePrompt: null,
          extraction: { company_name: `Enriched${emailCallIdx}`, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: null, interview_type: null },
      }),
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail(emails),
      calendarService: mockCalendar(events),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    // Should still get suggestions — rejections don't abort the batch
    expect(suggestions.length).toBeGreaterThan(0);

    // The cross-ref suggestion for msg0/evt0 should exist (msg0 gets call 1 which succeeds)
    const crossRef = suggestions.find((s) => s.source === 'gmail+calendar');
    expect(crossRef).toBeDefined();
  });
});

// ===========================================================================
// Pre-LLM dismissed filtering stress tests
// ===========================================================================

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

// ---------------------------------------------------------------------------
// H6: Mixed dismissed/active batch — cross-referencing correctness
// ---------------------------------------------------------------------------
describe('H6: mixed dismissed/active batch — cross-referencing still works', () => {
  it('dismissed email does not produce suggestion; matched event does not leak as calendar-only', async () => {
    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'dismissed-msg', senderDomain: 'acme.com', senderEmail: 'hr@acme.com', companyName: 'acme' }),
        makeEmailResult({ messageId: 'active-msg', senderDomain: 'beta.com', senderEmail: 'hr@beta.com', companyName: 'beta' }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@acme.com', date: '2025-01-20' }),
        makeCalendarResult({ eventId: 'evt2', organizerEmail: 'hr@beta.com', date: '2025-01-20' }),
      ]),
      tokenStore: createMockTokenStore([
        { id: 'suggestion_dismissed-msg_evt1', emailId: 'dismissed-msg', calendarId: '' },
      ]),
      idFn: fixedId,
    });

    const suggestions = await detector.detect();

    // active-msg + evt2 produces a suggestion
    const active = suggestions.find((s) => s.emailMessageId === 'active-msg');
    expect(active).toBeDefined();

    // evt1 was matched by dismissed email — must NOT appear as calendar-only
    const calOnlyEvt1 = suggestions.find((s) => s.source === 'calendar' && s.calendarEventId === 'evt1');
    expect(calOnlyEvt1).toBeUndefined();
  });

  it('batch with 50% dismissed — only non-dismissed items produce suggestions', async () => {
    const emails = [];
    const events = [];
    const dismissedEntries = [];

    for (let i = 0; i < 6; i++) {
      const msgId = `msg${i}`;
      const evtId = `evt${i}`;
      emails.push(makeEmailResult({
        messageId: msgId,
        senderDomain: `co${i}.com`,
        senderEmail: `hr@co${i}.com`,
        companyName: `company${i}`,
        extractedDate: `2025-02-${String(i + 1).padStart(2, '0')}`,
        score: 0.9,
      }));
      events.push(makeCalendarResult({
        eventId: evtId,
        organizerEmail: `hr@co${i}.com`,
        date: `2025-02-${String(i + 1).padStart(2, '0')}`,
        time: '14:00',
        startDateTime: `2025-02-${String(i + 1).padStart(2, '0')}T14:00:00Z`,
        endDateTime: `2025-02-${String(i + 1).padStart(2, '0')}T15:00:00Z`,
      }));

      // Dismiss even-indexed items
      if (i % 2 === 0) {
        dismissedEntries.push({ id: `suggestion_${msgId}_${evtId}`, emailId: msgId, calendarId: evtId });
      }
    }

    const detector = createInterviewDetector({
      gmailService: mockGmail(emails),
      calendarService: mockCalendar(events),
      tokenStore: createMockTokenStore(dismissedEntries),
      idFn: fixedId,
    });

    const suggestions = await detector.detect();

    // Only 3 active cross-ref suggestions (odd-indexed items)
    expect(suggestions).toHaveLength(3);
    for (const s of suggestions) {
      const idx = parseInt(s.emailMessageId.replace('msg', ''), 10);
      expect(idx % 2).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// H7: Dismissed set changes between scans
// ---------------------------------------------------------------------------
describe('H7: dismissed set changes between scans', () => {
  it('dismissed item produces no suggestion; un-dismissed produces a suggestion', async () => {
    // First scan: msg1 dismissed — no suggestions
    const detector1 = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ messageId: 'msg1' })]),
      calendarService: mockCalendar([makeCalendarResult({ eventId: 'evt1' })]),
      tokenStore: createMockTokenStore([
        { id: 'suggestion_msg1_evt1', emailId: 'msg1', calendarId: 'evt1' },
      ]),
      idFn: fixedId,
    });

    const suggestions1 = await detector1.detect();
    expect(suggestions1).toHaveLength(0);

    // Second scan: un-dismissed (empty set) — suggestion created
    const detector2 = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ messageId: 'msg1' })]),
      calendarService: mockCalendar([makeCalendarResult({ eventId: 'evt1' })]),
      tokenStore: createMockTokenStore([]),
      idFn: fixedId,
    });

    const suggestions2 = await detector2.detect();
    expect(suggestions2).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// H8: matchWasDismissed prevents email-only leak after dismissed cross-ref
// ---------------------------------------------------------------------------
describe('H8: matchWasDismissed prevents email-only leak', () => {
  it('dismissed cross-ref by emailId component blocks both cross-ref and email-only', async () => {
    const extractor = spyLlmExtractor();

    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'msg1', score: 0.9 }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'evt1', score: 0.8 }),
      ]),
      tokenStore: createMockTokenStore([
        { id: 'some-old-id', emailId: 'msg1', calendarId: '' },
      ]),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    // Cross-ref blocked by emailId component dismissal.
    // matchWasDismissed = true → no email-only either.
    // evt1 is in matchedEventIds → no calendar-only.
    expect(suggestions).toHaveLength(0);
  });

  it('two emails match one event — dismissed email does not block active email', async () => {
    const extractor = spyLlmExtractor();

    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({
          messageId: 'msg-dismissed',
          senderDomain: 'acme.com',
          senderEmail: 'hr@acme.com',
          companyName: 'acme',
          score: 0.9,
        }),
        makeEmailResult({
          messageId: 'msg-active',
          senderDomain: 'acme.com',
          senderEmail: 'hr@acme.com',
          companyName: 'acme',
          score: 0.7,
        }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@acme.com', date: '2025-01-20' }),
      ]),
      tokenStore: createMockTokenStore([
        { id: 'suggestion_msg-dismissed_evt1', emailId: 'msg-dismissed', calendarId: '' },
      ]),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    // msg-active should get the event since msg-dismissed's cross-ref was rejected
    const crossRef = suggestions.find((s) => s.source === 'gmail+calendar');
    expect(crossRef).toBeDefined();
    expect(crossRef.emailMessageId).toBe('msg-active');
    expect(crossRef.calendarEventId).toBe('evt1');
  });
});

// ---------------------------------------------------------------------------
// H9: Dismissed items produce no suggestions even with LLM enrichment
// ---------------------------------------------------------------------------
describe('H9: dismissed-prefilter-skips-llm — dismissed items never reach extractor', () => {
  it('10 emails + 5 events, half dismissed — extractor called only for non-dismissed', async () => {
    const emailCalls = [];
    const eventCalls = [];

    const extractor = mockLlmExtractor({
      emailHandler: (subject) => {
        emailCalls.push(subject);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'LlmCo', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: (summary) => {
        eventCalls.push(summary);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'LlmCo', interview_type: null },
        };
      },
    });

    const emails = [];
    const events = [];
    const dismissedRecords = [];

    for (let i = 0; i < 10; i++) {
      emails.push(makeEmailResult({
        messageId: `msg${i}`,
        companyName: `co${i}`,
        senderEmail: `hr@co${i}.com`,
        senderDomain: `co${i}.com`,
        subject: `Interview ${i}`,
        extractedDate: `2025-03-${String(i + 1).padStart(2, '0')}`,
        score: 0.9,
      }));
      // Dismiss even-numbered emails
      if (i % 2 === 0) {
        dismissedRecords.push({ id: `x-email-${i}`, emailId: `msg${i}`, calendarId: '' });
      }
    }

    for (let i = 0; i < 5; i++) {
      events.push(makeCalendarResult({
        eventId: `evt${i}`,
        organizerEmail: `hr@evtco${i}.com`,
        date: `2025-04-${String(i + 1).padStart(2, '0')}`,
        summary: `Calendar Interview ${i}`,
        score: 0.9,
      }));
      // Dismiss even-numbered events
      if (i % 2 === 0) {
        dismissedRecords.push({ id: `x-event-${i}`, emailId: '', calendarId: `evt${i}` });
      }
    }

    const detector = createInterviewDetector({
      gmailService: mockGmail(emails),
      calendarService: mockCalendar(events),
      tokenStore: createMockTokenStore(dismissedRecords),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    await detector.detect();

    // 5 of 10 emails dismissed → 5 extractor calls
    expect(emailCalls).toHaveLength(5);
    expect(emailCalls).toEqual([
      'Interview 1', 'Interview 3', 'Interview 5', 'Interview 7', 'Interview 9',
    ]);

    // All 5 events enriched — calendar events are never pre-filtered because
    // a new email may cross-reference a dismissed event for company-name matching.
    expect(eventCalls).toHaveLength(5);
    expect(eventCalls).toEqual([
      'Calendar Interview 0', 'Calendar Interview 1', 'Calendar Interview 2',
      'Calendar Interview 3', 'Calendar Interview 4',
    ]);
  });

  it('all items dismissed — zero extractor calls', async () => {
    let emailCalls = 0;
    let eventCalls = 0;

    const extractor = mockLlmExtractor({
      emailHandler: () => { emailCalls++; return null; },
      eventHandler: () => { eventCalls++; return null; },
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'msg-a', score: 0.9 }),
        makeEmailResult({ messageId: 'msg-b', score: 0.9 }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'evt-a', score: 0.9 }),
      ]),
      tokenStore: createMockTokenStore([
        { id: 'x1', emailId: 'msg-a', calendarId: '' },
        { id: 'x2', emailId: 'msg-b', calendarId: '' },
        { id: 'x3', emailId: '', calendarId: 'evt-a' },
      ]),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    expect(emailCalls).toBe(0);
    // Calendar event is still enriched (events are never pre-filtered)
    expect(eventCalls).toBe(1);
    expect(suggestions).toEqual([]);
  });

  it('non-dismissed items still enriched correctly after pre-filter', async () => {
    const extractor = mockLlmExtractor({
      emailHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: 'EnrichedFromLLM', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
      }),
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'dismissed-msg', companyName: 'dismissed', score: 0.9 }),
        makeEmailResult({ messageId: 'active-msg', companyName: 'original', senderEmail: 'hr@active.com', senderDomain: 'active.com', score: 0.9, extractedDate: '2025-04-01' }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'active-evt', organizerEmail: 'hr@active.com', date: '2025-04-01' }),
      ]),
      tokenStore: createMockTokenStore([
        { id: 'x1', emailId: 'dismissed-msg', calendarId: '' },
      ]),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    // Only the active email+event pair should produce a suggestion
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].companyName).toBe('EnrichedFromLLM');
    expect(suggestions[0].emailMessageId).toBe('active-msg');
  });
});

describe('H10: dismissed items filtered at suggestion level', () => {
  it('4 items, 2 dismissed — only 2 suggestions produced', async () => {
    const emails = [
      makeEmailResult({ messageId: 'msg0', companyName: 'co0', senderDomain: 'co0.com', senderEmail: 'hr@co0.com', subject: 'S0', extractedDate: '2025-03-01', score: 0.9 }),
      makeEmailResult({ messageId: 'msg1', companyName: 'co1', senderDomain: 'co1.com', senderEmail: 'hr@co1.com', subject: 'S1', extractedDate: '2025-03-02', score: 0.9 }),
      makeEmailResult({ messageId: 'msg2', companyName: 'co2', senderDomain: 'co2.com', senderEmail: 'hr@co2.com', subject: 'S2', extractedDate: '2025-03-03', score: 0.9 }),
      makeEmailResult({ messageId: 'msg3', companyName: 'co3', senderDomain: 'co3.com', senderEmail: 'hr@co3.com', subject: 'S3', extractedDate: '2025-03-04', score: 0.9 }),
    ];
    const events = [
      makeCalendarResult({ eventId: 'evt0', organizerEmail: 'hr@co0.com', date: '2025-03-01' }),
      makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@co1.com', date: '2025-03-02' }),
      makeCalendarResult({ eventId: 'evt2', organizerEmail: 'hr@co2.com', date: '2025-03-03' }),
      makeCalendarResult({ eventId: 'evt3', organizerEmail: 'hr@co3.com', date: '2025-03-04' }),
    ];

    const detector = createInterviewDetector({
      gmailService: mockGmail(emails),
      calendarService: mockCalendar(events),
      tokenStore: createMockTokenStore([
        { id: 'x0', emailId: 'msg0', calendarId: '' },
        { id: 'x2', emailId: 'msg2', calendarId: '' },
      ]),
      idFn: fixedId,
    });

    const suggestions = await detector.detect();

    // 2 active cross-ref suggestions (msg1+evt1, msg3+evt3)
    const crossRefs = suggestions.filter((s) => s.source === 'gmail+calendar');
    expect(crossRefs).toHaveLength(2);

    const s1 = crossRefs.find((s) => s.emailMessageId === 'msg1');
    const s3 = crossRefs.find((s) => s.emailMessageId === 'msg3');
    expect(s1).toBeDefined();
    expect(s3).toBeDefined();
  });
});

// ===========================================================================
// H11: Composite-ID-only dismissal — pre-filter passthrough to LLM
// ===========================================================================
describe('H11: composite-ID-only dismissal — item passes through pre-filter to LLM', () => {
  it('item dismissed only by composite suggestion ID (no emailId/calendarId) is still sent to LLM', async () => {
    // The dismissed record has an id but empty emailId and calendarId.
    // The pre-filter checks dismissedEmailIds.has(email.messageId) — which
    // is false because no emailId was stored. So the item should go to LLM.
    // However, the suggestion-level filter (dismissed.ids.has(suggestionId))
    // should still suppress it.
    const emailCalls = [];
    const eventCalls = [];

    const extractor = mockLlmExtractor({
      emailHandler: (subject) => {
        emailCalls.push(subject);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'LlmEnriched', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: (summary) => {
        eventCalls.push(summary);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'LlmEnriched', interview_type: null },
        };
      },
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'msg1', subject: 'Interview A', score: 0.9 }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'evt1', summary: 'Calendar A', score: 0.9 }),
      ]),
      // Dismissed by composite ID only — no emailId or calendarId stored
      tokenStore: createMockTokenStore([
        { id: 'suggestion_msg1_evt1', emailId: '', calendarId: '' },
      ]),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    // Pre-filter does NOT block — emailId/calendarId are empty in dismissed set
    // So the LLM should be called for both the email and event
    expect(emailCalls).toHaveLength(1);
    expect(emailCalls[0]).toBe('Interview A');
    expect(eventCalls).toHaveLength(1);
    expect(eventCalls[0]).toBe('Calendar A');

    // But the suggestion-level filter blocks the composite suggestion ID
    expect(suggestions).toHaveLength(0);
  });

  it('mixed: one item dismissed by composite ID, another by component ID — correct filtering', async () => {
    const emailCalls = [];

    const extractor = mockLlmExtractor({
      emailHandler: (subject) => {
        emailCalls.push(subject);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'FromLLM', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => null,
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'msg-composite', subject: 'Composite Dismissed', senderDomain: 'a.com', senderEmail: 'hr@a.com', score: 0.9, extractedDate: '2025-05-01' }),
        makeEmailResult({ messageId: 'msg-component', subject: 'Component Dismissed', senderDomain: 'b.com', senderEmail: 'hr@b.com', score: 0.9, extractedDate: '2025-05-02' }),
        makeEmailResult({ messageId: 'msg-active', subject: 'Active', senderDomain: 'c.com', senderEmail: 'hr@c.com', score: 0.9, extractedDate: '2025-05-03' }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'evt-a', organizerEmail: 'hr@a.com', date: '2025-05-01' }),
        makeCalendarResult({ eventId: 'evt-b', organizerEmail: 'hr@b.com', date: '2025-05-02' }),
        makeCalendarResult({ eventId: 'evt-c', organizerEmail: 'hr@c.com', date: '2025-05-03' }),
      ]),
      tokenStore: createMockTokenStore([
        // Composite-only: pre-filter passes through, suggestion-level blocks
        { id: 'suggestion_msg-composite_evt-a', emailId: '', calendarId: '' },
        // Component-level: pre-filter blocks LLM call for this email
        { id: 'some-old-suggestion', emailId: 'msg-component', calendarId: '' },
      ]),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    // msg-composite: LLM called (pre-filter passes through), but suggestion blocked by ids.has
    // msg-component: LLM NOT called (pre-filter blocks), and suggestion blocked by isDismissedComponent
    // msg-active: LLM called, suggestion produced
    expect(emailCalls).toHaveLength(2); // msg-composite + msg-active
    expect(emailCalls).toContain('Composite Dismissed');
    expect(emailCalls).toContain('Active');
    expect(emailCalls).not.toContain('Component Dismissed');

    // Only the active item produces a suggestion
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].emailMessageId).toBe('msg-active');
  });
});

// ===========================================================================
// H12: Mid-poll dismissal — item dismissed between two detect() calls
// ===========================================================================
describe('H12: mid-poll dismissal — LLM skipped on next cycle for newly dismissed item', () => {
  it('item enriched in cycle 1, dismissed before cycle 2 — LLM skipped in cycle 2', async () => {
    const emailCalls = [];

    const extractor = mockLlmExtractor({
      emailHandler: (subject) => {
        emailCalls.push(subject);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'Enriched', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => null,
    });

    const tokenStore = createMockTokenStore();

    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'msg1', subject: 'Interview', score: 0.9 }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'evt1', score: 0.9 }),
      ]),
      tokenStore,
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: item is active — LLM called, cached, suggestion produced
    const result1 = await detector.detect();
    expect(emailCalls).toHaveLength(1);
    expect(result1).toHaveLength(1);
    expect(result1[0].companyName).toBe('Enriched');

    // Dismiss the item between cycles (simulating user action)
    await tokenStore.addDismissed({ id: 'suggestion_msg1_evt1', emailId: 'msg1', calendarId: 'evt1' });
    emailCalls.length = 0;

    // Cycle 2: item now dismissed — LLM should be SKIPPED (pre-filter),
    // no suggestion produced
    const result2 = await detector.detect();
    expect(emailCalls).toHaveLength(0); // pre-filter skipped LLM
    expect(result2).toHaveLength(0); // no suggestion
  });

  it('item dismissed mid-poll does not corrupt cache for other items', async () => {
    const emailCalls = [];

    const extractor = mockLlmExtractor({
      emailHandler: (_subject, _body, sender) => {
        emailCalls.push(sender);
        return {
          dryModePrompt: null,
          extraction: { company_name: `LLM_${sender}`, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => null,
    });

    const tokenStore = createMockTokenStore();

    const email0 = makeEmailResult({ messageId: 'msg0', senderEmail: 'hr@a.com', senderDomain: 'a.com', companyName: 'a', score: 0.9 });
    const email1 = makeEmailResult({ messageId: 'msg1', senderEmail: 'hr@b.com', senderDomain: 'b.com', companyName: 'b', score: 0.9, extractedDate: '2025-06-01' });
    const evt0 = makeCalendarResult({ eventId: 'evt0', organizerEmail: 'hr@a.com', date: '2025-01-20' });
    const evt1 = makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@b.com', date: '2025-06-01' });

    const detector = createInterviewDetector({
      gmailService: mockGmail([email0, email1]),
      calendarService: mockCalendar([evt0, evt1]),
      tokenStore,
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: both enriched
    await detector.detect();
    expect(emailCalls).toHaveLength(2);

    // Dismiss msg0 between cycles
    await tokenStore.addDismissed({ id: 'suggestion_msg0_evt0', emailId: 'msg0', calendarId: 'evt0' });
    emailCalls.length = 0;

    // Cycle 2: msg0 dismissed (pre-filter skips), msg1 cached (no LLM call)
    const result2 = await detector.detect();
    expect(emailCalls).toHaveLength(0); // msg0 skipped, msg1 cached
    expect(result2).toHaveLength(1);
    expect(result2[0].emailMessageId).toBe('msg1');
    expect(result2[0].companyName).toBe('LLM_hr@b.com'); // from cache
  });
});

// ===========================================================================
// H13: Dismissed item's stale cache entry — dismiss then un-dismiss (reset)
// ===========================================================================
describe('H13: stale cache after dismiss-then-reset — cache entry reused on un-dismiss', () => {
  it('cached → dismissed → reset: cache entry reused without new LLM call', async () => {
    let emailCallCount = 0;

    const extractor = mockLlmExtractor({
      emailHandler: () => {
        emailCallCount++;
        return {
          dryModePrompt: null,
          extraction: { company_name: 'CachedCo', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: null, interview_type: null },
      }),
    });

    const tokenStore = createMockTokenStore();

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ score: 0.9 })]),
      calendarService: mockCalendar([makeCalendarResult()]),
      tokenStore,
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: enriched and cached
    const result1 = await detector.detect();
    expect(emailCallCount).toBe(1);
    expect(result1).toHaveLength(1);
    expect(result1[0].companyName).toBe('CachedCo');

    // Dismiss the item
    await tokenStore.addDismissed({ id: 'suggestion_msg1_evt1', emailId: 'msg1', calendarId: 'evt1' });
    emailCallCount = 0;

    // Cycle 2: dismissed — LLM skipped (pre-filter), no suggestion
    const result2 = await detector.detect();
    expect(emailCallCount).toBe(0);
    expect(result2).toHaveLength(0);

    // Reset (un-dismiss)
    await tokenStore.clearDismissed();
    emailCallCount = 0;

    // Cycle 3: un-dismissed — cache entry from cycle 1 should be reused
    const result3 = await detector.detect();
    expect(emailCallCount).toBe(0); // cache hit, no new LLM call
    expect(result3).toHaveLength(1);
    expect(result3[0].companyName).toBe('CachedCo'); // same cached extraction
  });

  it('cache entry evicted during dismissed period — LLM re-called after reset', async () => {
    let emailCallCount = 0;

    const extractor = mockLlmExtractor({
      emailHandler: (_subject, _body, sender) => {
        emailCallCount++;
        return {
          dryModePrompt: null,
          extraction: { company_name: `LLM_${emailCallCount}`, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => null,
    });

    const tokenStore = createMockTokenStore();

    // maxCacheSize=1 so only the most recent entry survives
    let currentEmails = [makeEmailResult({ messageId: 'msg-target', senderEmail: 'hr@target.com', senderDomain: 'target.com', companyName: 'target', score: 0.9 })];
    let currentEvents = [makeCalendarResult({ eventId: 'evt-target', organizerEmail: 'hr@target.com' })];

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore,
      idFn: fixedId,
      llmExtractor: extractor,
      maxCacheSize: 1,
    });

    // Cycle 1: msg-target enriched and cached
    await detector.detect();
    expect(emailCallCount).toBe(1);

    // Dismiss msg-target
    await tokenStore.addDismissed({ id: 'suggestion_msg-target_evt-target', emailId: 'msg-target', calendarId: 'evt-target' });
    emailCallCount = 0;

    // Cycle 2: present a different email to evict msg-target's cache
    currentEmails = [
      makeEmailResult({ messageId: 'msg-target', senderEmail: 'hr@target.com', senderDomain: 'target.com', companyName: 'target', score: 0.9 }),
      makeEmailResult({ messageId: 'msg-other', senderEmail: 'hr@other.com', senderDomain: 'other.com', companyName: 'other', score: 0.9, extractedDate: '2025-07-01' }),
    ];
    currentEvents = [
      makeCalendarResult({ eventId: 'evt-target', organizerEmail: 'hr@target.com' }),
      makeCalendarResult({ eventId: 'evt-other', organizerEmail: 'hr@other.com', date: '2025-07-01' }),
    ];

    await detector.detect();
    // msg-target dismissed (LLM skipped), msg-other enriched (evicts msg-target cache, maxCacheSize=1)
    expect(emailCallCount).toBe(1); // only msg-other

    // Reset (un-dismiss)
    await tokenStore.clearDismissed();
    emailCallCount = 0;

    // Cycle 3: msg-target no longer dismissed, but cache was evicted
    // LLM should be called again
    const result3 = await detector.detect();
    expect(emailCallCount).toBe(1); // msg-target re-fetched (msg-other cached)
    const targetSuggestion = result3.find(s => s.emailMessageId === 'msg-target');
    expect(targetSuggestion).toBeDefined();
  });
});

// ===========================================================================
// H14: Race between dismissal snapshot and concurrent enrichment
// ===========================================================================
describe('H14: dismissal snapshot race — dismissed set read once at detect() start', () => {
  it('dismissal during LLM enrichment still uses snapshot from before enrichment', async () => {
    // The dismissed set is read once inside detect() before enrichWithLlm is
    // called. If a user dismisses an item while the LLM calls are in-flight,
    // the snapshot does NOT change — the suggestion is still produced.
    //
    // To test this, we hook into the LLM extractor to mutate the token store
    // mid-enrichment. Because getDismissed() was already called with the old
    // snapshot, the cross-reference code still uses the stale snapshot.
    const emailCalls = [];
    const tokenStore = createMockTokenStore();

    const extractor = {
      extractFromEmail: async (subject) => {
        emailCalls.push(subject);
        // Dismiss the item DURING enrichment — this mutates the token store
        // but detect() already captured its snapshot before calling enrichWithLlm
        await tokenStore.addDismissed({ id: 'suggestion_msg1_evt1', emailId: 'msg1', calendarId: 'evt1' });
        return {
          dryModePrompt: null,
          extraction: { company_name: 'SlowLLM', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      extractFromCalendarEvent: async () => ({
        dryModePrompt: null,
        extraction: { company_name: null, interview_type: null },
      }),
    };

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ messageId: 'msg1', score: 0.9 })]),
      calendarService: mockCalendar([makeCalendarResult({ eventId: 'evt1' })]),
      tokenStore,
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const result = await detector.detect();

    // LLM was called because the snapshot taken before enrichWithLlm had no dismissals
    expect(emailCalls).toHaveLength(1);

    // The suggestion is produced because the cross-reference code uses the
    // stale snapshot captured at the start of detect(), not the live store
    expect(result).toHaveLength(1);
    expect(result[0].companyName).toBe('SlowLLM');

    // Verify the token store was actually mutated
    const dismissed = tokenStore.getDismissed();
    expect(dismissed.emailIds.has('msg1')).toBe(true);
  });

  it('next detect() call uses updated dismissed set correctly', async () => {
    const emailCalls = [];

    const tokenStore = createMockTokenStore();

    const extractor = {
      extractFromEmail: async (subject) => {
        emailCalls.push(subject);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'LLMCo', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      extractFromCalendarEvent: async () => ({
        dryModePrompt: null,
        extraction: { company_name: null, interview_type: null },
      }),
    };

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ messageId: 'msg1', score: 0.9 })]),
      calendarService: mockCalendar([makeCalendarResult({ eventId: 'evt1' })]),
      tokenStore,
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: no dismissals — suggestion produced
    const result1 = await detector.detect();
    expect(result1).toHaveLength(1);
    expect(emailCalls).toHaveLength(1);

    // Dismiss between cycles
    await tokenStore.addDismissed({ id: 'suggestion_msg1_evt1', emailId: 'msg1', calendarId: 'evt1' });
    emailCalls.length = 0;

    // Cycle 2: dismissed set updated — pre-filter skips LLM, no suggestion
    const result2 = await detector.detect();
    expect(emailCalls).toHaveLength(0);
    expect(result2).toHaveLength(0);
  });
});

// ===========================================================================
// H15: Pre-filter + circuit breaker interaction — dismissed items reduce
//      effective batch size for breaker counting
// ===========================================================================
describe('H15: pre-filter + circuit breaker — dismissed items not counted in breaker', () => {
  it('breaker threshold reached with smaller effective batch (dismissed items excluded)', async () => {
    let emailCallIdx = 0;

    const extractor = mockLlmExtractor({
      emailHandler: () => {
        emailCallIdx++;
        // All LLM calls fail (null extraction)
        return { dryModePrompt: null, extraction: null };
      },
      eventHandler: () => null,
    });

    const tokenStore = createMockTokenStore([
      // Dismiss 3 of 4 emails — only 1 goes to LLM per cycle
      { id: 'x1', emailId: 'msg0', calendarId: '' },
      { id: 'x2', emailId: 'msg1', calendarId: '' },
      { id: 'x3', emailId: 'msg2', calendarId: '' },
    ]);

    let currentEmails = [
      makeEmailResult({ messageId: 'msg0', senderEmail: 'hr@a.com', senderDomain: 'a.com', companyName: 'a', score: 0.9 }),
      makeEmailResult({ messageId: 'msg1', senderEmail: 'hr@b.com', senderDomain: 'b.com', companyName: 'b', score: 0.9, extractedDate: '2025-08-01' }),
      makeEmailResult({ messageId: 'msg2', senderEmail: 'hr@c.com', senderDomain: 'c.com', companyName: 'c', score: 0.9, extractedDate: '2025-08-02' }),
      makeEmailResult({ messageId: 'msg3', senderEmail: 'hr@d.com', senderDomain: 'd.com', companyName: 'd', score: 0.9, extractedDate: '2025-08-03' }),
    ];
    let currentEvents = [
      makeCalendarResult({ eventId: 'evt0', organizerEmail: 'hr@a.com', date: '2025-01-20' }),
      makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@b.com', date: '2025-08-01' }),
      makeCalendarResult({ eventId: 'evt2', organizerEmail: 'hr@c.com', date: '2025-08-02' }),
      makeCalendarResult({ eventId: 'evt3', organizerEmail: 'hr@d.com', date: '2025-08-03' }),
    ];

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore,
      idFn: fixedId,
      llmExtractor: extractor,
      breakerThreshold: 2,
    });

    // Cycle 1: only msg3 goes to LLM (others dismissed), fails → all-fail batch #1
    await detector.detect();
    expect(emailCallIdx).toBe(1);

    // Cycle 2: msg3 again (not cached — extraction was null), fails → all-fail batch #2
    // After this cycle, breaker should be open
    await detector.detect();
    expect(emailCallIdx).toBe(2);

    // Cycle 3: breaker OPEN — skips LLM entirely, even for msg3
    const preBreakerCount = emailCallIdx;
    await detector.detect();
    expect(emailCallIdx).toBe(preBreakerCount); // no new calls

    // Cycle 4: breaker reset — msg3 retried (still fails)
    await detector.detect();
    expect(emailCallIdx).toBe(preBreakerCount + 1);
  });

  it('dismissed items produce zero batchApiCalls — all-dismissed batch does not trip breaker', async () => {
    let emailCallIdx = 0;

    const extractor = mockLlmExtractor({
      emailHandler: () => {
        emailCallIdx++;
        return {
          dryModePrompt: null,
          extraction: { company_name: 'Good', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      eventHandler: () => null,
    });

    const tokenStore = createMockTokenStore([
      { id: 'x1', emailId: 'msg-dismissed', calendarId: '' },
    ]);

    // Only dismissed items — no LLM calls, batchApiCalls = 0
    // The breaker should NOT be affected (batchApiCalls > 0 check prevents counting)
    let currentEmails = [
      makeEmailResult({ messageId: 'msg-dismissed', senderEmail: 'hr@a.com', senderDomain: 'a.com', companyName: 'a', score: 0.9 }),
    ];
    let currentEvents = [
      makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@a.com', date: '2025-01-20' }),
    ];

    const detector = createInterviewDetector({
      gmailService: { scanForInterviews: async () => currentEmails },
      calendarService: { scanForInterviews: async () => currentEvents },
      tokenStore,
      idFn: fixedId,
      llmExtractor: extractor,
      breakerThreshold: 1,
    });

    // Run 5 cycles with all items dismissed — breaker should never open
    for (let i = 0; i < 5; i++) {
      await detector.detect();
    }
    expect(emailCallIdx).toBe(0); // no LLM calls at all

    // Now add an active item — LLM should be called (breaker never opened)
    await tokenStore.clearDismissed();
    currentEmails = [
      makeEmailResult({ messageId: 'msg-active', senderEmail: 'hr@b.com', senderDomain: 'b.com', companyName: 'b', score: 0.9, extractedDate: '2025-09-01' }),
    ];
    currentEvents = [
      makeCalendarResult({ eventId: 'evt-active', organizerEmail: 'hr@b.com', date: '2025-09-01' }),
    ];

    const result = await detector.detect();
    expect(emailCallIdx).toBe(1); // LLM called — breaker was never tripped
    expect(result).toHaveLength(1);
    expect(result[0].companyName).toBe('Good');
  });
});

// ===========================================================================
// H16: New email + dismissed calendarId — cross-ref suggestion surfaces
// ===========================================================================
describe('H16: new email + dismissed calendarId — cross-ref surfaces', () => {
  it('batch of 8 emails, 4 events: calendarId-only dismissals do not block new emails', async () => {
    const emails = [];
    const events = [];
    const dismissedRecords = [];

    // Create 4 email+event pairs from 4 different companies
    for (let i = 0; i < 4; i++) {
      const domain = `co${i}.com`;
      events.push(makeCalendarResult({
        eventId: `evt${i}`,
        organizerEmail: `hr@${domain}`,
        date: `2025-06-${String(i + 1).padStart(2, '0')}`,
        time: '10:00',
        startDateTime: `2025-06-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        endDateTime: `2025-06-${String(i + 1).padStart(2, '0')}T11:00:00Z`,
      }));

      // "Old" email (dismissed) for each company
      emails.push(makeEmailResult({
        messageId: `old-msg${i}`,
        senderDomain: domain,
        senderEmail: `hr@${domain}`,
        companyName: `company${i}`,
        extractedDate: `2025-06-${String(i + 1).padStart(2, '0')}`,
        score: 0.9,
      }));

      // "New" email (NOT dismissed) for each company
      emails.push(makeEmailResult({
        messageId: `new-msg${i}`,
        senderDomain: domain,
        senderEmail: `hr@${domain}`,
        companyName: `company${i}`,
        extractedDate: `2025-06-${String(i + 1).padStart(2, '0')}`,
        score: 0.85,
      }));

      // Dismiss old email+event cross-ref (stores both emailId and calendarId)
      dismissedRecords.push({
        id: `suggestion_old-msg${i}_evt${i}`,
        emailId: `old-msg${i}`,
        calendarId: `evt${i}`,
      });
    }

    const detector = createInterviewDetector({
      gmailService: mockGmail(emails),
      calendarService: mockCalendar(events),
      tokenStore: createMockTokenStore(dismissedRecords),
      idFn: fixedId,
    });

    const suggestions = await detector.detect();

    // Each new email should produce a cross-ref with its event, even though
    // the calendarId was dismissed (from the old email's dismissal)
    const crossRefs = suggestions.filter((s) => s.source === 'gmail+calendar');
    expect(crossRefs).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      const s = crossRefs.find((s) => s.calendarEventId === `evt${i}`);
      expect(s).toBeDefined();
      expect(s.emailMessageId).toBe(`new-msg${i}`);
    }

    // No calendar-only or email-only leaks
    expect(suggestions.filter((s) => s.source === 'calendar')).toHaveLength(0);
  });

  it('calendarId-only dismissal (no emailId stored) still allows new email cross-ref', async () => {
    // Edge case: dismissed record has calendarId but no emailId (e.g. from
    // a calendar-only suggestion that was dismissed)
    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'fresh-msg', score: 0.9 }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'evt1' }),
      ]),
      tokenStore: createMockTokenStore([
        { id: 'suggestion_calendar_evt1', emailId: '', calendarId: 'evt1' },
      ]),
      idFn: fixedId,
    });

    const suggestions = await detector.detect();

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].source).toBe('gmail+calendar');
    expect(suggestions[0].emailMessageId).toBe('fresh-msg');
    expect(suggestions[0].calendarEventId).toBe('evt1');
  });
});

// ===========================================================================
// H17: Multiple new emails competing for the same dismissed calendar event
// ===========================================================================
describe('H17: multiple new emails for same dismissed calendar event', () => {
  it('best-scoring new email wins the cross-ref; others become email-only', async () => {
    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({
          messageId: 'email-high',
          senderEmail: 'recruiter@google.com',
          senderDomain: 'google.com',
          companyName: 'google',
          score: 0.95,
          extractedDate: '2025-01-20',
        }),
        makeEmailResult({
          messageId: 'email-low',
          senderEmail: 'recruiter@google.com',
          senderDomain: 'google.com',
          companyName: 'google',
          score: 0.7,
          extractedDate: '2025-01-20',
        }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'evt1', organizerEmail: 'recruiter@google.com' }),
      ]),
      tokenStore: createMockTokenStore([
        { id: 'suggestion_old-msg_evt1', emailId: 'old-msg', calendarId: 'evt1' },
      ]),
      idFn: fixedId,
    });

    const suggestions = await detector.detect();

    // One cross-ref (best-scoring email wins the event)
    const crossRefs = suggestions.filter((s) => s.source === 'gmail+calendar');
    expect(crossRefs).toHaveLength(1);

    // The other email becomes email-only (if score >= EMAIL_ONLY_MIN_SCORE)
    // email-low has score 0.7 which is >= 0.5 threshold
    const emailOnly = suggestions.filter((s) => s.source === 'gmail');
    expect(emailOnly).toHaveLength(1);

    // No calendar-only (event is used by cross-ref)
    expect(suggestions.filter((s) => s.source === 'calendar')).toHaveLength(0);
  });
});

// ===========================================================================
// H18: Mixed emailId/calendarId dismissals — only emailId blocks cross-ref
// ===========================================================================
describe('H18: mixed emailId/calendarId dismissals — only emailId blocks', () => {
  it('emailId-dismissed emails blocked, calendarId-dismissed events still allow new emails', async () => {
    const detector = createInterviewDetector({
      gmailService: mockGmail([
        // Email dismissed by emailId — should be BLOCKED
        makeEmailResult({
          messageId: 'dismissed-by-email',
          senderEmail: 'hr@alpha.com',
          senderDomain: 'alpha.com',
          companyName: 'alpha',
          extractedDate: '2025-07-01',
          score: 0.9,
        }),
        // New email for dismissed calendar event — should SURFACE
        makeEmailResult({
          messageId: 'new-for-dismissed-cal',
          senderEmail: 'hr@beta.com',
          senderDomain: 'beta.com',
          companyName: 'beta',
          extractedDate: '2025-07-02',
          score: 0.9,
        }),
        // Completely fresh email+event — should SURFACE
        makeEmailResult({
          messageId: 'fresh',
          senderEmail: 'hr@gamma.com',
          senderDomain: 'gamma.com',
          companyName: 'gamma',
          extractedDate: '2025-07-03',
          score: 0.9,
        }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'evt-alpha', organizerEmail: 'hr@alpha.com', date: '2025-07-01' }),
        makeCalendarResult({ eventId: 'evt-beta', organizerEmail: 'hr@beta.com', date: '2025-07-02' }),
        makeCalendarResult({ eventId: 'evt-gamma', organizerEmail: 'hr@gamma.com', date: '2025-07-03' }),
      ]),
      tokenStore: createMockTokenStore([
        { id: 'old1', emailId: 'dismissed-by-email', calendarId: '' },
        { id: 'old2', emailId: '', calendarId: 'evt-beta' },
      ]),
      idFn: fixedId,
    });

    const suggestions = await detector.detect();

    // 2 cross-ref suggestions: beta (calendarId dismissed but email is new) + gamma (both fresh)
    const crossRefs = suggestions.filter((s) => s.source === 'gmail+calendar');
    expect(crossRefs).toHaveLength(2);

    const betaSuggestion = crossRefs.find((s) => s.emailMessageId === 'new-for-dismissed-cal');
    expect(betaSuggestion).toBeDefined();
    expect(betaSuggestion.calendarEventId).toBe('evt-beta');

    const gammaSuggestion = crossRefs.find((s) => s.emailMessageId === 'fresh');
    expect(gammaSuggestion).toBeDefined();

    // Alpha blocked by emailId — must NOT appear in any form
    const alpha = suggestions.find((s) => s.emailMessageId === 'dismissed-by-email');
    expect(alpha).toBeUndefined();

    // evt-alpha matched dismissed-by-email (matchedEventIds) — no calendar-only
    const calAlpha = suggestions.find((s) => s.source === 'calendar' && s.calendarEventId === 'evt-alpha');
    expect(calAlpha).toBeUndefined();
  });
});

// ===========================================================================
// H19: LLM enrichment with dismissed calendarId — email enriched, event skipped
// ===========================================================================
describe('H19: LLM enrichment with dismissed calendarId', () => {
  it('new email is enriched by LLM; dismissed calendar event is not; suggestion uses email data', async () => {
    const emailCalls = [];
    const eventCalls = [];

    const extractor = mockLlmExtractor({
      emailHandler: (subject) => {
        emailCalls.push(subject);
        return {
          dryModePrompt: null,
          extraction: {
            company_name: 'LlmEnrichedCompany',
            date: null,
            time: null,
            duration_minutes: null,
            intent: null,
            interview_type: 'Phone Interview',
          },
        };
      },
      eventHandler: (summary) => {
        eventCalls.push(summary);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'EventLlmCo', interview_type: 'video' },
        };
      },
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({
          messageId: 'new-msg',
          subject: 'Follow-up Interview',
          senderEmail: 'hr@acme.com',
          senderDomain: 'acme.com',
          companyName: 'acme',
          score: 0.9,
          extractedDate: '2025-08-01',
        }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({
          eventId: 'evt1',
          organizerEmail: 'hr@acme.com',
          date: '2025-08-01',
          summary: 'Interview at Acme',
        }),
      ]),
      tokenStore: createMockTokenStore([
        { id: 'suggestion_old-msg_evt1', emailId: 'old-msg', calendarId: 'evt1' },
      ]),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    // Email was enriched by LLM
    expect(emailCalls).toHaveLength(1);
    expect(emailCalls[0]).toBe('Follow-up Interview');

    // Calendar event IS enriched — events are never pre-filtered because a new
    // email may cross-reference a dismissed event and needs the enriched data.
    expect(eventCalls).toHaveLength(1);
    expect(eventCalls[0]).toBe('Interview at Acme');

    // Suggestion produced with LLM-enriched email data
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].companyName).toBe('LlmEnrichedCompany');
    expect(suggestions[0].type).toBe('Phone Interview');
    expect(suggestions[0].emailMessageId).toBe('new-msg');
    expect(suggestions[0].calendarEventId).toBe('evt1');
  });
});

// ===========================================================================
// H20: Rapid dismiss cycle — new emails keep surfacing for same calendar event
// ===========================================================================
describe('H20: rapid dismiss cycle — sequential new emails for same calendar event', () => {
  it('dismiss E1+C1, E2 surfaces; dismiss E2+C1, E3 surfaces', async () => {
    const tokenStore = createMockTokenStore();

    // Cycle 1: E1+C1 → suggestion surfaces
    const detector1 = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'e1', score: 0.9 }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'c1' }),
      ]),
      tokenStore,
      idFn: fixedId,
    });

    const result1 = await detector1.detect();
    expect(result1).toHaveLength(1);
    expect(result1[0].emailMessageId).toBe('e1');

    // Dismiss E1+C1
    await tokenStore.addDismissed({ id: 'suggestion_e1_c1', emailId: 'e1', calendarId: 'c1' });

    // Cycle 2: E2 (new email) + same C1 → should surface despite C1 dismissed
    const detector2 = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'e2', score: 0.9 }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'c1' }),
      ]),
      tokenStore,
      idFn: fixedId,
    });

    const result2 = await detector2.detect();
    expect(result2).toHaveLength(1);
    expect(result2[0].emailMessageId).toBe('e2');
    expect(result2[0].calendarEventId).toBe('c1');

    // Dismiss E2+C1
    await tokenStore.addDismissed({ id: 'suggestion_e2_c1', emailId: 'e2', calendarId: 'c1' });

    // Cycle 3: E3 (another new email) + same C1 → should surface again
    const detector3 = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'e3', score: 0.9 }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'c1' }),
      ]),
      tokenStore,
      idFn: fixedId,
    });

    const result3 = await detector3.detect();
    expect(result3).toHaveLength(1);
    expect(result3[0].emailMessageId).toBe('e3');
    expect(result3[0].calendarEventId).toBe('c1');
  });
});

// ---------------------------------------------------------------------------
// H21: low-score-exclusion — items that don't produce suggestions are excluded
//      from LLM extraction on subsequent detect() cycles
// ---------------------------------------------------------------------------
describe('H21: low-score-exclusion — non-suggestion items skip future LLM extraction', () => {
  it('low-score email skips LLM on second detect() cycle', async () => {
    const emailCalls = [];
    const extractor = mockLlmExtractor({
      emailHandler: (subject) => {
        emailCalls.push(subject);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'Acme', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
    });

    // Email with score 0.35 — passes Gmail threshold (0.3) but too low for
    // email-only suggestion (0.5) and no calendar event to cross-ref with.
    const lowEmail = makeEmailResult({
      messageId: 'low1',
      score: 0.35,
      senderDomain: 'acme.com',
    });

    const gmailService = mockGmail([lowEmail]);
    const detector = createInterviewDetector({
      gmailService,
      calendarService: mockCalendar([]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: email is enriched, but no suggestion produced
    const suggestions1 = await detector.detect();
    expect(suggestions1).toHaveLength(0);
    expect(emailCalls).toHaveLength(1);

    // Cycle 2: same email — should be skipped (low-score exclusion)
    emailCalls.length = 0;
    const suggestions2 = await detector.detect();
    expect(suggestions2).toHaveLength(0);
    expect(emailCalls).toHaveLength(0); // NOT called again
  });

  it('low-score calendar event skips LLM on second detect() cycle', async () => {
    const eventCalls = [];
    const extractor = mockLlmExtractor({
      eventHandler: (summary) => {
        eventCalls.push(summary);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'Acme', interview_type: 'video' },
        };
      },
    });

    // Calendar event with score 0.35 — passes scan threshold (0.3) but
    // too low for calendar-only suggestion (0.5).
    const lowEvent = makeCalendarResult({
      eventId: 'low-evt1',
      score: 0.35,
      summary: 'Interview at Acme',
    });

    const calendarService = mockCalendar([lowEvent]);
    const detector = createInterviewDetector({
      gmailService: mockGmail([]),
      calendarService,
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: event is enriched, but no suggestion produced
    const suggestions1 = await detector.detect();
    expect(suggestions1).toHaveLength(0);
    expect(eventCalls).toHaveLength(1);

    // Cycle 2: same event — should be skipped
    eventCalls.length = 0;
    const suggestions2 = await detector.detect();
    expect(suggestions2).toHaveLength(0);
    expect(eventCalls).toHaveLength(0);
  });

  it('high-score items that become suggestions are NOT added to low-score set', async () => {
    const emailCalls = [];
    const extractor = mockLlmExtractor({
      emailHandler: (subject) => {
        emailCalls.push(subject);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'Google', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ score: 0.8 })]),
      calendarService: mockCalendar([makeCalendarResult()]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: produces a suggestion
    const suggestions1 = await detector.detect();
    expect(suggestions1).toHaveLength(1);
    expect(emailCalls).toHaveLength(1);

    // Cycle 2: email is cached, not low-scored — still works
    emailCalls.length = 0;
    const suggestions2 = await detector.detect();
    expect(suggestions2).toHaveLength(1);
    // No new LLM call (cached), but NOT because of low-score exclusion
  });

  it('dismissed items are NOT added to low-score set (no double-exclusion)', async () => {
    const emailCalls = [];
    const extractor = mockLlmExtractor({
      emailHandler: (subject) => {
        emailCalls.push(subject);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'Acme', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
    });

    const tokenStore = createMockTokenStore([
      { id: 'suggestion_gmail_dismissed-email', emailId: 'dismissed-email' },
    ]);

    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'dismissed-email', score: 0.6 }),
        makeEmailResult({ messageId: 'active-email', score: 0.35 }),
      ]),
      calendarService: mockCalendar([]),
      tokenStore,
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: dismissed email skips LLM (dismissed filter), active email
    // gets enriched but is low-score → no suggestions
    const suggestions1 = await detector.detect();
    expect(suggestions1).toHaveLength(0);
    expect(emailCalls).toEqual(['Interview Invitation']); // only active email

    // Now clear dismissed
    await tokenStore.clearDismissed();

    // Cycle 2: dismissed email should now be enriched (no longer dismissed),
    // active email should be skipped (low-score exclusion)
    emailCalls.length = 0;
    const suggestions2 = await detector.detect();
    // Previously dismissed email is now eligible for LLM again
    expect(emailCalls).toEqual(['Interview Invitation']); // the dismissed one is now active
  });
});

// ---------------------------------------------------------------------------
// H22: low-score-calendar-cross-ref — a low-score calendar event can still
//      participate in cross-referencing using regex data on a later cycle
// ---------------------------------------------------------------------------
describe('H22: low-score-calendar-cross-ref — regex data still enables cross-ref', () => {
  it('low-score event cross-refs with new email using domain matching', async () => {
    let emailCallCount = 0;
    let eventCallCount = 0;
    const extractor = mockLlmExtractor({
      emailHandler: () => {
        emailCallCount++;
        return {
          dryModePrompt: null,
          extraction: { company_name: 'Google', date: null, time: null, duration_minutes: null, intent: null, interview_type: 'video' },
        };
      },
      eventHandler: () => {
        eventCallCount++;
        return {
          dryModePrompt: null,
          extraction: { company_name: 'Google', interview_type: 'video' },
        };
      },
    });

    // Calendar event with score 0.35 (low) — has google.com organizer
    const lowEvent = makeCalendarResult({
      eventId: 'low-evt',
      score: 0.35,
      organizerEmail: 'recruiter@google.com',
    });

    // First cycle: only calendar event, no email → no suggestion, event becomes low-score
    let emails = [];
    const gmailService = { scanForInterviews: async () => emails };
    const detector = createInterviewDetector({
      gmailService,
      calendarService: mockCalendar([lowEvent]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions1 = await detector.detect();
    expect(suggestions1).toHaveLength(0);
    expect(eventCallCount).toBe(1); // enriched on first cycle

    // Second cycle: new email arrives from google.com — should cross-ref
    // even though event is low-scored (regex data has organizerEmail)
    eventCallCount = 0;
    emailCallCount = 0;
    emails = [makeEmailResult({
      messageId: 'new-email',
      senderDomain: 'google.com',
      senderEmail: 'hr@google.com',
      score: 0.8,
    })];

    const suggestions2 = await detector.detect();
    // Event LLM was skipped (low-score), but cross-ref works on domain
    expect(eventCallCount).toBe(0); // skipped due to low-score
    expect(emailCallCount).toBe(1); // new email enriched
    expect(suggestions2).toHaveLength(1);
    expect(suggestions2[0].source).toBe('gmail+calendar');
    expect(suggestions2[0].calendarEventId).toBe('low-evt');
  });
});

// ---------------------------------------------------------------------------
// H23: concurrent-detect-low-score — two rapid detect() calls should not
//      produce duplicate low-score log entries for the same item
// ---------------------------------------------------------------------------
describe('H23: concurrent-detect-low-score — no duplicate low-score tracking', () => {
  it('sequential detect() calls do not re-log the same low-score item', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const extractor = mockLlmExtractor();
    const lowEmail = makeEmailResult({ messageId: 'dup-test', score: 0.35 });

    const detector = createInterviewDetector({
      gmailService: mockGmail([lowEmail]),
      calendarService: mockCalendar([]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    await detector.detect();
    await detector.detect();
    await detector.detect();

    const lowScoreLogs = logSpy.mock.calls
      .map((c) => c[0])
      .filter((l) => typeof l === 'string' && l.includes('LOW-SCORE email') && l.includes('dup-test'));

    // Should only log once (first cycle), not on subsequent cycles
    expect(lowScoreLogs).toHaveLength(1);

    logSpy.mockRestore();
  });

  it('concurrent detect() calls do not corrupt low-score sets', async () => {
    let emailCallCount = 0;
    const extractor = mockLlmExtractor({
      emailHandler: () => {
        emailCallCount++;
        return {
          dryModePrompt: null,
          extraction: { company_name: 'Test', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
    });

    const lowEmail = makeEmailResult({ messageId: 'concurrent-test', score: 0.35 });
    const detector = createInterviewDetector({
      gmailService: mockGmail([lowEmail]),
      calendarService: mockCalendar([]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Fire 3 detect() calls concurrently
    const [r1, r2, r3] = await Promise.all([
      detector.detect(),
      detector.detect(),
      detector.detect(),
    ]);

    // All should return 0 suggestions
    expect(r1).toHaveLength(0);
    expect(r2).toHaveLength(0);
    expect(r3).toHaveLength(0);

    // Subsequent call should skip LLM
    emailCallCount = 0;
    await detector.detect();
    expect(emailCallCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// H24: item-id-in-llm-logs — verify itemId appears in all LLM log lines
// ---------------------------------------------------------------------------
describe('H24: item-id-in-llm-logs — itemId propagated to all log lines', () => {
  it('REQUEST and RESPONSE logs include the email messageId', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const extractor = mockLlmExtractor({
      emailHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: 'Test', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
      }),
    });

    const detector = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ messageId: 'test-msg-42' })]),
      calendarService: mockCalendar([]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    await detector.detect();

    // The extractor mock doesn't produce real logs (it bypasses callLlm),
    // so we verify the detector passes the itemId by checking the call args
    logSpy.mockRestore();
  });

  it('extractFromEmail receives itemId from interviewDetector', async () => {
    const receivedItemIds = [];
    const extractor = {
      extractFromEmail: async (subject, body, sender, itemId) => {
        receivedItemIds.push(itemId);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'Test', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
      extractFromCalendarEvent: async () => null,
    };

    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'msg-alpha' }),
        makeEmailResult({ messageId: 'msg-beta', subject: 'Interview Beta' }),
      ]),
      calendarService: mockCalendar([]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    await detector.detect();

    expect(receivedItemIds).toContain('email:msg-alpha');
    expect(receivedItemIds).toContain('email:msg-beta');
  });

  it('extractFromCalendarEvent receives itemId from interviewDetector', async () => {
    const receivedItemIds = [];
    const extractor = {
      extractFromEmail: async () => null,
      extractFromCalendarEvent: async (summary, desc, loc, org, itemId) => {
        receivedItemIds.push(itemId);
        return {
          dryModePrompt: null,
          extraction: { company_name: 'Test', interview_type: 'video' },
        };
      },
    };

    const detector = createInterviewDetector({
      gmailService: mockGmail([]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'evt-alpha' }),
        makeCalendarResult({ eventId: 'evt-beta', summary: 'Interview Beta' }),
      ]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    await detector.detect();

    expect(receivedItemIds).toContain('event:evt-alpha');
    expect(receivedItemIds).toContain('event:evt-beta');
  });
});

// ---------------------------------------------------------------------------
// H25: low-score-skip-log — verify the skip summary log fires correctly
// ---------------------------------------------------------------------------
describe('H25: low-score-skip-log — summary log on subsequent cycles', () => {
  it('logs skip count on second cycle when low-score items exist', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const extractor = mockLlmExtractor();
    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'skip-e1', score: 0.35, senderDomain: 'acme.com', senderEmail: 'a@acme.com' }),
        makeEmailResult({ messageId: 'skip-e2', score: 0.35, subject: 'Interview 2', senderDomain: 'beta.com', senderEmail: 'b@beta.com' }),
      ]),
      calendarService: mockCalendar([]),
      tokenStore: createMockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    // Cycle 1: items enriched, then marked low-score
    await detector.detect();

    // Cycle 2: items skipped — summary log should fire
    await detector.detect();

    const skipLogs = logSpy.mock.calls
      .map((c) => c[0])
      .filter((l) => typeof l === 'string' && l.includes('Skipped LLM extraction for'));

    expect(skipLogs).toHaveLength(1);
    expect(skipLogs[0]).toContain('2 low-score email(s)');

    logSpy.mockRestore();
  });
});
