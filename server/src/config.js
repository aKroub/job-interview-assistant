import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Loads environment variables from server/.env and returns a validated config object.
 *
 * @param {Object} [env=process.env] - injectable env source for testing
 * @param {string} [envPath] - optional path to .env file (defaults to server/.env)
 * @returns {{ clientId: string, clientSecret: string, port: number, pollIntervalMs: number, emailLookbackDays: number, calendarLookaheadDays: number, redirectUri: string, anthropicApiKey: string, llmDryMode: boolean, llmModel: string, llmMaxConcurrency: number, llmMaxRetries: number, scanCooldownMs: number }}
 * @throws {Error} if required env vars are missing
 */
export function loadConfig(env = process.env, envPath) {
  const dotenvPath = envPath || resolve(__dirname, '..', '.env');
  loadEnv({ path: dotenvPath });

  const clientId     = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  const missing = [];
  if (!clientId)     missing.push('GOOGLE_CLIENT_ID');
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Copy server/.env.example to server/.env and fill in your Google OAuth credentials.'
    );
  }

  const port                = parseInt(env.PORT, 10) || 3001;
  const pollIntervalMs      = parseInt(env.POLL_INTERVAL_MS, 10) || 300_000;
  const emailLookbackDays   = parseInt(env.EMAIL_LOOKBACK_DAYS, 10) || 7;
  const calendarLookaheadDays = parseInt(env.CALENDAR_LOOKAHEAD_DAYS, 10) || 30;
  const redirectUri         = `http://localhost:${port}/api/auth/callback`;

  // LLM extraction config (optional — dry mode works without an API key)
  const anthropicApiKey = env.ANTHROPIC_API_KEY || '';
  const llmDryMode      = env.LLM_DRY_MODE !== 'false';  // default true
  const llmModel        = env.LLM_MODEL || 'claude-haiku-4-5';

  // Safety: if wet mode requested but no API key, warn and stay in dry mode
  if (!llmDryMode && !anthropicApiKey) {
    console.warn(
      '[config] LLM_DRY_MODE=false but ANTHROPIC_API_KEY is missing — falling back to dry mode.'
    );
  }
  const effectiveLlmDryMode = (!llmDryMode && !anthropicApiKey) ? true : llmDryMode;

  // LLM resilience config
  const llmMaxConcurrency   = parseInt(env.LLM_MAX_CONCURRENCY, 10) || 2;
  const llmMaxRetries       = parseInt(env.LLM_MAX_RETRIES, 10) || 3;
  const scanCooldownMs      = parseInt(env.SCAN_COOLDOWN_MS, 10) || 30_000;

  return {
    clientId,
    clientSecret,
    port,
    pollIntervalMs,
    emailLookbackDays,
    calendarLookaheadDays,
    redirectUri,
    anthropicApiKey,
    llmDryMode: effectiveLlmDryMode,
    llmModel,
    llmMaxConcurrency,
    llmMaxRetries,
    scanCooldownMs,
  };
}
