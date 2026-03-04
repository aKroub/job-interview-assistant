import { describe, it, expect } from '@jest/globals';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  /**
   * Creates a minimal env object with required variables set.
   * Tests can override individual fields.
   */
  function makeEnv(overrides = {}) {
    return {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      ...overrides,
    };
  }

  it('returns all config fields when required env vars are present', () => {
    const config = loadConfig(makeEnv(), '/dev/null');

    expect(config.clientId).toBe('test-client-id');
    expect(config.clientSecret).toBe('test-client-secret');
    expect(config.port).toBe(3001);
    expect(config.pollIntervalMs).toBe(300_000);
    expect(config.emailLookbackDays).toBe(7);
    expect(config.calendarLookaheadDays).toBe(30);
    expect(config.redirectUri).toBe('http://localhost:3001/api/auth/callback');
  });

  it('throws when GOOGLE_CLIENT_ID is missing', () => {
    expect(() => loadConfig(makeEnv({ GOOGLE_CLIENT_ID: '' }), '/dev/null'))
      .toThrow('GOOGLE_CLIENT_ID');
  });

  it('throws when GOOGLE_CLIENT_SECRET is missing', () => {
    expect(() => loadConfig(makeEnv({ GOOGLE_CLIENT_SECRET: '' }), '/dev/null'))
      .toThrow('GOOGLE_CLIENT_SECRET');
  });

  it('throws listing all missing vars when both are missing', () => {
    expect(() => loadConfig({}, '/dev/null'))
      .toThrow('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET');
  });

  it('uses custom PORT when provided', () => {
    const config = loadConfig(makeEnv({ PORT: '4000' }), '/dev/null');
    expect(config.port).toBe(4000);
    expect(config.redirectUri).toBe('http://localhost:4000/api/auth/callback');
  });

  it('uses custom POLL_INTERVAL_MS when provided', () => {
    const config = loadConfig(makeEnv({ POLL_INTERVAL_MS: '60000' }), '/dev/null');
    expect(config.pollIntervalMs).toBe(60_000);
  });

  it('uses custom EMAIL_LOOKBACK_DAYS when provided', () => {
    const config = loadConfig(makeEnv({ EMAIL_LOOKBACK_DAYS: '7' }), '/dev/null');
    expect(config.emailLookbackDays).toBe(7);
  });

  it('uses custom CALENDAR_LOOKAHEAD_DAYS when provided', () => {
    const config = loadConfig(makeEnv({ CALENDAR_LOOKAHEAD_DAYS: '60' }), '/dev/null');
    expect(config.calendarLookaheadDays).toBe(60);
  });

  it('falls back to defaults for invalid numeric values', () => {
    const config = loadConfig(makeEnv({ PORT: 'abc', POLL_INTERVAL_MS: '' }), '/dev/null');
    expect(config.port).toBe(3001);
    expect(config.pollIntervalMs).toBe(300_000);
  });

  // LLM extraction config
  it('defaults llmDryMode to true when LLM_DRY_MODE is not set', () => {
    const config = loadConfig(makeEnv(), '/dev/null');
    expect(config.llmDryMode).toBe(true);
    expect(config.anthropicApiKey).toBe('');
    expect(config.llmModel).toBe('claude-haiku-4-5');
  });

  it('sets llmDryMode to false when LLM_DRY_MODE=false and API key present', () => {
    const config = loadConfig(makeEnv({
      LLM_DRY_MODE: 'false',
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
    }), '/dev/null');
    expect(config.llmDryMode).toBe(false);
    expect(config.anthropicApiKey).toBe('sk-ant-test-key');
  });

  it('falls back to dry mode when LLM_DRY_MODE=false but no API key', () => {
    const config = loadConfig(makeEnv({ LLM_DRY_MODE: 'false' }), '/dev/null');
    expect(config.llmDryMode).toBe(true);
  });

  it('uses custom LLM_MODEL when provided', () => {
    const config = loadConfig(makeEnv({ LLM_MODEL: 'claude-sonnet-4-6' }), '/dev/null');
    expect(config.llmModel).toBe('claude-sonnet-4-6');
  });

  // LLM resilience config
  it('defaults llmMaxConcurrency to 2', () => {
    const config = loadConfig(makeEnv(), '/dev/null');
    expect(config.llmMaxConcurrency).toBe(2);
  });

  it('uses custom LLM_MAX_CONCURRENCY when provided', () => {
    const config = loadConfig(makeEnv({ LLM_MAX_CONCURRENCY: '5' }), '/dev/null');
    expect(config.llmMaxConcurrency).toBe(5);
  });

  it('defaults llmMaxRetries to 3', () => {
    const config = loadConfig(makeEnv(), '/dev/null');
    expect(config.llmMaxRetries).toBe(3);
  });

  it('uses custom LLM_MAX_RETRIES when provided', () => {
    const config = loadConfig(makeEnv({ LLM_MAX_RETRIES: '5' }), '/dev/null');
    expect(config.llmMaxRetries).toBe(5);
  });

  it('defaults scanCooldownMs to 30000', () => {
    const config = loadConfig(makeEnv(), '/dev/null');
    expect(config.scanCooldownMs).toBe(30_000);
  });

  it('uses custom SCAN_COOLDOWN_MS when provided', () => {
    const config = loadConfig(makeEnv({ SCAN_COOLDOWN_MS: '60000' }), '/dev/null');
    expect(config.scanCooldownMs).toBe(60_000);
  });

  it('falls back to defaults for invalid resilience values', () => {
    const config = loadConfig(makeEnv({
      LLM_MAX_CONCURRENCY: 'abc',
      LLM_MAX_RETRIES: '',
      SCAN_COOLDOWN_MS: 'xyz',
    }), '/dev/null');
    expect(config.llmMaxConcurrency).toBe(2);
    expect(config.llmMaxRetries).toBe(3);
    expect(config.scanCooldownMs).toBe(30_000);
  });
});
