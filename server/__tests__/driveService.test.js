import { describe, it, expect } from '@jest/globals';
import { createDriveService } from '../src/services/driveService.js';

/**
 * Creates a mock Drive API with controllable file list and content.
 *
 * @param {Object[]} [files] - existing files to return from list
 * @param {Object} [fileContent] - content to return from get (alt: media)
 * @returns {Object} mock Drive API matching googleapis drive.files shape
 */
function createMockDriveApi(files = [], fileContent = null) {
  return {
    files: {
      list: async () => ({ data: { files } }),
      create: async ({ requestBody, media }) => ({
        data: { id: 'new-file-id', name: requestBody.name, mimeType: media.mimeType },
      }),
      update: async () => ({ data: { id: files[0]?.id || 'updated-id' } }),
      get: async () => ({ data: fileContent }),
    },
  };
}

const SAMPLE_STATE = {
  version: 1,
  savedAt: '2026-02-22T10:00:00.000Z',
  companies: [{ id: '1', name: 'Acme', position: 'SWE', stage: 'applied', interviews: [] }],
  seenQuestions: ['q1', 'q2'],
};

describe('createDriveService', () => {
  describe('saveState', () => {
    it('creates a new file when no backup exists', async () => {
      const calls = [];
      const driveApi = {
        files: {
          list: async () => ({ data: { files: [] } }),
          create: async (params) => {
            calls.push({ method: 'create', params });
            return { data: { id: 'new-id' } };
          },
          update: async () => { throw new Error('should not be called'); },
          get: async () => { throw new Error('should not be called'); },
        },
      };

      const service = createDriveService({}, { driveApi });
      const result = await service.saveState(SAMPLE_STATE);

      expect(result).toEqual({ saved: true, fileId: 'new-id' });
      expect(calls.length).toBe(1);
      expect(calls[0].params.requestBody.name).toBe('interview-tracker-state.json');
      expect(calls[0].params.media.mimeType).toBe('application/json');
    });

    it('updates the existing file when a backup already exists', async () => {
      const calls = [];
      const driveApi = {
        files: {
          list: async () => ({ data: { files: [{ id: 'existing-id', modifiedTime: '2026-01-01' }] } }),
          create: async () => { throw new Error('should not be called'); },
          update: async (params) => {
            calls.push({ method: 'update', params });
            return { data: { id: 'existing-id' } };
          },
          get: async () => { throw new Error('should not be called'); },
        },
      };

      const service = createDriveService({}, { driveApi });
      const result = await service.saveState(SAMPLE_STATE);

      expect(result).toEqual({ saved: true, fileId: 'existing-id' });
      expect(calls.length).toBe(1);
      expect(calls[0].params.fileId).toBe('existing-id');
      expect(calls[0].params.media.mimeType).toBe('application/json');
    });

    it('propagates Drive API errors', async () => {
      const driveApi = {
        files: {
          list: async () => { throw new Error('Drive quota exceeded'); },
          create: async () => {},
          update: async () => {},
          get: async () => {},
        },
      };

      const service = createDriveService({}, { driveApi });
      await expect(service.saveState(SAMPLE_STATE)).rejects.toThrow('Drive quota exceeded');
    });
  });

  describe('loadState', () => {
    it('returns parsed content when backup exists', async () => {
      const driveApi = createMockDriveApi(
        [{ id: 'file-1', modifiedTime: '2026-02-22T10:00:00Z' }],
        SAMPLE_STATE
      );

      const service = createDriveService({}, { driveApi });
      const result = await service.loadState();

      expect(result).toEqual(SAMPLE_STATE);
    });

    it('returns null when no backup exists', async () => {
      const driveApi = createMockDriveApi([], null);

      const service = createDriveService({}, { driveApi });
      const result = await service.loadState();

      expect(result).toBeNull();
    });

    it('propagates Drive API errors on file get', async () => {
      const driveApi = {
        files: {
          list: async () => ({ data: { files: [{ id: 'file-1', modifiedTime: '2026-01-01' }] } }),
          get: async () => { throw new Error('Network timeout'); },
          create: async () => {},
          update: async () => {},
        },
      };

      const service = createDriveService({}, { driveApi });
      await expect(service.loadState()).rejects.toThrow('Network timeout');
    });
  });

  describe('getBackupInfo', () => {
    it('returns exists: true with lastSaved when backup exists', async () => {
      const driveApi = createMockDriveApi([
        { id: 'file-1', modifiedTime: '2026-02-22T10:00:00Z' },
      ]);

      const service = createDriveService({}, { driveApi });
      const result = await service.getBackupInfo();

      expect(result).toEqual({ exists: true, lastSaved: '2026-02-22T10:00:00Z' });
    });

    it('returns exists: false with null lastSaved when no backup', async () => {
      const driveApi = createMockDriveApi([]);

      const service = createDriveService({}, { driveApi });
      const result = await service.getBackupInfo();

      expect(result).toEqual({ exists: false, lastSaved: null });
    });

    it('propagates Drive API errors', async () => {
      const driveApi = {
        files: {
          list: async () => { throw new Error('Auth expired'); },
          create: async () => {},
          update: async () => {},
          get: async () => {},
        },
      };

      const service = createDriveService({}, { driveApi });
      await expect(service.getBackupInfo()).rejects.toThrow('Auth expired');
    });
  });
});
