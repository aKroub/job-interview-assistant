import { useState, useEffect, useCallback, useRef } from 'react';
import * as defaultApi from '../services/apiService.js';
import type { ApiService, AuthStatus, ConnectionStatus, Suggestion, SuggestionStream } from '../types';

/**
 * Custom hook that manages the SSE connection to the interview suggestions
 * endpoint and exposes auth + suggestion state.
 *
 * Accepts an injectable `api` object so tests can substitute mock implementations
 * without touching network or EventSource globals.
 *
 * Lifecycle:
 *  1. On mount → checks auth status
 *  2. If authenticated → opens SSE stream, receives suggestions in real time
 *  3. On unmount → closes SSE stream
 */
export function useInterviewSuggestions(api: ApiService = defaultApi) {
  const [suggestions,      setSuggestions]      = useState<Suggestion[]>([]);
  const [authStatus,       setAuthStatus]       = useState<AuthStatus>('checking');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  /** Ref to the active SSE stream — allows cleanup from any callback. */
  const streamRef = useRef<SuggestionStream | null>(null);

  /** Retry count and timer for SSE error recovery. */
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Whether the hook is mounted.  Prevents state updates (and
   * "Disconnected" flicker) when React StrictMode unmounts and
   * re-mounts in dev.
   */
  const mountedRef = useRef(true);

  /**
   * Local set of dismissed suggestion IDs.
   *
   * Prevents a race condition where SSE polling broadcasts suggestions
   * between the optimistic local removal and the server-side persist.
   * The SSE handler's full-array replacement would otherwise overwrite
   * the optimistic update and re-surface the dismissed suggestion.
   *
   * IDs stay in this set for the lifetime of the hook (or until
   * disconnectGoogle resets everything). This is safe because the
   * server also persists dismissed IDs — on the next SSE cycle the
   * server-side filter will have caught up, but the local set
   * guarantees no flicker in the meantime.
   */
  const dismissedIdsRef = useRef(new Set<string>());

  /**
   * Local sets of dismissed component IDs (email message IDs and calendar
   * event IDs). These prevent the same interview from resurfacing under
   * a different composite suggestion ID when the source changes (e.g.
   * email-only → cross-referenced after a calendar event is added).
   */
  const dismissedEmailIdsRef = useRef(new Set<string>());
  const dismissedCalendarIdsRef = useRef(new Set<string>());

  /**
   * Returns true when a suggestion matches any locally dismissed ID
   * (composite suggestion ID, email message ID, or calendar event ID).
   */
  function isDismissedLocally(s: Suggestion): boolean {
    if (dismissedIdsRef.current.has(s.id)) return true;
    if (s.emailMessageId && dismissedEmailIdsRef.current.has(s.emailMessageId)) return true;
    if (s.calendarEventId && dismissedCalendarIdsRef.current.has(s.calendarEventId)) return true;
    return false;
  }

  /**
   * Checks Google OAuth status against the backend.
   */
  const checkAuth = useCallback(async () => {
    try {
      const { authenticated } = await api.fetchAuthStatus();
      setAuthStatus(authenticated ? 'authenticated' : 'unauthenticated');
      return authenticated;
    } catch (err) {
      console.warn('Failed to check auth status:', err);
      setAuthStatus('unauthenticated');
      return false;
    }
  }, [api]);

  /**
   * Closes the SSE stream if one is open and clears retry timer.
   * Only updates connectionStatus when the hook is still mounted,
   * preventing a "Disconnected" flash during StrictMode cleanup.
   */
  const closeStream = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    if (mountedRef.current) {
      setConnectionStatus('disconnected');
    }
  }, []);

  /**
   * Opens the SSE stream to receive real-time suggestions.
   * Closes any existing stream first.
   */
  const openStream = useCallback(() => {
    // Close any existing connection without a status flash
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }

    setConnectionStatus('connecting');

    const stream = api.createSuggestionStream();

    stream
      .onConnected(() => {
        setConnectionStatus('connected');
        retryCountRef.current = 0;
      })
      .onSuggestions((newSuggestions) => {
        const filtered = newSuggestions.filter(
          (s) => !isDismissedLocally(s)
        );
        setSuggestions(filtered);
      })
      .onError(() => {
        setConnectionStatus('error');
        if (retryCountRef.current < 3) {
          retryTimerRef.current = setTimeout(() => {
            retryCountRef.current += 1;
            closeStream();
            openStream();
          }, 30_000);
        }
      });

    streamRef.current = stream;
  }, [api, closeStream]);

  // On mount: check auth, if authenticated open SSE stream
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function init() {
      const authenticated = await checkAuth();
      if (!cancelled && authenticated) {
        openStream();
      }
    }

    function handleVisibilityChange() {
      if (!cancelled && document.visibilityState === 'visible') {
        // Re-check auth when the user returns to the tab
        checkAuth().then(authenticated => {
          if (!cancelled && authenticated && !streamRef.current) {
            openStream();
          }
        });
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    init();

    // Cleanup: close SSE on unmount
    return () => {
      cancelled = true;
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      closeStream();
    };
  }, [checkAuth, openStream, closeStream]);

  /**
   * Dismisses a suggestion — removes it from local state and persists
   * the dismissal on the server. Tracks component IDs (emailMessageId,
   * calendarEventId) locally so the same interview is recognised even
   * when the composite suggestion ID changes.
   */
  const dismissSuggestion = useCallback(async (suggestion: Suggestion) => {
    // Record the composite ID and component IDs locally so incoming
    // SSE updates never re-surface this interview under any form
    dismissedIdsRef.current.add(suggestion.id);
    if (suggestion.emailMessageId) {
      dismissedEmailIdsRef.current.add(suggestion.emailMessageId);
    }
    if (suggestion.calendarEventId) {
      dismissedCalendarIdsRef.current.add(suggestion.calendarEventId);
    }

    // Optimistic update — remove from local state immediately
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));

    try {
      await api.dismissSuggestion(
        suggestion.id,
        suggestion.emailMessageId || '',
        suggestion.calendarEventId || '',
      );
    } catch (err) {
      console.warn('Failed to persist dismissal:', err);
      // The IDs remain in local refs so the suggestion stays hidden
      // locally even if the server call failed. On the next full session
      // (page reload) the server will be the source of truth.
    }
  }, [api]);

  /**
   * Triggers a manual scan and updates suggestions with the result.
   */
  const triggerScan = useCallback(async () => {
    try {
      const { suggestions: scanned } = await api.triggerScan();
      const filtered = scanned.filter(
        (s) => !isDismissedLocally(s)
      );
      setSuggestions(filtered);
    } catch (err) {
      console.warn('Scan failed:', err);
      // Silently ignore — the SSE stream will deliver results on next poll
    }
  }, [api]);

  /**
   * Resets all dismissed suggestions on the server, clears local dismissed
   * state, and triggers a fresh scan so cleared suggestions reappear.
   */
  const resetSuggestions = useCallback(async () => {
    try {
      await api.resetSuggestions();
      dismissedIdsRef.current = new Set();
      dismissedEmailIdsRef.current = new Set();
      dismissedCalendarIdsRef.current = new Set();

      // Trigger a fresh scan so the cleared suggestions appear immediately
      const { suggestions: scanned } = await api.triggerScan();
      setSuggestions(scanned || []);
    } catch (err) {
      console.warn('Reset failed:', err);
    }
  }, [api]);

  /**
   * Initiates Google OAuth by opening the consent URL in a new tab.
   * After the user completes auth, they return to the app and we
   * re-check status and open the SSE stream.
   */
  const connectGoogle = useCallback(async () => {
    try {
      const { url } = await api.fetchAuthUrl();
      window.open(url, '_blank');
    } catch (err) {
      console.warn('Failed to get auth URL:', err);
      // Silently ignore — user can retry
    }
  }, [api]);

  /**
   * Disconnects Google OAuth, closes the SSE stream, and clears suggestions.
   */
  const disconnectGoogle = useCallback(async () => {
    closeStream();
    setSuggestions([]);
    dismissedIdsRef.current = new Set();
    dismissedEmailIdsRef.current = new Set();
    dismissedCalendarIdsRef.current = new Set();

    try {
      await api.disconnectAuth();
      setAuthStatus('unauthenticated');
    } catch (err) {
      console.warn('Failed to disconnect:', err);
      // Even if the server call fails, clear local state
      setAuthStatus('unauthenticated');
    }
  }, [api, closeStream]);

  return {
    suggestions,
    authStatus,
    connectionStatus,
    dismissSuggestion,
    triggerScan,
    resetSuggestions,
    connectGoogle,
    disconnectGoogle,
  };
}
