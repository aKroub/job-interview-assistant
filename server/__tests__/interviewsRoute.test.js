import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createInterviewsRouter } from '../src/routes/interviews.js';

/**
 * Creates a minimal test app with the interviews router.
 *
 * @param {Object} [overrides] - dependency overrides
 * @param {number} [overrides.scanCooldownMs=100] - short cooldown for fast tests
 * @returns {{ app: import('express').Express, detector: Object }}
 */
function createTestApp(overrides = {}) {
  const detector = {
    detect: jest.fn().mockResolvedValue([
      { id: 'suggestion-1', companyName: 'Acme', source: 'email' },
    ]),
  };

  const tokenStore = {
    addDismissed: jest.fn().mockResolvedValue(undefined),
  };

  const googleAuth = {
    isAuthenticated: jest.fn().mockReturnValue(true),
  };

  const app = express();
  app.use(express.json());
  app.use('/api/interviews', createInterviewsRouter({
    detector: overrides.detector ?? detector,
    tokenStore: overrides.tokenStore ?? tokenStore,
    pollIntervalMs: 300_000,
    googleAuth: overrides.googleAuth ?? googleAuth,
    scanCooldownMs: overrides.scanCooldownMs ?? 100, // 100ms for fast tests
  }));

  return { app, detector, googleAuth };
}

// ---------------------------------------------------------------------------
// POST /api/interviews/scan — cooldown
// ---------------------------------------------------------------------------
describe('POST /api/interviews/scan (cooldown)', () => {
  it('returns suggestions on first scan', async () => {
    const { app } = createTestApp();

    const res = await request(app).post('/api/interviews/scan');

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0].companyName).toBe('Acme');
  });

  it('returns 429 when scan is called within cooldown window', async () => {
    const { app } = createTestApp({ scanCooldownMs: 5000 });

    // First scan — should succeed
    const res1 = await request(app).post('/api/interviews/scan');
    expect(res1.status).toBe(200);

    // Second scan immediately — should be rate limited
    const res2 = await request(app).post('/api/interviews/scan');
    expect(res2.status).toBe(429);
    expect(res2.body.error).toBe('Scan rate limited');
    expect(res2.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('allows scan after cooldown expires', async () => {
    const { app } = createTestApp({ scanCooldownMs: 50 });

    // First scan
    const res1 = await request(app).post('/api/interviews/scan');
    expect(res1.status).toBe(200);

    // Wait for cooldown to expire
    await new Promise((r) => setTimeout(r, 60));

    // Second scan — should succeed
    const res2 = await request(app).post('/api/interviews/scan');
    expect(res2.status).toBe(200);
  });

  it('returns 401 when not authenticated', async () => {
    const googleAuth = { isAuthenticated: jest.fn().mockReturnValue(false) };
    const { app } = createTestApp({ googleAuth });

    const res = await request(app).post('/api/interviews/scan');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Not authenticated');
  });

  it('returns 500 when detector throws', async () => {
    const detector = {
      detect: jest.fn().mockRejectedValue(new Error('Gmail API down')),
    };
    const { app } = createTestApp({ detector });

    const res = await request(app).post('/api/interviews/scan');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Gmail API down');
  });
});
