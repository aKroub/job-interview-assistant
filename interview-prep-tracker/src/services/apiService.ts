import type { Company, DriveBackup, SuggestionStream } from '../types';

/**
 * API service for communicating with the Express backend.
 *
 * All functions are pure (no React) and accept injectable dependencies
 * so tests can substitute `fetch` and `EventSource` without touching globals.
 *
 * The Vite dev server proxies `/api/*` to `http://localhost:3001` via the
 * proxy config in vite.config.ts, so all paths are relative.
 */

/**
 * Fetches the current Google OAuth authentication status.
 *
 * @param fetchFn - injectable fetch for testing
 */
export async function fetchAuthStatus(fetchFn: typeof fetch = fetch): Promise<{ authenticated: boolean }> {
  const res = await fetchFn('/api/auth/status');
  if (!res.ok) throw new Error(`Auth status failed: ${res.status}`);
  return res.json();
}

/**
 * Fetches the Google OAuth consent URL.
 *
 * @param fetchFn - injectable fetch for testing
 */
export async function fetchAuthUrl(fetchFn: typeof fetch = fetch): Promise<{ url: string }> {
  const res = await fetchFn('/api/auth/url');
  if (!res.ok) throw new Error(`Auth URL failed: ${res.status}`);
  return res.json();
}

/**
 * Disconnects the Google OAuth session (clears server-side tokens).
 *
 * @param fetchFn - injectable fetch for testing
 */
export async function disconnectAuth(fetchFn: typeof fetch = fetch): Promise<{ authenticated: false }> {
  const res = await fetchFn('/api/auth/disconnect', { method: 'POST' });
  if (!res.ok) throw new Error(`Disconnect failed: ${res.status}`);
  return res.json();
}

/**
 * Dismisses a suggestion so it won't appear again.
 *
 * Sends component IDs (emailMessageId, calendarEventId) alongside the composite
 * suggestion ID so the backend can prevent the same interview from resurfacing
 * under a different composite ID when the suggestion source changes.
 *
 * @param suggestionId - the composite suggestion ID to dismiss
 * @param emailMessageId - the email message ID (if known)
 * @param calendarEventId - the calendar event ID (if known)
 * @param fetchFn - injectable fetch for testing
 */
export async function dismissSuggestion(
  suggestionId: string,
  emailMessageId = '',
  calendarEventId = '',
  fetchFn: typeof fetch = fetch,
): Promise<{ dismissed: true }> {
  const res = await fetchFn('/api/interviews/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestionId, emailMessageId, calendarEventId }),
  });
  if (!res.ok) throw new Error(`Dismiss failed: ${res.status}`);
  return res.json();
}

/**
 * Triggers a manual scan and returns the detected suggestions immediately.
 *
 * @param fetchFn - injectable fetch for testing
 */
export async function triggerScan(fetchFn: typeof fetch = fetch): Promise<{ suggestions: unknown[] }> {
  const res = await fetchFn('/api/interviews/scan', { method: 'POST' });
  if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
  return res.json();
}

/**
 * Resets all dismissed suggestions on the server so they reappear.
 *
 * @param fetchFn - injectable fetch for testing
 */
export async function resetSuggestions(fetchFn: typeof fetch = fetch): Promise<{ reset: true }> {
  const res = await fetchFn('/api/interviews/reset', { method: 'POST' });
  if (!res.ok) throw new Error(`Reset failed: ${res.status}`);
  return res.json();
}

/**
 * Saves the current app state to Google Drive as a new backup version.
 * Returns the updated list of available backups.
 *
 * @param data - app state to persist
 * @param fetchFn - injectable fetch for testing
 */
export async function saveToDrive(
  data: { companies: Company[]; seenQuestions: string[] },
  fetchFn: typeof fetch = fetch,
): Promise<{ saved: boolean; savedAt: string; backups: DriveBackup[] }> {
  const res = await fetchFn('/api/sync/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Save to Drive failed: ${res.status}`);
  return res.json();
}

/**
 * Loads app state from a specific backup version on Google Drive.
 *
 * @param fileId - the Google Drive file ID of the backup to load
 * @param fetchFn - injectable fetch for testing
 */
export async function loadFromDrive(
  fileId: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ companies: Company[]; seenQuestions: string[] }> {
  const res = await fetchFn(`/api/sync/load?fileId=${encodeURIComponent(fileId)}`);
  if (!res.ok) throw new Error(`Load from Drive failed: ${res.status}`);
  return res.json();
}

/**
 * Fetches the list of available backup versions on Google Drive.
 *
 * @param fetchFn - injectable fetch for testing
 */
export async function fetchBackupStatus(fetchFn: typeof fetch = fetch): Promise<{ backups: DriveBackup[] }> {
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
 * @param EventSourceCtor - injectable constructor for testing
 */
export function createSuggestionStream(EventSourceCtor: typeof EventSource = EventSource): SuggestionStream {
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
  let connectedHandler: ((data: { status: string }) => void) | null = null;

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

  const stream: SuggestionStream = {
    onConnected(handler) {
      connectedHandler = handler;
      if (isOpen()) {
        handler({ status: 'connected' });
      }
      return stream;
    },

    onSuggestions(handler) {
      source.addEventListener('suggestions', (e) => {
        try {
          handler(JSON.parse((e as MessageEvent).data));
        } catch {
          // Malformed JSON from server — skip this event
        }
      });
      return stream;
    },

    onScanComplete(handler) {
      source.addEventListener('scan-complete', (e) => {
        try {
          handler(JSON.parse((e as MessageEvent).data));
        } catch {
          // Malformed JSON — skip
        }
      });
      return stream;
    },

    onError(handler) {
      source.addEventListener('error', (e) => {
        // Server-sent error event has data; native EventSource errors don't
        const event = e as MessageEvent;
        if (event.data) {
          try {
            handler(JSON.parse(event.data));
          } catch {
            handler({ message: 'Received malformed error from server' });
          }
        } else {
          handler({ message: 'SSE connection error' });
        }
      });
      return stream;
    },

    close() {
      source.close();
    },
  };

  return stream;
}
