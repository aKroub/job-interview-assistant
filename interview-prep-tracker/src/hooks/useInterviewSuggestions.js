import { useState, useEffect, useCallback, useRef } from 'react';
import * as defaultApi from '../services/apiService';

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
 *
 * @param {Object} [api=defaultApi] - injectable API service
 * @returns {{
 *   suggestions: Object[],
 *   authStatus: 'checking' | 'authenticated' | 'unauthenticated',
 *   connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error',
 *   dismissSuggestion: (id: string) => Promise<void>,
 *   triggerScan: () => Promise<void>,
 *   connectGoogle: () => Promise<void>,
 *   disconnectGoogle: () => Promise<void>,
 * }}
 */
export function useInterviewSuggestions(api = defaultApi) {
  const [suggestions,      setSuggestions]      = useState([]);
  const [authStatus,       setAuthStatus]       = useState('checking');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  /** Ref to the active SSE stream — allows cleanup from any callback. */
  const streamRef = useRef(null);

  /** Retry count and timer for SSE error recovery. */
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);

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
    setConnectionStatus('disconnected');
  }, []);

  /**
   * Opens the SSE stream to receive real-time suggestions.
   * Closes any existing stream first.
   */
  const openStream = useCallback(() => {
    // Close any existing connection
    if (streamRef.current) {
      streamRef.current.close();
    }

    setConnectionStatus('connecting');

    const stream = api.createSuggestionStream();

    stream
      .onConnected(() => {
        setConnectionStatus('connected');
        retryCountRef.current = 0;
      })
      .onSuggestions((newSuggestions) => {
        setSuggestions(newSuggestions);
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
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      closeStream();
    };
  }, [checkAuth, openStream, closeStream]);

  /**
   * Dismisses a suggestion — removes it from local state and persists
   * the dismissal on the server.
   *
   * @param {string} suggestionId
   */
  const dismissSuggestion = useCallback(async (suggestionId) => {
    // Optimistic update — remove from local state immediately
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));

    try {
      await api.dismissSuggestion(suggestionId);
    } catch (err) {
      console.warn('Failed to persist dismissal:', err);
      // If the server call fails, the suggestion stays dismissed locally
      // (next poll will re-fetch anyway). Silently ignore.
    }
  }, [api]);

  /**
   * Triggers a manual scan and updates suggestions with the result.
   */
  const triggerScan = useCallback(async () => {
    try {
      const { suggestions: scanned } = await api.triggerScan();
      setSuggestions(scanned);
    } catch (err) {
      console.warn('Scan failed:', err);
      // Silently ignore — the SSE stream will deliver results on next poll
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
    connectGoogle,
    disconnectGoogle,
  };
}
