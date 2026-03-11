import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { google } from 'googleapis';
import { loadConfig } from './config.js';
import { createTokenStore } from './services/tokenStore.js';
import { createGoogleAuth } from './services/googleAuth.js';
import { createGmailService } from './services/gmailService.js';
import { createCalendarService } from './services/calendarService.js';
import { createInterviewDetector } from './services/interviewDetector.js';
import { createLlmExtractor } from './services/llmExtractor.js';
import { createDriveService } from './services/driveService.js';
import { createAuthRouter } from './routes/auth.js';
import { createInterviewsRouter } from './routes/interviews.js';
import { createSyncRouter } from './routes/sync.js';

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
 * @param {Object} [deps.llmExtractor] - LLM extractor instance (null disables LLM enrichment)
 * @param {Object} [deps.detector] - interview detector instance
 * @param {Object} [deps.driveService] - Google Drive backup service
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
  const llmExtractor    = deps.llmExtractor    ?? (
    !config.llmDryMode && config.anthropicApiKey
      ? createLlmExtractor({
          apiKey: config.anthropicApiKey,
          dryMode: false,
          model: config.llmModel,
          maxConcurrency: config.llmMaxConcurrency,
          maxRetries: config.llmMaxRetries,
          logLevel: config.logLevel,
        })
      : null
  );
  const detector        = deps.detector        || createInterviewDetector({ gmailService, calendarService, tokenStore, llmExtractor, logLevel: config.logLevel });
  const driveService    = deps.driveService    || createDriveService(authClient);

  const app = express();
  
  // Security headers
  app.use(helmet());

  // CORS middleware
  app.use(cors({
    origin: config.corsOrigin,
    credentials: true,
  }));

  app.use(express.json({ limit: '1mb' }));

  // Auth routes
  app.use('/api/auth', createAuthRouter(googleAuth));

  // Interview suggestion routes (SSE + dismiss + manual scan)
  app.use('/api/interviews', createInterviewsRouter({
    detector,
    tokenStore,
    pollIntervalMs: config.pollIntervalMs,
    googleAuth,
    scanCooldownMs: config.scanCooldownMs,
  }));

  // Cloud sync routes (Google Drive backup/restore)
  app.use('/api/sync', createSyncRouter({ driveService, googleAuth }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      llm: llmExtractor ? llmExtractor.getStats() : { disabled: true },
    });
  });

  // Global error handler — catches unhandled async errors (Express 5 forwards
  // rejected promises here automatically).  Always responds with JSON.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[server] unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
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
