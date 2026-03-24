import { writeFile, mkdir, access } from 'fs/promises';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { OAuthTokens, DismissedRecord, DismissedSets, SurfacedRecords, SurfacedSets, TokenStore } from '../types';

/**
 * Default directory for storing OAuth tokens — outside the repo, in the user's home folder.
 * This ensures tokens are never committed to git, even accidentally.
 */
const DEFAULT_DIR = join(homedir(), '.interview-tracker');
const TOKENS_FILE = 'tokens.json';
const DISMISSED_FILE = 'dismissed.json';
const SURFACED_FILE = 'surfaced.json';
const DEFAULT_MAX_DISMISSED = 500;
const DEFAULT_MAX_SURFACED = 500;

/**
 * Creates a token store that reads/writes OAuth tokens and dismissed suggestion records
 * to a directory on disk. Uses an in-memory cache for fast synchronous reads,
 * with async writes to avoid blocking the event loop.
 *
 * Dismissed records store component IDs (emailId, calendarId) alongside the composite
 * suggestion ID. This prevents the same interview from resurfacing under a different
 * composite ID when the suggestion source changes (e.g. email-only → cross-referenced).
 */
export function createTokenStore(dir = DEFAULT_DIR, maxDismissed = DEFAULT_MAX_DISMISSED): TokenStore {
  const tokensPath    = join(dir, TOKENS_FILE);
  const dismissedPath = join(dir, DISMISSED_FILE);
  const surfacedPath  = join(dir, SURFACED_FILE);

  // In-memory caches — populated on first read (sync, one-time startup cost)
  let tokensCache: OAuthTokens | null = null;
  let dismissedCache: DismissedRecord[] | null = null;
  let surfacedCache: SurfacedRecords | null = null;

  /**
   * Ensures the storage directory exists (async).
   */
  async function ensureDir(): Promise<void> {
    try {
      await access(dir);
    } catch {
      await mkdir(dir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Reads persisted OAuth tokens from disk (synchronous, cached).
   * First call reads from disk, subsequent calls return from memory.
   *
   */
  function getTokens(): OAuthTokens | null {
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
   */
  async function saveTokens(tokens: OAuthTokens): Promise<void> {
    tokensCache = tokens;
    await ensureDir();
    await writeFile(tokensPath, JSON.stringify(tokens, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }

  /**
   * Removes persisted tokens (disconnect/logout) — async, non-blocking.
   * Clears the in-memory cache immediately.
   *
   */
  async function clearTokens(): Promise<void> {
    tokensCache = null;
    try {
      await ensureDir();
      await writeFile(tokensPath, '{}', { encoding: 'utf-8', mode: 0o600 });
    } catch {
      // File may not exist — that's fine
    }
  }

  /**
   * Loads the raw dismissed records from disk, migrating old string-only
   * entries to the new object format. Called once per store instance.
   *
   */
  function loadDismissedRecords(): DismissedRecord[] {
    try {
      const raw = readFileSync(dismissedPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .map((entry: unknown): DismissedRecord | null => {
          // Backward compat: old format stored plain strings
          if (typeof entry === 'string') {
            return { id: entry, emailId: '', calendarId: '' };
          }
          if (entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).id === 'string') {
            const e = entry as Record<string, unknown>;
            return {
              id: e.id as string,
              emailId: typeof e.emailId === 'string' ? e.emailId : '',
              calendarId: typeof e.calendarId === 'string' ? e.calendarId : '',
            };
          }
          return null;
        })
        .filter((x): x is DismissedRecord => x !== null);
    } catch {
      return [];
    }
  }

  /**
   * Returns the dismissed suggestion records as three Sets for O(1) lookup.
   * First call reads from disk, subsequent calls return from the in-memory cache.
   *
   */
  function getDismissed(): DismissedSets {
    if (dismissedCache === null) {
      dismissedCache = loadDismissedRecords();
    }

    const ids = new Set<string>();
    const emailIds = new Set<string>();
    const calendarIds = new Set<string>();

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
   */
  async function addDismissed(entry: string | { id: string; emailId?: string; calendarId?: string }): Promise<void> {
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
    await writeFile(dismissedPath, JSON.stringify(dismissedCache, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }

  /**
   * Clears all dismissed suggestion records (async, non-blocking).
   * Used by the reset endpoint so the user can re-evaluate all suggestions.
   *
   */
  async function clearDismissed(): Promise<void> {
    dismissedCache = [];
    try {
      await ensureDir();
      await writeFile(dismissedPath, '[]', { encoding: 'utf-8', mode: 0o600 });
    } catch {
      // File may not exist — that's fine
    }
  }

  /**
   * Loads surfaced records from disk. Called once per store instance.
   *
   */
  function loadSurfacedRecords(): SurfacedRecords {
    try {
      const raw = readFileSync(surfacedPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return { emailIds: [], calendarIds: [] };
      }
      return {
        emailIds: Array.isArray(parsed.emailIds)
          ? parsed.emailIds.filter((id: unknown) => typeof id === 'string') as string[]
          : [],
        calendarIds: Array.isArray(parsed.calendarIds)
          ? parsed.calendarIds.filter((id: unknown) => typeof id === 'string') as string[]
          : [],
      };
    } catch {
      return { emailIds: [], calendarIds: [] };
    }
  }

  /**
   * Returns the surfaced email and calendar IDs as Sets for O(1) lookup.
   * First call reads from disk, subsequent calls return from the in-memory cache.
   *
   */
  function getSurfaced(): SurfacedSets {
    if (surfacedCache === null) {
      surfacedCache = loadSurfacedRecords();
    }
    return {
      emailIds: new Set(surfacedCache.emailIds),
      calendarIds: new Set(surfacedCache.calendarIds),
    };
  }

  /**
   * Marks email and calendar IDs as surfaced (async, non-blocking).
   * Updates the in-memory cache immediately. Deduplicates and prunes
   * to DEFAULT_MAX_SURFACED entries per type.
   *
   */
  async function addSurfaced(emailIds: string[] = [], calendarIds: string[] = []): Promise<void> {
    if (surfacedCache === null) {
      surfacedCache = loadSurfacedRecords();
    }

    const emailSet = new Set(surfacedCache.emailIds);
    const calendarSet = new Set(surfacedCache.calendarIds);

    for (const id of emailIds) {
      if (id) emailSet.add(id);
    }
    for (const id of calendarIds) {
      if (id) calendarSet.add(id);
    }

    // Prune to max size (keep most recent additions)
    surfacedCache.emailIds = [...emailSet].slice(-DEFAULT_MAX_SURFACED);
    surfacedCache.calendarIds = [...calendarSet].slice(-DEFAULT_MAX_SURFACED);

    await ensureDir();
    await writeFile(surfacedPath, JSON.stringify(surfacedCache, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }

  /**
   * Clears all surfaced records (async, non-blocking).
   * Used for one-time state resets.
   *
   */
  async function clearSurfaced(): Promise<void> {
    surfacedCache = { emailIds: [], calendarIds: [] };
    try {
      await ensureDir();
      await writeFile(surfacedPath, JSON.stringify(surfacedCache, null, 2), { encoding: 'utf-8', mode: 0o600 });
    } catch {
      // File may not exist — that's fine
    }
  }

  return {
    getTokens, saveTokens, clearTokens,
    getDismissed, addDismissed, clearDismissed,
    getSurfaced, addSurfaced, clearSurfaced,
  };
}
