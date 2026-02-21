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

  const stream = {
    /**
     * Registers a handler for the `connected` SSE event.
     *
     * @param {(data: { status: string }) => void} handler
     * @returns {typeof stream} for chaining
     */
    onConnected(handler) {
      source.addEventListener('connected', (e) => {
        try {
          handler(JSON.parse(e.data));
        } catch {
          // Malformed JSON from server — skip this event
        }
      });
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
