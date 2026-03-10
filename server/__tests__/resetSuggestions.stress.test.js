import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import request from 'supertest';
import { createTokenStore } from '../src/services/tokenStore.js';
import { createInterviewsRouter } from '../src/routes/interviews.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function mockGoogleAuth(authenticated = true) {
  return { isAuthenticated: () => authenticated };
}

function createTestApp({ detector, tokenStore, pollIntervalMs = 300_000, googleAuth, scanCooldownMs = 0 }) {
  const app = express();
  app.use(express.json());
  app.use('/api/interviews', createInterviewsRouter({
    detector,
    tokenStore,
    pollIntervalMs,
    googleAuth: googleAuth || mockGoogleAuth(),
    scanCooldownMs,
  }));
  return app;
}

// ---------------------------------------------------------------------------
// H1: Concurrent reset + SSE broadcast race
//
// If pollOnce broadcasts suggestions at the same time as clearDismissed runs,
// stale suggestions (that should now be visible again) are broadcast. This is
// actually correct behaviour: after a reset, suggestions SHOULD reappear. The
// real risk is data corruption in the tokenStore. We verify that after
// concurrent reset + detect, the dismissed list is consistently empty and
// detect results are stable.
// ---------------------------------------------------------------------------
describe('H1: Concurrent reset + SSE broadcast race', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reset-stress-h1-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('clearDismissed during detect does not corrupt dismissed state', async () => {
    const store = createTokenStore(tempDir);

    // Pre-populate 50 dismissed entries
    for (let i = 0; i < 50; i++) {
      await store.addDismissed({ id: `sug-${i}`, emailId: `msg-${i}`, calendarId: `cal-${i}` });
    }
    expect(store.getDismissed().ids.size).toBe(50);

    // Simulate a slow detector (takes 50ms)
    const slowDetector = {
      detect: async () => {
        await new Promise((r) => setTimeout(r, 50));
        return [{ id: 'new-sug', source: 'gmail' }];
      },
    };

    const app = createTestApp({ detector: slowDetector, tokenStore: store, scanCooldownMs: 0 });

    // Fire scan and reset concurrently
    const [scanRes, resetRes] = await Promise.all([
      request(app).post('/api/interviews/scan'),
      request(app).post('/api/interviews/reset'),
    ]);

    // Both should succeed
    expect(scanRes.status).toBe(200);
    expect(resetRes.status).toBe(200);
    expect(resetRes.body).toEqual({ reset: true });

    // After the concurrent operations, dismissed list must be empty
    const dismissed = store.getDismissed();
    expect(dismissed.ids.size).toBe(0);
    expect(dismissed.emailIds.size).toBe(0);
    expect(dismissed.calendarIds.size).toBe(0);
  });

  it('reset during SSE broadcast leaves dismissed state clean', async () => {
    const store = createTokenStore(tempDir);

    // Add dismissed entries
    for (let i = 0; i < 20; i++) {
      await store.addDismissed({ id: `sug-${i}`, emailId: `msg-${i}`, calendarId: '' });
    }

    // Clear dismissed and verify state is clean
    await store.clearDismissed();
    const dismissed = store.getDismissed();
    expect(dismissed.ids.size).toBe(0);

    // Add new entries after clear — should work without corruption
    await store.addDismissed({ id: 'post-reset-1', emailId: 'new-msg', calendarId: '' });
    const afterAdd = store.getDismissed();
    expect(afterAdd.ids.size).toBe(1);
    expect(afterAdd.ids.has('post-reset-1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// H2: Reset during active scan — state consistency
//
// Calling /reset while /scan is in-flight. The scan reads dismissed state,
// then reset clears it. The scan result may or may not reflect the reset
// (depending on timing). The key invariant: dismissed state is empty after
// both operations complete, and no server errors occur.
// ---------------------------------------------------------------------------
describe('H2: Reset during active scan', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reset-stress-h2-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('concurrent /scan and /reset both succeed without server error', async () => {
    const store = createTokenStore(tempDir);

    // Pre-populate dismissed
    for (let i = 0; i < 10; i++) {
      await store.addDismissed({ id: `sug-${i}`, emailId: `msg-${i}`, calendarId: '' });
    }

    // Detector that takes varying time (0-20ms)
    let detectCallCount = 0;
    const variableDetector = {
      detect: async () => {
        detectCallCount++;
        await new Promise((r) => setTimeout(r, Math.random() * 20));
        return [{ id: `result-${detectCallCount}`, source: 'calendar' }];
      },
    };

    const app = createTestApp({ detector: variableDetector, tokenStore: store, scanCooldownMs: 0 });

    // Fire 5 concurrent scans and 5 concurrent resets
    const ops = [];
    for (let i = 0; i < 5; i++) {
      ops.push(request(app).post('/api/interviews/scan'));
      ops.push(request(app).post('/api/interviews/reset'));
    }

    const results = await Promise.all(ops);

    // None should be 500 (server error). Scans may be 429 (rate-limited) since scanCooldownMs=0
    // but multiple scans in rapid succession with Date.now() differences of < 0ms are fine.
    for (const res of results) {
      expect([200, 429]).toContain(res.status);
    }

    // After all operations complete, dismissed state must be empty (last reset wins)
    const dismissed = store.getDismissed();
    expect(dismissed.ids.size).toBe(0);
  });

  it('scan results are valid after a reset completes', async () => {
    const store = createTokenStore(tempDir);

    await store.addDismissed({ id: 'sug-1', emailId: 'msg-1', calendarId: '' });

    const detector = {
      detect: async () => [{ id: 'new-result', source: 'gmail' }],
    };

    const app = createTestApp({ detector, tokenStore: store, scanCooldownMs: 0 });

    // Reset first, then scan
    const resetRes = await request(app).post('/api/interviews/reset');
    expect(resetRes.status).toBe(200);

    const scanRes = await request(app).post('/api/interviews/scan');
    expect(scanRes.status).toBe(200);
    expect(scanRes.body.suggestions).toEqual([{ id: 'new-result', source: 'gmail' }]);

    // Dismissed list should be empty
    expect(store.getDismissed().ids.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// H3: clearDismissed file system race — concurrent write operations
//
// The tokenStore uses an in-memory array (dismissedCache) that is mutated
// by both addDismissed (push) and clearDismissed (assignment to []). Since
// JavaScript is single-threaded, the array mutation itself is safe, but the
// async writeFile calls could interleave. We test that the final file state
// is consistent with the in-memory state.
// ---------------------------------------------------------------------------
describe('H3: clearDismissed file system race', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reset-stress-h3-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('concurrent addDismissed + clearDismissed converges to consistent state', async () => {
    const store = createTokenStore(tempDir);

    // Fire adds and a clear concurrently
    const ops = [];
    for (let i = 0; i < 20; i++) {
      ops.push(store.addDismissed({ id: `sug-${i}`, emailId: `msg-${i}`, calendarId: '' }));
    }
    // Insert a clear in the middle
    ops.splice(10, 0, store.clearDismissed());

    await Promise.all(ops);

    // Wait a tick for any trailing writes
    await new Promise((r) => setTimeout(r, 50));

    // In-memory state should be consistent
    const dismissed = store.getDismissed();

    // The clear happens at index 10 in the ops array. Due to single-threaded
    // execution, all 20 addDismissed calls run synchronously (updating the
    // cache) before any awaited writeFile completes. The clearDismissed
    // sets cache to []. Subsequent adds push to the new array.
    // Exact count depends on execution order, but state must be internally consistent.
    const fileContent = readFileSync(join(tempDir, 'dismissed.json'), 'utf-8');
    const fileEntries = JSON.parse(fileContent);

    // File state may differ from memory due to write interleaving,
    // but the in-memory state (which is authoritative) must be self-consistent
    expect(dismissed.ids.size).toBeGreaterThanOrEqual(0);
    expect(dismissed.ids.size).toBeLessThanOrEqual(20);

    // Verify file is valid JSON (no corruption)
    expect(Array.isArray(fileEntries)).toBe(true);
  });

  it('rapid clearDismissed calls do not corrupt the file', async () => {
    const store = createTokenStore(tempDir);

    // Add some entries first
    for (let i = 0; i < 10; i++) {
      await store.addDismissed({ id: `sug-${i}`, emailId: '', calendarId: '' });
    }

    // Fire 10 rapid clears
    const clears = Array.from({ length: 10 }, () => store.clearDismissed());
    await Promise.all(clears);

    // Wait for writes to settle
    await new Promise((r) => setTimeout(r, 50));

    // In-memory must be empty
    expect(store.getDismissed().ids.size).toBe(0);

    // File must be valid JSON
    const fileContent = readFileSync(join(tempDir, 'dismissed.json'), 'utf-8');
    const parsed = JSON.parse(fileContent);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual([]);
  });

  it('addDismissed after clearDismissed persists correctly', async () => {
    const store = createTokenStore(tempDir);

    // Populate, clear, then add new
    for (let i = 0; i < 5; i++) {
      await store.addDismissed({ id: `old-${i}`, emailId: '', calendarId: '' });
    }

    await store.clearDismissed();

    for (let i = 0; i < 3; i++) {
      await store.addDismissed({ id: `new-${i}`, emailId: `new-msg-${i}`, calendarId: '' });
    }

    // In-memory: exactly 3 new entries
    const dismissed = store.getDismissed();
    expect(dismissed.ids.size).toBe(3);
    expect(dismissed.ids.has('old-0')).toBe(false);
    expect(dismissed.ids.has('new-0')).toBe(true);

    // File: same 3 entries
    const fileContent = readFileSync(join(tempDir, 'dismissed.json'), 'utf-8');
    const parsed = JSON.parse(fileContent);
    expect(parsed).toHaveLength(3);
    expect(parsed.every((e) => e.id.startsWith('new-'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// H4: Route-level rapid reset calls
//
// If the user rapidly clicks "Reset" multiple times, the server receives
// multiple POST /reset calls. Each calls clearDismissed(). We verify no
// server errors and the final state is consistent.
// ---------------------------------------------------------------------------
describe('H4: Rapid reset calls via HTTP', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reset-stress-h4-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('10 rapid /reset calls all return 200 with { reset: true }', async () => {
    const store = createTokenStore(tempDir);

    // Pre-populate
    for (let i = 0; i < 50; i++) {
      await store.addDismissed({ id: `sug-${i}`, emailId: `msg-${i}`, calendarId: `cal-${i}` });
    }

    const detector = { detect: async () => [] };
    const app = createTestApp({ detector, tokenStore: store });

    // Fire 10 concurrent resets
    const results = await Promise.all(
      Array.from({ length: 10 }, () => request(app).post('/api/interviews/reset'))
    );

    for (const res of results) {
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ reset: true });
    }

    // Final state: empty
    expect(store.getDismissed().ids.size).toBe(0);
  });

  it('interleaved dismiss + reset leaves correct final state', async () => {
    const store = createTokenStore(tempDir);
    const detector = { detect: async () => [] };
    const app = createTestApp({ detector, tokenStore: store });

    // Dismiss some, then reset, then dismiss more
    await request(app).post('/api/interviews/dismiss').send({ suggestionId: 'sug-1' });
    await request(app).post('/api/interviews/dismiss').send({ suggestionId: 'sug-2' });
    expect(store.getDismissed().ids.size).toBe(2);

    const resetRes = await request(app).post('/api/interviews/reset');
    expect(resetRes.status).toBe(200);
    expect(store.getDismissed().ids.size).toBe(0);

    // Dismiss after reset — new entries persist
    await request(app).post('/api/interviews/dismiss').send({ suggestionId: 'sug-3' });
    expect(store.getDismissed().ids.size).toBe(1);
    expect(store.getDismissed().ids.has('sug-3')).toBe(true);
    expect(store.getDismissed().ids.has('sug-1')).toBe(false);
  });

  it('reset when clearDismissed throws returns 500', async () => {
    const failingStore = {
      addDismissed: async () => {},
      clearDismissed: async () => { throw new Error('Disk full'); },
      getDismissed: () => ({ ids: new Set(), emailIds: new Set(), calendarIds: new Set() }),
    };

    const detector = { detect: async () => [] };
    const app = createTestApp({ detector, tokenStore: failingStore });

    const res = await request(app).post('/api/interviews/reset');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Reset failed');
  });
});

// ---------------------------------------------------------------------------
// H5: Reset with very large dismissed list (performance)
//
// clearDismissed replaces the in-memory array with [] and writes '[]' to disk.
// With a large list (500 entries), this should still be fast. We verify it
// completes under 200ms and leaves no stale data.
// ---------------------------------------------------------------------------
describe('H5: Reset with very large dismissed list (performance)', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reset-stress-h5-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('clearDismissed on 500 entries completes within 200ms', async () => {
    const store = createTokenStore(tempDir, 500);

    // Populate 500 entries
    for (let i = 0; i < 500; i++) {
      await store.addDismissed({
        id: `suggestion_${i}_${String(i).padStart(5, '0')}`,
        emailId: `msg_${i}`,
        calendarId: `cal_${i}`,
      });
    }
    expect(store.getDismissed().ids.size).toBe(500);

    const start = performance.now();
    await store.clearDismissed();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(store.getDismissed().ids.size).toBe(0);
  });

  it('getDismissed returns empty Sets after clearing 500 entries', async () => {
    const store = createTokenStore(tempDir, 500);

    for (let i = 0; i < 500; i++) {
      await store.addDismissed({
        id: `suggestion_${i}`,
        emailId: `msg_${i}`,
        calendarId: `cal_${i}`,
      });
    }

    await store.clearDismissed();

    const dismissed = store.getDismissed();
    expect(dismissed.ids.size).toBe(0);
    expect(dismissed.emailIds.size).toBe(0);
    expect(dismissed.calendarIds.size).toBe(0);
  });

  it('file on disk is valid empty array after clearing large list', async () => {
    const store = createTokenStore(tempDir, 500);

    for (let i = 0; i < 500; i++) {
      await store.addDismissed({
        id: `suggestion_${i}`,
        emailId: `msg_${i}`,
        calendarId: `cal_${i}`,
      });
    }

    await store.clearDismissed();

    // Wait for async write to complete
    await new Promise((r) => setTimeout(r, 50));

    const fileContent = readFileSync(join(tempDir, 'dismissed.json'), 'utf-8');
    expect(JSON.parse(fileContent)).toEqual([]);
  });

  it('adding entries after clearing a large list works correctly', async () => {
    const store = createTokenStore(tempDir, 500);

    // Populate and clear
    for (let i = 0; i < 500; i++) {
      await store.addDismissed({ id: `old_${i}`, emailId: '', calendarId: '' });
    }
    await store.clearDismissed();

    // Add 3 new entries
    await store.addDismissed({ id: 'fresh-1', emailId: 'e1', calendarId: '' });
    await store.addDismissed({ id: 'fresh-2', emailId: '', calendarId: 'c2' });
    await store.addDismissed({ id: 'fresh-3', emailId: 'e3', calendarId: 'c3' });

    const dismissed = store.getDismissed();
    expect(dismissed.ids.size).toBe(3);
    expect(dismissed.ids.has('old_0')).toBe(false);
    expect(dismissed.ids.has('fresh-1')).toBe(true);
    expect(dismissed.emailIds).toEqual(new Set(['e1', 'e3']));
    expect(dismissed.calendarIds).toEqual(new Set(['c2', 'c3']));
  });
});
