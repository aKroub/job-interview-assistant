import { readFile, writeFile, mkdir, access } from 'fs/promises';
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
 * Creates a token store that reads/writes OAuth tokens and dismissed suggestion IDs
 * to a directory on disk. Uses an in-memory cache for fast synchronous reads,
 * with async writes to avoid blocking the event loop.
 *
 * @param {string} [dir=DEFAULT_DIR] - directory to store token and dismissed files
 * @param {number} [maxDismissed=DEFAULT_MAX_DISMISSED] - max dismissed IDs to keep (oldest pruned)
 * @returns {{ getTokens, saveTokens, clearTokens, getDismissed, addDismissed }}
 */
export function createTokenStore(dir = DEFAULT_DIR, maxDismissed = DEFAULT_MAX_DISMISSED) {
  const tokensPath    = join(dir, TOKENS_FILE);
  const dismissedPath = join(dir, DISMISSED_FILE);

  // In-memory caches — populated on first read (sync, one-time startup cost)
  let tokensCache = null;
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
   * Returns the set of dismissed suggestion IDs (synchronous, cached).
   * First call reads from disk, subsequent calls return from memory.
   *
   * @returns {string[]}
   */
  function getDismissed() {
    if (dismissedCache !== null) return dismissedCache;

    try {
      const raw = readFileSync(dismissedPath, 'utf-8');
      const parsed = JSON.parse(raw);
      dismissedCache = Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
      return dismissedCache;
    } catch {
      dismissedCache = [];
      return [];
    }
  }

  /**
   * Adds a suggestion ID to the dismissed list (async, non-blocking).
   * Updates the in-memory cache immediately.
   * Prunes the oldest entries if the list exceeds maxDismissed.
   *
   * @param {string} suggestionId
   * @returns {Promise<void>}
   */
  async function addDismissed(suggestionId) {
    const current = getDismissed();
    if (!current.includes(suggestionId)) {
      current.push(suggestionId);
      
      // Prune oldest entries if exceeds max
      if (current.length > maxDismissed) {
        current.splice(0, current.length - maxDismissed);
      }

      dismissedCache = current;
      await ensureDir();
      await writeFile(dismissedPath, JSON.stringify(current, null, 2), 'utf-8');
    }
  }

  return { getTokens, saveTokens, clearTokens, getDismissed, addDismissed };
}
