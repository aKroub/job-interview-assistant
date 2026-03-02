import { describe, it, expect, jest } from '@jest/globals';
import {
  containsInterviewKeyword,
  buildEmailPrompt,
  buildCalendarPrompt,
  parseJsonResponse,
  createLlmExtractor,
} from '../src/services/llmExtractor.js';

// ---------------------------------------------------------------------------
// containsInterviewKeyword — privacy gate
// ---------------------------------------------------------------------------
describe('containsInterviewKeyword', () => {
  it('matches "interview"', () => {
    expect(containsInterviewKeyword('Technical interview with Acme')).toBe(true);
  });

  it('matches "interviews"', () => {
    expect(containsInterviewKeyword('Upcoming interviews this week')).toBe(true);
  });

  it('matches "interviewing"', () => {
    expect(containsInterviewKeyword('We are interviewing candidates')).toBe(true);
  });

  it('matches "interviewer"', () => {
    expect(containsInterviewKeyword('Your interviewer will be John')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(containsInterviewKeyword('INTERVIEW confirmation')).toBe(true);
  });

  it('rejects "view" (no false positives on partial match)', () => {
    expect(containsInterviewKeyword('Here is a view of the dashboard')).toBe(false);
  });

  it('rejects "internal review"', () => {
    expect(containsInterviewKeyword('Internal review meeting scheduled')).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(containsInterviewKeyword('', '', '')).toBe(false);
  });

  it('rejects non-string values gracefully', () => {
    expect(containsInterviewKeyword(null, undefined, 42)).toBe(false);
  });

  it('matches when keyword is in any field', () => {
    expect(containsInterviewKeyword('Hello', 'Your interview is tomorrow')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildEmailPrompt
// ---------------------------------------------------------------------------
describe('buildEmailPrompt', () => {
  it('includes subject, sender, and body in the prompt', () => {
    const prompt = buildEmailPrompt(
      'Interview with Acme Corp',
      'You are invited to an interview on March 9.',
      'recruiter@acme.com'
    );

    expect(prompt).toContain('Interview with Acme Corp');
    expect(prompt).toContain('recruiter@acme.com');
    expect(prompt).toContain('invited to an interview');
    expect(prompt).toContain('Subject:');
    expect(prompt).toContain('Body:');
  });

  it('truncates body to 3000 characters', () => {
    const longBody = 'x'.repeat(5000);
    const prompt = buildEmailPrompt('Subject', longBody, 'a@b.com');
    expect(prompt).toContain('x'.repeat(3000));
    expect(prompt).not.toContain('x'.repeat(3001));
  });

  it('handles empty body', () => {
    const prompt = buildEmailPrompt('Subject', '', 'a@b.com');
    expect(prompt).toContain('Subject');
    expect(prompt).toContain('Body:');
  });
});

// ---------------------------------------------------------------------------
// buildCalendarPrompt
// ---------------------------------------------------------------------------
describe('buildCalendarPrompt', () => {
  it('includes summary, organizer, and description', () => {
    const prompt = buildCalendarPrompt(
      'Interview with SentinelOne',
      'Video call link: https://zoom.us/j/123',
      'Zoom',
      'hr@sentinelone.com'
    );

    expect(prompt).toContain('Interview with SentinelOne');
    expect(prompt).toContain('hr@sentinelone.com');
    expect(prompt).toContain('Zoom');
    expect(prompt).toContain('Title:');
    expect(prompt).toContain('Description:');
  });

  it('handles missing location', () => {
    const prompt = buildCalendarPrompt('Title', 'Desc', '', 'a@b.com');
    expect(prompt).toContain('N/A');
  });
});

// ---------------------------------------------------------------------------
// parseJsonResponse
// ---------------------------------------------------------------------------
describe('parseJsonResponse', () => {
  it('parses plain JSON', () => {
    const result = parseJsonResponse('{"company_name": "Acme", "date": "2026-03-09"}');
    expect(result).toEqual({ company_name: 'Acme', date: '2026-03-09' });
  });

  it('parses markdown-fenced JSON (```json)', () => {
    const result = parseJsonResponse('```json\n{"company_name": "Acme"}\n```');
    expect(result).toEqual({ company_name: 'Acme' });
  });

  it('parses markdown-fenced JSON (``` without lang)', () => {
    const result = parseJsonResponse('```\n{"company_name": "Acme"}\n```');
    expect(result).toEqual({ company_name: 'Acme' });
  });

  it('returns null for invalid JSON', () => {
    expect(parseJsonResponse('not json at all')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseJsonResponse('')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseJsonResponse(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseJsonResponse(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createLlmExtractor — dry mode
// ---------------------------------------------------------------------------
describe('createLlmExtractor (dry mode)', () => {
  it('returns prompt without calling API', async () => {
    const mockClient = {
      messages: { create: jest.fn() },
    };
    const extractor = createLlmExtractor({
      dryMode: true,
      anthropicClient: mockClient,
    });

    const result = await extractor.extractFromEmail(
      'Interview with Acme',
      'Your interview is on March 9 at 10:00 AM.',
      'hr@acme.com'
    );

    expect(result).not.toBeNull();
    expect(result.dryModePrompt).toContain('[System]');
    expect(result.dryModePrompt).toContain('[User]');
    expect(result.dryModePrompt).toContain('Interview with Acme');
    expect(result.dryModePrompt).toContain('hr@acme.com');
    expect(result.dryModePrompt).toContain('company_name');
    expect(result.extraction).toBeNull();
    expect(mockClient.messages.create).not.toHaveBeenCalled();
  });

  it('returns prompt for calendar events in dry mode', async () => {
    const mockClient = {
      messages: { create: jest.fn() },
    };
    const extractor = createLlmExtractor({
      dryMode: true,
      anthropicClient: mockClient,
    });

    const result = await extractor.extractFromCalendarEvent(
      'Technical Interview - Google',
      'Video call with the team',
      'Google Meet',
      'recruiter@google.com'
    );

    expect(result).not.toBeNull();
    expect(result.dryModePrompt).toContain('[System]');
    expect(result.dryModePrompt).toContain('[User]');
    expect(result.dryModePrompt).toContain('Technical Interview - Google');
    expect(result.extraction).toBeNull();
    expect(mockClient.messages.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createLlmExtractor — privacy gate
// ---------------------------------------------------------------------------
describe('createLlmExtractor (privacy gate)', () => {
  it('returns null for emails without interview keywords', async () => {
    const extractor = createLlmExtractor({ dryMode: true });

    const result = await extractor.extractFromEmail(
      'Team lunch tomorrow',
      'Let\'s grab lunch at noon.',
      'coworker@company.com'
    );

    expect(result).toBeNull();
  });

  it('returns null for calendar events without interview keywords', async () => {
    const extractor = createLlmExtractor({ dryMode: true });

    const result = await extractor.extractFromCalendarEvent(
      'Sprint Planning',
      'Weekly sprint planning meeting',
      'Conference Room A',
      'pm@company.com'
    );

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createLlmExtractor — wet mode
// ---------------------------------------------------------------------------
describe('createLlmExtractor (wet mode)', () => {
  it('calls the API and returns parsed extraction', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              company_name: 'Acme Corp',
              date: '2026-03-09',
              time: '10:00',
              duration_minutes: 60,
              intent: 'add',
              interview_type: 'technical',
            }),
          }],
        }),
      },
    };
    const extractor = createLlmExtractor({
      dryMode: false,
      model: 'claude-haiku-4-5',
      anthropicClient: mockClient,
    });

    const result = await extractor.extractFromEmail(
      'Interview with Acme Corp',
      'You are invited to a technical interview on March 9 at 10:00 AM.',
      'hr@acme.com'
    );

    expect(result).not.toBeNull();
    expect(result.dryModePrompt).toBeNull();
    expect(result.extraction).toEqual({
      company_name: 'Acme Corp',
      date: '2026-03-09',
      time: '10:00',
      duration_minutes: 60,
      intent: 'add',
      interview_type: 'technical',
    });
    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
    expect(mockClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        system: expect.stringContaining('structured data extractor'),
      })
    );
  });

  it('calls the API for calendar events and returns parsed extraction', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: '```json\n{"company_name": "SentinelOne", "interview_type": "video"}\n```',
          }],
        }),
      },
    };
    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    const result = await extractor.extractFromCalendarEvent(
      'Interview with SentinelOne',
      'Video interview with engineering team',
      'Zoom',
      'hr@sentinelone.com'
    );

    expect(result).not.toBeNull();
    expect(result.extraction).toEqual({
      company_name: 'SentinelOne',
      interview_type: 'video',
    });
  });

  it('returns null extraction when API fails', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockRejectedValue(new Error('API rate limited')),
      },
    };
    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    const result = await extractor.extractFromEmail(
      'Interview tomorrow',
      'Your interview is scheduled.',
      'hr@company.com'
    );

    expect(result).not.toBeNull();
    expect(result.dryModePrompt).toBeNull();
    expect(result.extraction).toBeNull();
  });

  it('returns null extraction when response has no text block', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'tool_use', id: '123', name: 'test', input: {} }],
        }),
      },
    };
    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    const result = await extractor.extractFromEmail(
      'Interview invitation',
      'Details inside.',
      'hr@company.com'
    );

    expect(result).not.toBeNull();
    expect(result.extraction).toBeNull();
  });

  it('returns null extraction when LLM returns invalid JSON', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: 'I could not extract the details from this email.',
          }],
        }),
      },
    };
    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    const result = await extractor.extractFromEmail(
      'Interview follow-up',
      'Thanks for the interview.',
      'hr@company.com'
    );

    expect(result).not.toBeNull();
    expect(result.extraction).toBeNull();
  });
});
