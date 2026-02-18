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
