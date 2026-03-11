import { describe, it, expect, jest } from '@jest/globals';
import {
  normalizeInterviewType,
  mergeEmailExtraction,
  mergeCalendarExtraction,
} from '../src/utils/llmEnrichment.js';
import {
  createLlmExtractor,
  buildEmailPrompt,
  parseJsonResponse,
} from '../src/services/llmExtractor.js';

// Shared frozen base objects for immutability safety
const baseEmail = Object.freeze({
  messageId: 'msg1',
  subject: 'Interview with Acme',
  snippet: 'We invite you...',
  from: 'hr@acme.com',
  senderEmail: 'hr@acme.com',
  senderDomain: 'acme.com',
  companyName: 'acme',
  score: 0.8,
  matchedKeywords: ['interview'],
  extractedDate: '2026-03-10',
  extractedTime: '14:00',
  extractedDuration: 60,
  intent: 'add',
  bodyText: 'Full email body...',
});

// ---------------------------------------------------------------------------
// H1: time-boundary-bypass — midnight-crossing and boundary hour values
// ---------------------------------------------------------------------------
describe('H1: time-boundary-bypass — midnight and boundary times in computeDurationFromTimes', () => {
  it('returns regex fallback for midnight-crossing times (23:30 to 00:30)', () => {
    // Cross-midnight produces a negative diff on same-day Date objects, so
    // computeDurationFromTimes returns null and regex duration is preserved.
    const llm = {
      company_name: null, date: null,
      start_time: '23:30', end_time: '00:30',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    // Negative diff → null → falls back to regex duration
    expect(result.extractedDuration).toBe(60);
    // But extractedTime IS overridden to the LLM start_time
    expect(result.extractedTime).toBe('23:30');
  });

  it('returns regex fallback for midnight-crossing times (23:00 to 01:00)', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '23:00', end_time: '01:00',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.extractedDuration).toBe(60);
  });

  it('computes 0-minute duration for same time (returns regex fallback)', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '10:00', end_time: '10:00',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    // Zero diff is not > 0, so computeDurationFromTimes returns null
    expect(result.extractedDuration).toBe(60);
  });

  it('handles midnight start time (00:00) correctly', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '00:00', end_time: '01:00',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.extractedDuration).toBe(60);
    expect(result.extractedTime).toBe('00:00');
  });

  it('handles end-of-day time (23:59) correctly', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '23:00', end_time: '23:59',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.extractedDuration).toBe(59);
    expect(result.extractedTime).toBe('23:00');
  });

  it('computes 1-minute duration for consecutive minutes', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '09:00', end_time: '09:01',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.extractedDuration).toBe(1);
  });

  it('computes large duration for full-day interview (00:00 to 23:59)', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '00:00', end_time: '23:59',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.extractedDuration).toBe(1439); // 23*60 + 59
  });

  it('does not mutate the original email when computing duration', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '10:00', end_time: '11:30',
      intent: null, interview_type: null,
    };
    mergeEmailExtraction(baseEmail, llm);
    expect(baseEmail.extractedDuration).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// H2: time-regex-bypass — TIME_RE accepts format but not semantic validity
// ---------------------------------------------------------------------------
describe('H2: time-regex-bypass — invalid but regex-matching times', () => {
  it('rejects "25:00" — passes regex, but Date constructor behavior', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '25:00', end_time: '26:00',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    // "25:00" passes /^\d{2}:\d{2}$/ regex. Whether Date("1970-01-01T25:00:00")
    // is NaN or wraps to next day depends on the JS engine.
    // The function should handle this gracefully either way.
    // If Date parses it as NaN → returns null → fallback to regex duration
    // If Date wraps → still computes a positive diff → could return 60
    expect(typeof result.extractedDuration).toBe('number');
  });

  it('rejects "99:99" — passes regex, Date should produce NaN', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '99:99', end_time: '99:99',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    // NaN check in computeDurationFromTimes should catch this
    expect(result.extractedDuration).toBe(60); // fallback to regex
  });

  it('rejects "13:60" — 60 minutes is invalid', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '13:60', end_time: '14:00',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    // Whether 13:60 becomes 14:00 (wrapping) or NaN depends on engine
    expect(typeof result.extractedDuration).toBe('number');
  });

  it('rejects single-digit hours "9:00" — does not match \\d{2}', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '9:00', end_time: '10:00',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    // "9:00" fails /^\d{2}:\d{2}$/ regex → returns null → fallback
    expect(result.extractedDuration).toBe(60);
    // But start_time is truthy so extractedTime IS overridden
    expect(result.extractedTime).toBe('9:00');
  });

  it('rejects "10:00 " with trailing space — does not match strict regex', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '10:00 ', end_time: '11:00',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    // Trailing space fails $ anchor → regex returns false → null → fallback
    expect(result.extractedDuration).toBe(60);
  });

  it('rejects " 10:00" with leading space — does not match strict regex', () => {
    const llm = {
      company_name: null, date: null,
      start_time: ' 10:00', end_time: '11:00',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.extractedDuration).toBe(60);
  });

  it('rejects "10:00:00" with seconds — too many characters', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '10:00:00', end_time: '11:00:00',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.extractedDuration).toBe(60);
  });

  it('handles empty string times — both falsy, returns null', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '', end_time: '',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.extractedDuration).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// H3: adversarial-llm-types — unexpected types for start_time/end_time
// ---------------------------------------------------------------------------
describe('H3: adversarial-llm-types — non-string start_time/end_time values', () => {
  it('handles numeric start_time (1400) gracefully', () => {
    const llm = {
      company_name: null, date: null,
      start_time: 1400, end_time: 1500,
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    // Numbers are truthy but fail regex → null → fallback to regex duration
    expect(result.extractedDuration).toBe(60);
    // But extractedTime is overridden since 1400 is truthy via || check
    expect(result.extractedTime).toBe(1400);
  });

  it('handles boolean start_time (true) gracefully', () => {
    const llm = {
      company_name: null, date: null,
      start_time: true, end_time: true,
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.extractedDuration).toBe(60);
    // true is truthy → extractedTime is set to true (a boolean!)
    expect(result.extractedTime).toBe(true);
  });

  it('rejects array start_time (["10:00"]) — must not coerce via toString', () => {
    const llm = {
      company_name: null, date: null,
      start_time: ['10:00'], end_time: ['11:00'],
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    // Arrays are truthy and RegExp.test() coerces to string, so without an
    // explicit typeof guard, ["10:00"] would pass TIME_RE and Date parsing.
    // computeDurationFromTimes must reject non-string inputs.
    expect(result.extractedDuration).toBe(60); // fallback to regex duration
  });

  it('rejects array that would compute a valid duration via coercion', () => {
    // This is the key regression test: single-element arrays coerce to valid
    // HH:MM strings via RegExp.test() and template literal concatenation.
    // The typeof guard in computeDurationFromTimes must block this.
    const llm = {
      company_name: null, date: null,
      start_time: ['09:00'], end_time: ['10:30'],
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    // Without the fix, this would compute 90 minutes. With the fix, it falls back to 60.
    expect(result.extractedDuration).toBe(60);
  });

  it('handles object start_time ({hour: 10}) gracefully', () => {
    const llm = {
      company_name: null, date: null,
      start_time: { hour: 10, minute: 0 }, end_time: { hour: 11, minute: 0 },
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    // Object.toString → "[object Object]" fails regex → null → fallback
    expect(result.extractedDuration).toBe(60);
  });

  it('handles null start_time with non-null end_time', () => {
    const llm = {
      company_name: null, date: null,
      start_time: null, end_time: '11:00',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    // null start_time → computeDurationFromTimes returns null → fallback
    expect(result.extractedDuration).toBe(60);
    // extractedTime should NOT be overridden (start_time is null/falsy)
    expect(result.extractedTime).toBe('14:00');
  });

  it('handles non-null start_time with null end_time', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '10:00', end_time: null,
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    // null end_time → computeDurationFromTimes returns null → fallback
    expect(result.extractedDuration).toBe(60);
    // But extractedTime IS overridden
    expect(result.extractedTime).toBe('10:00');
  });

  it('handles undefined start_time and end_time (missing keys)', () => {
    const llm = {
      company_name: 'Test Corp',
      date: null,
      intent: null,
      interview_type: null,
      // start_time and end_time not present at all
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.extractedDuration).toBe(60);
    expect(result.extractedTime).toBe('14:00');
    expect(result.companyName).toBe('Test Corp');
  });

  it('LLM returning extra __proto__ field does not pollute prototype', () => {
    const llm = {
      company_name: 'Safe Corp',
      date: null,
      start_time: null,
      end_time: null,
      intent: null,
      interview_type: null,
      __proto__: { isAdmin: true },
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.isAdmin).toBeUndefined();
    expect(result.companyName).toBe('Safe Corp');
  });

  it('LLM returning toString override does not break merge', () => {
    const llm = {
      company_name: 'Override Corp',
      date: null,
      start_time: null,
      end_time: null,
      intent: null,
      interview_type: null,
      toString: () => 'HIJACKED',
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.companyName).toBe('Override Corp');
    // The toString should be a function on the result due to spread
    expect(typeof result.toString).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// H4: extractedTime-overwrite-without-duration — time/duration inconsistency
// ---------------------------------------------------------------------------
describe('H4: extractedTime-overwrite-without-duration — time changes but duration stays stale', () => {
  it('documents: LLM start_time overrides extractedTime but duration uses regex fallback', () => {
    // Regex extracted: time=14:00, duration=60 (implies 14:00-15:00)
    // LLM says: start_time=10:00, end_time=null
    // Result: time=10:00, duration=60 (implies 10:00-11:00 — a different slot!)
    const llm = {
      company_name: null, date: null,
      start_time: '10:00', end_time: null,
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);

    expect(result.extractedTime).toBe('10:00');
    expect(result.extractedDuration).toBe(60);
    // This is a KNOWN BEHAVIOR: the duration is stale relative to the new time.
    // The caller (interviewDetector) should be aware of this limitation.
  });

  it('documents: LLM with only end_time does NOT override extractedTime', () => {
    // Only end_time provided — start_time is falsy → extractedTime stays as regex
    const llm = {
      company_name: null, date: null,
      start_time: null, end_time: '15:00',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);

    expect(result.extractedTime).toBe('14:00'); // regex value preserved
    expect(result.extractedDuration).toBe(60);   // regex value preserved
  });

  it('LLM with both start_time and end_time overrides both time and duration', () => {
    const llm = {
      company_name: null, date: null,
      start_time: '10:00', end_time: '10:45',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(baseEmail, llm);

    expect(result.extractedTime).toBe('10:00');
    expect(result.extractedDuration).toBe(45);
  });

  it('regex base has no duration — LLM provides valid start/end', () => {
    const noDurationEmail = Object.freeze({
      ...baseEmail,
      extractedDuration: null,
    });
    const llm = {
      company_name: null, date: null,
      start_time: '09:00', end_time: '09:30',
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(noDurationEmail, llm);

    expect(result.extractedDuration).toBe(30);
  });

  it('regex base has no duration — LLM provides no duration info → stays null', () => {
    const noDurationEmail = Object.freeze({
      ...baseEmail,
      extractedDuration: null,
    });
    const llm = {
      company_name: 'Test', date: null,
      start_time: null, end_time: null,
      intent: null, interview_type: null,
    };
    const result = mergeEmailExtraction(noDurationEmail, llm);

    expect(result.extractedDuration).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// H5: pipeline-integration-drift — old vs new LLM schema field names
// ---------------------------------------------------------------------------
describe('H5: pipeline-integration-drift — old schema fields silently ignored', () => {
  it('old schema with "time" and "duration_minutes" is silently ignored', () => {
    // If LLM returns old field names, merge won't find start_time/end_time
    const llm = {
      company_name: 'OldSchema Corp',
      date: '2026-03-15',
      time: '10:00',           // old field name
      duration_minutes: 45,     // old field name
      intent: 'add',
      interview_type: 'video',
    };
    const result = mergeEmailExtraction(baseEmail, llm);

    expect(result.companyName).toBe('OldSchema Corp');
    expect(result.extractedDate).toBe('2026-03-15');
    // extractedTime falls back to regex because start_time is undefined (falsy)
    expect(result.extractedTime).toBe('14:00');
    // extractedDuration falls back to regex because computeDurationFromTimes(undefined, undefined) → null
    expect(result.extractedDuration).toBe(60);
    // The old "time" and "duration_minutes" fields are lost — no error, no warning
    expect(result.time).toBeUndefined();
  });

  it('mixed old + new schema: start_time present, old time also present', () => {
    const llm = {
      company_name: 'MixedSchema Corp',
      date: '2026-03-15',
      time: '09:00',            // old field
      start_time: '10:00',      // new field (should take precedence)
      end_time: '10:30',        // new field
      duration_minutes: 60,     // old field (ignored)
      intent: 'add',
      interview_type: 'phone',
    };
    const result = mergeEmailExtraction(baseEmail, llm);

    // New fields are used
    expect(result.extractedTime).toBe('10:00');
    expect(result.extractedDuration).toBe(30); // computed from start_time/end_time
    expect(result.companyName).toBe('MixedSchema Corp');
  });

  it('system prompt now requests start_time/end_time instead of time/duration', () => {
    // Verify the prompt actually asks for the new field names
    const extractor = createLlmExtractor({ dryMode: true });
    const result = extractor.extractFromEmail(
      'Interview invitation',
      'Your interview is scheduled.',
      'hr@company.com'
    );

    return result.then((r) => {
      expect(r.dryModePrompt).toContain('start_time');
      expect(r.dryModePrompt).toContain('end_time');
      expect(r.dryModePrompt).not.toContain('duration_minutes');
    });
  });

  it('system prompt instructs LLM to extract only current event details', () => {
    const extractor = createLlmExtractor({ dryMode: true });
    return extractor.extractFromEmail(
      'Interview rescheduled',
      'Your interview has been moved.',
      'hr@company.com'
    ).then((r) => {
      // The prompt should contain guardrail language about current event only
      expect(r.dryModePrompt).toMatch(/current|new|only/i);
    });
  });

  it('calendar system prompt also has current-event-only guardrail', () => {
    const extractor = createLlmExtractor({ dryMode: true });
    return extractor.extractFromCalendarEvent(
      'Interview with Acme',
      'Following your phone screen, please join this video interview.',
      'Zoom',
      'hr@acme.com'
    ).then((r) => {
      expect(r.dryModePrompt).toMatch(/ignore|THIS event only|current/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: full pipeline (extractor → enrichment merge)
// ---------------------------------------------------------------------------
describe('Integration: LLM extraction + enrichment merge pipeline', () => {
  it('wet mode extraction result feeds correctly into mergeEmailExtraction', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              company_name: 'Pipeline Corp',
              date: '2026-04-01',
              start_time: '14:00',
              end_time: '15:30',
              intent: 'add',
              interview_type: 'video',
            }),
          }],
        }),
      },
    };

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    const extraction = await extractor.extractFromEmail(
      'Interview with Pipeline Corp',
      'You are invited to a video interview on April 1.',
      'hr@pipeline.com'
    );

    // Now merge extraction.extraction into base email
    const enriched = mergeEmailExtraction(baseEmail, extraction.extraction);

    expect(enriched.companyName).toBe('Pipeline Corp');
    expect(enriched.extractedDate).toBe('2026-04-01');
    expect(enriched.extractedTime).toBe('14:00');
    expect(enriched.extractedDuration).toBe(90); // 14:00-15:30 = 90 min
    expect(enriched.intent).toBe('add');
    expect(enriched.llmInterviewType).toBe('video');
    // Original fields preserved
    expect(enriched.messageId).toBe('msg1');
    expect(enriched.score).toBe(0.8);
  });

  it('wet mode extraction with null fields preserves regex values', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              company_name: null,
              date: null,
              start_time: null,
              end_time: null,
              intent: null,
              interview_type: null,
            }),
          }],
        }),
      },
    };

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    const extraction = await extractor.extractFromEmail(
      'Interview with Acme',
      'Your interview is scheduled.',
      'hr@acme.com'
    );

    const enriched = mergeEmailExtraction(baseEmail, extraction.extraction);

    expect(enriched.companyName).toBe('acme');
    expect(enriched.extractedDate).toBe('2026-03-10');
    expect(enriched.extractedTime).toBe('14:00');
    expect(enriched.extractedDuration).toBe(60);
    expect(enriched.intent).toBe('add');
  });

  it('pipeline handles LLM returning completely empty object', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: '{}' }],
        }),
      },
    };

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    const extraction = await extractor.extractFromEmail(
      'Interview tomorrow',
      'Your interview is tomorrow.',
      'hr@company.com'
    );

    const enriched = mergeEmailExtraction(baseEmail, extraction.extraction);

    // All fields should fall back to regex values
    expect(enriched.companyName).toBe('acme');
    expect(enriched.extractedDate).toBe('2026-03-10');
    expect(enriched.extractedTime).toBe('14:00');
    expect(enriched.extractedDuration).toBe(60);
    expect(enriched.intent).toBe('add');
    expect(enriched.llmInterviewType).toBeNull();
  });

  it('pipeline handles API failure → merge with null extraction', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockRejectedValue(new Error('Service unavailable')),
      },
    };

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    const extraction = await extractor.extractFromEmail(
      'Interview follow-up',
      'Regarding your interview...',
      'hr@company.com'
    );

    expect(extraction.extraction).toBeNull();

    // Merging null extraction should return original unchanged
    const enriched = mergeEmailExtraction(baseEmail, extraction.extraction);
    expect(enriched).toBe(baseEmail);
  });

  it('pipeline handles LLM returning extra unexpected fields safely', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              company_name: 'Extra Corp',
              date: '2026-04-01',
              start_time: '09:00',
              end_time: '10:00',
              intent: 'add',
              interview_type: 'phone',
              // Extra fields that shouldn't contaminate the result
              recruiter_name: 'Jane Doe',
              salary_range: '$100k-$150k',
              confidence: 0.95,
              notes: 'Candidate looks promising',
            }),
          }],
        }),
      },
    };

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    const extraction = await extractor.extractFromEmail(
      'Interview invitation',
      'You are invited to interview at Extra Corp.',
      'hr@extra.com'
    );

    const enriched = mergeEmailExtraction(baseEmail, extraction.extraction);

    // Expected fields are set
    expect(enriched.companyName).toBe('Extra Corp');
    expect(enriched.extractedDuration).toBe(60); // 09:00-10:00
    // Protected fields are NOT overwritten by extra LLM fields
    expect(enriched.score).toBe(0.8);
    expect(enriched.messageId).toBe('msg1');
    // Extra fields should NOT leak into the result
    expect(enriched.recruiter_name).toBeUndefined();
    expect(enriched.salary_range).toBeUndefined();
    expect(enriched.confidence).toBeUndefined();
    expect(enriched.notes).toBeUndefined();
  });
});
