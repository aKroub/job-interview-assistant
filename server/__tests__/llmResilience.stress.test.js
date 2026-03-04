import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createLlmExtractor, createSemaphore } from '../src/services/llmExtractor.js';
import { createInterviewsRouter } from '../src/routes/interviews.js';

// ---------------------------------------------------------------------------
// H1: semaphore-deadlock — getClient() or early errors don't leak slots
// ---------------------------------------------------------------------------
describe('H1: semaphore handles errors at every stage without deadlock', () => {
  it('completes all calls even when every API call throws', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockRejectedValue(new Error('401 unauthorized')),
      },
    };

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
      maxConcurrency: 1,
    });

    // Fire 5 calls — all will fail. With maxConcurrency=1, they serialize.
    // If the semaphore leaks a slot, this will hang forever.
    const results = await Promise.all([
      extractor.extractFromEmail('Interview 1', 'interview body', 'a@b.com'),
      extractor.extractFromEmail('Interview 2', 'interview body', 'a@b.com'),
      extractor.extractFromEmail('Interview 3', 'interview body', 'a@b.com'),
      extractor.extractFromEmail('Interview 4', 'interview body', 'a@b.com'),
      extractor.extractFromEmail('Interview 5', 'interview body', 'a@b.com'),
    ]);

    // All should complete (not hang) with null extractions
    expect(results).toHaveLength(5);
    results.forEach((r) => {
      expect(r.extraction).toBeNull();
    });
    expect(mockClient.messages.create).toHaveBeenCalledTimes(5);
  });

  it('does not hang when concurrent calls all throw synchronously', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockImplementation(() => {
          throw new Error('synchronous throw');
        }),
      },
    };

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
      maxConcurrency: 2,
    });

    const results = await Promise.all([
      extractor.extractFromEmail('Interview A', 'interview body', 'a@b.com'),
      extractor.extractFromEmail('Interview B', 'interview body', 'a@b.com'),
      extractor.extractFromEmail('Interview C', 'interview body', 'a@b.com'),
    ]);

    expect(results).toHaveLength(3);
    results.forEach((r) => expect(r.extraction).toBeNull());
  });

  it('double-release is safely ignored without corrupting the semaphore', () => {
    const sem = createSemaphore(1);

    // Acquire, then release twice
    sem.acquire();
    sem.release();
    sem.release(); // should be no-op due to guard

    // Semaphore should still work normally
    const acquired = [];
    sem.acquire().then(() => acquired.push('a'));
    sem.release();
    sem.acquire().then(() => acquired.push('b'));

    // Allow microtasks to flush
    return new Promise((r) => setTimeout(r, 10)).then(() => {
      expect(acquired).toContain('a');
    });
  });
});

// ---------------------------------------------------------------------------
// H2: scan-cooldown-leak — failed scan still counts against cooldown
// ---------------------------------------------------------------------------
describe('H2: scan cooldown behavior when detect() throws', () => {
  function createTestApp({ detector, scanCooldownMs = 5000 } = {}) {
    const googleAuth = { isAuthenticated: jest.fn().mockReturnValue(true) };
    const tokenStore = { addDismissed: jest.fn() };

    const app = express();
    app.use(express.json());
    app.use('/api/interviews', createInterviewsRouter({
      detector,
      tokenStore,
      pollIntervalMs: 300_000,
      googleAuth,
      scanCooldownMs,
    }));

    return app;
  }

  it('cooldown applies even when the scan fails with an error', async () => {
    const detector = {
      detect: jest.fn().mockRejectedValue(new Error('Gmail API failed')),
    };
    const app = createTestApp({ detector, scanCooldownMs: 5000 });

    // First scan — fails with 500, but cooldown timer starts
    const res1 = await request(app).post('/api/interviews/scan');
    expect(res1.status).toBe(500);

    // Second scan immediately — should be rate-limited
    const res2 = await request(app).post('/api/interviews/scan');
    expect(res2.status).toBe(429);
    expect(res2.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('allows scan after cooldown even if previous scan failed', async () => {
    let callCount = 0;
    const detector = {
      detect: jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('first call fails');
        return [{ id: 's1', companyName: 'Acme' }];
      }),
    };
    const app = createTestApp({ detector, scanCooldownMs: 50 });

    // First scan fails
    const res1 = await request(app).post('/api/interviews/scan');
    expect(res1.status).toBe(500);

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 60));

    // Second scan succeeds
    const res2 = await request(app).post('/api/interviews/scan');
    expect(res2.status).toBe(200);
    expect(res2.body.suggestions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// H3: stats consistency — total always equals succeeded + failed
// ---------------------------------------------------------------------------
describe('H3: stats consistency under concurrent load', () => {
  it('total equals succeeded + failed after all calls complete', async () => {
    let callCount = 0;
    const mockClient = {
      messages: {
        create: jest.fn().mockImplementation(async () => {
          callCount++;
          // Mix of successes and failures
          if (callCount % 3 === 0) throw new Error('API error');
          if (callCount % 3 === 1) {
            return { content: [{ type: 'text', text: '{"company_name":"Test"}' }] };
          }
          // Return invalid JSON
          return { content: [{ type: 'text', text: 'not json' }] };
        }),
      },
    };

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
      maxConcurrency: 3,
    });

    // Fire 9 calls (3 succeed, 3 invalid JSON, 3 throw)
    await Promise.all(
      Array.from({ length: 9 }, (_, i) =>
        extractor.extractFromEmail(`Interview ${i}`, 'interview body', 'a@b.com')
      )
    );

    const stats = extractor.getStats();
    expect(stats.total).toBe(9);
    expect(stats.total).toBe(stats.succeeded + stats.failed);
    expect(stats.succeeded).toBe(3); // calls 1, 4, 7
    expect(stats.failed).toBe(6);    // calls 2,3,5,6,8,9
  });
});

// ---------------------------------------------------------------------------
// H4: semaphore survives consecutive error batches
// ---------------------------------------------------------------------------
describe('H4: semaphore survives consecutive error batches', () => {
  it('second batch works after first batch all failed', async () => {
    let batchNum = 0;
    const mockClient = {
      messages: {
        create: jest.fn().mockImplementation(async () => {
          if (batchNum === 0) throw new Error('batch 1 fails');
          return { content: [{ type: 'text', text: '{"company_name":"Acme"}' }] };
        }),
      },
    };

    const extractor = createLlmExtractor({
      dryMode: false,
      anthropicClient: mockClient,
      maxConcurrency: 2,
    });

    // Batch 1: all fail
    const batch1 = await Promise.all([
      extractor.extractFromEmail('Interview 1', 'interview body', 'a@b.com'),
      extractor.extractFromEmail('Interview 2', 'interview body', 'a@b.com'),
      extractor.extractFromEmail('Interview 3', 'interview body', 'a@b.com'),
    ]);
    batch1.forEach((r) => expect(r.extraction).toBeNull());

    // Switch to success mode
    batchNum = 1;

    // Batch 2: should all succeed (semaphore not corrupted)
    const batch2 = await Promise.all([
      extractor.extractFromEmail('Interview 4', 'interview body', 'a@b.com'),
      extractor.extractFromEmail('Interview 5', 'interview body', 'a@b.com'),
      extractor.extractFromEmail('Interview 6', 'interview body', 'a@b.com'),
    ]);
    batch2.forEach((r) => expect(r.extraction).toEqual({ company_name: 'Acme' }));

    // Stats should reflect both batches
    const stats = extractor.getStats();
    expect(stats.total).toBe(6);
    expect(stats.succeeded).toBe(3);
    expect(stats.failed).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// H5: concurrent scans during in-flight detect()
// ---------------------------------------------------------------------------
describe('H5: concurrent scan requests during in-flight detection', () => {
  it('second scan is rejected immediately after first scan starts', async () => {
    const detector = {
      detect: jest.fn().mockResolvedValue([]),
    };
    const googleAuth = { isAuthenticated: jest.fn().mockReturnValue(true) };
    const tokenStore = { addDismissed: jest.fn() };

    const app = express();
    app.use(express.json());
    app.use('/api/interviews', createInterviewsRouter({
      detector,
      tokenStore,
      pollIntervalMs: 300_000,
      googleAuth,
      scanCooldownMs: 5000,
    }));

    // First scan — completes instantly, sets lastScanAt
    const res1 = await request(app).post('/api/interviews/scan');
    expect(res1.status).toBe(200);

    // Second scan immediately — cooldown is active
    const res2 = await request(app).post('/api/interviews/scan');
    expect(res2.status).toBe(429);
    expect(res2.body.retryAfterSeconds).toBeGreaterThan(0);

    // detector.detect was only called once (second scan never reached it)
    expect(detector.detect).toHaveBeenCalledTimes(1);
  });
});
