/**
 * Stress tests for storageService TypeScript migration.
 *
 * Hypotheses tested:
 *   H1 — Prototype-inherited keys (toString, constructor, hasOwnProperty)
 *        leak through the ?? null guard in createMemoryStorage.
 *   H2 — Empty-string values are correctly returned (not coerced to null).
 */
import { createMemoryStorage } from './storageService';

// ---------------------------------------------------------------------------
// H1: Prototype-inherited key leakage
// ---------------------------------------------------------------------------

describe('H1 — prototype-inherited keys do not leak', () => {
  const PROTO_KEYS = [
    'toString',
    'constructor',
    'hasOwnProperty',
    'valueOf',
    '__proto__',
  ];

  it.each(PROTO_KEYS)(
    'getItem("%s") returns null when key was never set',
    (key) => {
      const storage = createMemoryStorage();
      expect(storage.getItem(key)).toBeNull();
    },
  );

  it.each(PROTO_KEYS)(
    'getItem("%s") returns the stored value after setItem',
    (key) => {
      const storage = createMemoryStorage();
      storage.setItem(key, 'custom-value');
      expect(storage.getItem(key)).toBe('custom-value');
    },
  );
});

// ---------------------------------------------------------------------------
// H2: Empty-string values
// ---------------------------------------------------------------------------

describe('H2 — empty string values are preserved', () => {
  it('returns empty string, not null, after setItem("k", "")', () => {
    const storage = createMemoryStorage();
    storage.setItem('k', '');
    expect(storage.getItem('k')).toBe('');
  });

  it('distinguishes empty string from never-set key', () => {
    const storage = createMemoryStorage();
    storage.setItem('exists', '');
    expect(storage.getItem('exists')).toBe('');
    expect(storage.getItem('missing')).toBeNull();
  });
});
