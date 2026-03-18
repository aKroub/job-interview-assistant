import { describe, it, expect } from '@jest/globals';
import { extractVideoCallUrl } from '../src/utils/emailParser.js';

// ---------------------------------------------------------------------------
// H1: Regex catastrophic backtracking (ReDoS) on crafted URLs
// ---------------------------------------------------------------------------

describe('H1 — extractVideoCallUrl ReDoS resistance', () => {
  const TIMEOUT_MS = 200; // Each call must complete well under 200ms

  it('handles a crafted Zoom URL with excessive path segments', () => {
    const start = performance.now();
    const payload = 'https://zoom.us/j/' + '/'.repeat(10000) + 'a'.repeat(5000);
    const result = extractVideoCallUrl(payload);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(TIMEOUT_MS);
    expect(result).toBeTruthy(); // Should still match the zoom pattern
  });

  it('handles text with many near-miss zoom URLs', () => {
    // Repeated near-matches that could cause backtracking
    const text = Array(500).fill('Check https://zoom.us/ for details').join(' ');
    const start = performance.now();
    extractVideoCallUrl(text);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(TIMEOUT_MS);
  });

  it('handles very long text with no video URLs', () => {
    const text = 'a'.repeat(100000);
    const start = performance.now();
    const result = extractVideoCallUrl(text);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(TIMEOUT_MS);
    expect(result).toBe('');
  });

  it('handles pathological whitespace-free text', () => {
    // No whitespace delimiter for the URL char class to stop at
    const text = 'https://zoom.us/j/' + 'x'.repeat(50000);
    const start = performance.now();
    const result = extractVideoCallUrl(text);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(TIMEOUT_MS);
    expect(result).toBeTruthy();
  });

  it('handles alternating Meet/Zoom patterns without backtracking', () => {
    const text = Array(200).fill(
      'Join at https://meet.google.com/xxx-xxxx-xxx or https://zoom.us/j/999'
    ).join('\n');
    const start = performance.now();
    const result = extractVideoCallUrl(text);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(TIMEOUT_MS);
    expect(result).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// H1b: extractVideoCallUrl correctness for supported platforms
// ---------------------------------------------------------------------------

describe('H1b — extractVideoCallUrl correctness', () => {
  it('extracts Zoom URL', () => {
    const text = 'Join meeting: https://zoom.us/j/1234567890?pwd=abc123';
    expect(extractVideoCallUrl(text)).toBe('https://zoom.us/j/1234567890?pwd=abc123');
  });

  it('extracts Zoom URL with subdomain', () => {
    const text = 'Link: https://company.zoom.us/j/999888777';
    expect(extractVideoCallUrl(text)).toBe('https://company.zoom.us/j/999888777');
  });

  it('extracts Google Meet URL', () => {
    const text = 'Meeting link: https://meet.google.com/abc-defg-hij';
    expect(extractVideoCallUrl(text)).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('extracts Microsoft Teams URL', () => {
    const text = 'Join: https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc';
    expect(extractVideoCallUrl(text)).toBe('https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc');
  });

  it('extracts Webex URL', () => {
    const text = 'Webex meeting: https://company.webex.com/meet/jsmith';
    expect(extractVideoCallUrl(text)).toBe('https://company.webex.com/meet/jsmith');
  });

  it('returns first match when multiple video URLs exist', () => {
    const text = 'Zoom: https://zoom.us/j/111 and Meet: https://meet.google.com/abc-defg-hij';
    expect(extractVideoCallUrl(text)).toBe('https://zoom.us/j/111');
  });

  it('returns empty string for non-video URLs', () => {
    expect(extractVideoCallUrl('Visit https://example.com')).toBe('');
    expect(extractVideoCallUrl('See https://calendar.google.com/event/123')).toBe('');
  });

  it('returns empty string for null/undefined/empty input', () => {
    expect(extractVideoCallUrl(null)).toBe('');
    expect(extractVideoCallUrl(undefined)).toBe('');
    expect(extractVideoCallUrl('')).toBe('');
  });

  it('does not match video URLs inside tracking redirects (no scheme prefix)', () => {
    // The pattern requires the URL to start with https?://, so a bare
    // "zoom.us/j/123" without scheme should not match.
    expect(extractVideoCallUrl('redirect?url=zoom.us/j/123')).toBe('');
  });

  it('matches video URL inside tracking redirect when full scheme is present', () => {
    // If the full URL is present in the text, it should still be extractable
    const text = 'redirect?url=https://zoom.us/j/123';
    expect(extractVideoCallUrl(text)).toBe('https://zoom.us/j/123');
  });

  it('stops at closing angle bracket in HTML', () => {
    const text = '<a href="https://zoom.us/j/123">link</a>';
    // The pattern stops at < and > and "
    const result = extractVideoCallUrl(text);
    expect(result).toBe('https://zoom.us/j/123');
  });

  it('stops at closing parenthesis (markdown links)', () => {
    const text = '[Join](https://zoom.us/j/123)';
    const result = extractVideoCallUrl(text);
    expect(result).toBe('https://zoom.us/j/123');
  });
});

// ---------------------------------------------------------------------------
// H5: Calendar video URL extraction — missing/malformed conferenceData
// ---------------------------------------------------------------------------

describe('H5 — extractVideoCallUrlFromEvent via calendarService', () => {
  // We test the extractVideoCallUrlFromEvent logic indirectly by testing
  // the calendarService module. Since extractVideoCallUrlFromEvent is not
  // exported, we import createCalendarService and mock the calendar API.

  // Dynamic import to avoid issues with googleapis mock
  let createCalendarService;

  beforeAll(async () => {
    const mod = await import('../src/services/calendarService.js');
    createCalendarService = mod.createCalendarService;
  });

  function createMockCalendarApi(events) {
    return {
      events: {
        list: async () => ({ data: { items: events } }),
      },
    };
  }

  function makeEvent(overrides = {}) {
    return {
      id: 'evt1',
      summary: 'Technical Interview with Acme',
      description: '',
      status: 'confirmed',
      start: { dateTime: '2099-06-01T10:00:00Z' },
      end: { dateTime: '2099-06-01T11:00:00Z' },
      organizer: { email: 'hr@acme.com' },
      ...overrides,
    };
  }

  it('extracts hangoutLink when present', async () => {
    const event = makeEvent({ hangoutLink: 'https://meet.google.com/abc-defg-hij' });
    const service = createCalendarService({}, {
      calendarApi: createMockCalendarApi([event]),
      nowFn: () => new Date('2099-01-01'),
    });
    const results = await service.scanForInterviews();
    expect(results[0].videoCallLink).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('extracts video entry point from conferenceData', async () => {
    const event = makeEvent({
      conferenceData: {
        entryPoints: [
          { entryPointType: 'phone', uri: 'tel:+1234567890' },
          { entryPointType: 'video', uri: 'https://zoom.us/j/999' },
        ],
      },
    });
    const service = createCalendarService({}, {
      calendarApi: createMockCalendarApi([event]),
      nowFn: () => new Date('2099-01-01'),
    });
    const results = await service.scanForInterviews();
    expect(results[0].videoCallLink).toBe('https://zoom.us/j/999');
  });

  it('prefers hangoutLink over conferenceData', async () => {
    const event = makeEvent({
      hangoutLink: 'https://meet.google.com/abc-defg-hij',
      conferenceData: {
        entryPoints: [
          { entryPointType: 'video', uri: 'https://zoom.us/j/999' },
        ],
      },
    });
    const service = createCalendarService({}, {
      calendarApi: createMockCalendarApi([event]),
      nowFn: () => new Date('2099-01-01'),
    });
    const results = await service.scanForInterviews();
    expect(results[0].videoCallLink).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('returns empty string when no video link exists', async () => {
    const event = makeEvent({
      hangoutLink: undefined,
      conferenceData: undefined,
    });
    const service = createCalendarService({}, {
      calendarApi: createMockCalendarApi([event]),
      nowFn: () => new Date('2099-01-01'),
    });
    const results = await service.scanForInterviews();
    expect(results[0].videoCallLink).toBe('');
  });

  it('returns empty string when conferenceData has no video entry point', async () => {
    const event = makeEvent({
      conferenceData: {
        entryPoints: [
          { entryPointType: 'phone', uri: 'tel:+1234567890' },
          { entryPointType: 'sip', uri: 'sip:meeting@example.com' },
        ],
      },
    });
    const service = createCalendarService({}, {
      calendarApi: createMockCalendarApi([event]),
      nowFn: () => new Date('2099-01-01'),
    });
    const results = await service.scanForInterviews();
    expect(results[0].videoCallLink).toBe('');
  });

  it('returns empty string when conferenceData.entryPoints is empty array', async () => {
    const event = makeEvent({
      conferenceData: { entryPoints: [] },
    });
    const service = createCalendarService({}, {
      calendarApi: createMockCalendarApi([event]),
      nowFn: () => new Date('2099-01-01'),
    });
    const results = await service.scanForInterviews();
    expect(results[0].videoCallLink).toBe('');
  });

  it('returns empty string when conferenceData.entryPoints is undefined', async () => {
    const event = makeEvent({
      conferenceData: {},
    });
    const service = createCalendarService({}, {
      calendarApi: createMockCalendarApi([event]),
      nowFn: () => new Date('2099-01-01'),
    });
    const results = await service.scanForInterviews();
    expect(results[0].videoCallLink).toBe('');
  });

  it('extracts video link for cancelled events too', async () => {
    const event = makeEvent({
      status: 'cancelled',
      hangoutLink: 'https://meet.google.com/xyz-abcd-efg',
    });
    const service = createCalendarService({}, {
      calendarApi: createMockCalendarApi([event]),
      nowFn: () => new Date('2099-01-01'),
    });
    const results = await service.scanForInterviews();
    expect(results.length).toBe(1);
    expect(results[0].videoCallLink).toBe('https://meet.google.com/xyz-abcd-efg');
    expect(results[0].calendarStatus).toBe('cancelled');
  });
});
