import type { StorageService } from '../types';

/**
 * Storage service interface.
 *
 * All persistence in the app goes through this interface so that:
 *  - Production code uses localStorage
 *  - Tests inject a lightweight in-memory implementation with no globals to mock
 */

/** Default production implementation backed by localStorage. */
export const localStorageService: StorageService = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

/**
 * Creates a fresh in-memory storage instance.
 * Useful in tests — each test gets its own isolated store.
 */
export function createMemoryStorage(): StorageService {
  const store: Record<string, string> = Object.create(null) as Record<string, string>;
  return {
    getItem:  (key)        => store[key] ?? null,
    setItem:  (key, value) => { store[key] = value; },
  };
}
