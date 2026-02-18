import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Loads environment variables from server/.env and returns a validated config object.
 *
 * @param {Object} [env=process.env] - injectable env source for testing
 * @param {string} [envPath] - optional path to .env file (defaults to server/.env)
 * @returns {{ clientId: string, clientSecret: string, port: number, pollIntervalMs: number, emailLookbackDays: number, calendarLookaheadDays: number, redirectUri: string }}
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
  const emailLookbackDays   = parseInt(env.EMAIL_LOOKBACK_DAYS, 10) || 1;
  const calendarLookaheadDays = parseInt(env.CALENDAR_LOOKAHEAD_DAYS, 10) || 30;
  const redirectUri         = `http://localhost:${port}/api/auth/callback`;

  return {
    clientId,
    clientSecret,
    port,
    pollIntervalMs,
    emailLookbackDays,
    calendarLookaheadDays,
    redirectUri,
  };
}
