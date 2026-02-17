import { createMemoryStorage } from './storageService';

// ---------------------------------------------------------------------------
// createMemoryStorage — interface shape
// ---------------------------------------------------------------------------

describe('createMemoryStorage — interface', () => {
  it('returns an object with getItem and setItem methods', () => {
    const storage = createMemoryStorage();
    expect(typeof storage.getItem).toBe('function');
    expect(typeof storage.setItem).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// createMemoryStorage — getItem
// ---------------------------------------------------------------------------

describe('createMemoryStorage — getItem', () => {
  it('returns null for a key that has not been set', () => {
    const storage = createMemoryStorage();
    expect(storage.getItem('missing')).toBeNull();
  });

  it('returns the value that was previously set', () => {
    const storage = createMemoryStorage();
    storage.setItem('foo', 'bar');
    expect(storage.getItem('foo')).toBe('bar');
  });

  it('returns the latest value after multiple sets for the same key', () => {
    const storage = createMemoryStorage();
    storage.setItem('key', 'first');
    storage.setItem('key', 'second');
    expect(storage.getItem('key')).toBe('second');
  });
});

// ---------------------------------------------------------------------------
// createMemoryStorage — setItem
// ---------------------------------------------------------------------------

describe('createMemoryStorage — setItem', () => {
  it('stores different values under different keys independently', () => {
    const storage = createMemoryStorage();
    storage.setItem('a', '1');
    storage.setItem('b', '2');
    expect(storage.getItem('a')).toBe('1');
    expect(storage.getItem('b')).toBe('2');
  });

  it('accepts JSON strings (mirrors localStorage usage pattern)', () => {
    const storage = createMemoryStorage();
    const data = [{ id: '1', name: 'Acme' }];
    storage.setItem('companies', JSON.stringify(data));
    expect(JSON.parse(storage.getItem('companies'))).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// createMemoryStorage — isolation between instances
// ---------------------------------------------------------------------------

describe('createMemoryStorage — instance isolation', () => {
  it('two instances do not share data', () => {
    const s1 = createMemoryStorage();
    const s2 = createMemoryStorage();
    s1.setItem('key', 'from-s1');
    expect(s2.getItem('key')).toBeNull();
  });
});
