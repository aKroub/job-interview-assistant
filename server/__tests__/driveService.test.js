import { describe, it, expect } from '@jest/globals';
import { createDriveService } from '../src/services/driveService.js';

const SAMPLE_STATE = {
  version: 1,
  savedAt: '2026-02-22T10:00:00.000Z',
  companies: [{ id: '1', name: 'Acme', position: 'SWE', stage: 'applied', interviews: [] }],
  seenQuestions: ['q1', 'q2'],
};

/**
 * Creates a mock Drive API for testing.
 *
 * @param {Object[]} [files] - files returned by list
 * @param {Object} [getContent] - content returned by get (alt: media)
 * @returns {Object} mock Drive API
 */
function createMockDriveApi(files = [], getContent = null) {
  const deletedIds = [];

  return {
    _deletedIds: deletedIds,
    files: {
      list: async () => ({ data: { files } }),
      create: async ({ requestBody, media }) => ({
        data: { id: 'new-file-id', name: requestBody.name, mimeType: media.mimeType },
      }),
      get: async () => ({ data: getContent }),
      delete: async ({ fileId }) => { deletedIds.push(fileId); },
    },
  };
}

describe('createDriveService', () => {
  describe('saveState', () => {
    it('always creates a new file with timestamped name', async () => {
      const calls = [];
      const driveApi = {
        files: {
          list: async () => ({ data: { files: [] } }),
          create: async (params) => {
            calls.push(params);
            return { data: { id: 'new-id' } };
          },
          get: async () => ({}),
          delete: async () => {},
        },
      };

      const service = createDriveService({}, { driveApi });
      const result = await service.saveState(SAMPLE_STATE);

      expect(result).toEqual({ saved: true, fileId: 'new-id' });
      expect(calls.length).toBe(1);
      expect(calls[0].requestBody.name).toBe('interview-tracker-state-2026-02-22T10-00-00.000Z.json');
      expect(calls[0].media.mimeType).toBe('application/json');
    });

    it('prunes old backups beyond the 5 most recent', async () => {
      const files = [
        { id: 'f1', name: 'interview-tracker-state-2026-02-06.json', createdTime: '2026-02-06' },
        { id: 'f2', name: 'interview-tracker-state-2026-02-05.json', createdTime: '2026-02-05' },
        { id: 'f3', name: 'interview-tracker-state-2026-02-04.json', createdTime: '2026-02-04' },
        { id: 'f4', name: 'interview-tracker-state-2026-02-03.json', createdTime: '2026-02-03' },
        { id: 'f5', name: 'interview-tracker-state-2026-02-02.json', createdTime: '2026-02-02' },
        { id: 'f6', name: 'interview-tracker-state-2026-02-01.json', createdTime: '2026-02-01' },
      ];
      const deletedIds = [];
      const driveApi = {
        files: {
          list: async () => ({ data: { files } }),
          create: async () => ({ data: { id: 'new-id' } }),
          get: async () => ({}),
          delete: async ({ fileId }) => { deletedIds.push(fileId); },
        },
      };

      const service = createDriveService({}, { driveApi });
      await service.saveState(SAMPLE_STATE);

      expect(deletedIds).toEqual(['f6']);
    });

    it('does not prune when 5 or fewer backups exist', async () => {
      const files = [
        { id: 'f1', name: 'n1.json', createdTime: '2026-02-05' },
        { id: 'f2', name: 'n2.json', createdTime: '2026-02-04' },
        { id: 'f3', name: 'n3.json', createdTime: '2026-02-03' },
      ];
      const driveApi = createMockDriveApi(files);

      const service = createDriveService({}, { driveApi });
      await service.saveState(SAMPLE_STATE);

      expect(driveApi._deletedIds).toEqual([]);
    });

    it('propagates Drive API errors', async () => {
      const driveApi = {
        files: {
          list: async () => { throw new Error('Drive quota exceeded'); },
          create: async () => {},
          get: async () => {},
          delete: async () => {},
        },
      };

      const service = createDriveService({}, { driveApi });
      await expect(service.saveState(SAMPLE_STATE)).rejects.toThrow('Drive quota exceeded');
    });
  });

  describe('loadState', () => {
    it('downloads content for the given fileId', async () => {
      const getCalls = [];
      const driveApi = {
        files: {
          list: async () => ({ data: { files: [] } }),
          create: async () => ({ data: { id: 'new-id' } }),
          get: async (params) => {
            getCalls.push(params);
            return { data: SAMPLE_STATE };
          },
          delete: async () => {},
        },
      };

      const service = createDriveService({}, { driveApi });
      const result = await service.loadState('file-abc');

      expect(result).toEqual(SAMPLE_STATE);
      expect(getCalls[0].fileId).toBe('file-abc');
      expect(getCalls[0].alt).toBe('media');
    });

    it('propagates Drive API errors on file get', async () => {
      const driveApi = {
        files: {
          list: async () => ({ data: { files: [] } }),
          get: async () => { throw new Error('Network timeout'); },
          create: async () => {},
          delete: async () => {},
        },
      };

      const service = createDriveService({}, { driveApi });
      await expect(service.loadState('file-xyz')).rejects.toThrow('Network timeout');
    });
  });

  describe('listBackups', () => {
    it('returns empty backups array when no files exist', async () => {
      const driveApi = createMockDriveApi([]);

      const service = createDriveService({}, { driveApi });
      const result = await service.listBackups();

      expect(result).toEqual({ backups: [] });
    });

    it('returns backups sorted newest-first with fileId and savedAt', async () => {
      const files = [
        { id: 'f1', name: 'n1.json', createdTime: '2026-02-22T10:00:00Z' },
        { id: 'f2', name: 'n2.json', createdTime: '2026-02-21T10:00:00Z' },
        { id: 'f3', name: 'n3.json', createdTime: '2026-02-20T10:00:00Z' },
      ];
      const driveApi = createMockDriveApi(files);

      const service = createDriveService({}, { driveApi });
      const result = await service.listBackups();

      expect(result.backups).toEqual([
        { fileId: 'f1', savedAt: '2026-02-22T10:00:00Z' },
        { fileId: 'f2', savedAt: '2026-02-21T10:00:00Z' },
        { fileId: 'f3', savedAt: '2026-02-20T10:00:00Z' },
      ]);
    });

    it('limits results to 5 backups even if more files exist', async () => {
      const files = Array.from({ length: 8 }, (_, i) => ({
        id: `f${i}`,
        name: `n${i}.json`,
        createdTime: `2026-02-${String(22 - i).padStart(2, '0')}T10:00:00Z`,
      }));
      const driveApi = createMockDriveApi(files);

      const service = createDriveService({}, { driveApi });
      const result = await service.listBackups();

      expect(result.backups.length).toBe(5);
      expect(result.backups[0].fileId).toBe('f0');
      expect(result.backups[4].fileId).toBe('f4');
    });

    it('propagates Drive API errors', async () => {
      const driveApi = {
        files: {
          list: async () => { throw new Error('Auth expired'); },
          create: async () => {},
          get: async () => {},
          delete: async () => {},
        },
      };

      const service = createDriveService({}, { driveApi });
      await expect(service.listBackups()).rejects.toThrow('Auth expired');
    });
  });
});
