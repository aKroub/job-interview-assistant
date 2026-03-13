import { describe, it, expect } from '@jest/globals';
import { extractCalendarData } from '../src/utils/emailParser.js';
import { createGmailService } from '../src/services/gmailService.js';

/** Helper: base64url-encode a UTF-8 string. */
function encode(text) {
  return Buffer.from(text, 'utf-8').toString('base64url');
}

/**
 * Wraps ICS content in a Gmail message with a text/calendar MIME part.
 *
 * @param {string} icsContent - raw ICS text
 * @returns {Object} Gmail API message shape
 */
function icsMessage(icsContent) {
  return {
    payload: {
      mimeType: 'text/calendar',
      body: { data: encode(icsContent) },
    },
  };
}

/**
 * Creates a mock Gmail API that returns the given messages.
 *
 * @param {Object[]} messages - array of Gmail API message objects
 * @returns {Object} mock Gmail API
 */
function createMockGmailApi(messages = []) {
  return {
    users: {
      messages: {
        list: async () => ({
          data: { messages: messages.map((m) => ({ id: m.id })) },
        }),
        get: async ({ id }) => {
          const msg = messages.find((m) => m.id === id);
          if (!msg) throw new Error(`Message ${id} not found`);
          return { data: msg };
        },
      },
    },
  };
}

/**
 * Creates a Gmail message fixture with optional body and ICS parts.
 */
function makeMessage({ id = 'msg1', subject = '', from = '', snippet = '', body = '', icsContent = '' }) {
  const headers = [
    { name: 'Subject', value: subject },
    { name: 'From', value: from },
  ];

  if (!body && !icsContent) {
    return { id, snippet, payload: { headers } };
  }

  const parts = [];
  if (body) {
    parts.push({ mimeType: 'text/plain', body: { data: encode(body) } });
    parts.push({ mimeType: 'text/html', body: { data: encode(`<p>${body}</p>`) } });
  }
  if (icsContent) {
    parts.push({ mimeType: 'text/calendar', body: { data: encode(icsContent) } });
  }

  const payload = {
    mimeType: parts.length > 1 ? 'multipart/mixed' : parts[0].mimeType,
    headers,
    ...(parts.length > 1 ? { parts } : { body: parts[0].body }),
  };

  return { id, snippet, payload };
}

// =============================================================================
// Hypothesis 1: Malformed ICS content
// =============================================================================
describe('H1: Malformed ICS content', () => {
  it('returns null for completely garbage data', () => {
    const result = extractCalendarData(icsMessage('asdkfjh2398ry2h3f9uahsdflkj!!@@##'));
    expect(result).toBeNull();
  });

  it('returns null for empty ICS content', () => {
    const result = extractCalendarData(icsMessage(''));
    expect(result).toBeNull();
  });

  it('returns null for ICS with only headers but no DTSTART', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//Test//EN',
      'BEGIN:VEVENT',
      'SUMMARY:Interview',
      'LOCATION:Room 42',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(extractCalendarData(icsMessage(ics))).toBeNull();
  });

  it('returns null for truncated DTSTART value (incomplete date)', () => {
    const ics = 'BEGIN:VEVENT\r\nDTSTART:202603\r\nEND:VEVENT';
    expect(extractCalendarData(icsMessage(ics))).toBeNull();
  });

  it('returns null for DTSTART with date only (VALUE=DATE, all-day event)', () => {
    // All-day events use VALUE=DATE:20260315 with no T separator
    const ics = 'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260315\r\nEND:VEVENT';
    expect(extractCalendarData(icsMessage(ics))).toBeNull();
  });

  it('parses DTSTART with invalid date components without crashing', () => {
    // Month 13, day 32 — the regex captures digits, no validation
    const ics = 'BEGIN:VEVENT\r\nDTSTART:20261332T150000\r\nEND:VEVENT';
    const result = extractCalendarData(icsMessage(ics));
    // Should return something (the regex matches), but with bogus values
    expect(result).not.toBeNull();
    expect(result.date).toBe('2026-13-32');
    expect(result.startTime).toBe('15:00');
  });

  it('returns null for partial base64url encoding (corrupted attachment)', () => {
    // Create a message where the body.data is corrupted base64url
    const message = {
      payload: {
        mimeType: 'text/calendar',
        body: { data: '!!!not-valid-base64url!!!' },
      },
    };
    // Buffer.from with invalid base64url may produce garbage — should not match DTSTART
    const result = extractCalendarData(message);
    expect(result).toBeNull();
  });

  it('returns null for DTSTART missing the time component', () => {
    // Has YYYYMMDDx where x is not T — no time separator
    const ics = 'BEGIN:VEVENT\r\nDTSTART:20260315 150000\r\nEND:VEVENT';
    expect(extractCalendarData(icsMessage(ics))).toBeNull();
  });

  it('handles DTSTART at hour 00:00 correctly', () => {
    const ics = 'BEGIN:VEVENT\r\nDTSTART:20260315T000000\r\nDTEND:20260315T010000\r\nEND:VEVENT';
    const result = extractCalendarData(icsMessage(ics));
    expect(result).toEqual({
      date: '2026-03-15',
      startTime: '00:00',
      endTime: '01:00',
      duration: 60,
    });
  });

  it('handles DTSTART at hour 23:59 correctly', () => {
    const ics = 'BEGIN:VEVENT\r\nDTSTART:20260315T235900\r\nDTEND:20260316T000000\r\nEND:VEVENT';
    const result = extractCalendarData(icsMessage(ics));
    expect(result.startTime).toBe('23:59');
    expect(result.endTime).toBe('00:00');
    // Overnight — duration should be null
    expect(result.duration).toBeNull();
  });
});

// =============================================================================
// Hypothesis 2: Encoding edge cases
// =============================================================================
describe('H2: Encoding edge cases', () => {
  it('handles ICS with UTF-8 BOM (byte order mark) prefix', () => {
    const bom = '\uFEFF';
    const ics = bom + 'BEGIN:VEVENT\r\nDTSTART:20260315T150000\r\nDTEND:20260315T160000\r\nEND:VEVENT';
    const result = extractCalendarData(icsMessage(ics));
    expect(result).toEqual({
      date: '2026-03-15',
      startTime: '15:00',
      endTime: '16:00',
      duration: 60,
    });
  });

  it('handles ICS with Unix line endings (\\n only, no \\r)', () => {
    const ics = 'BEGIN:VEVENT\nDTSTART:20260315T150000\nDTEND:20260315T160000\nEND:VEVENT';
    const result = extractCalendarData(icsMessage(ics));
    expect(result).toEqual({
      date: '2026-03-15',
      startTime: '15:00',
      endTime: '16:00',
      duration: 60,
    });
  });

  it('handles ICS with mixed line endings (\\r\\n and \\n)', () => {
    const ics = 'BEGIN:VEVENT\r\nDTSTART:20260315T150000\nDTEND:20260315T160000\r\nEND:VEVENT';
    const result = extractCalendarData(icsMessage(ics));
    expect(result).toEqual({
      date: '2026-03-15',
      startTime: '15:00',
      endTime: '16:00',
      duration: 60,
    });
  });

  it('handles ICS with non-ASCII characters in SUMMARY', () => {
    const ics = [
      'BEGIN:VEVENT',
      'DTSTART:20260315T150000',
      'DTEND:20260315T160000',
      'SUMMARY:ראיון עם חברת Dream — הנדסת תוכנה',
      'END:VEVENT',
    ].join('\r\n');
    const result = extractCalendarData(icsMessage(ics));
    expect(result).toEqual({
      date: '2026-03-15',
      startTime: '15:00',
      endTime: '16:00',
      duration: 60,
    });
  });

  it('handles RFC 5545 line folding with tab continuation', () => {
    // RFC 5545 §3.1: CRLF + space OR tab is continuation
    const ics = 'BEGIN:VEVENT\r\nDTSTART;TZID=Americ\r\n\ta/New_York:20260315T150000\r\nDTEND;TZID=Americ\r\n\ta/New_York:20260315T160000\r\nEND:VEVENT';
    const result = extractCalendarData(icsMessage(ics));
    expect(result).toEqual({
      date: '2026-03-15',
      startTime: '15:00',
      endTime: '16:00',
      duration: 60,
    });
  });

  it('handles line folding that splits the DTSTART value digits', () => {
    // The fold splits right in the middle of the date digits
    const ics = 'BEGIN:VEVENT\r\nDTSTART:2026031\r\n 5T150000\r\nDTEND:20260315T160000\r\nEND:VEVENT';
    const result = extractCalendarData(icsMessage(ics));
    expect(result).toEqual({
      date: '2026-03-15',
      startTime: '15:00',
      endTime: '16:00',
      duration: 60,
    });
  });
});

// =============================================================================
// Hypothesis 3: Priority conflict — ICS always wins over regex
// =============================================================================
describe('H3: ICS priority over regex extraction in gmailService', () => {
  it('ICS date/time wins when body text has a different date', async () => {
    const icsContent = [
      'BEGIN:VEVENT',
      'DTSTART;TZID=Asia/Jerusalem:20260320T140000',
      'DTEND;TZID=Asia/Jerusalem:20260320T150000',
      'SUMMARY:Interview',
      'END:VEVENT',
    ].join('\r\n');

    const messages = [
      makeMessage({
        id: 'conflict1',
        subject: 'Interview Invitation - your interview is on March 18, 2026 at 10:00 AM',
        from: 'recruiter@greenhouse.io',
        snippet: 'Your interview is on March 18, 2026 at 10:00 AM',
        body: 'Your interview is scheduled for March 18, 2026 at 10:00 AM to 11:00 AM.',
        icsContent,
      }),
    ];

    const gmailApi = createMockGmailApi(messages);
    const service = createGmailService({}, { gmailApi, minScore: 0.1 });
    const results = await service.scanForInterviews();

    expect(results.length).toBe(1);
    // ICS says March 20 at 14:00, body says March 18 at 10:00 — ICS wins
    expect(results[0].extractedDate).toBe('2026-03-20');
    expect(results[0].extractedTime).toBe('14:00');
    expect(results[0].extractedDuration).toBe(60);
  });

  it('ICS duration wins over regex-extracted time range', async () => {
    const icsContent = [
      'BEGIN:VEVENT',
      'DTSTART:20260315T150000Z',
      'DTEND:20260315T153000Z',
      'SUMMARY:Quick screen',
      'END:VEVENT',
    ].join('\r\n');

    const messages = [
      makeMessage({
        id: 'conflict2',
        subject: 'Phone Screen Scheduled',
        from: 'recruiter@company.com',
        snippet: 'Your phone screen is on March 15, 2026 at 3:00 PM to 4:00 PM',
        body: 'Your phone screen is from 3:00 PM to 4:00 PM on March 15, 2026.',
        icsContent,
      }),
    ];

    const gmailApi = createMockGmailApi(messages);
    const service = createGmailService({}, { gmailApi, minScore: 0.1 });
    const results = await service.scanForInterviews();

    expect(results.length).toBe(1);
    // ICS says 30 min, body says 60 min — ICS wins
    expect(results[0].extractedDuration).toBe(30);
  });

  it('regex extraction used when ICS returns null (no DTSTART)', async () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Just a meeting note',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const messages = [
      makeMessage({
        id: 'fallback1',
        subject: 'Interview Scheduled for March 15, 2026 at 2:00 PM',
        from: 'recruiter@greenhouse.io',
        snippet: 'Your interview is on March 15, 2026 at 2:00 PM',
        body: 'Interview date: March 15, 2026, Time: 2:00 PM to 3:00 PM',
        icsContent,
      }),
    ];

    const gmailApi = createMockGmailApi(messages);
    const service = createGmailService({}, { gmailApi, minScore: 0.1 });
    const results = await service.scanForInterviews();

    expect(results.length).toBe(1);
    // ICS had no DTSTART → null → falls back to regex
    expect(results[0].extractedDate).toBe('2026-03-15');
    expect(results[0].extractedTime).toBe('14:00');
    expect(results[0].extractedDuration).toBe(60);
  });

  it('ICS partial data (date+time, no duration) still overrides regex date/time', async () => {
    const icsContent = [
      'BEGIN:VEVENT',
      'DTSTART:20260320T090000Z',
      'END:VEVENT',
    ].join('\r\n');

    const messages = [
      makeMessage({
        id: 'partial1',
        subject: 'Interview Invitation - March 18, 2026 at 2:00 PM to 3:00 PM',
        from: 'recruiter@company.com',
        snippet: 'Your interview is on March 18, 2026 at 2:00 PM',
        body: 'Date: March 18, 2026. Time: 2:00 PM to 3:00 PM.',
        icsContent,
      }),
    ];

    const gmailApi = createMockGmailApi(messages);
    const service = createGmailService({}, { gmailApi, minScore: 0.1 });
    const results = await service.scanForInterviews();

    expect(results.length).toBe(1);
    // ICS date/time wins, but ICS has no duration → falls back to regex duration
    expect(results[0].extractedDate).toBe('2026-03-20');
    expect(results[0].extractedTime).toBe('09:00');
    // ICS duration is null → ?? operator falls through to regex duration (60)
    expect(results[0].extractedDuration).toBe(60);
  });
});

// =============================================================================
// Hypothesis 4: ICS with DURATION property instead of DTEND
// =============================================================================
describe('H4: ICS with DURATION property instead of DTEND', () => {
  it('returns null duration when DURATION property is used instead of DTEND', () => {
    // Some calendar implementations use DURATION:PT1H instead of DTEND
    const ics = [
      'BEGIN:VEVENT',
      'DTSTART:20260315T150000Z',
      'DURATION:PT1H',
      'SUMMARY:Interview',
      'END:VEVENT',
    ].join('\r\n');

    const result = extractCalendarData(icsMessage(ics));
    // Current implementation only parses DTEND, not DURATION
    expect(result).not.toBeNull();
    expect(result.date).toBe('2026-03-15');
    expect(result.startTime).toBe('15:00');
    expect(result.endTime).toBeNull();
    expect(result.duration).toBeNull();
  });

  it('returns null duration for DURATION:PT30M format', () => {
    const ics = [
      'BEGIN:VEVENT',
      'DTSTART;TZID=Europe/London:20260315T100000',
      'DURATION:PT30M',
      'SUMMARY:Quick call',
      'END:VEVENT',
    ].join('\r\n');

    const result = extractCalendarData(icsMessage(ics));
    expect(result).not.toBeNull();
    expect(result.date).toBe('2026-03-15');
    expect(result.startTime).toBe('10:00');
    expect(result.endTime).toBeNull();
    expect(result.duration).toBeNull();
  });

  it('returns null duration for DURATION:PT1H30M (compound) format', () => {
    const ics = [
      'BEGIN:VEVENT',
      'DTSTART:20260315T140000Z',
      'DURATION:PT1H30M',
      'SUMMARY:Long interview',
      'END:VEVENT',
    ].join('\r\n');

    const result = extractCalendarData(icsMessage(ics));
    expect(result).not.toBeNull();
    expect(result.startTime).toBe('14:00');
    expect(result.endTime).toBeNull();
    expect(result.duration).toBeNull();
  });

  it('DURATION-based ICS still provides date/time to gmailService, regex fills duration gap', async () => {
    const icsContent = [
      'BEGIN:VEVENT',
      'DTSTART:20260315T150000Z',
      'DURATION:PT1H',
      'SUMMARY:Interview',
      'END:VEVENT',
    ].join('\r\n');

    const messages = [
      makeMessage({
        id: 'dur1',
        subject: 'Phone Screen Scheduled',
        from: 'recruiter@greenhouse.io',
        snippet: 'Your phone screen is on March 15, 2026 at 3:00 PM to 4:00 PM',
        body: 'Interview: March 15, 2026, 3:00 PM to 4:00 PM.',
        icsContent,
      }),
    ];

    const gmailApi = createMockGmailApi(messages);
    const service = createGmailService({}, { gmailApi, minScore: 0.1 });
    const results = await service.scanForInterviews();

    expect(results.length).toBe(1);
    // ICS provides date/time, but duration is null → regex fills it
    expect(results[0].extractedDate).toBe('2026-03-15');
    expect(results[0].extractedTime).toBe('15:00');
    expect(results[0].extractedDuration).toBe(60);
  });
});

// =============================================================================
// Hypothesis 5: Large/pathological ICS content
// =============================================================================
describe('H5: Large and pathological ICS content', () => {
  it('handles a very large ICS attachment (10,000+ lines of ATTENDEE)', () => {
    const attendees = Array.from({ length: 10000 }, (_, i) =>
      `ATTENDEE;CN=Person ${i}:mailto:person${i}@example.com`
    ).join('\r\n');

    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART:20260315T150000Z',
      'DTEND:20260315T160000Z',
      attendees,
      'SUMMARY:Big meeting',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const result = extractCalendarData(icsMessage(ics));
    expect(result).toEqual({
      date: '2026-03-15',
      startTime: '15:00',
      endTime: '16:00',
      duration: 60,
    });
  });

  it('handles deeply nested MIME tree (4 levels)', () => {
    const icsContent = 'BEGIN:VEVENT\r\nDTSTART:20260315T150000\r\nDTEND:20260315T160000\r\nEND:VEVENT';

    const message = {
      payload: {
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'multipart/related',
            parts: [
              {
                mimeType: 'multipart/alternative',
                parts: [
                  { mimeType: 'text/plain', body: { data: encode('body text') } },
                  {
                    mimeType: 'multipart/mixed',
                    parts: [
                      { mimeType: 'text/html', body: { data: encode('<p>html</p>') } },
                      { mimeType: 'text/calendar', body: { data: encode(icsContent) } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const result = extractCalendarData(message);
    expect(result).toEqual({
      date: '2026-03-15',
      startTime: '15:00',
      endTime: '16:00',
      duration: 60,
    });
  });

  it('handles ICS with many VEVENT blocks and extra properties', () => {
    const vevents = Array.from({ length: 50 }, (_, i) => [
      'BEGIN:VEVENT',
      `DTSTART:2026031${5 + (i % 5)}T${String(10 + i).padStart(2, '0')}0000`,
      `DTEND:2026031${5 + (i % 5)}T${String(11 + i).padStart(2, '0')}0000`,
      `SUMMARY:Interview ${i}`,
      `DESCRIPTION:This is a long description for interview ${i} that contains lots of text to simulate real-world ICS files.`,
      `LOCATION:Room ${i}`,
      `ORGANIZER:mailto:organizer${i}@example.com`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    ].join('\r\n')).join('\r\n');

    const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${vevents}\r\nEND:VCALENDAR`;

    const result = extractCalendarData(icsMessage(ics));
    // First VEVENT should win
    expect(result).not.toBeNull();
    expect(result.date).toBe('2026-03-15');
    expect(result.startTime).toBe('10:00');
  });

  it('handles ICS with very long property values', () => {
    const longSummary = 'A'.repeat(10000);
    const ics = [
      'BEGIN:VEVENT',
      `SUMMARY:${longSummary}`,
      'DTSTART:20260315T150000Z',
      'DTEND:20260315T160000Z',
      'END:VEVENT',
    ].join('\r\n');

    const result = extractCalendarData(icsMessage(ics));
    expect(result).toEqual({
      date: '2026-03-15',
      startTime: '15:00',
      endTime: '16:00',
      duration: 60,
    });
  });

  it('handles ICS with no newline at end of file', () => {
    const ics = 'BEGIN:VEVENT\r\nDTSTART:20260315T150000Z\r\nDTEND:20260315T160000Z\r\nEND:VEVENT';
    const result = extractCalendarData(icsMessage(ics));
    expect(result).toEqual({
      date: '2026-03-15',
      startTime: '15:00',
      endTime: '16:00',
      duration: 60,
    });
  });

  it('returns null for an ICS that is just whitespace', () => {
    const result = extractCalendarData(icsMessage('   \r\n  \r\n  '));
    expect(result).toBeNull();
  });
});
