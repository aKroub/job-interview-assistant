import { writeFile, mkdir, access } from 'fs/promises';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Default directory for storing OAuth tokens — outside the repo, in the user's home folder.
 * This ensures tokens are never committed to git, even accidentally.
 */
const DEFAULT_DIR = join(homedir(), '.interview-tracker');
const TOKENS_FILE = 'tokens.json';
const DISMISSED_FILE = 'dismissed.json';
const DEFAULT_MAX_DISMISSED = 500;

/**
 * Creates a token store that reads/writes OAuth tokens and dismissed suggestion records
 * to a directory on disk. Uses an in-memory cache for fast synchronous reads,
 * with async writes to avoid blocking the event loop.
 *
 * Dismissed records store component IDs (emailId, calendarId) alongside the composite
 * suggestion ID. This prevents the same interview from resurfacing under a different
 * composite ID when the suggestion source changes (e.g. email-only → cross-referenced).
 *
 * @param {string} [dir=DEFAULT_DIR] - directory to store token and dismissed files
 * @param {number} [maxDismissed=DEFAULT_MAX_DISMISSED] - max dismissed entries to keep (oldest pruned)
 * @returns {{ getTokens, saveTokens, clearTokens, getDismissed, addDismissed, clearDismissed }}
 */
export function createTokenStore(dir = DEFAULT_DIR, maxDismissed = DEFAULT_MAX_DISMISSED) {
  const tokensPath    = join(dir, TOKENS_FILE);
  const dismissedPath = join(dir, DISMISSED_FILE);

  // In-memory caches — populated on first read (sync, one-time startup cost)
  let tokensCache = null;
  /** @type {Array<{ id: string, emailId?: string, calendarId?: string }> | null} */
  let dismissedCache = null;

  /**
   * Ensures the storage directory exists (async).
   */
  async function ensureDir() {
    try {
      await access(dir);
    } catch {
      await mkdir(dir, { recursive: true });
    }
  }

  /**
   * Reads persisted OAuth tokens from disk (synchronous, cached).
   * First call reads from disk, subsequent calls return from memory.
   *
   * @returns {{ access_token: string, refresh_token: string, expiry_date: number } | null}
   */
  function getTokens() {
    if (tokensCache !== null) return tokensCache;

    try {
      const raw = readFileSync(tokensPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.access_token === 'string') {
        tokensCache = parsed;
        return tokensCache;
      }
      tokensCache = null;
      return null;
    } catch {
      tokensCache = null;
      return null;
    }
  }

  /**
   * Persists OAuth tokens to disk (async, non-blocking).
   * Updates the in-memory cache immediately for subsequent getTokens() calls.
   *
   * @param {{ access_token: string, refresh_token?: string, expiry_date?: number }} tokens
   * @returns {Promise<void>}
   */
  async function saveTokens(tokens) {
    tokensCache = tokens;
    await ensureDir();
    await writeFile(tokensPath, JSON.stringify(tokens, null, 2), 'utf-8');
  }

  /**
   * Removes persisted tokens (disconnect/logout) — async, non-blocking.
   * Clears the in-memory cache immediately.
   *
   * @returns {Promise<void>}
   */
  async function clearTokens() {
    tokensCache = null;
    try {
      await ensureDir();
      await writeFile(tokensPath, '{}', 'utf-8');
    } catch {
      // File may not exist — that's fine
    }
  }

  /**
   * Loads the raw dismissed records from disk, migrating old string-only
   * entries to the new object format. Called once per store instance.
   *
   * @returns {Array<{ id: string, emailId: string, calendarId: string }>}
   */
  function loadDismissedRecords() {
    try {
      const raw = readFileSync(dismissedPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .map((entry) => {
          // Backward compat: old format stored plain strings
          if (typeof entry === 'string') {
            return { id: entry, emailId: '', calendarId: '' };
          }
          if (entry && typeof entry === 'object' && typeof entry.id === 'string') {
            return {
              id: entry.id,
              emailId: typeof entry.emailId === 'string' ? entry.emailId : '',
              calendarId: typeof entry.calendarId === 'string' ? entry.calendarId : '',
            };
          }
          return null;
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Returns the dismissed suggestion records as three Sets for O(1) lookup.
   * First call reads from disk, subsequent calls return from the in-memory cache.
   *
   * @returns {{ ids: Set<string>, emailIds: Set<string>, calendarIds: Set<string> }}
   */
  function getDismissed() {
    if (dismissedCache === null) {
      dismissedCache = loadDismissedRecords();
    }

    const ids = new Set();
    const emailIds = new Set();
    const calendarIds = new Set();

    for (const entry of dismissedCache) {
      ids.add(entry.id);
      if (entry.emailId) emailIds.add(entry.emailId);
      if (entry.calendarId) calendarIds.add(entry.calendarId);
    }

    return { ids, emailIds, calendarIds };
  }

  /**
   * Adds a dismissed suggestion record (async, non-blocking).
   * Updates the in-memory cache immediately.
   * Prunes the oldest entries if the list exceeds maxDismissed.
   *
   * Accepts either an object with component IDs or a plain string
   * (backward compat for any old callers).
   *
   * @param {string | { id: string, emailId?: string, calendarId?: string }} entry
   * @returns {Promise<void>}
   */
  async function addDismissed(entry) {
    // Normalise input — support plain string for backward compat
    const record = typeof entry === 'string'
      ? { id: entry, emailId: '', calendarId: '' }
      : {
        id: entry.id,
        emailId: entry.emailId || '',
        calendarId: entry.calendarId || '',
      };

    // Ensure cache is initialised
    if (dismissedCache === null) {
      dismissedCache = loadDismissedRecords();
    }

    // Check for duplicate by composite ID
    if (dismissedCache.some((e) => e.id === record.id)) return;

    dismissedCache.push(record);

    // Prune oldest entries if exceeds max
    if (dismissedCache.length > maxDismissed) {
      dismissedCache.splice(0, dismissedCache.length - maxDismissed);
    }

    await ensureDir();
    await writeFile(dismissedPath, JSON.stringify(dismissedCache, null, 2), 'utf-8');
  }

  /**
   * Clears all dismissed suggestion records (async, non-blocking).
   * Used by the reset endpoint so the user can re-evaluate all suggestions.
   *
   * @returns {Promise<void>}
   */
  async function clearDismissed() {
    dismissedCache = [];
    try {
      await ensureDir();
      await writeFile(dismissedPath, '[]', 'utf-8');
    } catch {
      // File may not exist — that's fine
    }
  }

  return { getTokens, saveTokens, clearTokens, getDismissed, addDismissed, clearDismissed };
}
