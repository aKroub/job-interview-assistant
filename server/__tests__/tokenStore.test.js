import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTokenStore } from '../src/services/tokenStore.js';

describe('createTokenStore', () => {
  let tempDir;
  let store;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'token-store-test-'));
    store = createTokenStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- Token operations ---

  describe('getTokens', () => {
    it('returns null when no tokens file exists', () => {
      expect(store.getTokens()).toBeNull();
    });

    it('returns null for malformed JSON', () => {
      writeFileSync(join(tempDir, 'tokens.json'), 'not json', 'utf-8');
      expect(store.getTokens()).toBeNull();
    });

    it('returns null for JSON without access_token', () => {
      writeFileSync(join(tempDir, 'tokens.json'), '{"foo":"bar"}', 'utf-8');
      expect(store.getTokens()).toBeNull();
    });
  });

  describe('saveTokens + getTokens round-trip', () => {
    it('persists and retrieves tokens', () => {
      const tokens = {
        access_token: 'access-123',
        refresh_token: 'refresh-456',
        expiry_date: 1700000000000,
      };

      store.saveTokens(tokens);
      const retrieved = store.getTokens();

      expect(retrieved.access_token).toBe('access-123');
      expect(retrieved.refresh_token).toBe('refresh-456');
      expect(retrieved.expiry_date).toBe(1700000000000);
    });

    it('overwrites previous tokens', () => {
      store.saveTokens({ access_token: 'old' });
      store.saveTokens({ access_token: 'new', refresh_token: 'r' });

      const retrieved = store.getTokens();
      expect(retrieved.access_token).toBe('new');
      expect(retrieved.refresh_token).toBe('r');
    });

    it('creates the directory if it does not exist', () => {
      const nestedDir = join(tempDir, 'deeply', 'nested', 'dir');
      const nestedStore = createTokenStore(nestedDir);

      nestedStore.saveTokens({ access_token: 'deep' });
      expect(nestedStore.getTokens().access_token).toBe('deep');
    });
  });

  describe('clearTokens', () => {
    it('clears stored tokens', () => {
      store.saveTokens({ access_token: 'abc' });
      store.clearTokens();

      // After clearing, getTokens should return null (empty object has no access_token)
      expect(store.getTokens()).toBeNull();
    });

    it('does not throw when no tokens file exists', () => {
      expect(() => store.clearTokens()).not.toThrow();
    });
  });

  // --- Dismissed suggestions ---

  describe('getDismissed', () => {
    it('returns empty array when no dismissed file exists', () => {
      expect(store.getDismissed()).toEqual([]);
    });

    it('returns empty array for malformed JSON', () => {
      writeFileSync(join(tempDir, 'dismissed.json'), '!!!', 'utf-8');
      expect(store.getDismissed()).toEqual([]);
    });

    it('filters out non-string values', () => {
      writeFileSync(
        join(tempDir, 'dismissed.json'),
        JSON.stringify(['valid', 123, null, 'also-valid']),
        'utf-8'
      );
      expect(store.getDismissed()).toEqual(['valid', 'also-valid']);
    });
  });

  describe('addDismissed', () => {
    it('adds a suggestion ID to the dismissed list', () => {
      store.addDismissed('suggestion-1');
      expect(store.getDismissed()).toEqual(['suggestion-1']);
    });

    it('does not duplicate an already-dismissed ID', () => {
      store.addDismissed('suggestion-1');
      store.addDismissed('suggestion-1');
      expect(store.getDismissed()).toEqual(['suggestion-1']);
    });

    it('accumulates multiple dismissed IDs', () => {
      store.addDismissed('suggestion-1');
      store.addDismissed('suggestion-2');
      store.addDismissed('suggestion-3');
      expect(store.getDismissed()).toEqual(['suggestion-1', 'suggestion-2', 'suggestion-3']);
    });
  });

  // --- Instance isolation ---

  describe('isolation', () => {
    it('two stores with different directories do not share data', () => {
      const dir2 = mkdtempSync(join(tmpdir(), 'token-store-test-2-'));
      const store2 = createTokenStore(dir2);

      store.saveTokens({ access_token: 'store1' });
      store2.saveTokens({ access_token: 'store2' });

      expect(store.getTokens().access_token).toBe('store1');
      expect(store2.getTokens().access_token).toBe('store2');

      rmSync(dir2, { recursive: true, force: true });
    });
  });
});
