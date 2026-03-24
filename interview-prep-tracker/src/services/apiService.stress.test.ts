/**
 * Stress tests for apiService TypeScript migration.
 *
 * Hypotheses tested:
 *   H3 — saveToDrive / loadFromDrive / fetchBackupStatus have zero test
 *         coverage and may contain type coercion or serialisation bugs.
 *   H4 — SSE onConnected handler fires twice when onopen fires and then
 *         onConnected is called (double-dispatch race condition).
 *   H5 — loadFromDrive fails to properly encode special characters in fileId.
 */
import {
  saveToDrive,
  loadFromDrive,
  fetchBackupStatus,
  createSuggestionStream,
} from './apiService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

function mockFetchError() {
  return vi.fn().mockRejectedValue(new Error('Network error'));
}

function mockEventSource() {
  const listeners: Record<string, (e: unknown) => void> = {};
  const instance: Record<string, unknown> & {
    addEventListener: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    onopen: ((this: EventSource, ev: Event) => unknown) | null;
    readyState: number;
  } = {
    addEventListener: vi.fn((event: string, handler: (e: unknown) => void) => {
      listeners[event] = handler;
    }),
    close: vi.fn(),
    onopen: null,
    readyState: 0,
  };

  function Ctor() {
    return instance;
  }

  return { Ctor: Ctor as unknown as typeof EventSource, instance, listeners };
}

// ---------------------------------------------------------------------------
// H3: Drive functions — basic coverage
// ---------------------------------------------------------------------------

describe('H3 — saveToDrive', () => {
  it('sends POST with JSON body and returns result', async () => {
    const payload = {
      companies: [{ id: '1', name: 'Acme', position: 'SWE', stage: 'applied' as const, pipeline: ['us' as const], interviews: [], notes: '', createdAt: '2024-01-01' }],
      seenQuestions: ['q1', 'q2'],
    };
    const response = { saved: true, savedAt: '2024-01-01T00:00:00Z', backups: [] };
    const fetcher = mockFetch(response);

    const result = await saveToDrive(payload, fetcher);

    expect(result).toEqual(response);
    expect(fetcher).toHaveBeenCalledWith('/api/sync/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });

  it('throws on non-200 response', async () => {
    const fetcher = mockFetch({}, 500);
    await expect(
      saveToDrive({ companies: [], seenQuestions: [] }, fetcher),
    ).rejects.toThrow('Save to Drive failed: 500');
  });

  it('propagates network errors', async () => {
    const fetcher = mockFetchError();
    await expect(
      saveToDrive({ companies: [], seenQuestions: [] }, fetcher),
    ).rejects.toThrow('Network error');
  });
});

describe('H3 — loadFromDrive', () => {
  it('sends GET with fileId query param and returns result', async () => {
    const response = { companies: [], seenQuestions: [] };
    const fetcher = mockFetch(response);

    const result = await loadFromDrive('file_abc', fetcher);

    expect(result).toEqual(response);
    expect(fetcher).toHaveBeenCalledWith('/api/sync/load?fileId=file_abc');
  });

  it('throws on non-200 response', async () => {
    const fetcher = mockFetch({}, 404);
    await expect(loadFromDrive('bad_id', fetcher)).rejects.toThrow(
      'Load from Drive failed: 404',
    );
  });

  it('propagates network errors', async () => {
    const fetcher = mockFetchError();
    await expect(loadFromDrive('any', fetcher)).rejects.toThrow('Network error');
  });
});

describe('H3 — fetchBackupStatus', () => {
  it('sends GET and returns backup list', async () => {
    const response = { backups: [{ fileId: 'f1', savedAt: '2024-01-01T00:00:00Z' }] };
    const fetcher = mockFetch(response);

    const result = await fetchBackupStatus(fetcher);

    expect(result).toEqual(response);
    expect(fetcher).toHaveBeenCalledWith('/api/sync/status');
  });

  it('throws on non-200 response', async () => {
    const fetcher = mockFetch({}, 500);
    await expect(fetchBackupStatus(fetcher)).rejects.toThrow(
      'Backup status failed: 500',
    );
  });

  it('propagates network errors', async () => {
    const fetcher = mockFetchError();
    await expect(fetchBackupStatus(fetcher)).rejects.toThrow('Network error');
  });
});

// ---------------------------------------------------------------------------
// H4: SSE onConnected double-dispatch
// ---------------------------------------------------------------------------

describe('H4 — onConnected does not fire the handler twice', () => {
  it('handler fires exactly once when onopen fires before onConnected is called', () => {
    const { Ctor, instance } = mockEventSource();
    const handler = vi.fn();

    const stream = createSuggestionStream(Ctor);

    // onopen fires first (no handler registered yet)
    instance.onopen!.call(instance as unknown as EventSource, new Event('open'));

    // Now register handler — should fire immediately via isOpen() check
    stream.onConnected(handler);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handler fires exactly once when onopen fires after onConnected is called', () => {
    const { Ctor, instance } = mockEventSource();
    const handler = vi.fn();

    const stream = createSuggestionStream(Ctor);
    stream.onConnected(handler);

    // onopen fires after handler is registered
    instance.onopen!.call(instance as unknown as EventSource, new Event('open'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handler fires exactly once when readyState is already OPEN and onopen also fires', () => {
    const { Ctor, instance } = mockEventSource();
    const handler = vi.fn();

    // readyState is already OPEN before stream is created
    instance.readyState = 1;

    const stream = createSuggestionStream(Ctor);
    stream.onConnected(handler);

    // Suppose onopen also fires later (shouldn't happen normally, but test resilience)
    instance.onopen!.call(instance as unknown as EventSource, new Event('open'));

    // Handler was already called once via isOpen() in onConnected.
    // After the fix: onConnected sets opened=true when isOpen() detects
    // readyState=1, so onopen's guard sees opened is already true and
    // does not double-fire.
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('replacing the handler via a second onConnected call does not cause old handler to fire', () => {
    const { Ctor, instance } = mockEventSource();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const stream = createSuggestionStream(Ctor);
    stream.onConnected(handler1);
    stream.onConnected(handler2);

    instance.onopen!.call(instance as unknown as EventSource, new Event('open'));

    // Only handler2 should fire (handler1 was replaced)
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// H5: loadFromDrive — special characters in fileId
// ---------------------------------------------------------------------------

describe('H5 — loadFromDrive encodes special characters in fileId', () => {
  it('encodes spaces', async () => {
    const fetcher = mockFetch({ companies: [], seenQuestions: [] });
    await loadFromDrive('file with spaces', fetcher);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/sync/load?fileId=file%20with%20spaces',
    );
  });

  it('encodes ampersands and equals signs', async () => {
    const fetcher = mockFetch({ companies: [], seenQuestions: [] });
    await loadFromDrive('id&extra=param', fetcher);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/sync/load?fileId=id%26extra%3Dparam',
    );
  });

  it('encodes unicode characters', async () => {
    const fetcher = mockFetch({ companies: [], seenQuestions: [] });
    await loadFromDrive('file-id-with-emoji-\u{1F600}', fetcher);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/sync/load?fileId=${encodeURIComponent('file-id-with-emoji-\u{1F600}')}`,
    );
  });

  it('handles already-encoded characters without double-encoding', async () => {
    const fetcher = mockFetch({ companies: [], seenQuestions: [] });
    // Pass a string that contains %20 — encodeURIComponent should encode the %
    await loadFromDrive('file%20id', fetcher);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/sync/load?fileId=file%2520id',
    );
  });
});
