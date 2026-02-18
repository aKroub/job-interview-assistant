import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Default directory for storing OAuth tokens — outside the repo, in the user's home folder.
 * This ensures tokens are never committed to git, even accidentally.
 */
const DEFAULT_DIR = join(homedir(), '.interview-tracker');
const TOKENS_FILE = 'tokens.json';
const DISMISSED_FILE = 'dismissed.json';

/**
 * Creates a token store that reads/writes OAuth tokens and dismissed suggestion IDs
 * to a directory on disk. Defaults to ~/.interview-tracker/ but accepts an injectable
 * directory path for testing.
 *
 * @param {string} [dir=DEFAULT_DIR] - directory to store token and dismissed files
 * @returns {{ getTokens, saveTokens, clearTokens, getDismissed, addDismissed }}
 */
export function createTokenStore(dir = DEFAULT_DIR) {
  const tokensPath    = join(dir, TOKENS_FILE);
  const dismissedPath = join(dir, DISMISSED_FILE);

  function ensureDir() {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Reads persisted OAuth tokens from disk.
   *
   * @returns {{ access_token: string, refresh_token: string, expiry_date: number } | null}
   */
  function getTokens() {
    try {
      const raw = readFileSync(tokensPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.access_token === 'string') {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Persists OAuth tokens to disk.
   *
   * @param {{ access_token: string, refresh_token?: string, expiry_date?: number }} tokens
   */
  function saveTokens(tokens) {
    ensureDir();
    writeFileSync(tokensPath, JSON.stringify(tokens, null, 2), 'utf-8');
  }

  /**
   * Removes persisted tokens (disconnect/logout).
   */
  function clearTokens() {
    try {
      writeFileSync(tokensPath, '{}', 'utf-8');
    } catch {
      // File may not exist — that's fine
    }
  }

  /**
   * Returns the set of dismissed suggestion IDs.
   *
   * @returns {string[]}
   */
  function getDismissed() {
    try {
      const raw = readFileSync(dismissedPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  /**
   * Adds a suggestion ID to the dismissed list.
   *
   * @param {string} suggestionId
   */
  function addDismissed(suggestionId) {
    ensureDir();
    const current = getDismissed();
    if (!current.includes(suggestionId)) {
      current.push(suggestionId);
      writeFileSync(dismissedPath, JSON.stringify(current, null, 2), 'utf-8');
    }
  }

  return { getTokens, saveTokens, clearTokens, getDismissed, addDismissed };
}
