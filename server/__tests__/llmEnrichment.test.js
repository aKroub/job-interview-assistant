import { describe, it, expect } from '@jest/globals';
import {
  normalizeInterviewType,
  mergeEmailExtraction,
  mergeCalendarExtraction,
} from '../src/utils/llmEnrichment.js';

// ---------------------------------------------------------------------------
// normalizeInterviewType
// ---------------------------------------------------------------------------
describe('normalizeInterviewType', () => {
  it.each([
    ['phone', 'Phone Interview'],
    ['phone screen', 'Phone Interview'],
    ['phone interview', 'Phone Interview'],
    ['phone call', 'Phone Interview'],
    ['video', 'Video Interview'],
    ['video interview', 'Video Interview'],
    ['video call', 'Video Interview'],
    ['virtual', 'Video Interview'],
    ['remote', 'Video Interview'],
    ['zoom', 'Video Interview'],
    ['google meet', 'Video Interview'],
    ['teams', 'Video Interview'],
    ['in-person', 'In-Person Interview'],
    ['in person', 'In-Person Interview'],
    ['onsite', 'In-Person Interview'],
    ['on-site', 'In-Person Interview'],
    ['on site', 'In-Person Interview'],
    ['office', 'In-Person Interview'],
  ])('maps "%s" to "%s"', (input, expected) => {
    expect(normalizeInterviewType(input)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(normalizeInterviewType('PHONE SCREEN')).toBe('Phone Interview');
    expect(normalizeInterviewType('Video Interview')).toBe('Video Interview');
    expect(normalizeInterviewType('ON-SITE')).toBe('In-Person Interview');
  });

  it('trims whitespace', () => {
    expect(normalizeInterviewType('  phone  ')).toBe('Phone Interview');
  });

  it('returns null for round-type descriptions', () => {
    expect(normalizeInterviewType('technical')).toBeNull();
    expect(normalizeInterviewType('behavioral')).toBeNull();
    expect(normalizeInterviewType('system design')).toBeNull();
    expect(normalizeInterviewType('coding')).toBeNull();
  });

  it('returns null for unrecognised types', () => {
    expect(normalizeInterviewType('group discussion')).toBeNull();
    expect(normalizeInterviewType('whiteboard')).toBeNull();
  });

  it('returns null for null / undefined / empty / non-string', () => {
    expect(normalizeInterviewType(null)).toBeNull();
    expect(normalizeInterviewType(undefined)).toBeNull();
    expect(normalizeInterviewType('')).toBeNull();
    expect(normalizeInterviewType(42)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mergeEmailExtraction
// ---------------------------------------------------------------------------
describe('mergeEmailExtraction', () => {
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

  it('overrides all fields when LLM returns non-null values', () => {
    const llm = {
      company_name: 'Acme Corp',
      date: '2026-03-11',
      time: '15:30',
      duration_minutes: 45,
      intent: 'update',
      interview_type: 'phone screen',
    };

    const result = mergeEmailExtraction(baseEmail, llm);

    expect(result.companyName).toBe('Acme Corp');
    expect(result.extractedDate).toBe('2026-03-11');
    expect(result.extractedTime).toBe('15:30');
    expect(result.extractedDuration).toBe(45);
    expect(result.intent).toBe('update');
    expect(result.llmInterviewType).toBe('phone screen');
  });

  it('keeps regex values when LLM fields are null', () => {
    const llm = {
      company_name: null,
      date: null,
      time: null,
      duration_minutes: null,
      intent: null,
      interview_type: null,
    };

    const result = mergeEmailExtraction(baseEmail, llm);

    expect(result.companyName).toBe('acme');
    expect(result.extractedDate).toBe('2026-03-10');
    expect(result.extractedTime).toBe('14:00');
    expect(result.extractedDuration).toBe(60);
    expect(result.intent).toBe('add');
    expect(result.llmInterviewType).toBeNull();
  });

  it('keeps regex values when LLM fields are empty strings', () => {
    const llm = {
      company_name: '',
      date: '',
      time: '',
      duration_minutes: null,
      intent: '',
      interview_type: '',
    };

    const result = mergeEmailExtraction(baseEmail, llm);

    expect(result.companyName).toBe('acme');
    expect(result.extractedDate).toBe('2026-03-10');
    expect(result.extractedTime).toBe('14:00');
    expect(result.intent).toBe('add');
  });

  it('returns original unchanged when extraction is null', () => {
    const result = mergeEmailExtraction(baseEmail, null);
    expect(result).toBe(baseEmail);
  });

  it('returns original unchanged when extraction is undefined', () => {
    const result = mergeEmailExtraction(baseEmail, undefined);
    expect(result).toBe(baseEmail);
  });

  it('does not mutate the original email result', () => {
    const llm = { company_name: 'New Corp', date: null, time: null, duration_minutes: null, intent: null, interview_type: null };
    const result = mergeEmailExtraction(baseEmail, llm);

    expect(result).not.toBe(baseEmail);
    expect(baseEmail.companyName).toBe('acme');
    expect(result.companyName).toBe('New Corp');
  });

  it('preserves non-enriched fields from the original', () => {
    const llm = { company_name: 'Google', date: null, time: null, duration_minutes: null, intent: null, interview_type: null };
    const result = mergeEmailExtraction(baseEmail, llm);

    expect(result.messageId).toBe('msg1');
    expect(result.subject).toBe('Interview with Acme');
    expect(result.score).toBe(0.8);
    expect(result.senderDomain).toBe('acme.com');
    expect(result.bodyText).toBe('Full email body...');
  });

  it('rejects invalid intent values and keeps regex intent', () => {
    const llm = { company_name: null, date: null, time: null, duration_minutes: null, intent: 'reschedule', interview_type: null };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.intent).toBe('add');
  });

  it('accepts "cancel" as a valid intent', () => {
    const llm = { company_name: null, date: null, time: null, duration_minutes: null, intent: 'cancel', interview_type: null };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.intent).toBe('cancel');
  });

  it('accepts duration_minutes of 0 (does not fall back)', () => {
    const llm = { company_name: null, date: null, time: null, duration_minutes: 0, intent: null, interview_type: null };
    const result = mergeEmailExtraction(baseEmail, llm);
    expect(result.extractedDuration).toBe(0);
  });

  it('handles partial LLM extraction (some fields non-null, others null)', () => {
    const llm = {
      company_name: 'Google LLC',
      date: null,
      time: '10:00',
      duration_minutes: null,
      intent: null,
      interview_type: 'video',
    };

    const result = mergeEmailExtraction(baseEmail, llm);

    expect(result.companyName).toBe('Google LLC');
    expect(result.extractedDate).toBe('2026-03-10');
    expect(result.extractedTime).toBe('10:00');
    expect(result.extractedDuration).toBe(60);
    expect(result.intent).toBe('add');
    expect(result.llmInterviewType).toBe('video');
  });
});

// ---------------------------------------------------------------------------
// mergeCalendarExtraction
// ---------------------------------------------------------------------------
describe('mergeCalendarExtraction', () => {
  const baseEvent = Object.freeze({
    eventId: 'evt1',
    summary: 'Interview with TechCo',
    description: 'Video call with engineering team',
    organizerEmail: 'hr@techco.com',
    startDateTime: '2026-03-10T14:00:00Z',
    endDateTime: '2026-03-10T15:00:00Z',
    date: '2026-03-10',
    time: '14:00',
    score: 0.7,
    matchedKeywords: ['interview'],
    reasons: ['keyword-match'],
    hasVideoLink: true,
    location: 'Zoom',
    companyName: 'techco',
    calendarStatus: 'confirmed',
  });

  it('overrides company name when LLM returns non-null', () => {
    const llm = { company_name: 'TechCo Inc', interview_type: 'video' };
    const result = mergeCalendarExtraction(baseEvent, llm);

    expect(result.companyName).toBe('TechCo Inc');
    expect(result.llmInterviewType).toBe('video');
  });

  it('keeps regex company name when LLM returns null', () => {
    const llm = { company_name: null, interview_type: null };
    const result = mergeCalendarExtraction(baseEvent, llm);

    expect(result.companyName).toBe('techco');
    expect(result.llmInterviewType).toBeNull();
  });

  it('returns original unchanged when extraction is null', () => {
    const result = mergeCalendarExtraction(baseEvent, null);
    expect(result).toBe(baseEvent);
  });

  it('does not mutate the original calendar result', () => {
    const llm = { company_name: 'New Corp', interview_type: 'onsite' };
    const result = mergeCalendarExtraction(baseEvent, llm);

    expect(result).not.toBe(baseEvent);
    expect(baseEvent.companyName).toBe('techco');
    expect(result.companyName).toBe('New Corp');
  });

  it('preserves non-enriched fields from the original', () => {
    const llm = { company_name: 'Google', interview_type: null };
    const result = mergeCalendarExtraction(baseEvent, llm);

    expect(result.eventId).toBe('evt1');
    expect(result.date).toBe('2026-03-10');
    expect(result.time).toBe('14:00');
    expect(result.score).toBe(0.7);
    expect(result.hasVideoLink).toBe(true);
    expect(result.calendarStatus).toBe('confirmed');
  });

  it('does not add date/time/duration fields to calendar results', () => {
    const llm = { company_name: 'Test', interview_type: 'phone' };
    const result = mergeCalendarExtraction(baseEvent, llm);

    // Calendar date/time comes from the API, not LLM
    expect(result.date).toBe('2026-03-10');
    expect(result.time).toBe('14:00');
    expect(result.startDateTime).toBe('2026-03-10T14:00:00Z');
    expect(result.endDateTime).toBe('2026-03-10T15:00:00Z');
  });
});
