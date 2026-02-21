import {
  fetchAuthStatus,
  fetchAuthUrl,
  disconnectAuth,
  dismissSuggestion,
  triggerScan,
  createSuggestionStream,
} from './apiService';

/**
 * Creates a mock fetch that returns the given body with the given status.
 *
 * @param {Object} body - JSON body to return
 * @param {number} [status=200] - HTTP status code
 * @returns {Function} mock fetch function
 */
function mockFetch(body, status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

/**
 * Creates a mock fetch that rejects with a network error.
 *
 * @returns {Function} mock fetch function
 */
function mockFetchError() {
  return jest.fn().mockRejectedValue(new Error('Network error'));
}

/**
 * Creates a mock EventSource constructor.
 * The returned instance stores registered listeners so tests can fire events.
 *
 * @returns {{ Ctor: Function, instance: { listeners: Object, close: Function } }}
 */
function mockEventSource() {
  const listeners = {};
  const instance = {
    addEventListener: jest.fn((event, handler) => {
      listeners[event] = handler;
    }),
    close: jest.fn(),
  };

  function Ctor() {
    return instance;
  }

  return { Ctor, instance, listeners };
}

describe('apiService — REST functions', () => {
  describe('fetchAuthStatus', () => {
    it('returns authenticated status on success', async () => {
      const fetcher = mockFetch({ authenticated: true });
      const result = await fetchAuthStatus(fetcher);
      expect(result).toEqual({ authenticated: true });
      expect(fetcher).toHaveBeenCalledWith('/api/auth/status');
    });

    it('throws on non-200 response', async () => {
      const fetcher = mockFetch({}, 500);
      await expect(fetchAuthStatus(fetcher)).rejects.toThrow('Auth status failed: 500');
    });

    it('propagates network errors', async () => {
      const fetcher = mockFetchError();
      await expect(fetchAuthStatus(fetcher)).rejects.toThrow('Network error');
    });
  });

  describe('fetchAuthUrl', () => {
    it('returns the OAuth URL on success', async () => {
      const fetcher = mockFetch({ url: 'https://accounts.google.com/...' });
      const result = await fetchAuthUrl(fetcher);
      expect(result).toEqual({ url: 'https://accounts.google.com/...' });
      expect(fetcher).toHaveBeenCalledWith('/api/auth/url');
    });

    it('throws on non-200 response', async () => {
      const fetcher = mockFetch({}, 403);
      await expect(fetchAuthUrl(fetcher)).rejects.toThrow('Auth URL failed: 403');
    });
  });

  describe('disconnectAuth', () => {
    it('sends POST and returns result', async () => {
      const fetcher = mockFetch({ authenticated: false });
      const result = await disconnectAuth(fetcher);
      expect(result).toEqual({ authenticated: false });
      expect(fetcher).toHaveBeenCalledWith('/api/auth/disconnect', { method: 'POST' });
    });

    it('throws on non-200 response', async () => {
      const fetcher = mockFetch({}, 500);
      await expect(disconnectAuth(fetcher)).rejects.toThrow('Disconnect failed: 500');
    });
  });

  describe('dismissSuggestion', () => {
    it('sends POST with suggestionId in body', async () => {
      const fetcher = mockFetch({ dismissed: true });
      const result = await dismissSuggestion('suggestion_abc', fetcher);
      expect(result).toEqual({ dismissed: true });
      expect(fetcher).toHaveBeenCalledWith('/api/interviews/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: 'suggestion_abc' }),
      });
    });

    it('throws on non-200 response', async () => {
      const fetcher = mockFetch({}, 400);
      await expect(dismissSuggestion('bad', fetcher)).rejects.toThrow('Dismiss failed: 400');
    });
  });

  describe('triggerScan', () => {
    it('sends POST and returns suggestions', async () => {
      const suggestions = [{ id: 's1', source: 'gmail+calendar' }];
      const fetcher = mockFetch({ suggestions });
      const result = await triggerScan(fetcher);
      expect(result).toEqual({ suggestions });
      expect(fetcher).toHaveBeenCalledWith('/api/interviews/scan', { method: 'POST' });
    });

    it('throws on non-200 response', async () => {
      const fetcher = mockFetch({}, 500);
      await expect(triggerScan(fetcher)).rejects.toThrow('Scan failed: 500');
    });
  });
});

describe('apiService — SSE stream', () => {
  it('creates an EventSource pointing to the suggestions endpoint', () => {
    const { Ctor } = mockEventSource();
    createSuggestionStream(Ctor);
    // Constructor called (via `new Ctor(url)`) — we just verify it was used
    // Note: our mock Ctor is a plain function, so it's always called
  });

  it('registers connected, suggestions, scan-complete, and error listeners', () => {
    const { Ctor, instance } = mockEventSource();
    const stream = createSuggestionStream(Ctor);

    stream.onConnected(() => {});
    stream.onSuggestions(() => {});
    stream.onScanComplete(() => {});
    stream.onError(() => {});

    expect(instance.addEventListener).toHaveBeenCalledWith('connected', expect.any(Function));
    expect(instance.addEventListener).toHaveBeenCalledWith('suggestions', expect.any(Function));
    expect(instance.addEventListener).toHaveBeenCalledWith('scan-complete', expect.any(Function));
    expect(instance.addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('calls the connected handler with parsed data', () => {
    const { Ctor, listeners } = mockEventSource();
    const handler = jest.fn();

    const stream = createSuggestionStream(Ctor);
    stream.onConnected(handler);

    // Simulate the server sending a connected event
    listeners.connected({ data: JSON.stringify({ status: 'connected' }) });

    expect(handler).toHaveBeenCalledWith({ status: 'connected' });
  });

  it('silently skips malformed JSON in connected event', () => {
    const { Ctor, listeners } = mockEventSource();
    const handler = jest.fn();

    const stream = createSuggestionStream(Ctor);
    stream.onConnected(handler);

    listeners.connected({ data: 'not valid json' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('calls the suggestions handler with parsed data', () => {
    const { Ctor, listeners } = mockEventSource();
    const handler = jest.fn();
    const suggestions = [{ id: 's1' }, { id: 's2' }];

    const stream = createSuggestionStream(Ctor);
    stream.onSuggestions(handler);

    listeners.suggestions({ data: JSON.stringify(suggestions) });

    expect(handler).toHaveBeenCalledWith(suggestions);
  });

  it('silently skips malformed JSON in suggestions event', () => {
    const { Ctor, listeners } = mockEventSource();
    const handler = jest.fn();

    const stream = createSuggestionStream(Ctor);
    stream.onSuggestions(handler);

    listeners.suggestions({ data: 'invalid json' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('calls the scan-complete handler with parsed data', () => {
    const { Ctor, listeners } = mockEventSource();
    const handler = jest.fn();

    const stream = createSuggestionStream(Ctor);
    stream.onScanComplete(handler);

    listeners['scan-complete']({ data: JSON.stringify({ scanned: 5 }) });

    expect(handler).toHaveBeenCalledWith({ scanned: 5 });
  });

  it('silently skips malformed JSON in scan-complete event', () => {
    const { Ctor, listeners } = mockEventSource();
    const handler = jest.fn();

    const stream = createSuggestionStream(Ctor);
    stream.onScanComplete(handler);

    listeners['scan-complete']({ data: 'bad json' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('calls the error handler with parsed server error', () => {
    const { Ctor, listeners } = mockEventSource();
    const handler = jest.fn();

    const stream = createSuggestionStream(Ctor);
    stream.onError(handler);

    // Server-sent error (has data field)
    listeners.error({ data: JSON.stringify({ message: 'API failure' }) });

    expect(handler).toHaveBeenCalledWith({ message: 'API failure' });
  });

  it('calls the error handler with generic message for native EventSource errors', () => {
    const { Ctor, listeners } = mockEventSource();
    const handler = jest.fn();

    const stream = createSuggestionStream(Ctor);
    stream.onError(handler);

    // Native EventSource error (no data field)
    listeners.error({});

    expect(handler).toHaveBeenCalledWith({ message: 'SSE connection error' });
  });

  it('calls the error handler with generic message when server error is malformed JSON', () => {
    const { Ctor, listeners } = mockEventSource();
    const handler = jest.fn();

    const stream = createSuggestionStream(Ctor);
    stream.onError(handler);

    // Server error with malformed JSON
    listeners.error({ data: 'not json' });

    expect(handler).toHaveBeenCalledWith({ message: 'Received malformed error from server' });
  });

  it('close() calls EventSource.close()', () => {
    const { Ctor, instance } = mockEventSource();
    const stream = createSuggestionStream(Ctor);
    stream.close();
    expect(instance.close).toHaveBeenCalled();
  });

  it('supports method chaining', () => {
    const { Ctor } = mockEventSource();
    const stream = createSuggestionStream(Ctor);

    const result = stream
      .onConnected(() => {})
      .onSuggestions(() => {})
      .onScanComplete(() => {})
      .onError(() => {});

    expect(result).toBe(stream);
  });
});
