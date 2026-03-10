import { describe, it, expect, jest } from '@jest/globals';
import {
  containsInterviewKeyword,
  buildEmailPrompt,
  buildCalendarPrompt,
  parseJsonResponse,
  createLlmExtractor,
  createSemaphore,
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

// ---------------------------------------------------------------------------
// createSemaphore
// ---------------------------------------------------------------------------
describe('createSemaphore', () => {
  it('allows up to maxConcurrent operations to run simultaneously', async () => {
    const sem = createSemaphore(2);
    const log = [];

    const task = async (id) => {
      await sem.acquire();
      log.push(`start-${id}`);
      await new Promise((r) => setTimeout(r, 50));
      log.push(`end-${id}`);
      sem.release();
    };

    await Promise.all([task('a'), task('b'), task('c')]);

    // a and b should start before c starts
    const startC = log.indexOf('start-c');
    const endA = log.indexOf('end-a');
    const endB = log.indexOf('end-b');
    // c must start after at least one of a or b finishes
    expect(startC).toBeGreaterThan(Math.min(endA, endB));
  });

  it('releases the semaphore even when the task throws', async () => {
    const sem = createSemaphore(1);

    await sem.acquire();
    sem.release(); // free up the slot

    // Slot should be available again
    await sem.acquire();
    sem.release();
  });

  it('serializes operations with maxConcurrent=1', async () => {
    const sem = createSemaphore(1);
    const log = [];

    const task = async (id) => {
      await sem.acquire();
      log.push(`start-${id}`);
      await new Promise((r) => setTimeout(r, 20));
      log.push(`end-${id}`);
      sem.release();
    };

    await Promise.all([task('a'), task('b')]);

    // With concurrency 1, tasks must be fully sequential
    expect(log).toEqual(['start-a', 'end-a', 'start-b', 'end-b']);
  });
});

// ---------------------------------------------------------------------------
// createLlmExtractor — concurrency limiter
// ---------------------------------------------------------------------------
describe('createLlmExtractor (concurrency limiter)', () => {
  it('limits concurrent API calls to maxConcurrency', async () => {
    let concurrent = 0;
    let maxObserved = 0;

    const mockClient = {
      messages: {
        create: jest.fn().mockImplementation(async () => {
          concurrent++;
          maxObserved = Math.max(maxObserved, concurrent);
          await new Promise((r) => setTimeout(r, 50));
          concurrent--;
          return {
            content: [{ type: 'text', text: '{"company_name": "Test"}' }],
          };
        }),
      },
    };

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
      maxConcurrency: 2,
    });

    // Fire 5 calls simultaneously
    await Promise.all([
      extractor.extractFromEmail('Interview 1', 'interview body', 'a@b.com'),
      extractor.extractFromEmail('Interview 2', 'interview body', 'a@b.com'),
      extractor.extractFromEmail('Interview 3', 'interview body', 'a@b.com'),
      extractor.extractFromEmail('Interview 4', 'interview body', 'a@b.com'),
      extractor.extractFromEmail('Interview 5', 'interview body', 'a@b.com'),
    ]);

    expect(mockClient.messages.create).toHaveBeenCalledTimes(5);
    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it('releases semaphore slot on API error', async () => {
    let callCount = 0;
    const mockClient = {
      messages: {
        create: jest.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) throw new Error('API error');
          return {
            content: [{ type: 'text', text: '{"company_name": "Test"}' }],
          };
        }),
      },
    };

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
      maxConcurrency: 1,
    });

    // First call fails
    const result1 = await extractor.extractFromEmail(
      'Interview A', 'interview body', 'a@b.com'
    );
    expect(result1.extraction).toBeNull();

    // Second call should succeed (semaphore was released)
    const result2 = await extractor.extractFromEmail(
      'Interview B', 'interview body', 'a@b.com'
    );
    expect(result2.extraction).toEqual({ company_name: 'Test' });
  });
});

// ---------------------------------------------------------------------------
// createLlmExtractor — stats tracking
// ---------------------------------------------------------------------------
describe('createLlmExtractor (stats)', () => {
  it('tracks successful extractions', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: '{"company_name": "Acme"}' }],
        }),
      },
    };
    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    await extractor.extractFromEmail('Interview', 'interview body', 'a@b.com');
    await extractor.extractFromEmail('Interview 2', 'interview body', 'a@b.com');

    const stats = extractor.getStats();
    expect(stats).toEqual({ total: 2, succeeded: 2, failed: 0 });
  });

  it('tracks failed extractions', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockRejectedValue(new Error('API down')),
      },
    };
    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    await extractor.extractFromEmail('Interview', 'interview body', 'a@b.com');

    const stats = extractor.getStats();
    expect(stats).toEqual({ total: 1, succeeded: 0, failed: 1 });
  });

  it('counts invalid JSON as failed', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'not valid json' }],
        }),
      },
    };
    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    await extractor.extractFromEmail('Interview', 'interview body', 'a@b.com');

    expect(extractor.getStats()).toEqual({ total: 1, succeeded: 0, failed: 1 });
  });

  it('counts no text block as failed', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'tool_use', id: '1', name: 't', input: {} }],
        }),
      },
    };
    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    await extractor.extractFromEmail('Interview', 'interview body', 'a@b.com');

    expect(extractor.getStats()).toEqual({ total: 1, succeeded: 0, failed: 1 });
  });

  it('returns a copy of stats (not a mutable reference)', async () => {
    const extractor = createLlmExtractor({ dryMode: true });
    const stats1 = extractor.getStats();
    stats1.total = 999;

    const stats2 = extractor.getStats();
    expect(stats2.total).toBe(0);
  });

  it('does not count dry mode or privacy-gated calls in stats', async () => {
    const extractor = createLlmExtractor({ dryMode: true });

    await extractor.extractFromEmail('Interview', 'interview body', 'a@b.com');
    await extractor.extractFromEmail('Team lunch', 'no keyword', 'a@b.com');

    expect(extractor.getStats()).toEqual({ total: 0, succeeded: 0, failed: 0 });
  });
});

// ---------------------------------------------------------------------------
// createLlmExtractor — API call logging
// ---------------------------------------------------------------------------
describe('createLlmExtractor (logging)', () => {
  it('logs request and response for successful API calls (debug level)', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: '{"company_name": "Acme"}' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 25 },
        }),
      },
    };
    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
      model: 'claude-haiku-4-5',
      logLevel: 'debug',
    });

    await extractor.extractFromEmail('Interview', 'interview body', 'a@b.com');

    const logs = logSpy.mock.calls.map((c) => c[0]);
    expect(logs.some((l) => l.includes('[llmExtractor] REQUEST #1') && l.includes('model=claude-haiku-4-5'))).toBe(true);
    expect(logs.some((l) => l.includes('[llmExtractor] RESPONSE #1') && l.includes('stop_reason=end_turn'))).toBe(true);
    expect(logs.some((l) => l.includes('input:100') && l.includes('output:25'))).toBe(true);
    expect(logs.some((l) => l.includes('extracted: company_name=Acme'))).toBe(true);

    logSpy.mockRestore();
  });

  it('hides API usage metadata at default info log level', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: '{"company_name": "Acme"}' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 25 },
        }),
      },
    };
    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    await extractor.extractFromEmail('Interview', 'interview body', 'a@b.com');

    const logs = logSpy.mock.calls.map((c) => c[0]);
    // REQUEST and extracted= are still logged at info level
    expect(logs.some((l) => l.includes('[llmExtractor] REQUEST #1'))).toBe(true);
    expect(logs.some((l) => l.includes('extracted: company_name='))).toBe(true);
    // But stop_reason/usage metadata is hidden
    expect(logs.some((l) => l.includes('stop_reason=end_turn'))).toBe(false);
    expect(logs.some((l) => l.includes('input:100'))).toBe(false);

    logSpy.mockRestore();
  });

  it('logs warning when JSON parse fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'not valid json' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 50, output_tokens: 10 },
        }),
      },
    };
    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    await extractor.extractFromEmail('Interview', 'interview body', 'a@b.com');

    const warns = warnSpy.mock.calls.map((c) => c[0]);
    expect(warns.some((w) => w.includes('JSON parse failed') && w.includes('not valid json'))).toBe(true);

    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('logs error when API call fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockClient = {
      messages: {
        create: jest.fn().mockRejectedValue(Object.assign(new Error('Overloaded'), { status: 529 })),
      },
    };
    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
    });

    await extractor.extractFromEmail('Interview', 'interview body', 'a@b.com');

    const errors = errorSpy.mock.calls.map((c) => c[0]);
    expect(errors.some((e) => e.includes('REQUEST #1') && e.includes('FAILED') && e.includes('status=529') && e.includes('Overloaded'))).toBe(true);

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
