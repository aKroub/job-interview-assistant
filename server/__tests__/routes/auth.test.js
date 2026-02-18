import { describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createAuthRouter } from '../../src/routes/auth.js';

/**
 * Creates a mock googleAuth service for testing routes in isolation.
 * Each method can be overridden via the overrides parameter.
 */
function createMockGoogleAuth(overrides = {}) {
  let authenticated = false;

  return {
    isAuthenticated: () => authenticated,
    getAuthUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth?mock=true',
    handleCallback: async (code) => {
      if (code === 'invalid-code') {
        throw new Error('Invalid authorization code');
      }
      authenticated = true;
    },
    disconnect: () => { authenticated = false; },
    _setAuthenticated: (val) => { authenticated = val; },
    ...overrides,
  };
}

/**
 * Creates a test Express app with the auth router mounted.
 */
function createTestApp(googleAuth) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(googleAuth));
  return app;
}

describe('Auth routes', () => {
  let googleAuth;
  let app;

  beforeEach(() => {
    googleAuth = createMockGoogleAuth();
    app = createTestApp(googleAuth);
  });

  describe('GET /api/auth/status', () => {
    it('returns { authenticated: false } when not connected', async () => {
      const res = await request(app).get('/api/auth/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ authenticated: false });
    });

    it('returns { authenticated: true } when connected', async () => {
      googleAuth._setAuthenticated(true);
      const res = await request(app).get('/api/auth/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ authenticated: true });
    });
  });

  describe('GET /api/auth/url', () => {
    it('returns the OAuth consent URL', async () => {
      const res = await request(app).get('/api/auth/url');
      expect(res.status).toBe(200);
      expect(res.body.url).toContain('accounts.google.com');
    });
  });

  describe('GET /api/auth/callback', () => {
    it('returns 400 when no code is provided', async () => {
      const res = await request(app).get('/api/auth/callback');
      expect(res.status).toBe(400);
      expect(res.text).toContain('No authorization code');
    });

    it('returns success HTML when a valid code is provided', async () => {
      const res = await request(app).get('/api/auth/callback?code=valid-code');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Connected');
    });

    it('returns 500 when handleCallback throws', async () => {
      const res = await request(app).get('/api/auth/callback?code=invalid-code');
      expect(res.status).toBe(500);
      expect(res.text).toContain('Connection Failed');
      expect(res.text).toContain('Invalid authorization code');
    });
  });

  describe('POST /api/auth/disconnect', () => {
    it('disconnects and returns { authenticated: false }', async () => {
      googleAuth._setAuthenticated(true);

      const res = await request(app).post('/api/auth/disconnect');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ authenticated: false });
    });

    it('marks the auth service as disconnected', async () => {
      googleAuth._setAuthenticated(true);
      await request(app).post('/api/auth/disconnect');

      const statusRes = await request(app).get('/api/auth/status');
      expect(statusRes.body).toEqual({ authenticated: false });
    });
  });
});
