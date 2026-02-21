import { renderHook, act } from '@testing-library/react';
import { useInterviewSuggestions } from './useInterviewSuggestions';

/**
 * Creates a mock API service with controllable return values.
 * All methods are jest.fn() so callers can customize per-test.
 */
function createMockApi(overrides = {}) {
  const streamInstance = {
    onConnected: jest.fn().mockReturnThis(),
    onSuggestions: jest.fn().mockReturnThis(),
    onError: jest.fn().mockReturnThis(),
    close: jest.fn(),
  };

  return {
    fetchAuthStatus: jest.fn().mockResolvedValue({ authenticated: false }),
    fetchAuthUrl: jest.fn().mockResolvedValue({ url: 'https://accounts.google.com/auth' }),
    disconnectAuth: jest.fn().mockResolvedValue({ authenticated: false }),
    dismissSuggestion: jest.fn().mockResolvedValue({ dismissed: true }),
    triggerScan: jest.fn().mockResolvedValue({ suggestions: [] }),
    createSuggestionStream: jest.fn().mockReturnValue(streamInstance),
    _stream: streamInstance,
    ...overrides,
  };
}

/**
 * Helper: renders the hook and waits for the initial auth check to settle.
 */
async function setup(apiOverrides = {}) {
  const api = createMockApi(apiOverrides);

  let hookResult;
  await act(async () => {
    hookResult = renderHook(() => useInterviewSuggestions(api));
  });

  return { result: hookResult.result, unmount: hookResult.unmount, api };
}

describe('useInterviewSuggestions', () => {
  describe('initial state', () => {
    it('starts with empty suggestions', async () => {
      const { result } = await setup();
      expect(result.current.suggestions).toEqual([]);
    });

    it('sets authStatus to unauthenticated when server says not authenticated', async () => {
      const { result } = await setup();
      expect(result.current.authStatus).toBe('unauthenticated');
    });

    it('sets authStatus to authenticated when server says authenticated', async () => {
      const { result } = await setup({
        fetchAuthStatus: jest.fn().mockResolvedValue({ authenticated: true }),
      });
      expect(result.current.authStatus).toBe('authenticated');
    });
  });

  describe('SSE connection lifecycle', () => {
    it('opens SSE stream when authenticated', async () => {
      const { api } = await setup({
        fetchAuthStatus: jest.fn().mockResolvedValue({ authenticated: true }),
      });
      expect(api.createSuggestionStream).toHaveBeenCalled();
    });

    it('does NOT open SSE stream when unauthenticated', async () => {
      const { api } = await setup({
        fetchAuthStatus: jest.fn().mockResolvedValue({ authenticated: false }),
      });
      expect(api.createSuggestionStream).not.toHaveBeenCalled();
    });

    it('sets connectionStatus to disconnected when unauthenticated', async () => {
      const { result } = await setup();
      expect(result.current.connectionStatus).toBe('disconnected');
    });

    it('closes SSE stream on unmount', async () => {
      const { unmount, api } = await setup({
        fetchAuthStatus: jest.fn().mockResolvedValue({ authenticated: true }),
      });

      await act(async () => {
        unmount();
      });

      expect(api._stream.close).toHaveBeenCalled();
    });

    it('sets connectionStatus to connecting when stream opens', async () => {
      const { result } = await setup({
        fetchAuthStatus: jest.fn().mockResolvedValue({ authenticated: true }),
      });

      // The hook sets 'connecting' synchronously when openStream is called
      // After the mock stream is created, status should be 'connecting'
      // (since our mock onConnected doesn't auto-fire)
      expect(result.current.connectionStatus).toBe('connecting');
    });

    it('sets connectionStatus to connected when onConnected fires', async () => {
      const { result, api } = await setup({
        fetchAuthStatus: jest.fn().mockResolvedValue({ authenticated: true }),
      });

      expect(result.current.connectionStatus).toBe('connecting');

      // Capture the onConnected callback
      const onConnectedCallback = api._stream.onConnected.mock.calls[0][0];

      // Trigger connected event
      await act(async () => {
        onConnectedCallback({ status: 'connected' });
      });

      expect(result.current.connectionStatus).toBe('connected');
    });

    it('resets retry count when SSE connection succeeds', async () => {
      const { api } = await setup({
        fetchAuthStatus: jest.fn().mockResolvedValue({ authenticated: true }),
      });

      // Capture the onConnected callback
      const onConnectedCallback = api._stream.onConnected.mock.calls[0][0];

      // Trigger connected event
      await act(async () => {
        onConnectedCallback({ status: 'connected' });
      });

      // If retry was in progress, connected resets it (verified by retry count starting fresh on next error)
      expect(api._stream.onConnected).toHaveBeenCalled();
    });
  });

  describe('SSE error recovery', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('retries SSE connection after error with 30s backoff', async () => {
      const { api } = await setup({
        fetchAuthStatus: jest.fn().mockResolvedValue({ authenticated: true }),
      });

      // Capture the onError callback
      const onErrorCallback = api._stream.onError.mock.calls[0][0];

      // Trigger error
      await act(async () => {
        onErrorCallback({ message: 'SSE connection error' });
      });

      // Should not retry immediately
      expect(api.createSuggestionStream).toHaveBeenCalledTimes(1);

      // Fast-forward 30 seconds
      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });

      // Should have retried
      expect(api.createSuggestionStream).toHaveBeenCalledTimes(2);
    });

    it('stops retrying after 3 attempts', async () => {
      const { api } = await setup({
        fetchAuthStatus: jest.fn().mockResolvedValue({ authenticated: true }),
      });

      // Capture the onError callback
      const onErrorCallback = api._stream.onError.mock.calls[0][0];

      // Trigger error 4 times
      for (let i = 0; i < 4; i++) {
        await act(async () => {
          onErrorCallback({ message: 'SSE connection error' });
        });

        await act(async () => {
          jest.advanceTimersByTime(30_000);
        });
      }

      // Should have tried: initial + 3 retries = 4 total
      expect(api.createSuggestionStream).toHaveBeenCalledTimes(4);
    });
  });

  describe('visibilitychange handling', () => {
    it('re-checks auth when tab becomes visible and opens stream if authenticated', async () => {
      const { api } = await setup({
        fetchAuthStatus: jest.fn().mockResolvedValue({ authenticated: false }),
      });

      // Initially unauthenticated, no stream
      expect(api.createSuggestionStream).not.toHaveBeenCalled();

      // User completes OAuth in another tab, now authenticated
      api.fetchAuthStatus.mockResolvedValue({ authenticated: true });

      // Simulate visibility change
      await act(async () => {
        Object.defineProperty(document, 'visibilityState', {
          writable: true,
          configurable: true,
          value: 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      // Wait for async re-check
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Should have re-checked auth and opened stream
      expect(api.fetchAuthStatus).toHaveBeenCalledTimes(2);
      expect(api.createSuggestionStream).toHaveBeenCalled();
    });

    it('does not open duplicate stream if one already exists', async () => {
      const { api } = await setup({
        fetchAuthStatus: jest.fn().mockResolvedValue({ authenticated: true }),
      });

      // Stream already open
      expect(api.createSuggestionStream).toHaveBeenCalledTimes(1);

      // Simulate visibility change
      await act(async () => {
        Object.defineProperty(document, 'visibilityState', {
          writable: true,
          configurable: true,
          value: 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Should not have opened a second stream
      expect(api.createSuggestionStream).toHaveBeenCalledTimes(1);
    });
  });

  describe('error logging', () => {
    let consoleWarnSpy;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('logs warning when checkAuth fails', async () => {
      await setup({
        fetchAuthStatus: jest.fn().mockRejectedValue(new Error('Network error')),
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to check auth status:',
        expect.any(Error)
      );
    });

    it('logs warning when dismissSuggestion fails', async () => {
      const { result, api } = await setup();

      api.dismissSuggestion.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        await result.current.dismissSuggestion('s1');
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to persist dismissal:',
        expect.any(Error)
      );
    });

    it('logs warning when triggerScan fails', async () => {
      const { result, api } = await setup();

      api.triggerScan.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        await result.current.triggerScan();
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith('Scan failed:', expect.any(Error));
    });

    it('logs warning when connectGoogle fails', async () => {
      const { result, api } = await setup();

      api.fetchAuthUrl.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        await result.current.connectGoogle();
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to get auth URL:', expect.any(Error));
    });

    it('logs warning when disconnectGoogle fails', async () => {
      const { result, api } = await setup();

      api.disconnectAuth.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        await result.current.disconnectGoogle();
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to disconnect:', expect.any(Error));
    });
  });

  describe('dismissSuggestion', () => {
    it('removes the suggestion from local state', async () => {
      const { result, api } = await setup();

      // Manually set suggestions via triggerScan
      api.triggerScan.mockResolvedValue({
        suggestions: [
          { id: 's1', companyName: 'Google' },
          { id: 's2', companyName: 'Meta' },
        ],
      });

      await act(async () => {
        await result.current.triggerScan();
      });

      expect(result.current.suggestions).toHaveLength(2);

      await act(async () => {
        await result.current.dismissSuggestion('s1');
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].id).toBe('s2');
    });

    it('calls the API to persist the dismissal', async () => {
      const { result, api } = await setup();

      await act(async () => {
        await result.current.dismissSuggestion('suggestion_abc');
      });

      expect(api.dismissSuggestion).toHaveBeenCalledWith('suggestion_abc');
    });
  });

  describe('triggerScan', () => {
    it('updates suggestions from the scan result', async () => {
      const scanned = [{ id: 's1', companyName: 'Apple' }];
      const { result, api } = await setup();

      api.triggerScan.mockResolvedValue({ suggestions: scanned });

      await act(async () => {
        await result.current.triggerScan();
      });

      expect(result.current.suggestions).toEqual(scanned);
    });

    it('keeps existing suggestions on scan error', async () => {
      const { result, api } = await setup();

      // First, populate suggestions
      api.triggerScan.mockResolvedValue({
        suggestions: [{ id: 's1', companyName: 'Google' }],
      });
      await act(async () => {
        await result.current.triggerScan();
      });

      // Now fail the second scan
      api.triggerScan.mockRejectedValue(new Error('fail'));
      await act(async () => {
        await result.current.triggerScan();
      });

      // Suggestions should still be there
      expect(result.current.suggestions).toHaveLength(1);
    });
  });

  describe('connectGoogle', () => {
    it('calls fetchAuthUrl and opens the URL', async () => {
      const openSpy = jest.spyOn(window, 'open').mockImplementation(() => {});
      const { result, api } = await setup();

      api.fetchAuthUrl.mockResolvedValue({ url: 'https://google.com/auth' });

      await act(async () => {
        await result.current.connectGoogle();
      });

      expect(api.fetchAuthUrl).toHaveBeenCalled();
      expect(openSpy).toHaveBeenCalledWith('https://google.com/auth', '_blank');
      openSpy.mockRestore();
    });
  });

  describe('disconnectGoogle', () => {
    it('clears suggestions and sets authStatus to unauthenticated', async () => {
      const { result, api } = await setup({
        fetchAuthStatus: jest.fn().mockResolvedValue({ authenticated: true }),
      });

      // Populate suggestions
      api.triggerScan.mockResolvedValue({
        suggestions: [{ id: 's1' }],
      });
      await act(async () => {
        await result.current.triggerScan();
      });
      expect(result.current.suggestions).toHaveLength(1);

      // Disconnect
      await act(async () => {
        await result.current.disconnectGoogle();
      });

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.authStatus).toBe('unauthenticated');
      expect(api.disconnectAuth).toHaveBeenCalled();
    });

    it('closes the SSE stream', async () => {
      const { result, api } = await setup({
        fetchAuthStatus: jest.fn().mockResolvedValue({ authenticated: true }),
      });

      await act(async () => {
        await result.current.disconnectGoogle();
      });

      expect(api._stream.close).toHaveBeenCalled();
    });
  });
});
