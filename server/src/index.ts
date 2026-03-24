import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { google } from 'googleapis';
import type { Auth } from 'googleapis';
import type { Request, Response, NextFunction } from 'express';
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
import { createLogoRouter } from './routes/logo.js';
import type { CreateAppDeps, AppInstance } from './types';

/**
 * Creates an async function that lazily fetches and caches the authenticated user's email.
 *
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGetUserEmail(authClient: Auth.OAuth2Client, options: { gmailApi?: any } = {}): () => Promise<string> {
  const gmailApi = options.gmailApi || google.gmail({ version: 'v1', auth: authClient });
  let cachedEmail: string | null = null;

  return async function getUserEmail(): Promise<string> {
    if (cachedEmail) return cachedEmail;

    try {
      const response = await gmailApi.users.getProfile({ userId: 'me' });
      const email = response.data.emailAddress ?? '';
      cachedEmail = email;
      return email;
    } catch (err: unknown) {
      console.warn('Failed to fetch user email:', (err as Error).message);
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
 */
export function createApp(deps: CreateAppDeps = {}): AppInstance {
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

  // Logo proxy (favicon lookup for custom companies)
  app.use('/api/logo', createLogoRouter());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      llm: llmExtractor ? llmExtractor.getStats() : { disabled: true },
    });
  });

  // Global error handler — catches unhandled async errors (Express 5 forwards
  // rejected promises here automatically).  Always responds with JSON.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    // If headers are already sent (e.g. mid-SSE stream), delegate to Express's
    // default error handler which will close the connection gracefully.
    if (res.headersSent) {
      return next(err);
    }
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
  } catch (err: unknown) {
    console.error('Failed to start server:', (err as Error).message);
    process.exit(1);
  }
}
