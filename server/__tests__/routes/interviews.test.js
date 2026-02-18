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
  const dismissed = [];
  return {
    addDismissed: (id) => dismissed.push(id),
    getDismissed: () => dismissed,
    _getDismissed: () => dismissed,
  };
}

function createTestApp(detector, tokenStore, pollIntervalMs = 300_000) {
  const app = express();
  app.use(express.json());
  app.use('/api/interviews', createInterviewsRouter({ detector, tokenStore, pollIntervalMs }));
  return app;
}

describe('Interviews routes', () => {
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
      expect(store._getDismissed()).toContain('suggestion_abc');
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
  });
});
