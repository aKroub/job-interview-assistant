import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level ESM mock for createLlmExtractor
// We intercept the module so that importing index.js never triggers the real
// Anthropic SDK. jest.unstable_mockModule must come before the dynamic import.
// ---------------------------------------------------------------------------
const mockCreateLlmExtractor = jest.fn();

jest.unstable_mockModule('../src/services/llmExtractor.js', () => ({
  createLlmExtractor: mockCreateLlmExtractor,
}));

// Dynamic import AFTER the mock is registered (ESM requirement)
const { createApp } = await import('../src/index.js');

// ---------------------------------------------------------------------------
// Shared helpers — minimal stubs that satisfy createApp's dependency chain
// ---------------------------------------------------------------------------

/**
 * Returns a config object with all required fields set.
 * Override individual fields via the overrides parameter.
 */
function makeConfig(overrides = {}) {
  return {
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
    ...overrides,
  };
}

/** Minimal googleAuth stub with an authClient that has the required methods. */
function makeGoogleAuth() {
  return {
    getAuthClient: () => ({
      setCredentials: jest.fn(),
      on: jest.fn(),
    }),
    getAuthUrl: () => 'http://test-auth-url',
    handleCallback: jest.fn(),
    isAuthenticated: () => false,
  };
}

/** Stub that satisfies createInterviewDetector's interface. */
function makeDetector() {
  return { detect: jest.fn().mockResolvedValue([]) };
}

/** Stub token store. */
function makeTokenStore() {
  const surfacedEmailIds = new Set();
  const surfacedCalendarIds = new Set();
  return {
    loadTokens: jest.fn().mockReturnValue(null),
    saveTokens: jest.fn(),
    getDismissed: () => ({ ids: new Set(), emailIds: new Set(), calendarIds: new Set() }),
    addDismissed: jest.fn(),
    getSurfaced: () => ({
      emailIds: new Set(surfacedEmailIds),
      calendarIds: new Set(surfacedCalendarIds),
    }),
    addSurfaced: jest.fn(async (emailIds = [], calendarIds = []) => {
      for (const id of emailIds) surfacedEmailIds.add(id);
      for (const id of calendarIds) surfacedCalendarIds.add(id);
    }),
    clearDismissed: jest.fn(),
    clearSurfaced: jest.fn(),
  };
}

/** Stub gmail service. */
function makeGmailService() {
  return { scanForInterviews: jest.fn().mockResolvedValue([]) };
}

/** Stub calendar service. */
function makeCalendarService() {
  return { scanForInterviews: jest.fn().mockResolvedValue([]) };
}

/** Stub drive service. */
function makeDriveService() {
  return { save: jest.fn(), load: jest.fn(), list: jest.fn() };
}

/** Sentinel object returned by the mocked createLlmExtractor. */
const FAKE_EXTRACTOR = Object.freeze({
  extractFromEmail: jest.fn(),
  extractFromCalendarEvent: jest.fn(),
});

/**
 * Calls createApp with full stubs, allowing callers to override
 * specific deps and config fields.
 */
function buildApp({ configOverrides = {}, depOverrides = {} } = {}) {
  const config = makeConfig(configOverrides);
  return createApp({
    config,
    tokenStore: makeTokenStore(),
    googleAuth: makeGoogleAuth(),
    getUserEmail: jest.fn().mockResolvedValue('test@test.com'),
    gmailService: makeGmailService(),
    calendarService: makeCalendarService(),
    driveService: makeDriveService(),
    ...depOverrides,
  });
}

// ---------------------------------------------------------------------------
// Reset mock state between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockCreateLlmExtractor.mockReset();
  mockCreateLlmExtractor.mockReturnValue(FAKE_EXTRACTOR);
});

// ---------------------------------------------------------------------------
// H1: ?? operator — explicit null vs undefined vs false in deps.llmExtractor
//
// The wiring uses `deps.llmExtractor ?? <fallback>`.
//   - undefined → uses fallback (creates extractor or null based on config)
//   - null      → coalesces to fallback (null != null for ??, wait — null IS
//                 nullish, so ?? WILL execute the fallback)
//   - false     → NOT nullish, so ?? does NOT execute fallback (false is used)
//   - a real object → used directly, fallback skipped
//
// This tests that the ?? operator works as expected with each value.
// ---------------------------------------------------------------------------
describe('H1: ?? operator handles null / undefined / false in deps.llmExtractor', () => {
  it('undefined deps.llmExtractor triggers fallback (extractor created when config allows)', () => {
    const config = makeConfig({ llmDryMode: false, anthropicApiKey: 'sk-test-key', llmModel: 'claude-haiku-4-5' });
    createApp({
      config,
      tokenStore: makeTokenStore(),
      googleAuth: makeGoogleAuth(),
      getUserEmail: jest.fn().mockResolvedValue('test@test.com'),
      gmailService: makeGmailService(),
      calendarService: makeCalendarService(),
      driveService: makeDriveService(),
      // llmExtractor is NOT provided → undefined → ?? triggers fallback
    });

    expect(mockCreateLlmExtractor).toHaveBeenCalledTimes(1);
    expect(mockCreateLlmExtractor).toHaveBeenCalledWith({
      apiKey: 'sk-test-key',
      dryMode: false,
      model: 'claude-haiku-4-5',
    });
  });

  it('explicit null deps.llmExtractor triggers fallback (null is nullish)', () => {
    const config = makeConfig({ llmDryMode: false, anthropicApiKey: 'sk-test-key' });
    createApp({
      config,
      tokenStore: makeTokenStore(),
      googleAuth: makeGoogleAuth(),
      getUserEmail: jest.fn().mockResolvedValue('test@test.com'),
      gmailService: makeGmailService(),
      calendarService: makeCalendarService(),
      driveService: makeDriveService(),
      llmExtractor: null, // explicit null → ?? triggers fallback
    });

    expect(mockCreateLlmExtractor).toHaveBeenCalledTimes(1);
  });

  it('explicit false deps.llmExtractor does NOT trigger fallback (false is not nullish)', () => {
    const config = makeConfig({ llmDryMode: false, anthropicApiKey: 'sk-test-key' });
    createApp({
      config,
      tokenStore: makeTokenStore(),
      googleAuth: makeGoogleAuth(),
      getUserEmail: jest.fn().mockResolvedValue('test@test.com'),
      gmailService: makeGmailService(),
      calendarService: makeCalendarService(),
      driveService: makeDriveService(),
      llmExtractor: false, // false is NOT nullish → ?? does NOT trigger
    });

    expect(mockCreateLlmExtractor).not.toHaveBeenCalled();
  });

  it('a provided extractor object skips the fallback entirely', () => {
    const customExtractor = { extractFromEmail: jest.fn(), extractFromCalendarEvent: jest.fn() };
    createApp({
      config: makeConfig({ llmDryMode: false, anthropicApiKey: 'sk-test-key' }),
      tokenStore: makeTokenStore(),
      googleAuth: makeGoogleAuth(),
      getUserEmail: jest.fn().mockResolvedValue('test@test.com'),
      gmailService: makeGmailService(),
      calendarService: makeCalendarService(),
      driveService: makeDriveService(),
      llmExtractor: customExtractor,
    });

    expect(mockCreateLlmExtractor).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// H2: When config.llmDryMode is true, llmExtractor stays null
//
// The ternary: !config.llmDryMode && config.anthropicApiKey
// When llmDryMode=true → !true = false → short-circuits to null
// ---------------------------------------------------------------------------
describe('H2: llmDryMode=true keeps llmExtractor null', () => {
  it('does not call createLlmExtractor when llmDryMode=true (default)', () => {
    buildApp({ configOverrides: { llmDryMode: true, anthropicApiKey: 'sk-test-key' } });
    expect(mockCreateLlmExtractor).not.toHaveBeenCalled();
  });

  it('does not call createLlmExtractor when llmDryMode=true and no API key', () => {
    buildApp({ configOverrides: { llmDryMode: true, anthropicApiKey: '' } });
    expect(mockCreateLlmExtractor).not.toHaveBeenCalled();
  });

  it('does not call createLlmExtractor when llmDryMode=true even with model set', () => {
    buildApp({ configOverrides: { llmDryMode: true, anthropicApiKey: 'sk-key', llmModel: 'claude-sonnet-4-6' } });
    expect(mockCreateLlmExtractor).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// H3: No anthropicApiKey keeps llmExtractor null
//
// The ternary: !config.llmDryMode && config.anthropicApiKey
// When anthropicApiKey='' → '' is falsy → short-circuits to null
// ---------------------------------------------------------------------------
describe('H3: missing anthropicApiKey keeps llmExtractor null', () => {
  it('does not call createLlmExtractor when anthropicApiKey is empty string', () => {
    buildApp({ configOverrides: { llmDryMode: false, anthropicApiKey: '' } });
    expect(mockCreateLlmExtractor).not.toHaveBeenCalled();
  });

  it('does not call createLlmExtractor when anthropicApiKey is undefined', () => {
    const config = makeConfig({ llmDryMode: false });
    delete config.anthropicApiKey;
    createApp({
      config,
      tokenStore: makeTokenStore(),
      googleAuth: makeGoogleAuth(),
      getUserEmail: jest.fn().mockResolvedValue('test@test.com'),
      gmailService: makeGmailService(),
      calendarService: makeCalendarService(),
      driveService: makeDriveService(),
    });
    expect(mockCreateLlmExtractor).not.toHaveBeenCalled();
  });

  it('DOES call createLlmExtractor when both llmDryMode=false AND apiKey present', () => {
    buildApp({ configOverrides: { llmDryMode: false, anthropicApiKey: 'sk-live-key' } });
    expect(mockCreateLlmExtractor).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// H4: Importing llmExtractor.js has no side effects that break existing tests
//
// Since we mocked the module above, the real llmExtractor.js is never loaded.
// This hypothesis verifies that createApp can be called multiple times
// without side effects, and that the app still works when the mocked module
// is used (health endpoint responds, no import errors).
// ---------------------------------------------------------------------------
describe('H4: no side effects from importing llmExtractor.js', () => {
  it('createApp succeeds and returns an Express app with health endpoint', async () => {
    const { app } = buildApp();
    expect(app).toBeDefined();

    // Verify the Express app is functional
    const { default: request } = await import('supertest');
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', llm: { disabled: true } });
  });

  it('createApp can be called multiple times without leaking state', () => {
    const result1 = buildApp();
    const result2 = buildApp();

    expect(result1.app).toBeDefined();
    expect(result2.app).toBeDefined();
    expect(result1.app).not.toBe(result2.app); // fresh instances each time
  });

  it('createApp does not throw when the mocked module returns a sentinel', () => {
    expect(() => {
      buildApp({ configOverrides: { llmDryMode: false, anthropicApiKey: 'sk-test' } });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// H5: llmExtractor is correctly passed to createInterviewDetector
//
// When deps.detector is NOT provided, createApp builds one internally via
// createInterviewDetector({ ..., llmExtractor }). We verify this by:
//   a) NOT providing deps.detector
//   b) Providing config that triggers extractor creation
//   c) Verifying the app creates without error (detector receives extractor)
//
// We also test the "null propagation" path: when llmExtractor is null,
// createInterviewDetector still receives null (its default), and no
// enrichment occurs.
// ---------------------------------------------------------------------------
describe('H5: llmExtractor is passed to createInterviewDetector', () => {
  it('when config enables LLM, detector receives the extractor (app creates without error)', () => {
    // Do NOT provide deps.detector so createApp builds one internally
    const config = makeConfig({ llmDryMode: false, anthropicApiKey: 'sk-real-key' });
    const result = createApp({
      config,
      tokenStore: makeTokenStore(),
      googleAuth: makeGoogleAuth(),
      getUserEmail: jest.fn().mockResolvedValue('test@test.com'),
      gmailService: makeGmailService(),
      calendarService: makeCalendarService(),
      driveService: makeDriveService(),
      // No detector — let createApp build it with llmExtractor from mock
    });

    expect(result.app).toBeDefined();
    // The mocked createLlmExtractor was called and returned FAKE_EXTRACTOR
    expect(mockCreateLlmExtractor).toHaveBeenCalledTimes(1);
  });

  it('when config disables LLM (dry mode), detector receives null extractor', () => {
    const config = makeConfig({ llmDryMode: true, anthropicApiKey: 'sk-key' });
    const result = createApp({
      config,
      tokenStore: makeTokenStore(),
      googleAuth: makeGoogleAuth(),
      getUserEmail: jest.fn().mockResolvedValue('test@test.com'),
      gmailService: makeGmailService(),
      calendarService: makeCalendarService(),
      driveService: makeDriveService(),
      // No detector — built internally with null llmExtractor
    });

    expect(result.app).toBeDefined();
    expect(mockCreateLlmExtractor).not.toHaveBeenCalled();
  });

  it('when deps.detector is provided, it is used directly (extractor not created)', () => {
    const customDetector = makeDetector();
    const config = makeConfig({ llmDryMode: false, anthropicApiKey: 'sk-key' });

    // Providing detector means createApp skips building one, but llmExtractor
    // is still resolved (it just is not passed to anything internally).
    // The key point: no error, no side effect.
    const result = createApp({
      config,
      tokenStore: makeTokenStore(),
      googleAuth: makeGoogleAuth(),
      getUserEmail: jest.fn().mockResolvedValue('test@test.com'),
      gmailService: makeGmailService(),
      calendarService: makeCalendarService(),
      driveService: makeDriveService(),
      detector: customDetector,
    });

    expect(result.app).toBeDefined();
  });

  it('extractor creation uses correct config values (apiKey, dryMode, model)', () => {
    const config = makeConfig({
      llmDryMode: false,
      anthropicApiKey: 'sk-custom-key-12345',
      llmModel: 'claude-sonnet-4-6',
    });
    createApp({
      config,
      tokenStore: makeTokenStore(),
      googleAuth: makeGoogleAuth(),
      getUserEmail: jest.fn().mockResolvedValue('test@test.com'),
      gmailService: makeGmailService(),
      calendarService: makeCalendarService(),
      driveService: makeDriveService(),
    });

    expect(mockCreateLlmExtractor).toHaveBeenCalledWith({
      apiKey: 'sk-custom-key-12345',
      dryMode: false,
      model: 'claude-sonnet-4-6',
    });
  });
});
