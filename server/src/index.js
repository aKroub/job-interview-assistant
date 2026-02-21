import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import { loadConfig } from './config.js';
import { createTokenStore } from './services/tokenStore.js';
import { createGoogleAuth } from './services/googleAuth.js';
import { createGmailService } from './services/gmailService.js';
import { createCalendarService } from './services/calendarService.js';
import { createInterviewDetector } from './services/interviewDetector.js';
import { createAuthRouter } from './routes/auth.js';
import { createInterviewsRouter } from './routes/interviews.js';

/**
 * Creates an async function that lazily fetches and caches the authenticated user's email.
 *
 * @param {import('googleapis').Auth.OAuth2Client} authClient - authenticated OAuth2 client
 * @param {Object} [options]
 * @param {Function} [options.gmailApi] - injectable Gmail API instance for testing
 * @returns {() => Promise<string>}
 */
export function createGetUserEmail(authClient, options = {}) {
  const gmailApi = options.gmailApi || google.gmail({ version: 'v1', auth: authClient });
  let cachedEmail = null;

  return async function getUserEmail() {
    if (cachedEmail) return cachedEmail;

    try {
      const response = await gmailApi.users.getProfile({ userId: 'me' });
      cachedEmail = response.data.emailAddress || '';
      return cachedEmail;
    } catch (err) {
      console.warn('Failed to fetch user email:', err.message);
      return '';
    }
  };
}

/**
 * Creates and configures the Express application.
 * Accepts injectable dependencies for testing.
 *
 * The interview scanning pipeline is only active when:
 * 1. The user has authenticated via OAuth (tokens exist)
 * 2. A frontend client connects to the SSE endpoint
 *
 * @param {Object} [deps] - optional dependency overrides
 * @param {Object} [deps.config] - config object (defaults to loadConfig())
 * @param {Object} [deps.tokenStore] - token store instance
 * @param {Object} [deps.googleAuth] - google auth instance
 * @param {Object} [deps.detector] - interview detector instance
 * @returns {{ app: import('express').Express, config: Object, tokenStore: Object, googleAuth: Object }}
 */
export function createApp(deps = {}) {
  const config     = deps.config     || loadConfig();
  const tokenStore = deps.tokenStore || createTokenStore();
  const googleAuth = deps.googleAuth || createGoogleAuth(config, tokenStore);

  // Build the scanning pipeline (services are lazy — they don't do anything until called)
  const authClient = googleAuth.getAuthClient();
  const getUserEmail    = deps.getUserEmail    || createGetUserEmail(authClient);
  const gmailService    = deps.gmailService    || createGmailService(authClient, { lookbackDays: config.emailLookbackDays });
  const calendarService = deps.calendarService || createCalendarService(authClient, { lookaheadDays: config.calendarLookaheadDays, getUserEmail });
  const detector        = deps.detector        || createInterviewDetector({ gmailService, calendarService, tokenStore });

  const app = express();
  
  // CORS middleware
  app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
  }));
  
  app.use(express.json());

  // Auth routes
  app.use('/api/auth', createAuthRouter(googleAuth));

  // Interview suggestion routes (SSE + dismiss + manual scan)
  app.use('/api/interviews', createInterviewsRouter({
    detector,
    tokenStore,
    pollIntervalMs: config.pollIntervalMs,
  }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return { app, config, tokenStore, googleAuth };
}

/**
 * Starts the server when run directly (not imported as a module in tests).
 */
const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isDirectRun) {
  try {
    const { app, config } = createApp();
    app.listen(config.port, () => {
      console.log(`Interview Tracker server running on http://localhost:${config.port}`);
      console.log(`OAuth callback URL: ${config.redirectUri}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}
