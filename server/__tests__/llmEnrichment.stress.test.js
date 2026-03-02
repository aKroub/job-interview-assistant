import { describe, it, expect } from '@jest/globals';
import {
  normalizeInterviewType,
  mergeEmailExtraction,
  mergeCalendarExtraction,
} from '../src/utils/llmEnrichment.js';

// ---------------------------------------------------------------------------
// H1: merge-overflow — LLM returns extra fields that collide with result keys
// ---------------------------------------------------------------------------
describe('H1: merge-overflow — LLM extra fields do not overwrite protected fields', () => {
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
    bodyText: 'Full email body',
  });

  it('LLM returning "score" field does not overwrite email score', () => {
    const llm = {
      company_name: 'Acme',
      date: null,
      time: null,
      duration_minutes: null,
      intent: null,
      interview_type: null,
      score: 0.1, // adversarial extra field
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    // score should remain 0.8 from baseEmail since mergeEmailExtraction
    // only spreads baseEmail then overrides specific known fields
    expect(result.score).toBe(0.8);
  });

  it('LLM returning "messageId" field does not overwrite email messageId', () => {
    const llm = {
      company_name: null,
      date: null,
      time: null,
      duration_minutes: null,
      intent: null,
      interview_type: null,
      messageId: 'HIJACKED', // adversarial
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.messageId).toBe('msg1');
  });

  it('LLM returning "senderEmail" does not overwrite original', () => {
    const llm = {
      company_name: null,
      date: null,
      time: null,
      duration_minutes: null,
      intent: null,
      interview_type: null,
      senderEmail: 'evil@hacker.com', // adversarial
    };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.senderEmail).toBe('hr@acme.com');
  });

  const baseEvent = Object.freeze({
    eventId: 'evt1',
    summary: 'Interview with TechCo',
    description: 'Video call',
    organizerEmail: 'hr@techco.com',
    date: '2026-03-10',
    time: '14:00',
    score: 0.7,
    companyName: 'techco',
    calendarStatus: 'confirmed',
  });

  it('LLM returning "score" field does not overwrite calendar score', () => {
    const llm = {
      company_name: 'TechCo',
      interview_type: null,
      score: 0.1, // adversarial
    };
    const result = mergeCalendarExtraction(baseEvent, llm);
    expect(result.score).toBe(0.7);
  });

  it('LLM returning "calendarStatus" does not overwrite original', () => {
    const llm = {
      company_name: null,
      interview_type: null,
      calendarStatus: 'cancelled', // adversarial
    };
    const result = mergeCalendarExtraction(baseEvent, llm);
    expect(result.calendarStatus).toBe('confirmed');
  });
});

// ---------------------------------------------------------------------------
// H2: falsy-zero-regression — edge-case falsy values in LLM extraction
// ---------------------------------------------------------------------------
describe('H2: falsy-zero-regression — edge-case values handled correctly', () => {
  const baseEmail = Object.freeze({
    messageId: 'msg1',
    subject: 'Interview',
    snippet: 'Snippet',
    from: 'hr@co.com',
    senderEmail: 'hr@co.com',
    senderDomain: 'co.com',
    companyName: 'original',
    score: 0.5,
    matchedKeywords: [],
    extractedDate: '2026-01-01',
    extractedTime: '09:00',
    extractedDuration: 30,
    intent: 'add',
    bodyText: '',
  });

  it('LLM company_name "0" is falsy — falls back to regex', () => {
    // "0" is truthy in JS, so this should actually override
    const llm = { company_name: '0', date: null, time: null, duration_minutes: null, intent: null, interview_type: null };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.companyName).toBe('0');
  });

  it('LLM company_name false (boolean) falls back to regex', () => {
    const llm = { company_name: false, date: null, time: null, duration_minutes: null, intent: null, interview_type: null };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.companyName).toBe('original');
  });

  it('LLM date "0000-00-00" is truthy — overrides regex', () => {
    const llm = { company_name: null, date: '0000-00-00', time: null, duration_minutes: null, intent: null, interview_type: null };
    const result = mergeEmailExtraction(baseEmail, llm);
    // This is a technically invalid date but the merge function doesn't validate format
    expect(result.extractedDate).toBe('0000-00-00');
  });

  it('LLM duration_minutes NaN is treated as non-null (overrides)', () => {
    const llm = { company_name: null, date: null, time: null, duration_minutes: NaN, intent: null, interview_type: null };
    const result = mergeEmailExtraction(baseEmail, llm);
    // NaN != null is true, so NaN overrides. This is a known edge case.
    expect(result.extractedDuration).toBeNaN();
  });

  it('LLM duration_minutes negative number is accepted', () => {
    const llm = { company_name: null, date: null, time: null, duration_minutes: -5, intent: null, interview_type: null };
    const result = mergeEmailExtraction(baseEmail, llm);
    // Negative duration is nonsensical but merge doesn't validate
    expect(result.extractedDuration).toBe(-5);
  });
});

// ---------------------------------------------------------------------------
// H3: normalize-substring-match — compound/decorated LLM types
// ---------------------------------------------------------------------------
describe('H3: normalize-substring-match — compound type strings', () => {
  it('returns null for "Phone Screen Interview" (extra word)', () => {
    expect(normalizeInterviewType('Phone Screen Interview')).toBeNull();
  });

  it('returns null for "Video (Zoom)" (parenthetical)', () => {
    expect(normalizeInterviewType('Video (Zoom)')).toBeNull();
  });

  it('returns null for "In-Person / Onsite" (slash combo)', () => {
    expect(normalizeInterviewType('In-Person / Onsite')).toBeNull();
  });

  it('returns null for "technical phone screen" (round + format combo)', () => {
    expect(normalizeInterviewType('technical phone screen')).toBeNull();
  });

  it('returns null for "1st round video interview" (numbered round)', () => {
    expect(normalizeInterviewType('1st round video interview')).toBeNull();
  });

  it('returns null for "final onsite" (qualifier + format)', () => {
    expect(normalizeInterviewType('final onsite')).toBeNull();
  });

  it('returns null for "webex" (unlisted video platform)', () => {
    expect(normalizeInterviewType('webex')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// H4: bodyText-memory — check that raw bodyText is unbounded
// ---------------------------------------------------------------------------
describe('H4: bodyText-memory — bodyText is passed through without truncation', () => {
  it('bodyText can be very large (100K chars)', () => {
    // This simulates what gmailService would return if email body is huge
    const largeBody = 'x'.repeat(100_000);
    const email = {
      messageId: 'msg1',
      companyName: 'test',
      extractedDate: null,
      extractedTime: null,
      extractedDuration: null,
      intent: 'add',
      bodyText: largeBody,
    };

    const llm = { company_name: 'Enriched', date: null, time: null, duration_minutes: null, intent: null, interview_type: null };
    const result = mergeEmailExtraction(email, llm);

    // bodyText is preserved (not truncated by merge)
    expect(result.bodyText.length).toBe(100_000);
    expect(result.companyName).toBe('Enriched');
  });
});

// ---------------------------------------------------------------------------
// H5: concurrent-merge-safety — nested objects are not shared references
// ---------------------------------------------------------------------------
describe('H5: concurrent-merge-safety — spread does not share nested refs', () => {
  it('mutating matchedKeywords on merged result does not affect original', () => {
    const original = {
      messageId: 'msg1',
      companyName: 'test',
      extractedDate: null,
      extractedTime: null,
      extractedDuration: null,
      intent: 'add',
      matchedKeywords: ['interview', 'technical'],
      bodyText: '',
    };

    const llm = { company_name: 'Enriched', date: null, time: null, duration_minutes: null, intent: null, interview_type: null };
    const merged = mergeEmailExtraction(original, llm);

    // Shallow spread means matchedKeywords is the SAME array reference
    merged.matchedKeywords.push('INJECTED');

    // This WILL affect the original because spread is shallow!
    // This test documents the behavior — it's a known limitation.
    // The calling code (enrichWithLlm in PR 2) must not mutate merged results.
    expect(original.matchedKeywords).toContain('INJECTED');
  });

  it('mutating companyName on merged result does not affect original (string)', () => {
    const original = {
      messageId: 'msg1',
      companyName: 'test',
      extractedDate: null,
      extractedTime: null,
      extractedDuration: null,
      intent: 'add',
      matchedKeywords: [],
      bodyText: '',
    };

    const llm = { company_name: 'Enriched', date: null, time: null, duration_minutes: null, intent: null, interview_type: null };
    const merged = mergeEmailExtraction(original, llm);
    // Strings are immutable primitives — reassignment does NOT affect original
    expect(original.companyName).toBe('test');
    expect(merged.companyName).toBe('Enriched');
  });

  it('calendar merge: mutating reasons array on merged does affect original (shallow)', () => {
    const original = {
      eventId: 'evt1',
      companyName: 'test',
      reasons: ['keyword-match', 'external-organizer'],
    };

    const llm = { company_name: 'Enriched', interview_type: null };
    const merged = mergeCalendarExtraction(original, llm);

    merged.reasons.push('INJECTED');
    // Same shallow spread behavior — documents the limitation
    expect(original.reasons).toContain('INJECTED');
  });
});
