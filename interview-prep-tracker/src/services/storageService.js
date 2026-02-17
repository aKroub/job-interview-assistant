/**
 * Storage service interface.
 *
 * All persistence in the app goes through this interface so that:
 *  - Production code uses localStorage
 *  - Tests inject a lightweight in-memory implementation with no globals to mock
 *
 * Interface shape:
 *   { getItem(key: string): string | null, setItem(key: string, value: string): void }
 */

/** Default production implementation backed by localStorage. */
export const localStorageService = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

/**
 * Creates a fresh in-memory storage instance.
 * Useful in tests — each test gets its own isolated store.
 *
 * @returns {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }}
 */
export function createMemoryStorage() {
  const store = {};
  return {
    getItem:  (key)        => store[key] ?? null,
    setItem:  (key, value) => { store[key] = value; },
  };
}
