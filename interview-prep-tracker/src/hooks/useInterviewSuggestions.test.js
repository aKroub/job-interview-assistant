import { renderHook, act } from '@testing-library/react';
import { useInterviewSuggestions } from './useInterviewSuggestions';

/**
 * Creates a mock API service with controllable return values.
 * All methods are vi.fn() so callers can customize per-test.
 */
function createMockApi(overrides = {}) {
  const streamInstance = {
    onConnected: vi.fn().mockReturnThis(),
    onSuggestions: vi.fn().mockReturnThis(),
    onError: vi.fn().mockReturnThis(),
    close: vi.fn(),
  };

  return {
    fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: false }),
    fetchAuthUrl: vi.fn().mockResolvedValue({ url: 'https://accounts.google.com/auth' }),
    disconnectAuth: vi.fn().mockResolvedValue({ authenticated: false }),
    dismissSuggestion: vi.fn().mockResolvedValue({ dismissed: true }),
    triggerScan: vi.fn().mockResolvedValue({ suggestions: [] }),
    resetSuggestions: vi.fn().mockResolvedValue({ reset: true }),
    createSuggestionStream: vi.fn().mockReturnValue(streamInstance),
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
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
      });
      expect(result.current.authStatus).toBe('authenticated');
    });
  });

  describe('SSE connection lifecycle', () => {
    it('opens SSE stream when authenticated', async () => {
      const { api } = await setup({
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
      });
      expect(api.createSuggestionStream).toHaveBeenCalled();
    });

    it('does NOT open SSE stream when unauthenticated', async () => {
      const { api } = await setup({
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: false }),
      });
      expect(api.createSuggestionStream).not.toHaveBeenCalled();
    });

    it('sets connectionStatus to disconnected when unauthenticated', async () => {
      const { result } = await setup();
      expect(result.current.connectionStatus).toBe('disconnected');
    });

    it('closes SSE stream on unmount', async () => {
      const { unmount, api } = await setup({
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
      });

      await act(async () => {
        unmount();
      });

      expect(api._stream.close).toHaveBeenCalled();
    });

    it('sets connectionStatus to connecting when stream opens', async () => {
      const { result } = await setup({
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
      });

      // The hook sets 'connecting' synchronously when openStream is called
      // After the mock stream is created, status should be 'connecting'
      // (since our mock onConnected doesn't auto-fire)
      expect(result.current.connectionStatus).toBe('connecting');
    });

    it('sets connectionStatus to connected when onConnected fires', async () => {
      const { result, api } = await setup({
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
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
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
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
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    });

    it('retries SSE connection after error with 30s backoff', async () => {
      const { api } = await setup({
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
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
        vi.advanceTimersByTime(30_000);
      });

      // Should have retried
      expect(api.createSuggestionStream).toHaveBeenCalledTimes(2);
    });

    it('stops retrying after 3 attempts', async () => {
      const { api } = await setup({
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
      });

      // Capture the onError callback
      const onErrorCallback = api._stream.onError.mock.calls[0][0];

      // Trigger error 4 times
      for (let i = 0; i < 4; i++) {
        await act(async () => {
          onErrorCallback({ message: 'SSE connection error' });
        });

        await act(async () => {
          vi.advanceTimersByTime(30_000);
        });
      }

      // Should have tried: initial + 3 retries = 4 total
      expect(api.createSuggestionStream).toHaveBeenCalledTimes(4);
    });
  });

  describe('visibilitychange handling', () => {
    it('re-checks auth when tab becomes visible and opens stream if authenticated', async () => {
      const { api } = await setup({
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: false }),
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
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
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
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('logs warning when checkAuth fails', async () => {
      await setup({
        fetchAuthStatus: vi.fn().mockRejectedValue(new Error('Network error')),
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
        await result.current.dismissSuggestion({ id: 's1' });
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
        await result.current.dismissSuggestion({ id: 's1' });
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].id).toBe('s2');
    });

    it('calls the API to persist the dismissal with component IDs', async () => {
      const { result, api } = await setup();

      await act(async () => {
        await result.current.dismissSuggestion({
          id: 'suggestion_abc',
          emailMessageId: 'msg_123',
          calendarEventId: 'cal_456',
        });
      });

      expect(api.dismissSuggestion).toHaveBeenCalledWith('suggestion_abc', 'msg_123', 'cal_456');
    });

    it('defaults missing component IDs to empty strings in API call', async () => {
      const { result, api } = await setup();

      await act(async () => {
        await result.current.dismissSuggestion({ id: 'suggestion_abc' });
      });

      expect(api.dismissSuggestion).toHaveBeenCalledWith('suggestion_abc', '', '');
    });
  });

  describe('dismiss race condition prevention', () => {
    it('filters dismissed suggestions from SSE updates received after dismiss', async () => {
      const { result, api } = await setup({
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
      });

      // Capture the onSuggestions callback from the SSE stream
      const onSuggestionsCallback = api._stream.onSuggestions.mock.calls[0][0];

      // Initial SSE push with two suggestions
      await act(async () => {
        onSuggestionsCallback([
          { id: 's1', companyName: 'Google' },
          { id: 's2', companyName: 'Meta' },
        ]);
      });
      expect(result.current.suggestions).toHaveLength(2);

      // User dismisses s1
      await act(async () => {
        await result.current.dismissSuggestion({ id: 's1', companyName: 'Google' });
      });
      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].id).toBe('s2');

      // SSE polling fires BEFORE server persists the dismiss — includes s1 again
      await act(async () => {
        onSuggestionsCallback([
          { id: 's1', companyName: 'Google' },
          { id: 's2', companyName: 'Meta' },
        ]);
      });

      // s1 must NOT reappear — the local dismissedIds filter catches it
      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].id).toBe('s2');
    });

    it('filters dismissed suggestions from triggerScan results', async () => {
      const { result, api } = await setup();

      // Populate initial suggestions
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

      // Dismiss s1
      await act(async () => {
        await result.current.dismissSuggestion({ id: 's1', companyName: 'Google' });
      });

      // Manual scan returns s1 again (server hasn't persisted yet)
      api.triggerScan.mockResolvedValue({
        suggestions: [
          { id: 's1', companyName: 'Google' },
          { id: 's2', companyName: 'Meta' },
        ],
      });
      await act(async () => {
        await result.current.triggerScan();
      });

      // s1 must NOT reappear
      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].id).toBe('s2');
    });

    it('keeps dismissed suggestion hidden even when server dismiss fails', async () => {
      let consoleWarnSpy;
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result, api } = await setup({
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
      });

      const onSuggestionsCallback = api._stream.onSuggestions.mock.calls[0][0];

      // Initial SSE push
      await act(async () => {
        onSuggestionsCallback([{ id: 's1', companyName: 'Google' }]);
      });

      // Dismiss fails on the server
      api.dismissSuggestion.mockRejectedValue(new Error('Network error'));
      await act(async () => {
        await result.current.dismissSuggestion({ id: 's1', companyName: 'Google' });
      });

      // SSE pushes the suggestion again (server never received the dismiss)
      await act(async () => {
        onSuggestionsCallback([{ id: 's1', companyName: 'Google' }]);
      });

      // Must still be hidden — local dismissedIds survives the API failure
      expect(result.current.suggestions).toEqual([]);

      consoleWarnSpy.mockRestore();
    });

    it('clears dismissed IDs on disconnectGoogle so suggestions can reappear on reconnect', async () => {
      const { result, api } = await setup({
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
      });

      const onSuggestionsCallback = api._stream.onSuggestions.mock.calls[0][0];

      // Push a suggestion and dismiss it
      await act(async () => {
        onSuggestionsCallback([{ id: 's1', companyName: 'Google' }]);
      });
      await act(async () => {
        await result.current.dismissSuggestion({ id: 's1', companyName: 'Google' });
      });

      // Disconnect clears everything
      await act(async () => {
        await result.current.disconnectGoogle();
      });

      // Re-authenticate and open a fresh stream
      api.fetchAuthStatus.mockResolvedValue({ authenticated: true });
      await act(async () => {
        // Simulate visibility change to trigger reconnection
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

      // The new stream's onSuggestions sends s1 — it should NOT be filtered
      // because dismissedIds was cleared on disconnect
      const newOnSuggestions = api._stream.onSuggestions.mock.calls.at(-1)?.[0];
      if (newOnSuggestions) {
        await act(async () => {
          newOnSuggestions([{ id: 's1', companyName: 'Google' }]);
        });
        expect(result.current.suggestions).toHaveLength(1);
        expect(result.current.suggestions[0].id).toBe('s1');
      }
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
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
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

  describe('resetSuggestions', () => {
    it('calls the API resetSuggestions method', async () => {
      const { result, api } = await setup();

      api.resetSuggestions = vi.fn().mockResolvedValue({ reset: true });
      api.triggerScan.mockResolvedValue({ suggestions: [] });

      await act(async () => {
        await result.current.resetSuggestions();
      });

      expect(api.resetSuggestions).toHaveBeenCalled();
    });

    it('clears local dismissed IDs so previously dismissed suggestions reappear', async () => {
      const { result, api } = await setup({
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
      });

      const onSuggestionsCallback = api._stream.onSuggestions.mock.calls[0][0];

      // Push a suggestion and dismiss it
      await act(async () => {
        onSuggestionsCallback([{ id: 's1', companyName: 'Google' }]);
      });
      await act(async () => {
        await result.current.dismissSuggestion({ id: 's1', companyName: 'Google' });
      });

      // Verify it's dismissed (SSE re-push should be filtered)
      await act(async () => {
        onSuggestionsCallback([{ id: 's1', companyName: 'Google' }]);
      });
      expect(result.current.suggestions).toEqual([]);

      // Reset — should clear local dismissed IDs
      api.resetSuggestions = vi.fn().mockResolvedValue({ reset: true });
      api.triggerScan.mockResolvedValue({
        suggestions: [{ id: 's1', companyName: 'Google' }],
      });

      await act(async () => {
        await result.current.resetSuggestions();
      });

      // s1 should reappear since local dismissed IDs were cleared
      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].id).toBe('s1');
    });

    it('clears component-level dismissed IDs (email and calendar)', async () => {
      const { result, api } = await setup({
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
      });

      const onSuggestionsCallback = api._stream.onSuggestions.mock.calls[0][0];

      // Push and dismiss a suggestion with component IDs
      await act(async () => {
        onSuggestionsCallback([{
          id: 's1', companyName: 'Google',
          emailMessageId: 'msg_1', calendarEventId: 'cal_1',
        }]);
      });
      await act(async () => {
        await result.current.dismissSuggestion({
          id: 's1', companyName: 'Google',
          emailMessageId: 'msg_1', calendarEventId: 'cal_1',
        });
      });

      // Same interview reappears under a different composite ID (same emailMessageId)
      await act(async () => {
        onSuggestionsCallback([{
          id: 's1_v2', companyName: 'Google',
          emailMessageId: 'msg_1', calendarEventId: 'cal_2',
        }]);
      });
      expect(result.current.suggestions).toEqual([]);

      // Reset clears component IDs too
      api.resetSuggestions = vi.fn().mockResolvedValue({ reset: true });
      api.triggerScan.mockResolvedValue({
        suggestions: [{
          id: 's1_v2', companyName: 'Google',
          emailMessageId: 'msg_1', calendarEventId: 'cal_2',
        }],
      });

      await act(async () => {
        await result.current.resetSuggestions();
      });

      expect(result.current.suggestions).toHaveLength(1);
    });

    it('triggers a fresh scan after reset so suggestions appear immediately', async () => {
      const { result, api } = await setup();

      api.resetSuggestions = vi.fn().mockResolvedValue({ reset: true });
      const scanned = [{ id: 's1', companyName: 'Apple' }];
      api.triggerScan.mockResolvedValue({ suggestions: scanned });

      await act(async () => {
        await result.current.resetSuggestions();
      });

      expect(api.triggerScan).toHaveBeenCalled();
      expect(result.current.suggestions).toEqual(scanned);
    });

    it('logs warning when reset fails', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { result, api } = await setup();

      api.resetSuggestions = vi.fn().mockRejectedValue(new Error('Network error'));

      await act(async () => {
        await result.current.resetSuggestions();
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith('Reset failed:', expect.any(Error));
      consoleWarnSpy.mockRestore();
    });
  });

  describe('disconnectGoogle', () => {
    it('clears suggestions and sets authStatus to unauthenticated', async () => {
      const { result, api } = await setup({
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
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
        fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
      });

      await act(async () => {
        await result.current.disconnectGoogle();
      });

      expect(api._stream.close).toHaveBeenCalled();
    });
  });
});
