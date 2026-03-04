/**
 * Reproduction tests for the cancellation email bug.
 *
 * Bug: An email with subject "Quick Update: Interview Cancellation" from
 * Spark Hire Recruit on behalf of "Dream" is surfaced as a new interview
 * suggestion (action: 'add') at 50% confidence instead of being detected
 * as a cancellation. Additionally, the company name is extracted as
 * "Liron Kraushar" (a person) instead of "Dream" (the actual company).
 *
 * H1: detectEmailIntent misses the noun form "interview cancellation"
 * H2: extractCompanyNameFromText matches across subject–snippet boundary
 */

import { describe, it, expect } from '@jest/globals';
import {
  detectEmailIntent,
  extractCompanyNameFromText,
} from '../src/utils/emailParser.js';
import { createInterviewDetector } from '../src/services/interviewDetector.js';
import { createMockTokenStore } from './helpers/mockTokenStore.js';

// -------------------------------------------------------------------------
// H1: detectEmailIntent — "Interview Cancellation" noun form
// -------------------------------------------------------------------------

describe('H1 — detectEmailIntent misses "Interview Cancellation" noun form', () => {
  const SUBJECT = 'Quick Update: Interview Cancellation';
  const BODY =
    'Hi Ayal, Just a quick heads-up — your interview that was scheduled ' +
    'for Monday, March 2, 2026 has been canceled. If you have any questions, ' +
    'please reach out to the recruiter.';

  it('detects "Interview Cancellation" in subject as cancel intent', () => {
    expect(detectEmailIntent(SUBJECT, BODY)).toBe('cancel');
  });

  it('detects standalone "cancellation" in subject as cancel intent', () => {
    expect(detectEmailIntent('Cancellation Notice', '')).toBe('cancel');
  });

  it('detects "interview cancellation" noun phrase in body as cancel intent', () => {
    expect(detectEmailIntent(
      'Quick Update',
      'This is an interview cancellation notice. Your slot has been removed.'
    )).toBe('cancel');
  });

  it('detects "cancel your interview" phrasing as cancel intent', () => {
    expect(detectEmailIntent(
      'Schedule Update',
      'We need to cancel your interview originally set for next week.'
    )).toBe('cancel');
  });

  it('detects "interview has been canceled" (US spelling) as cancel', () => {
    expect(detectEmailIntent(
      'Update',
      'Your interview has been canceled due to scheduling conflicts.'
    )).toBe('cancel');
  });

  it('detects Google Calendar "Cancelled event:" notification as cancel (UK spelling)', () => {
    expect(detectEmailIntent(
      'Cancelled event: Interview with Torq @ Mon 2 Mar 2026 15:15 – 16:45 (GMT+2) (ayalkroub@gmail.com)',
      ''
    )).toBe('cancel');
  });

  it('detects Google Calendar "Canceled event:" notification as cancel (US spelling)', () => {
    expect(detectEmailIntent(
      'Canceled event: Interview with Torq @ Mon 2 Mar 2026 15:15 – 16:45 (GMT+2)',
      ''
    )).toBe('cancel');
  });
});

// -------------------------------------------------------------------------
// H2: extractCompanyNameFromText — "on behalf of" pattern
// -------------------------------------------------------------------------

describe('H2 — extractCompanyNameFromText misses "on behalf of Dream"', () => {
  const SUBJECT = 'Quick Update: Interview Cancellation';
  const SNIPPET =
    'Reply above to continue the conversation with Liron Kraushar. ' +
    'Sent by Spark Hire Recruit on behalf of Dream Hi Ayal, ' +
    'Just a quick heads-up — your interview that was scheduled for Monday, March 2, 2026';

  it('extracts "dream" from "on behalf of Dream" in snippet (not "liron kraushar")', () => {
    const combined = `${SUBJECT} ${SNIPPET}`;
    const result = extractCompanyNameFromText(combined);
    expect(result).toBe('dream');
  });

  it('does NOT extract a person name from "conversation with Liron Kraushar"', () => {
    const combined = `${SUBJECT} ${SNIPPET}`;
    const result = extractCompanyNameFromText(combined);
    expect(result).not.toBe('liron kraushar');
  });

  it('extracts company from standalone "on behalf of CompanyName"', () => {
    expect(extractCompanyNameFromText(
      'Sent on behalf of Acme Corp regarding your upcoming interview'
    )).toBe('acme');
  });
});

// -------------------------------------------------------------------------
// Integration: Full pipeline — cancellation email should get action='cancel'
// -------------------------------------------------------------------------

describe('Integration — cancellation email pipeline', () => {
  function mockGmail(results = []) {
    return { scanForInterviews: async () => results };
  }
  function mockCalendar(results = []) {
    return { scanForInterviews: async () => results };
  }

  it('surfaces a cancellation email as action=cancel, not action=add', async () => {
    const email = {
      messageId: 'cancel-msg-1',
      subject: 'Quick Update: Interview Cancellation',
      snippet: 'Reply above to continue the conversation with Liron Kraushar. ' +
        'Sent by Spark Hire Recruit on behalf of Dream Hi Ayal, ' +
        'Just a quick heads-up — your interview that was scheduled for Monday, March 2, 2026',
      from: 'Spark Hire Recruit <noreply@sparkhire.com>',
      senderEmail: 'noreply@sparkhire.com',
      senderDomain: 'sparkhire.com',
      companyName: 'dream',
      score: 0.55,
      matchedKeywords: ['interview', 'schedule', 'recruiting-platform:sparkhire.com'],
      extractedDate: '2026-03-02',
      extractedTime: '15:15',
      extractedDuration: null,
      intent: 'cancel', // This is what detectEmailIntent SHOULD return
    };

    const calendarEvent = {
      eventId: 'cal-evt-1',
      summary: 'Interview with Dream',
      description: '',
      organizerEmail: 'calendar@group.calendar.google.com',
      startDateTime: '2026-03-02T15:15:00+02:00',
      endDateTime: '2026-03-02T16:15:00+02:00',
      date: '2026-03-02',
      time: '15:15',
      score: 0.6,
      matchedKeywords: ['interview'],
      reasons: ['keyword-match'],
      hasVideoLink: false,
      location: '123 Main St, Tel Aviv',
      companyName: 'dream',
      calendarStatus: 'confirmed',
    };

    const detector = createInterviewDetector({
      gmailService: mockGmail([email]),
      calendarService: mockCalendar([calendarEvent]),
      tokenStore: createMockTokenStore(),
      idFn: () => 1700000000000,
    });

    const suggestions = await detector.detect();

    expect(suggestions.length).toBe(1);
    expect(suggestions[0].action).toBe('cancel');
    expect(suggestions[0].companyName).toBe('Dream');
  });
});
