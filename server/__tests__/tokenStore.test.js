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
    it('persists and retrieves tokens', async () => {
      const tokens = {
        access_token: 'access-123',
        refresh_token: 'refresh-456',
        expiry_date: 1700000000000,
      };

      await store.saveTokens(tokens);
      const retrieved = store.getTokens();

      expect(retrieved.access_token).toBe('access-123');
      expect(retrieved.refresh_token).toBe('refresh-456');
      expect(retrieved.expiry_date).toBe(1700000000000);
    });

    it('overwrites previous tokens', async () => {
      await store.saveTokens({ access_token: 'old' });
      await store.saveTokens({ access_token: 'new', refresh_token: 'r' });

      const retrieved = store.getTokens();
      expect(retrieved.access_token).toBe('new');
      expect(retrieved.refresh_token).toBe('r');
    });

    it('creates the directory if it does not exist', async () => {
      const nestedDir = join(tempDir, 'deeply', 'nested', 'dir');
      const nestedStore = createTokenStore(nestedDir);

      await nestedStore.saveTokens({ access_token: 'deep' });
      expect(nestedStore.getTokens().access_token).toBe('deep');
    });
  });

  describe('clearTokens', () => {
    it('clears stored tokens', async () => {
      await store.saveTokens({ access_token: 'abc' });
      await store.clearTokens();

      // After clearing, getTokens should return null (empty object has no access_token)
      expect(store.getTokens()).toBeNull();
    });

    it('does not throw when no tokens file exists', async () => {
      await expect(store.clearTokens()).resolves.not.toThrow();
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
    it('adds a suggestion ID to the dismissed list', async () => {
      await store.addDismissed('suggestion-1');
      expect(store.getDismissed()).toEqual(['suggestion-1']);
    });

    it('does not duplicate an already-dismissed ID', async () => {
      await store.addDismissed('suggestion-1');
      await store.addDismissed('suggestion-1');
      expect(store.getDismissed()).toEqual(['suggestion-1']);
    });

    it('accumulates multiple dismissed IDs', async () => {
      await store.addDismissed('suggestion-1');
      await store.addDismissed('suggestion-2');
      await store.addDismissed('suggestion-3');
      expect(store.getDismissed()).toEqual(['suggestion-1', 'suggestion-2', 'suggestion-3']);
    });

    it('prunes oldest entries when exceeding maxDismissed', async () => {
      const smallStore = createTokenStore(tempDir, 3); // max 3 dismissed

      await smallStore.addDismissed('suggestion-1');
      await smallStore.addDismissed('suggestion-2');
      await smallStore.addDismissed('suggestion-3');
      await smallStore.addDismissed('suggestion-4'); // should prune suggestion-1

      const dismissed = smallStore.getDismissed();
      expect(dismissed).toEqual(['suggestion-2', 'suggestion-3', 'suggestion-4']);
      expect(dismissed).not.toContain('suggestion-1');
    });

    it('keeps exactly maxDismissed entries after pruning', async () => {
      const smallStore = createTokenStore(tempDir, 2);

      await smallStore.addDismissed('a');
      await smallStore.addDismissed('b');
      await smallStore.addDismissed('c');
      await smallStore.addDismissed('d');

      expect(smallStore.getDismissed()).toEqual(['c', 'd']);
      expect(smallStore.getDismissed().length).toBe(2);
    });
  });

  // --- Instance isolation ---

  describe('isolation', () => {
    it('two stores with different directories do not share data', async () => {
      const dir2 = mkdtempSync(join(tmpdir(), 'token-store-test-2-'));
      const store2 = createTokenStore(dir2);

      await store.saveTokens({ access_token: 'store1' });
      await store2.saveTokens({ access_token: 'store2' });

      expect(store.getTokens().access_token).toBe('store1');
      expect(store2.getTokens().access_token).toBe('store2');

      rmSync(dir2, { recursive: true, force: true });
    });
  });
});
