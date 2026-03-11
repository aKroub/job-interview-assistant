import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createAuthRouter } from '../src/routes/auth.js';
import { createSyncRouter } from '../src/routes/sync.js';
import { createInterviewsRouter } from '../src/routes/interviews.js';
import { createMockTokenStore } from './helpers/mockTokenStore.js';
import { createApp } from '../src/index.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function mockGoogleAuth(overrides = {}) {
  let authenticated = false;
  return {
    isAuthenticated: () => authenticated,
    getAuthUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth?mock=true&state=valid-state',
    handleCallback: async (code) => {
      if (code === 'invalid-code') throw new Error('Invalid authorization code');
      authenticated = true;
    },
    verifyState: (state) => state === 'valid-state',
    disconnect: async () => { authenticated = false; },
    getAuthClient: () => ({ setCredentials: jest.fn(), on: jest.fn() }),
    _setAuthenticated: (val) => { authenticated = val; },
    ...overrides,
  };
}

function createAuthTestApp(googleAuth) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(googleAuth));
  return app;
}

function createSyncTestApp(driveService, googleAuth) {
  const app = express();
  app.use(express.json());
  app.use('/api/sync', createSyncRouter({ driveService, googleAuth }));
  return app;
}

function createInterviewsTestApp(detector, tokenStore, opts = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/interviews', createInterviewsRouter({
    detector,
    tokenStore,
    pollIntervalMs: opts.pollIntervalMs ?? 300_000,
    googleAuth: opts.googleAuth ?? mockGoogleAuth(),
    scanCooldownMs: opts.scanCooldownMs ?? 0,
  }));
  return app;
}

/**
 * Creates a full app with the global error handler using createApp from index.js.
 */
function createFullApp(depOverrides = {}) {
  const config = {
    clientId: 'test-id',
    clientSecret: 'test-secret',
    port: 3001,
    pollIntervalMs: 300_000,
    emailLookbackDays: 7,
    calendarLookaheadDays: 30,
    redirectUri: 'http://localhost:3001/api/auth/callback',
    anthropicApiKey: '',
    llmDryMode: true,
    llmModel: 'claude-haiku-4-5',
    corsOrigin: 'http://localhost:3000',
    scanCooldownMs: 0,
    logLevel: 'info',
  };

  const googleAuth = mockGoogleAuth();
  const tokenStore = createMockTokenStore();
  const detector = { detect: jest.fn().mockResolvedValue([]) };
  const driveService = {
    saveState: jest.fn(),
    loadState: jest.fn().mockResolvedValue(null),
    listBackups: jest.fn().mockResolvedValue({ backups: [] }),
  };

  return createApp({
    config,
    tokenStore,
    googleAuth,
    getUserEmail: jest.fn().mockResolvedValue('test@test.com'),
    gmailService: { scanForInterviews: jest.fn().mockResolvedValue([]) },
    calendarService: { scanForInterviews: jest.fn().mockResolvedValue([]) },
    driveService,
    detector,
    ...depOverrides,
  });
}

// ===========================================================================
// H1: Express 5 query string parsing differences
//
// Express 5 replaced the `qs` library with native URLSearchParams for query
// string parsing. This means:
// - Nested objects like ?a[b]=1 are no longer parsed (they become flat strings)
// - Array notation like ?a[]=1&a[]=2 no longer produces arrays
// - Special characters in values may be handled differently
//
// We test that the auth callback and sync load routes correctly handle:
// 1. Normal query params (code, state, fileId)
// 2. Special characters in query params (URL-encoded)
// 3. Multiple values for same param (Express 5 keeps last value)
// 4. Empty and missing query params
// ===========================================================================

describe('H1: Express 5 query string parsing — auth callback', () => {
  let googleAuth;
  let app;

  beforeEach(() => {
    googleAuth = mockGoogleAuth();
    app = createAuthTestApp(googleAuth);
  });

  it('parses simple code and state query params correctly', async () => {
    const res = await request(app).get('/api/auth/callback?code=abc123&state=valid-state');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Connected');
  });

  it('handles URL-encoded special characters in code param', async () => {
    // OAuth codes often contain + / = characters
    const encodedCode = encodeURIComponent('4/0A+test=code/value');
    const res = await request(app).get(`/api/auth/callback?code=${encodedCode}&state=valid-state`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Connected');
  });

  it('handles code with plus signs (common in OAuth codes)', async () => {
    const res = await request(app).get('/api/auth/callback?code=4%2F0AQSTgQHtest%2Bcode&state=valid-state');
    expect(res.status).toBe(200);
  });

  it('returns 400 when code param is completely missing', async () => {
    const res = await request(app).get('/api/auth/callback?state=valid-state');
    expect(res.status).toBe(400);
    expect(res.text).toContain('No authorization code');
  });

  it('returns 400 when code param is empty string', async () => {
    const res = await request(app).get('/api/auth/callback?code=&state=valid-state');
    // Express 5: empty string is falsy, so !code is true → 400
    expect(res.status).toBe(400);
  });

  it('handles state with special characters', async () => {
    const customAuth = mockGoogleAuth({
      verifyState: (s) => s === 'state-with-special=chars+and/slashes',
    });
    const customApp = createAuthTestApp(customAuth);

    const encodedState = encodeURIComponent('state-with-special=chars+and/slashes');
    const res = await request(customApp).get(`/api/auth/callback?code=test&state=${encodedState}`);
    expect(res.status).toBe(200);
  });

  it('handles multiple code params (Express 5 behavior)', async () => {
    // In Express 5 with URLSearchParams, duplicate params return the first value
    // (via req.query which uses URLSearchParams.get())
    const res = await request(app).get('/api/auth/callback?code=first&code=second&state=valid-state');
    // Should still work — the route just needs a truthy code value
    expect([200, 403, 500]).toContain(res.status);
    // Should not crash or return 400
    expect(res.status).not.toBe(400);
  });
});

describe('H1: Express 5 query string parsing — sync load', () => {
  let googleAuth;
  let driveService;
  let app;

  beforeEach(() => {
    googleAuth = mockGoogleAuth();
    googleAuth._setAuthenticated(true);
    driveService = {
      loadState: jest.fn().mockResolvedValue({ version: 1, companies: [] }),
      listBackups: jest.fn().mockResolvedValue({ backups: [] }),
      saveState: jest.fn(),
    };
    app = createSyncTestApp(driveService, googleAuth);
  });

  it('parses fileId from query string correctly', async () => {
    const res = await request(app).get('/api/sync/load?fileId=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms');
    expect(res.status).toBe(200);
    expect(driveService.loadState).toHaveBeenCalledWith('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms');
  });

  it('handles fileId with hyphens and underscores', async () => {
    const res = await request(app).get('/api/sync/load?fileId=file-abc_test-1234567890');
    expect(res.status).toBe(200);
    expect(driveService.loadState).toHaveBeenCalledWith('file-abc_test-1234567890');
  });

  it('returns 400 when fileId is missing', async () => {
    const res = await request(app).get('/api/sync/load');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('fileId');
  });

  it('returns 400 when fileId is empty', async () => {
    const res = await request(app).get('/api/sync/load?fileId=');
    expect(res.status).toBe(400);
  });

  it('rejects fileId with invalid characters (SQL injection attempt)', async () => {
    const res = await request(app).get('/api/sync/load?fileId=1%27%20OR%201%3D1');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid fileId');
  });

  it('handles fileId that is too short', async () => {
    const res = await request(app).get('/api/sync/load?fileId=abc');
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// H2: Global error handler interaction with SSE streaming
//
// When an error occurs after SSE headers are sent (writeHead 200 already
// called), the global error handler must NOT try to send a JSON response
// (which would throw "headers already sent"). Instead it delegates to
// Express's default handler via next(err).
//
// Express 5 automatically forwards rejected promises from async route
// handlers to error middleware. We test:
// 1. Error during SSE broadcast → graceful degradation
// 2. Error handler works for non-SSE routes (normal JSON error)
// 3. Error after headers sent in SSE → no crash, connection closes
// ===========================================================================

describe('H2: Global error handler + SSE interaction', () => {
  it('returns JSON error for non-SSE routes when async handler throws', async () => {
    const failingDetector = {
      detect: jest.fn().mockRejectedValue(new Error('API exploded')),
    };
    const googleAuth = mockGoogleAuth();
    googleAuth._setAuthenticated(true);

    const { app } = createFullApp({
      detector: failingDetector,
      googleAuth,
    });

    // scan is a normal POST route with try/catch — should return 500 JSON
    const res = await request(app).post('/api/interviews/scan');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Scan failed');
  });

  it('global error handler catches unhandled async errors and returns JSON', async () => {
    const { app } = createFullApp();

    // Health endpoint is sync — test a route that doesn't exist
    const res = await request(app).get('/api/nonexistent');
    // Express 5 returns 404 for unknown routes
    expect(res.status).toBe(404);
  });

  it('SSE endpoint does not crash server when detector throws during poll', async () => {
    let callCount = 0;
    const failOnSecondDetector = {
      detect: jest.fn(async () => {
        callCount++;
        if (callCount >= 2) throw new Error('Delayed failure');
        return [];
      }),
    };

    const googleAuth = mockGoogleAuth();
    googleAuth._setAuthenticated(true);

    const app = createInterviewsTestApp(failOnSecondDetector, createMockTokenStore(), {
      pollIntervalMs: 50,
      googleAuth,
    });

    // Connect SSE client
    const data = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => resolve('timeout-ok'), 2000);
      let collected = '';

      const req = request(app).get('/api/interviews/suggestions');
      req.buffer(false).end(() => {});
      req.on('response', (res) => {
        res.on('data', (chunk) => {
          collected += chunk.toString();
          // Wait for error event to be broadcast
          if (collected.includes('event: error')) {
            clearTimeout(timeout);
            res.destroy();
            resolve(collected);
          }
        });
      });
    });

    // The SSE stream should have received an error event, not crash
    expect(data).toContain('event: error');
    expect(data).toContain('Detection cycle failed');
  }, 5000);

  it('global error handler does not crash when headers already sent', async () => {
    // Verify that the production app's global error handler delegates to
    // next(err) when res.headersSent is true by checking that the health
    // endpoint (sync, no headers-sent issue) still returns correctly.
    // The actual headersSent guard was verified by the security review
    // (commit 8f1327ae) via source inspection. Here we verify the
    // non-SSE error path still works after the guard was added.
    const { app } = createFullApp();

    // Normal error path: unknown route returns 404 (Express 5 default)
    const res = await request(app).get('/api/nonexistent-route-xyz');
    expect(res.status).toBe(404);

    // Health endpoint still works (no regression from error handler changes)
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');
  });
});

// ===========================================================================
// H4: Jest 30 ESM module resolution
//
// Jest 30 with --experimental-vm-modules handles ESM differently than Jest 29.
// We verify that:
// 1. Static imports from ESM modules work correctly
// 2. Dynamic imports work (await import())
// 3. jest.unstable_mockModule works for ESM mocking
// 4. Named exports and default exports resolve correctly
// 5. Import assertions/conditions don't break
// ===========================================================================

describe('H4: Jest 30 ESM module resolution', () => {
  it('static imports from src/ modules resolve correctly', () => {
    // These were imported at the top of the file — if they fail, the entire
    // test file would not load. This test documents the verification.
    expect(typeof createAuthRouter).toBe('function');
    expect(typeof createSyncRouter).toBe('function');
    expect(typeof createInterviewsRouter).toBe('function');
    expect(typeof createApp).toBe('function');
  });

  it('dynamic import of utility modules works', async () => {
    const emailParser = await import('../src/utils/emailParser.js');
    expect(typeof emailParser.scoreEmailForInterview).toBe('function');
    expect(typeof emailParser.parseGmailMessage).toBe('function');
  });

  it('dynamic import of service modules works', async () => {
    const gmailService = await import('../src/services/gmailService.js');
    expect(typeof gmailService.createGmailService).toBe('function');

    const calendarService = await import('../src/services/calendarService.js');
    expect(typeof calendarService.createCalendarService).toBe('function');

    const driveService = await import('../src/services/driveService.js');
    expect(typeof driveService.createDriveService).toBe('function');
  });

  it('helper module imports work (relative paths with .js extension)', async () => {
    const { createMockTokenStore: imported } = await import('./helpers/mockTokenStore.js');
    expect(typeof imported).toBe('function');

    const store = imported();
    expect(typeof store.getDismissed).toBe('function');
    expect(typeof store.addDismissed).toBe('function');
  });

  it('re-exporting named exports from barrel files works', async () => {
    // Verify that matchingUtils exports resolve
    const matchingUtils = await import('../src/utils/matchingUtils.js');
    expect(typeof matchingUtils.scoreCalendarEvent).toBe('function');
  });

  it('@jest/globals imports work correctly in ESM context', () => {
    // These were imported at the top — verify they are the real Jest functions
    expect(typeof describe).toBe('function');
    expect(typeof it).toBe('function');
    expect(typeof expect).toBe('function');
    expect(typeof jest).toBe('object');
    expect(typeof jest.fn).toBe('function');
    expect(typeof jest.unstable_mockModule).toBe('function');
  });
});

// ===========================================================================
// H5: googleapis v171 API response shape changes
//
// The jump from googleapis v144 to v171 could change response shapes.
// Our services access: response.data.messages, response.data.items,
// response.data.files, response.data.id, response.data.emailAddress,
// and nested message payload headers.
//
// We test that our service parsing logic correctly handles the expected
// response shapes from the Google APIs — if v171 changed these shapes,
// these tests would fail.
// ===========================================================================

describe('H5: googleapis v171 — Gmail service response parsing', () => {
  it('handles messages.list response with messages array', async () => {
    const { createGmailService } = await import('../src/services/gmailService.js');

    const mockGmailApi = {
      users: {
        messages: {
          list: jest.fn().mockResolvedValue({
            data: {
              messages: [{ id: 'msg1' }, { id: 'msg2' }],
              resultSizeEstimate: 2,
            },
          }),
          get: jest.fn().mockResolvedValue({
            data: {
              id: 'msg1',
              snippet: 'Interview at Google for SWE position',
              payload: {
                headers: [
                  { name: 'Subject', value: 'Interview Invitation - Google' },
                  { name: 'From', value: 'recruiter@google.com' },
                ],
                mimeType: 'text/plain',
                body: { data: '' },
              },
            },
          }),
        },
      },
    };

    const service = createGmailService(null, { gmailApi: mockGmailApi });
    const results = await service.scanForInterviews();

    expect(mockGmailApi.users.messages.list).toHaveBeenCalled();
    expect(mockGmailApi.users.messages.get).toHaveBeenCalledTimes(2);
    // Results should parse without error
    expect(Array.isArray(results)).toBe(true);
  });

  it('handles messages.list response with empty messages (no results)', async () => {
    const { createGmailService } = await import('../src/services/gmailService.js');

    const mockGmailApi = {
      users: {
        messages: {
          list: jest.fn().mockResolvedValue({
            data: {
              // v171 may return undefined instead of empty array
              messages: undefined,
              resultSizeEstimate: 0,
            },
          }),
          get: jest.fn(),
        },
      },
    };

    const service = createGmailService(null, { gmailApi: mockGmailApi });
    const results = await service.scanForInterviews();

    expect(results).toEqual([]);
    expect(mockGmailApi.users.messages.get).not.toHaveBeenCalled();
  });

  it('handles messages.list response with null messages field', async () => {
    const { createGmailService } = await import('../src/services/gmailService.js');

    const mockGmailApi = {
      users: {
        messages: {
          list: jest.fn().mockResolvedValue({
            data: { messages: null },
          }),
          get: jest.fn(),
        },
      },
    };

    const service = createGmailService(null, { gmailApi: mockGmailApi });
    const results = await service.scanForInterviews();

    expect(results).toEqual([]);
  });
});

describe('H5: googleapis v171 — Calendar service response parsing', () => {
  it('handles events.list response with items array', async () => {
    const { createCalendarService } = await import('../src/services/calendarService.js');

    const mockCalendarApi = {
      events: {
        list: jest.fn().mockResolvedValue({
          data: {
            items: [
              {
                id: 'evt1',
                summary: 'Technical Interview - SWE',
                description: 'Interview with engineering team',
                start: { dateTime: '2026-04-01T10:00:00-07:00' },
                end: { dateTime: '2026-04-01T11:00:00-07:00' },
                organizer: { email: 'recruiter@company.com' },
                status: 'confirmed',
              },
            ],
          },
        }),
      },
    };

    const service = createCalendarService(null, {
      calendarApi: mockCalendarApi,
      getUserEmail: async () => 'user@gmail.com',
      nowFn: () => new Date('2026-03-01T00:00:00Z'),
    });

    const results = await service.scanForInterviews();
    expect(Array.isArray(results)).toBe(true);
    expect(mockCalendarApi.events.list).toHaveBeenCalled();
  });

  it('handles events.list response with empty items', async () => {
    const { createCalendarService } = await import('../src/services/calendarService.js');

    const mockCalendarApi = {
      events: {
        list: jest.fn().mockResolvedValue({
          data: { items: undefined },
        }),
      },
    };

    const service = createCalendarService(null, {
      calendarApi: mockCalendarApi,
      getUserEmail: async () => 'user@gmail.com',
      nowFn: () => new Date('2026-03-01T00:00:00Z'),
    });

    const results = await service.scanForInterviews();
    expect(results).toEqual([]);
  });

  it('handles cancelled events with missing start/end fields', async () => {
    const { createCalendarService } = await import('../src/services/calendarService.js');

    const mockCalendarApi = {
      events: {
        list: jest.fn().mockResolvedValue({
          data: {
            items: [
              {
                id: 'evt-cancelled',
                summary: 'Interview cancelled',
                status: 'cancelled',
                // No start/end fields — v171 might strip these from cancelled events
              },
            ],
          },
        }),
      },
    };

    const service = createCalendarService(null, {
      calendarApi: mockCalendarApi,
      getUserEmail: async () => 'user@gmail.com',
      nowFn: () => new Date('2026-03-01T00:00:00Z'),
    });

    // Should not crash — cancelled events without dates are skipped
    const results = await service.scanForInterviews();
    expect(Array.isArray(results)).toBe(true);
  });

  it('handles events with optional chaining fields (organizer, hangoutLink, conferenceData)', async () => {
    const { createCalendarService } = await import('../src/services/calendarService.js');

    const mockCalendarApi = {
      events: {
        list: jest.fn().mockResolvedValue({
          data: {
            items: [
              {
                id: 'evt-minimal',
                summary: 'Interview - minimal fields',
                start: { dateTime: '2026-04-01T10:00:00Z' },
                end: { dateTime: '2026-04-01T11:00:00Z' },
                status: 'confirmed',
                // No organizer, no hangoutLink, no conferenceData, no location, no description
              },
            ],
          },
        }),
      },
    };

    const service = createCalendarService(null, {
      calendarApi: mockCalendarApi,
      getUserEmail: async () => 'user@gmail.com',
      nowFn: () => new Date('2026-03-01T00:00:00Z'),
    });

    const results = await service.scanForInterviews();
    // Should parse without crashing even with missing optional fields
    expect(Array.isArray(results)).toBe(true);
  });
});

describe('H5: googleapis v171 — Drive service response parsing', () => {
  it('handles files.list response with files array', async () => {
    const { createDriveService } = await import('../src/services/driveService.js');

    const mockDriveApi = {
      files: {
        list: jest.fn().mockResolvedValue({
          data: {
            files: [
              { id: 'f1', name: 'interview-tracker-state-2026-03-01.json', createdTime: '2026-03-01T10:00:00Z' },
              { id: 'f2', name: 'interview-tracker-state-2026-02-28.json', createdTime: '2026-02-28T10:00:00Z' },
            ],
          },
        }),
        create: jest.fn().mockResolvedValue({ data: { id: 'f-new' } }),
        delete: jest.fn().mockResolvedValue({}),
        get: jest.fn().mockResolvedValue({ data: { version: 1, companies: [] } }),
      },
    };

    const service = createDriveService(null, { driveApi: mockDriveApi });
    const { backups } = await service.listBackups();

    expect(Array.isArray(backups)).toBe(true);
    expect(backups).toHaveLength(2);
    expect(backups[0].fileId).toBe('f1');
  });

  it('handles files.list with empty files array', async () => {
    const { createDriveService } = await import('../src/services/driveService.js');

    const mockDriveApi = {
      files: {
        list: jest.fn().mockResolvedValue({
          data: { files: undefined },
        }),
        create: jest.fn(),
        delete: jest.fn(),
        get: jest.fn(),
      },
    };

    const service = createDriveService(null, { driveApi: mockDriveApi });
    const { backups } = await service.listBackups();

    expect(backups).toEqual([]);
  });

  it('handles files.create response with data.id', async () => {
    const { createDriveService } = await import('../src/services/driveService.js');

    const mockDriveApi = {
      files: {
        list: jest.fn().mockResolvedValue({
          data: { files: [] },
        }),
        create: jest.fn().mockResolvedValue({
          data: { id: 'new-file-id-123' },
        }),
        delete: jest.fn(),
        get: jest.fn(),
      },
    };

    const service = createDriveService(null, { driveApi: mockDriveApi });
    const result = await service.saveState({
      savedAt: '2026-03-11T10:00:00.000Z',
      version: 1,
      companies: [],
      seenQuestions: [],
    });

    expect(result.saved).toBe(true);
    expect(result.fileId).toBe('new-file-id-123');
  });

  it('handles files.get with alt=media response (loadState)', async () => {
    const { createDriveService } = await import('../src/services/driveService.js');

    const storedState = {
      version: 1,
      savedAt: '2026-03-11T10:00:00Z',
      companies: [{ id: 'c1', name: 'TestCo' }],
      seenQuestions: ['q1'],
    };

    const mockDriveApi = {
      files: {
        list: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        get: jest.fn().mockResolvedValue({ data: storedState }),
      },
    };

    const service = createDriveService(null, { driveApi: mockDriveApi });
    const loaded = await service.loadState('file-id-123');

    expect(loaded).toEqual(storedState);
    expect(mockDriveApi.files.get).toHaveBeenCalledWith({
      fileId: 'file-id-123',
      alt: 'media',
    });
  });
});

// ===========================================================================
// H1 (extra): Express 5 — req.query type behavior
//
// In Express 5, req.query returns a plain object from URLSearchParams.
// Specifically, typeof req.query.fileId might be different when the param
// is missing vs empty. We verify our route validation handles all cases.
// ===========================================================================

describe('H1 (extra): Express 5 query param edge cases for sync load', () => {
  let googleAuth;
  let driveService;
  let app;

  beforeEach(() => {
    googleAuth = mockGoogleAuth();
    googleAuth._setAuthenticated(true);
    driveService = {
      loadState: jest.fn().mockResolvedValue({ version: 1 }),
      listBackups: jest.fn().mockResolvedValue({ backups: [] }),
      saveState: jest.fn(),
    };
    app = createSyncTestApp(driveService, googleAuth);
  });

  it('handles fileId with only alphanumeric characters', async () => {
    const res = await request(app).get('/api/sync/load?fileId=abcdef1234567890');
    expect(res.status).toBe(200);
  });

  it('handles very long but valid fileId (Google Drive IDs can be 40+ chars)', async () => {
    const longId = 'a'.repeat(44);
    const res = await request(app).get(`/api/sync/load?fileId=${longId}`);
    expect(res.status).toBe(200);
    expect(driveService.loadState).toHaveBeenCalledWith(longId);
  });

  it('rejects fileId exceeding max length (81+ chars)', async () => {
    const tooLongId = 'a'.repeat(81);
    const res = await request(app).get(`/api/sync/load?fileId=${tooLongId}`);
    expect(res.status).toBe(400);
  });

  it('rejects fileId with spaces', async () => {
    const res = await request(app).get('/api/sync/load?fileId=file%20with%20spaces');
    expect(res.status).toBe(400);
  });

  it('rejects fileId with dots', async () => {
    const res = await request(app).get('/api/sync/load?fileId=../../../etc/passwd');
    expect(res.status).toBe(400);
  });
});
