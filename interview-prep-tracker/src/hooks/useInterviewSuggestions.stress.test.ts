import { renderHook, act } from '@testing-library/react';
import { useInterviewSuggestions } from './useInterviewSuggestions';
import type { ApiService } from '../types';

/**
 * Creates a mock API service with controllable return values.
 */
function createMockApi(overrides: Record<string, unknown> = {}) {
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
    saveToDrive: vi.fn().mockResolvedValue({ saved: true, savedAt: '', backups: [] }),
    loadFromDrive: vi.fn().mockResolvedValue({ companies: [], seenQuestions: [] }),
    fetchBackupStatus: vi.fn().mockResolvedValue({ backups: [] }),
    createSuggestionStream: vi.fn().mockReturnValue(streamInstance),
    _stream: streamInstance,
    ...overrides,
  } as unknown as ApiService & { _stream: typeof streamInstance };
}

/**
 * Helper: renders the hook and waits for the initial auth check to settle.
 */
async function setup(apiOverrides: Record<string, unknown> = {}) {
  const api = createMockApi(apiOverrides);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let hookResult: any;
  await act(async () => {
    hookResult = renderHook(() => useInterviewSuggestions(api as unknown as ApiService));
  });

  type MockFn = ReturnType<typeof vi.fn>;
  type MockApi = {
    fetchAuthStatus: MockFn; fetchAuthUrl: MockFn; disconnectAuth: MockFn;
    dismissSuggestion: MockFn; triggerScan: MockFn; resetSuggestions: MockFn;
    saveToDrive: MockFn; loadFromDrive: MockFn; fetchBackupStatus: MockFn;
    createSuggestionStream: MockFn;
    _stream: { onConnected: MockFn; onSuggestions: MockFn; onError: MockFn; close: MockFn };
  };
  return { result: hookResult.result as { current: ReturnType<typeof useInterviewSuggestions> }, unmount: hookResult.unmount as () => void, api: api as unknown as MockApi };
}

// ---------------------------------------------------------------------------
// H6: Rapid resetSuggestions calls from the hook
//
// If the user clicks the Reset button multiple times rapidly (before the
// first call completes), multiple concurrent resetSuggestions callbacks run.
// Each clears the dismissed refs and triggers a scan. We verify:
//   - No thrown errors (all promises resolve/reject gracefully)
//   - Final suggestions state is consistent (last scan result wins)
//   - Local dismissed refs are cleared
// ---------------------------------------------------------------------------
describe('H6: Rapid resetSuggestions calls from hook', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('5 rapid resets all resolve without error', async () => {
    const { result, api } = await setup({
      fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
    });

    let scanCount = 0;
    api.triggerScan.mockImplementation(async () => {
      scanCount++;
      return { suggestions: [{ id: `scan-${scanCount}`, companyName: `Company${scanCount}` }] };
    });

    // Fire 5 resets concurrently
    await act(async () => {
      const resets = Array.from({ length: 5 }, () =>
        result.current.resetSuggestions()
      );
      await Promise.all(resets);
    });

    // All resets should have called the API
    expect(api.resetSuggestions).toHaveBeenCalledTimes(5);

    // Final suggestions should be from the last scan
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0]!.id).toMatch(/^scan-/);
  });

  it('rapid resets clear dismissed refs so SSE updates are not filtered', async () => {
    const { result, api } = await setup({
      fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
    });

    const onSuggestionsCallback = api._stream.onSuggestions.mock.calls[0]![0];

    // Push initial suggestions and dismiss them
    await act(async () => {
      onSuggestionsCallback([
        { id: 's1', companyName: 'Google', emailMessageId: 'msg1' },
        { id: 's2', companyName: 'Meta', calendarEventId: 'cal1' },
      ]);
    });

    await act(async () => {
      await result.current.dismissSuggestion({
        id: 's1', emailMessageId: 'msg1',
      });
      await result.current.dismissSuggestion({
        id: 's2', calendarEventId: 'cal1',
      });
    });

    // Both should be filtered from SSE
    await act(async () => {
      onSuggestionsCallback([
        { id: 's1', companyName: 'Google', emailMessageId: 'msg1' },
        { id: 's2', companyName: 'Meta', calendarEventId: 'cal1' },
      ]);
    });
    expect(result.current.suggestions).toEqual([]);

    // Fire 3 rapid resets
    api.triggerScan.mockResolvedValue({
      suggestions: [
        { id: 's1', companyName: 'Google', emailMessageId: 'msg1' },
        { id: 's2', companyName: 'Meta', calendarEventId: 'cal1' },
      ],
    });

    await act(async () => {
      const resets = Array.from({ length: 3 }, () =>
        result.current.resetSuggestions()
      );
      await Promise.all(resets);
    });

    // After reset, both suggestions should reappear
    expect(result.current.suggestions).toHaveLength(2);

    // SSE push should also not filter them anymore
    await act(async () => {
      onSuggestionsCallback([
        { id: 's1', companyName: 'Google', emailMessageId: 'msg1' },
        { id: 's2', companyName: 'Meta', calendarEventId: 'cal1' },
      ]);
    });
    expect(result.current.suggestions).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// H7: Reset when the API call fails — dismissed refs should NOT be cleared
//
// If resetSuggestions throws on the api.resetSuggestions() call, the local
// dismissed refs should remain intact so previously dismissed suggestions
// stay hidden. The current implementation clears refs BEFORE the scan but
// AFTER the reset call, so if reset throws, refs are NOT cleared (correct).
// But if the scan call fails (after reset succeeds), refs ARE already cleared
// and the catch block catches the scan error. We verify both paths.
// ---------------------------------------------------------------------------
describe('H7: Reset failure leaves dismissed refs intact', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('when api.resetSuggestions rejects, local dismissed refs remain intact', async () => {
    const { result, api } = await setup({
      fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
    });

    const onSuggestionsCallback = api._stream.onSuggestions.mock.calls[0]![0];

    // Push and dismiss
    await act(async () => {
      onSuggestionsCallback([{ id: 's1', companyName: 'Google' }]);
    });
    await act(async () => {
      await result.current.dismissSuggestion({ id: 's1', companyName: 'Google' });
    });

    // Reset fails
    api.resetSuggestions = vi.fn().mockRejectedValue(new Error('Server down'));

    await act(async () => {
      await result.current.resetSuggestions();
    });

    // s1 should still be filtered since reset failed before clearing refs
    await act(async () => {
      onSuggestionsCallback([{ id: 's1', companyName: 'Google' }]);
    });
    expect(result.current.suggestions).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith('Reset failed:', expect.any(Error));
  });

  it('when api.triggerScan rejects after successful reset, refs are already cleared', async () => {
    const { result, api } = await setup({
      fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
    });

    const onSuggestionsCallback = api._stream.onSuggestions.mock.calls[0]![0];

    // Push and dismiss
    await act(async () => {
      onSuggestionsCallback([{ id: 's1', companyName: 'Google' }]);
    });
    await act(async () => {
      await result.current.dismissSuggestion({ id: 's1', companyName: 'Google' });
    });

    // Reset succeeds but scan fails
    api.resetSuggestions = vi.fn().mockResolvedValue({ reset: true });
    api.triggerScan.mockRejectedValue(new Error('Scan timeout'));

    await act(async () => {
      await result.current.resetSuggestions();
    });

    // Refs were cleared after successful reset, before the scan attempt.
    // The scan failure is caught but refs are already gone.
    // So s1 should now pass through the SSE filter.
    await act(async () => {
      onSuggestionsCallback([{ id: 's1', companyName: 'Google' }]);
    });

    // s1 reappears because refs were cleared by the successful reset
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0]!.id).toBe('s1');
  });
});

// ---------------------------------------------------------------------------
// H8: Reset followed by dismiss — new dismiss persists after reset
//
// After a reset clears all dismissed state, the user should be able to
// dismiss new suggestions, and those dismissals should be tracked in the
// local refs. This verifies the refs (Sets) are fully functional after
// being replaced with new empty Sets.
// ---------------------------------------------------------------------------
describe('H8: Reset followed by dismiss', () => {
  it('new dismiss after reset is tracked in local refs', async () => {
    const { result, api } = await setup({
      fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
    });

    const onSuggestionsCallback = api._stream.onSuggestions.mock.calls[0]![0];

    // Reset (clears refs)
    api.triggerScan.mockResolvedValue({
      suggestions: [
        { id: 's1', companyName: 'Google' },
        { id: 's2', companyName: 'Meta' },
      ],
    });

    await act(async () => {
      await result.current.resetSuggestions();
    });
    expect(result.current.suggestions).toHaveLength(2);

    // Dismiss s1 after reset
    await act(async () => {
      await result.current.dismissSuggestion({ id: 's1', companyName: 'Google' });
    });
    expect(result.current.suggestions).toHaveLength(1);

    // SSE push with s1 — should still be filtered
    await act(async () => {
      onSuggestionsCallback([
        { id: 's1', companyName: 'Google' },
        { id: 's2', companyName: 'Meta' },
      ]);
    });
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0]!.id).toBe('s2');
  });

  it('component ID dismiss tracking works after reset', async () => {
    const { result, api } = await setup({
      fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
    });

    const onSuggestionsCallback = api._stream.onSuggestions.mock.calls[0]![0];

    // Reset
    api.triggerScan.mockResolvedValue({ suggestions: [] });
    await act(async () => {
      await result.current.resetSuggestions();
    });

    // Push and dismiss a suggestion with component IDs
    await act(async () => {
      onSuggestionsCallback([{
        id: 's1', companyName: 'Google',
        emailMessageId: 'msg_1', calendarEventId: 'cal_1',
      }]);
    });
    await act(async () => {
      await result.current.dismissSuggestion({
        id: 's1', emailMessageId: 'msg_1', calendarEventId: 'cal_1',
      });
    });

    // Same interview with different composite ID but same emailMessageId
    await act(async () => {
      onSuggestionsCallback([{
        id: 's1_v2', companyName: 'Google',
        emailMessageId: 'msg_1', calendarEventId: 'cal_2',
      }]);
    });

    // Should be filtered by emailMessageId
    expect(result.current.suggestions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// H9: Reset + SSE race — SSE push arrives between reset and scan
//
// The resetSuggestions callback does:
//   1. await api.resetSuggestions()
//   2. Clear dismissed refs
//   3. await api.triggerScan()
//   4. setSuggestions(scanned)
//
// If an SSE push arrives between steps 2 and 4, the onSuggestions handler
// sets suggestions with the SSE data (unfiltered since refs are cleared).
// Then step 4 overwrites with the scan result. The final state should be
// the scan result, not the SSE push.
// ---------------------------------------------------------------------------
describe('H9: Reset + SSE race — SSE push between reset and scan', () => {
  it('scan result overwrites any SSE push that arrived during reset', async () => {
    const { result, api } = await setup({
      fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
    });

    const onSuggestionsCallback = api._stream.onSuggestions.mock.calls[0]![0];

    // Make triggerScan take some time and push SSE during that time
    let scanResolve: (value: unknown) => void;
    api.triggerScan.mockImplementation(() => {
      return new Promise((resolve) => {
        scanResolve = resolve;
        // Simulate SSE push arriving during the scan
        setTimeout(() => {
          onSuggestionsCallback([
            { id: 'sse-1', companyName: 'SSE Company' },
          ]);
        }, 10);
      });
    });

    // Start the reset
    let resetPromise: Promise<void>;
    await act(async () => {
      resetPromise = result.current.resetSuggestions();
    });

    // Wait for SSE to arrive
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // SSE push should have set suggestions
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0]!.id).toBe('sse-1');

    // Now resolve the scan
    await act(async () => {
      scanResolve({
        suggestions: [
          { id: 'scan-1', companyName: 'Scan Company' },
          { id: 'scan-2', companyName: 'Scan Company 2' },
        ],
      });
      await resetPromise;
    });

    // Final state should be the scan result (overwrites SSE)
    expect(result.current.suggestions).toHaveLength(2);
    expect(result.current.suggestions[0]!.id).toBe('scan-1');
    expect(result.current.suggestions[1]!.id).toBe('scan-2');
  });
});
