import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createInterviewsRouter } from '../../src/routes/interviews.js';

/**
 * Creates a mock detector that returns the given suggestions.
 */
function mockDetector(suggestions = []) {
  return { detect: async () => suggestions };
}

/**
 * Creates a mock token store for dismiss testing.
 */
function mockTokenStore() {
  let dismissed = [];
  return {
    addDismissed: async (entry) => dismissed.push(entry),
    clearDismissed: async () => { dismissed = []; },
    getDismissed: () => dismissed,
    _getDismissed: () => dismissed,
    clearDismissed: async () => { dismissed.length = 0; },
    clearSurfaced: async () => {},
  };
}

/**
 * Creates a mock googleAuth service for testing.
 */
function mockGoogleAuth(authenticated = true) {
  return {
    isAuthenticated: () => authenticated,
  };
}

function createTestApp(detector, tokenStore, pollIntervalMs = 300_000, googleAuth = null) {
  const app = express();
  app.use(express.json());
  app.use('/api/interviews', createInterviewsRouter({
    detector,
    tokenStore,
    pollIntervalMs,
    googleAuth: googleAuth || mockGoogleAuth(),
  }));
  return app;
}

describe('Interviews routes', () => {
  describe('Authentication checks', () => {
    it('GET /suggestions returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDetector(), mockTokenStore(), 300_000, mockGoogleAuth(false));
      const res = await request(app).get('/api/interviews/suggestions');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Not authenticated');
    });

    it('POST /dismiss returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDetector(), mockTokenStore(), 300_000, mockGoogleAuth(false));
      const res = await request(app)
        .post('/api/interviews/dismiss')
        .send({ suggestionId: 'test-id' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Not authenticated');
    });

    it('POST /scan returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDetector(), mockTokenStore(), 300_000, mockGoogleAuth(false));
      const res = await request(app).post('/api/interviews/scan');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Not authenticated');
    });

    it('POST /reset returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDetector(), mockTokenStore(), 300_000, mockGoogleAuth(false));
      const res = await request(app).post('/api/interviews/reset');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Not authenticated');
    });
  });

  describe('POST /api/interviews/dismiss', () => {
    it('returns 400 when suggestionId is missing', async () => {
      const app = createTestApp(mockDetector(), mockTokenStore());
      const res = await request(app)
        .post('/api/interviews/dismiss')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('suggestionId');
    });

    it('returns 400 when suggestionId is not a string', async () => {
      const app = createTestApp(mockDetector(), mockTokenStore());
      const res = await request(app)
        .post('/api/interviews/dismiss')
        .send({ suggestionId: 123 });

      expect(res.status).toBe(400);
    });

    it('persists the dismissed suggestion ID', async () => {
      const store = mockTokenStore();
      const app = createTestApp(mockDetector(), store);

      const res = await request(app)
        .post('/api/interviews/dismiss')
        .send({ suggestionId: 'suggestion_abc' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ dismissed: true });
      expect(store._getDismissed()).toContainEqual(
        expect.objectContaining({ id: 'suggestion_abc' })
      );
    });
  });

  describe('POST /api/interviews/scan', () => {
    it('returns suggestions from a manual scan', async () => {
      const suggestions = [{ id: 's1', source: 'gmail+calendar', confidence: 0.9 }];
      const app = createTestApp(mockDetector(suggestions), mockTokenStore());

      const res = await request(app).post('/api/interviews/scan');

      expect(res.status).toBe(200);
      expect(res.body.suggestions).toEqual(suggestions);
    });

    it('returns empty suggestions when none found', async () => {
      const app = createTestApp(mockDetector([]), mockTokenStore());

      const res = await request(app).post('/api/interviews/scan');

      expect(res.status).toBe(200);
      expect(res.body.suggestions).toEqual([]);
    });

    it('returns 500 when detector throws', async () => {
      const failingDetector = {
        detect: async () => { throw new Error('API failure'); },
      };
      const app = createTestApp(failingDetector, mockTokenStore());

      const res = await request(app).post('/api/interviews/scan');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('API failure');
    });
  });

  describe('POST /api/interviews/reset', () => {
    it('clears dismissed entries and returns success', async () => {
      const store = mockTokenStore();
      const app = createTestApp(mockDetector(), store);

      // Add some dismissed entries first
      await store.addDismissed({ id: 'sug-1', emailId: 'msg1', calendarId: '' });
      await store.addDismissed({ id: 'sug-2', emailId: '', calendarId: 'evt2' });
      expect(store._getDismissed()).toHaveLength(2);

      const res = await request(app).post('/api/interviews/reset');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ reset: true });
      expect(store._getDismissed()).toHaveLength(0);
    });

    it('succeeds even when no dismissed entries exist', async () => {
      const app = createTestApp(mockDetector(), mockTokenStore());

      const res = await request(app).post('/api/interviews/reset');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ reset: true });
    });
  });

  describe('GET /api/interviews/suggestions (SSE)', () => {
    it('returns SSE content-type and connected event', async () => {
      const app = createTestApp(mockDetector(), mockTokenStore());

      const data = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('SSE timeout')), 3000);
        let collected = '';

        const req = request(app).get('/api/interviews/suggestions');

        req.buffer(false).end((err, res) => {
          if (err && !collected) {
            clearTimeout(timeout);
            return reject(err);
          }
        });

        // Access the underlying response via the agent
        req.on('response', (res) => {
          res.on('data', (chunk) => {
            collected += chunk.toString();
            // Once we have the connected event, close and resolve
            if (collected.includes('event: connected')) {
              clearTimeout(timeout);
              res.destroy();
              resolve({ data: collected, headers: res.headers });
            }
          });
        });
      });

      expect(data.headers['content-type']).toContain('text/event-stream');
      expect(data.data).toContain('event: connected');
      expect(data.data).toContain('"status":"connected"');
    }, 5000);

    it('broadcasts scan-complete event when no suggestions found', async () => {
      const app = createTestApp(mockDetector([]), mockTokenStore(), 100);

      const data = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('SSE timeout')), 3000);
        let collected = '';

        const req = request(app).get('/api/interviews/suggestions');

        req.buffer(false).end(() => {});

        req.on('response', (res) => {
          res.on('data', (chunk) => {
            collected += chunk.toString();
            // Wait for scan-complete event
            if (collected.includes('event: scan-complete')) {
              clearTimeout(timeout);
              res.destroy();
              resolve(collected);
            }
          });
        });
      });

      expect(data).toContain('event: scan-complete');
      expect(data).toContain('"count":0');
    }, 5000);
  });
});
