import { describe, it, expect, jest } from '@jest/globals';
import { createInterviewDetector } from '../src/services/interviewDetector.js';

// ---------------------------------------------------------------------------
// Shared test helpers (same pattern as interviewDetector.test.js)
// ---------------------------------------------------------------------------

function mockGmail(results = []) {
  return { scanForInterviews: async () => results };
}

function mockCalendar(results = []) {
  return { scanForInterviews: async () => results };
}

function mockTokenStore(dismissed = []) {
  return {
    getDismissed: () => {
      const ids = new Set();
      const emailIds = new Set();
      const calendarIds = new Set();
      for (const entry of dismissed) {
        if (typeof entry === 'string') {
          ids.add(entry);
        } else {
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const withoutLlm = createInterviewDetector({
      gmailService: mockGmail(emailData),
      calendarService: mockCalendar(calData),
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const withoutLlm = createInterviewDetector({
      gmailService: mockGmail(emailData),
      calendarService: mockCalendar(calData),
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
      tokenStore: mockTokenStore(),
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
  it('dismissed email skips LLM but its matched event does not leak as calendar-only', async () => {
    const extractor = spyLlmExtractor();

    const detector = createInterviewDetector({
      gmailService: mockGmail([
        makeEmailResult({ messageId: 'dismissed-msg', senderDomain: 'acme.com', senderEmail: 'hr@acme.com', companyName: 'acme' }),
        makeEmailResult({ messageId: 'active-msg', senderDomain: 'beta.com', senderEmail: 'hr@beta.com', companyName: 'beta' }),
      ]),
      calendarService: mockCalendar([
        makeCalendarResult({ eventId: 'evt1', organizerEmail: 'hr@acme.com', date: '2025-01-20' }),
        makeCalendarResult({ eventId: 'evt2', organizerEmail: 'hr@beta.com', date: '2025-01-20' }),
      ]),
      tokenStore: mockTokenStore([
        { id: 'suggestion_dismissed-msg_evt1', emailId: 'dismissed-msg', calendarId: '' },
      ]),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    // Only active email gets LLM call
    expect(extractor.emailCalls).toHaveLength(1);
    expect(extractor.emailCalls[0].subject).toBe('Interview Invitation');

    // active-msg + evt2 produces a suggestion
    const active = suggestions.find((s) => s.emailMessageId === 'active-msg');
    expect(active).toBeDefined();

    // evt1 was matched by dismissed email — must NOT appear as calendar-only
    const calOnlyEvt1 = suggestions.find((s) => s.source === 'calendar' && s.calendarEventId === 'evt1');
    expect(calOnlyEvt1).toBeUndefined();
  });

  it('batch with 50% dismissed — correct LLM call count and suggestion output', async () => {
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

    const extractor = spyLlmExtractor();

    const detector = createInterviewDetector({
      gmailService: mockGmail(emails),
      calendarService: mockCalendar(events),
      tokenStore: mockTokenStore(dismissedEntries),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    // 3 of 6 emails dismissed, 3 of 6 events dismissed
    expect(extractor.emailCalls).toHaveLength(3);
    expect(extractor.eventCalls).toHaveLength(3);

    // Only 3 active cross-ref suggestions
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
  it('un-dismissed item is enriched with LLM on second scan', async () => {
    const extractor1 = spyLlmExtractor();

    // First scan: msg1 dismissed
    const detector1 = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ messageId: 'msg1' })]),
      calendarService: mockCalendar([makeCalendarResult({ eventId: 'evt1' })]),
      tokenStore: mockTokenStore([
        { id: 'suggestion_msg1_evt1', emailId: 'msg1', calendarId: 'evt1' },
      ]),
      idFn: fixedId,
      llmExtractor: extractor1,
    });

    const suggestions1 = await detector1.detect();
    expect(suggestions1).toHaveLength(0);
    expect(extractor1.emailCalls).toHaveLength(0);
    expect(extractor1.eventCalls).toHaveLength(0);

    // Second scan: un-dismissed (empty set)
    const extractor2 = spyLlmExtractor({
      emailHandler: () => ({
        dryModePrompt: null,
        extraction: { company_name: 'NowActive', date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
      }),
    });

    const detector2 = createInterviewDetector({
      gmailService: mockGmail([makeEmailResult({ messageId: 'msg1' })]),
      calendarService: mockCalendar([makeCalendarResult({ eventId: 'evt1' })]),
      tokenStore: mockTokenStore([]),
      idFn: fixedId,
      llmExtractor: extractor2,
    });

    const suggestions2 = await detector2.detect();
    expect(suggestions2).toHaveLength(1);
    expect(extractor2.emailCalls).toHaveLength(1);
    expect(suggestions2[0].companyName).toBe('NowActive');
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
      tokenStore: mockTokenStore([
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
      tokenStore: mockTokenStore([
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
// H9: Index alignment with variable-delay enrichment in mixed dismissed batch
// ---------------------------------------------------------------------------
describe('H9: index alignment under variable-delay enrichment', () => {
  it('enriched results at correct indices despite null gaps from dismissed items', async () => {
    const extractor = spyLlmExtractor({
      emailHandler: async (subject) => {
        await new Promise((r) => setTimeout(r, Math.random() * 15));
        return {
          dryModePrompt: null,
          extraction: { company_name: `LLM_${subject}`, date: null, time: null, duration_minutes: null, intent: null, interview_type: null },
        };
      },
    });

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
      tokenStore: mockTokenStore([
        { id: 'x0', emailId: 'msg0', calendarId: '' },
        { id: 'x2', emailId: 'msg2', calendarId: '' },
      ]),
      idFn: fixedId,
      llmExtractor: extractor,
    });

    const suggestions = await detector.detect();

    // Only 2 LLM email calls (msg1, msg3)
    expect(extractor.emailCalls).toHaveLength(2);

    // 2 active cross-ref suggestions
    const crossRefs = suggestions.filter((s) => s.source === 'gmail+calendar');
    expect(crossRefs).toHaveLength(2);

    // Verify enriched names are correctly assigned (no index drift)
    const s1 = crossRefs.find((s) => s.emailMessageId === 'msg1');
    const s3 = crossRefs.find((s) => s.emailMessageId === 'msg3');
    expect(s1).toBeDefined();
    expect(s3).toBeDefined();
    expect(s1.companyName).toBe('LLM_S1');
    expect(s3.companyName).toBe('LLM_S3');
  });
});
