import { renderHook, act } from '@testing-library/react';
import { useCloudSync } from './useCloudSync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock API service with controllable return values.
 */
function createMockApi(overrides = {}) {
  return {
    fetchBackupStatus: vi.fn().mockResolvedValue({ backups: [] }),
    saveToDrive: vi.fn().mockResolvedValue({
      saved: true,
      savedAt: '2026-02-22T10:00:00Z',
      backups: [{ fileId: 'f1', savedAt: '2026-02-22T10:00:00Z' }],
    }),
    loadFromDrive: vi.fn().mockResolvedValue({
      version: 1,
      savedAt: '2026-02-22T10:00:00Z',
      companies: [{ id: '1', name: 'Acme', position: 'SWE', stage: 'applied', interviews: [] }],
      seenQuestions: ['q1'],
    }),
    ...overrides,
  };
}

function setup(overrides = {}) {
  const api = createMockApi(overrides.apiOverrides);
  const replaceCompanies = vi.fn();
  const replaceSeenQuestions = vi.fn();
  const companies = overrides.companies || [];
  const seenQuestions = overrides.seenQuestions || new Set();
  const authStatus = overrides.authStatus || 'unauthenticated';

  const { result } = renderHook(() =>
    useCloudSync({
      api,
      replaceCompanies,
      replaceSeenQuestions,
      companies,
      seenQuestions,
      authStatus,
    })
  );

  return { result, api, replaceCompanies, replaceSeenQuestions };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('useCloudSync — initial state', () => {
  it('starts with idle syncStatus', () => {
    const { result } = setup();
    expect(result.current.syncStatus).toBe('idle');
  });

  it('starts with null lastSaved', () => {
    const { result } = setup();
    expect(result.current.lastSaved).toBeNull();
  });

  it('starts with null syncError', () => {
    const { result } = setup();
    expect(result.current.syncError).toBeNull();
  });

  it('starts with empty backups array', () => {
    const { result } = setup();
    expect(result.current.backups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Backup status check on mount
// ---------------------------------------------------------------------------

describe('useCloudSync — backup status check', () => {
  it('fetches backup status when authenticated', async () => {
    const { api } = setup({
      authStatus: 'authenticated',
      apiOverrides: {
        fetchBackupStatus: vi.fn().mockResolvedValue({ backups: [{ fileId: 'f1', savedAt: '2026-01-01T00:00:00Z' }] }),
      },
    });

    // Wait for effect to run
    await act(async () => {});

    expect(api.fetchBackupStatus).toHaveBeenCalled();
  });

  it('populates backups array when authenticated', async () => {
    const { result } = setup({
      authStatus: 'authenticated',
      apiOverrides: {
        fetchBackupStatus: vi.fn().mockResolvedValue({
          backups: [
            { fileId: 'f1', savedAt: '2026-02-22T10:00:00Z' },
            { fileId: 'f2', savedAt: '2026-02-21T10:00:00Z' },
          ],
        }),
      },
    });

    await act(async () => {});

    expect(result.current.backups).toEqual([
      { fileId: 'f1', savedAt: '2026-02-22T10:00:00Z' },
      { fileId: 'f2', savedAt: '2026-02-21T10:00:00Z' },
    ]);
  });

  it('derives lastSaved from the first backup', async () => {
    const { result } = setup({
      authStatus: 'authenticated',
      apiOverrides: {
        fetchBackupStatus: vi.fn().mockResolvedValue({
          backups: [{ fileId: 'f1', savedAt: '2026-01-01T00:00:00Z' }],
        }),
      },
    });

    await act(async () => {});

    expect(result.current.lastSaved).toBe('2026-01-01T00:00:00Z');
  });

  it('does not fetch backup status when unauthenticated', async () => {
    const { api } = setup({ authStatus: 'unauthenticated' });

    await act(async () => {});

    expect(api.fetchBackupStatus).not.toHaveBeenCalled();
  });

  it('silently ignores backup status fetch errors', async () => {
    const { result } = setup({
      authStatus: 'authenticated',
      apiOverrides: {
        fetchBackupStatus: vi.fn().mockRejectedValue(new Error('Network error')),
      },
    });

    await act(async () => {});

    expect(result.current.syncStatus).toBe('idle');
    expect(result.current.syncError).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// saveToDrive
// ---------------------------------------------------------------------------

describe('useCloudSync — saveToDrive', () => {
  it('sends companies and seenQuestions to the API', async () => {
    const companies = [{ id: '1', name: 'Google', position: 'SWE', stage: 'applied', interviews: [] }];
    const seenQuestions = new Set(['q1', 'q2']);

    const { result, api } = setup({ companies, seenQuestions, authStatus: 'authenticated' });

    await act(async () => { await result.current.saveToDrive(); });

    expect(api.saveToDrive).toHaveBeenCalledWith({
      companies,
      seenQuestions: ['q1', 'q2'],
    });
  });

  it('updates backups from response', async () => {
    const { result } = setup({ authStatus: 'authenticated' });

    await act(async () => { await result.current.saveToDrive(); });

    expect(result.current.backups).toEqual([
      { fileId: 'f1', savedAt: '2026-02-22T10:00:00Z' },
    ]);
  });

  it('derives lastSaved from updated backups', async () => {
    const { result } = setup({ authStatus: 'authenticated' });

    await act(async () => { await result.current.saveToDrive(); });

    expect(result.current.lastSaved).toBe('2026-02-22T10:00:00Z');
  });

  it('sets syncStatus to success after save', async () => {
    const { result } = setup({ authStatus: 'authenticated' });

    await act(async () => { await result.current.saveToDrive(); });

    expect(result.current.syncStatus).toBe('success');
  });

  it('sets syncStatus to error on failure', async () => {
    const { result } = setup({
      authStatus: 'authenticated',
      apiOverrides: {
        saveToDrive: vi.fn().mockRejectedValue(new Error('Upload failed')),
      },
    });

    await act(async () => { await result.current.saveToDrive(); });

    expect(result.current.syncStatus).toBe('error');
    expect(result.current.syncError).toBe('Upload failed');
  });
});

// ---------------------------------------------------------------------------
// loadFromDrive
// ---------------------------------------------------------------------------

describe('useCloudSync — loadFromDrive', () => {
  it('passes fileId to api.loadFromDrive', async () => {
    const { result, api } = setup({ authStatus: 'authenticated' });

    await act(async () => { await result.current.loadFromDrive('file-abc'); });

    expect(api.loadFromDrive).toHaveBeenCalledWith('file-abc');
  });

  it('calls replaceCompanies and replaceSeenQuestions with loaded data', async () => {
    const { result, replaceCompanies, replaceSeenQuestions } = setup({ authStatus: 'authenticated' });

    await act(async () => { await result.current.loadFromDrive('file-abc'); });

    expect(replaceCompanies).toHaveBeenCalledWith([
      { id: '1', name: 'Acme', position: 'SWE', stage: 'applied', interviews: [] },
    ]);
    expect(replaceSeenQuestions).toHaveBeenCalledWith(['q1']);
  });

  it('sets syncStatus to success after load', async () => {
    const { result } = setup({ authStatus: 'authenticated' });

    await act(async () => { await result.current.loadFromDrive('file-abc'); });

    expect(result.current.syncStatus).toBe('success');
  });

  it('sets error when no backup exists', async () => {
    const { result } = setup({
      authStatus: 'authenticated',
      apiOverrides: {
        loadFromDrive: vi.fn().mockResolvedValue({ exists: false }),
      },
    });

    await act(async () => { await result.current.loadFromDrive('file-abc'); });

    expect(result.current.syncStatus).toBe('error');
    expect(result.current.syncError).toBe('No backup found on Google Drive');
  });

  it('sets syncStatus to error on API failure', async () => {
    const { result } = setup({
      authStatus: 'authenticated',
      apiOverrides: {
        loadFromDrive: vi.fn().mockRejectedValue(new Error('Download failed')),
      },
    });

    await act(async () => { await result.current.loadFromDrive('file-abc'); });

    expect(result.current.syncStatus).toBe('error');
    expect(result.current.syncError).toBe('Download failed');
  });

  it('does not call replace functions when no backup exists', async () => {
    const { result, replaceCompanies, replaceSeenQuestions } = setup({
      authStatus: 'authenticated',
      apiOverrides: {
        loadFromDrive: vi.fn().mockResolvedValue({ exists: false }),
      },
    });

    await act(async () => { await result.current.loadFromDrive('file-abc'); });

    expect(replaceCompanies).not.toHaveBeenCalled();
    expect(replaceSeenQuestions).not.toHaveBeenCalled();
  });
});
