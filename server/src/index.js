import express from 'express';
import { loadConfig } from './config.js';

/**
 * Creates and configures the Express application.
 * Accepts injectable dependencies for testing.
 *
 * Future PRs will add tokenStore, googleAuth, and route middleware here.
 *
 * @param {Object} [deps] - optional dependency overrides
 * @param {Object} [deps.config] - config object (defaults to loadConfig())
 * @returns {{ app: import('express').Express, config: Object }}
 */
export function createApp(deps = {}) {
  const config = deps.config || loadConfig();

  const app = express();
  app.use(express.json());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return { app, config };
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
