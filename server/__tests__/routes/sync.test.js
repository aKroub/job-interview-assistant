import { describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createSyncRouter } from '../../src/routes/sync.js';

/**
 * Creates a mock Google Auth service for testing routes in isolation.
 */
function createMockGoogleAuth(overrides = {}) {
  let authenticated = false;

  return {
    isAuthenticated: () => authenticated,
    _setAuthenticated: (val) => { authenticated = val; },
    ...overrides,
  };
}

/**
 * Creates a mock Drive service with controllable return values.
 */
function createMockDriveService(overrides = {}) {
  return {
    listBackups: async () => ({ backups: [] }),
    saveState: async () => ({ saved: true, fileId: 'file-123' }),
    loadState: async () => null,
    ...overrides,
  };
}

/**
 * Creates a test Express app with the sync router mounted.
 */
function createTestApp(driveService, googleAuth) {
  const app = express();
  app.use(express.json());
  app.use('/api/sync', createSyncRouter({ driveService, googleAuth }));
  return app;
}

describe('Sync routes', () => {
  let googleAuth;
  let driveService;
  let app;

  beforeEach(() => {
    googleAuth = createMockGoogleAuth();
    driveService = createMockDriveService();
    app = createTestApp(driveService, googleAuth);
  });

  describe('auth guard', () => {
    it('GET /api/sync/status returns 401 when not authenticated', async () => {
      const res = await request(app).get('/api/sync/status');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Not authenticated' });
    });

    it('POST /api/sync/save returns 401 when not authenticated', async () => {
      const res = await request(app)
        .post('/api/sync/save')
        .send({ companies: [], seenQuestions: [] });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Not authenticated' });
    });

    it('GET /api/sync/load returns 401 when not authenticated', async () => {
      const res = await request(app).get('/api/sync/load?fileId=abc');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Not authenticated' });
    });
  });

  describe('GET /api/sync/status', () => {
    it('returns backups array when authenticated', async () => {
      googleAuth._setAuthenticated(true);
      driveService.listBackups = async () => ({
        backups: [
          { fileId: 'f1', savedAt: '2026-02-22T10:00:00Z' },
          { fileId: 'f2', savedAt: '2026-02-21T10:00:00Z' },
        ],
      });

      const res = await request(app).get('/api/sync/status');

      expect(res.status).toBe(200);
      expect(res.body.backups).toEqual([
        { fileId: 'f1', savedAt: '2026-02-22T10:00:00Z' },
        { fileId: 'f2', savedAt: '2026-02-21T10:00:00Z' },
      ]);
    });

    it('returns empty backups when no files exist', async () => {
      googleAuth._setAuthenticated(true);

      const res = await request(app).get('/api/sync/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ backups: [] });
    });

    it('returns 500 when Drive API fails', async () => {
      googleAuth._setAuthenticated(true);
      driveService.listBackups = async () => { throw new Error('Drive unavailable'); };

      const res = await request(app).get('/api/sync/status');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Drive unavailable' });
    });
  });

  describe('POST /api/sync/save', () => {
    it('saves state and returns savedAt with updated backups list', async () => {
      googleAuth._setAuthenticated(true);
      driveService.listBackups = async () => ({
        backups: [{ fileId: 'f-new', savedAt: '2026-02-22T10:00:00Z' }],
      });

      const res = await request(app)
        .post('/api/sync/save')
        .send({
          companies: [{ id: '1', name: 'Acme' }],
          seenQuestions: ['q1'],
        });

      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(true);
      expect(res.body.savedAt).toBeDefined();
      expect(res.body.backups).toEqual([
        { fileId: 'f-new', savedAt: '2026-02-22T10:00:00Z' },
      ]);
    });

    it('passes version and savedAt in the payload to driveService', async () => {
      googleAuth._setAuthenticated(true);
      let receivedPayload = null;
      driveService.saveState = async (data) => {
        receivedPayload = data;
        return { saved: true, fileId: 'f1' };
      };

      await request(app)
        .post('/api/sync/save')
        .send({ companies: [{ id: '1' }], seenQuestions: ['q1'] });

      expect(receivedPayload.version).toBe(1);
      expect(receivedPayload.savedAt).toBeDefined();
      expect(receivedPayload.companies).toEqual([{ id: '1' }]);
      expect(receivedPayload.seenQuestions).toEqual(['q1']);
    });

    it('returns 400 when companies is not an array', async () => {
      googleAuth._setAuthenticated(true);

      const res = await request(app)
        .post('/api/sync/save')
        .send({ companies: 'not-array', seenQuestions: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('must be arrays');
    });

    it('returns 400 when seenQuestions is not an array', async () => {
      googleAuth._setAuthenticated(true);

      const res = await request(app)
        .post('/api/sync/save')
        .send({ companies: [], seenQuestions: null });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('must be arrays');
    });

    it('returns 500 when Drive API fails', async () => {
      googleAuth._setAuthenticated(true);
      driveService.saveState = async () => { throw new Error('Upload failed'); };

      const res = await request(app)
        .post('/api/sync/save')
        .send({ companies: [], seenQuestions: [] });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Upload failed' });
    });
  });

  describe('GET /api/sync/load', () => {
    it('returns 400 when fileId query param is missing', async () => {
      googleAuth._setAuthenticated(true);

      const res = await request(app).get('/api/sync/load');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('fileId');
    });

    it('returns state data for a valid fileId', async () => {
      googleAuth._setAuthenticated(true);
      const storedState = {
        version: 1,
        savedAt: '2026-02-22T10:00:00Z',
        companies: [{ id: '1', name: 'Acme' }],
        seenQuestions: ['q1'],
      };
      driveService.loadState = async (fileId) => {
        expect(fileId).toBe('file-abc');
        return storedState;
      };

      const res = await request(app).get('/api/sync/load?fileId=file-abc');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(storedState);
    });

    it('returns { exists: false } when loadState returns null', async () => {
      googleAuth._setAuthenticated(true);
      driveService.loadState = async () => null;

      const res = await request(app).get('/api/sync/load?fileId=nonexistent');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ exists: false });
    });

    it('returns 500 when Drive API fails', async () => {
      googleAuth._setAuthenticated(true);
      driveService.loadState = async () => { throw new Error('Download failed'); };

      const res = await request(app).get('/api/sync/load?fileId=file-abc');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Download failed' });
    });
  });
});
