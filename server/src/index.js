import express from 'express';
import { loadConfig } from './config.js';
import { createTokenStore } from './services/tokenStore.js';
import { createGoogleAuth } from './services/googleAuth.js';
import { createAuthRouter } from './routes/auth.js';

/**
 * Creates and configures the Express application.
 * Accepts injectable dependencies for testing.
 *
 * @param {Object} [deps] - optional dependency overrides
 * @param {Object} [deps.config] - config object (defaults to loadConfig())
 * @param {Object} [deps.tokenStore] - token store instance
 * @param {Object} [deps.googleAuth] - google auth instance
 * @returns {{ app: import('express').Express, config: Object }}
 */
export function createApp(deps = {}) {
  const config     = deps.config     || loadConfig();
  const tokenStore = deps.tokenStore || createTokenStore();
  const googleAuth = deps.googleAuth || createGoogleAuth(config, tokenStore);

  const app = express();
  app.use(express.json());

  // Auth routes
  app.use('/api/auth', createAuthRouter(googleAuth));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return { app, config, tokenStore, googleAuth };
}

/**
 * Starts the server when run directly (not imported as a module in tests).
 * Uses a self-invoking async function to handle the async config loading.
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
