/**
 * API service for communicating with the Express backend.
 *
 * All functions are pure (no React) and accept injectable dependencies
 * so tests can substitute `fetch` and `EventSource` without touching globals.
 *
 * The CRA dev server proxies `/api/*` to `http://localhost:3001` via the
 * `"proxy"` field in package.json, so all paths are relative.
 */

/**
 * Fetches the current Google OAuth authentication status.
 *
 * @param {Function} [fetchFn=fetch] - injectable fetch for testing
 * @returns {Promise<{ authenticated: boolean }>}
 */
export async function fetchAuthStatus(fetchFn = fetch) {
  const res = await fetchFn('/api/auth/status');
  if (!res.ok) throw new Error(`Auth status failed: ${res.status}`);
  return res.json();
}

/**
 * Fetches the Google OAuth consent URL.
 *
 * @param {Function} [fetchFn=fetch] - injectable fetch for testing
 * @returns {Promise<{ url: string }>}
 */
export async function fetchAuthUrl(fetchFn = fetch) {
  const res = await fetchFn('/api/auth/url');
  if (!res.ok) throw new Error(`Auth URL failed: ${res.status}`);
  return res.json();
}

/**
 * Disconnects the Google OAuth session (clears server-side tokens).
 *
 * @param {Function} [fetchFn=fetch] - injectable fetch for testing
 * @returns {Promise<{ authenticated: false }>}
 */
export async function disconnectAuth(fetchFn = fetch) {
  const res = await fetchFn('/api/auth/disconnect', { method: 'POST' });
  if (!res.ok) throw new Error(`Disconnect failed: ${res.status}`);
  return res.json();
}

/**
 * Dismisses a suggestion so it won't appear again.
 *
 * @param {string} suggestionId - the suggestion ID to dismiss
 * @param {Function} [fetchFn=fetch] - injectable fetch for testing
 * @returns {Promise<{ dismissed: true }>}
 */
export async function dismissSuggestion(suggestionId, fetchFn = fetch) {
  const res = await fetchFn('/api/interviews/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestionId }),
  });
  if (!res.ok) throw new Error(`Dismiss failed: ${res.status}`);
  return res.json();
}

/**
 * Triggers a manual scan and returns the detected suggestions immediately.
 *
 * @param {Function} [fetchFn=fetch] - injectable fetch for testing
 * @returns {Promise<{ suggestions: Object[] }>}
 */
export async function triggerScan(fetchFn = fetch) {
  const res = await fetchFn('/api/interviews/scan', { method: 'POST' });
  if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
  return res.json();
}

/**
 * Saves the current app state to Google Drive.
 *
 * @param {{ companies: Object[], seenQuestions: string[] }} data
 * @param {Function} [fetchFn=fetch] - injectable fetch for testing
 * @returns {Promise<{ saved: boolean, savedAt: string }>}
 */
export async function saveToDrive(data, fetchFn = fetch) {
  const res = await fetchFn('/api/sync/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Save to Drive failed: ${res.status}`);
  return res.json();
}

/**
 * Loads app state from Google Drive.
 *
 * @param {Function} [fetchFn=fetch] - injectable fetch for testing
 * @returns {Promise<Object>}
 */
export async function loadFromDrive(fetchFn = fetch) {
  const res = await fetchFn('/api/sync/load');
  if (!res.ok) throw new Error(`Load from Drive failed: ${res.status}`);
  return res.json();
}

/**
 * Checks whether a backup exists on Google Drive.
 *
 * @param {Function} [fetchFn=fetch] - injectable fetch for testing
 * @returns {Promise<{ exists: boolean, lastSaved: string | null }>}
 */
export async function fetchBackupStatus(fetchFn = fetch) {
  const res = await fetchFn('/api/sync/status');
  if (!res.ok) throw new Error(`Backup status failed: ${res.status}`);
  return res.json();
}

/**
 * Creates an SSE connection to the suggestions stream.
 *
 * Returns an object with event handler setters and a close method.
 * The caller is responsible for calling `close()` on unmount to clean up.
 *
 * SSE events from the server:
 *   - `connected`     → `{ status: 'connected' }`
 *   - `suggestions`   → array of suggestion objects
 *   - `scan-complete` → `{ scanned: number }`
 *   - `error`         → `{ message: string }`
 *
 * @param {Function} [EventSourceCtor=EventSource] - injectable constructor for testing
 * @returns {{ onConnected: Function, onSuggestions: Function, onScanComplete: Function, onError: Function, close: Function }}
 */
export function createSuggestionStream(EventSourceCtor = EventSource) {
  const source = new EventSourceCtor('/api/interviews/suggestions');

  /**
   * Track whether the connection has opened and any pending handler.
   *
   * Race-condition fix: the server sends `event: connected` immediately,
   * but `.onConnected(handler)` is called later (after the chained API
   * returns). If the browser fires the event before the listener is
   * registered the handler never runs, leaving the UI stuck on
   * "Connecting…".
   *
   * Solution: use EventSource's built-in `onopen` callback (fires when
   * readyState transitions to OPEN) which can be assigned synchronously
   * before the stream object is returned.  If `onConnected(handler)` is
   * called after `onopen` has already fired we invoke the handler
   * immediately.  As a further safety net, `onConnected` also checks
   * `source.readyState === 1` (OPEN) in case `onopen` was missed.
   */
  let opened = false;
  let connectedHandler = null;

  source.onopen = () => {
    opened = true;
    if (connectedHandler) {
      connectedHandler({ status: 'connected' });
    }
  };

  /**
   * Returns true if the EventSource has already opened, checking both
   * the local flag and the native readyState (OPEN = 1).
   */
  function isOpen() {
    return opened || source.readyState === 1;
  }

  const stream = {
    /**
     * Registers a handler for the SSE connection being established.
     *
     * Uses EventSource's native `onopen` to avoid a race condition
     * where the server's `connected` event arrives before the listener
     * is attached.  If the connection is already open when this is
     * called, the handler fires immediately.
     *
     * @param {(data: { status: string }) => void} handler
     * @returns {typeof stream} for chaining
     */
    onConnected(handler) {
      connectedHandler = handler;
      if (isOpen()) {
        handler({ status: 'connected' });
      }
      return stream;
    },

    /**
     * Registers a handler for the `suggestions` SSE event.
     *
     * @param {(suggestions: Object[]) => void} handler
     * @returns {typeof stream} for chaining
     */
    onSuggestions(handler) {
      source.addEventListener('suggestions', (e) => {
        try {
          handler(JSON.parse(e.data));
        } catch {
          // Malformed JSON from server — skip this event
        }
      });
      return stream;
    },

    /**
     * Registers a handler for the `scan-complete` SSE event.
     *
     * @param {(data: { scanned: number }) => void} handler
     * @returns {typeof stream} for chaining
     */
    onScanComplete(handler) {
      source.addEventListener('scan-complete', (e) => {
        try {
          handler(JSON.parse(e.data));
        } catch {
          // Malformed JSON — skip
        }
      });
      return stream;
    },

    /**
     * Registers a handler for SSE errors (both stream-level and server-sent).
     *
     * @param {(error: { message: string } | Event) => void} handler
     * @returns {typeof stream} for chaining
     */
    onError(handler) {
      source.addEventListener('error', (e) => {
        // Server-sent error event has data; native EventSource errors don't
        if (e.data) {
          try {
            handler(JSON.parse(e.data));
          } catch {
            handler({ message: 'Received malformed error from server' });
          }
        } else {
          handler({ message: 'SSE connection error' });
        }
      });
      return stream;
    },

    /**
     * Closes the SSE connection. Must be called on unmount.
     */
    close() {
      source.close();
    },
  };

  return stream;
}
