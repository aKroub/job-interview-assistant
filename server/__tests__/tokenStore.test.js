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
    it('returns empty Sets when no dismissed file exists', () => {
      const dismissed = store.getDismissed();
      expect(dismissed.ids.size).toBe(0);
      expect(dismissed.emailIds.size).toBe(0);
      expect(dismissed.calendarIds.size).toBe(0);
    });

    it('returns empty Sets for malformed JSON', () => {
      writeFileSync(join(tempDir, 'dismissed.json'), '!!!', 'utf-8');
      const dismissed = store.getDismissed();
      expect(dismissed.ids.size).toBe(0);
    });

    it('returns the three Sets: ids, emailIds, calendarIds', () => {
      writeFileSync(
        join(tempDir, 'dismissed.json'),
        JSON.stringify([
          { id: 'suggestion_gmail_msg1', emailId: 'msg1', calendarId: '' },
          { id: 'suggestion_msg2_evt2', emailId: 'msg2', calendarId: 'evt2' },
        ]),
        'utf-8'
      );

      const dismissed = store.getDismissed();
      expect(dismissed.ids).toEqual(new Set(['suggestion_gmail_msg1', 'suggestion_msg2_evt2']));
      expect(dismissed.emailIds).toEqual(new Set(['msg1', 'msg2']));
      expect(dismissed.calendarIds).toEqual(new Set(['evt2']));
    });
  });

  describe('getDismissed — backward compatibility', () => {
    it('loads old string-only format into ids Set', () => {
      writeFileSync(
        join(tempDir, 'dismissed.json'),
        JSON.stringify(['suggestion_gmail_msg1', 'suggestion_msg2_evt2']),
        'utf-8'
      );

      const dismissed = store.getDismissed();
      expect(dismissed.ids).toEqual(new Set(['suggestion_gmail_msg1', 'suggestion_msg2_evt2']));
      // Old format has no component IDs
      expect(dismissed.emailIds.size).toBe(0);
      expect(dismissed.calendarIds.size).toBe(0);
    });

    it('handles mixed old string + new object entries', () => {
      writeFileSync(
        join(tempDir, 'dismissed.json'),
        JSON.stringify([
          'old-string-entry',
          { id: 'new-object-entry', emailId: 'msg1', calendarId: 'evt1' },
        ]),
        'utf-8'
      );

      const dismissed = store.getDismissed();
      expect(dismissed.ids).toEqual(new Set(['old-string-entry', 'new-object-entry']));
      expect(dismissed.emailIds).toEqual(new Set(['msg1']));
      expect(dismissed.calendarIds).toEqual(new Set(['evt1']));
    });

    it('filters out non-string, non-object values', () => {
      writeFileSync(
        join(tempDir, 'dismissed.json'),
        JSON.stringify(['valid', 123, null, { id: 'also-valid', emailId: 'e1', calendarId: '' }]),
        'utf-8'
      );

      const dismissed = store.getDismissed();
      expect(dismissed.ids).toEqual(new Set(['valid', 'also-valid']));
    });
  });

  describe('addDismissed', () => {
    it('adds a suggestion record with component IDs', async () => {
      await store.addDismissed({ id: 'suggestion-1', emailId: 'msg1', calendarId: 'evt1' });

      const dismissed = store.getDismissed();
      expect(dismissed.ids.has('suggestion-1')).toBe(true);
      expect(dismissed.emailIds.has('msg1')).toBe(true);
      expect(dismissed.calendarIds.has('evt1')).toBe(true);
    });

    it('accepts a plain string for backward compatibility', async () => {
      await store.addDismissed('suggestion-1');

      const dismissed = store.getDismissed();
      expect(dismissed.ids.has('suggestion-1')).toBe(true);
    });

    it('does not duplicate an already-dismissed ID', async () => {
      await store.addDismissed({ id: 'suggestion-1', emailId: 'msg1', calendarId: '' });
      await store.addDismissed({ id: 'suggestion-1', emailId: 'msg1', calendarId: '' });

      const dismissed = store.getDismissed();
      expect(dismissed.ids.size).toBe(1);
    });

    it('accumulates multiple dismissed entries', async () => {
      await store.addDismissed({ id: 'suggestion-1', emailId: 'msg1', calendarId: '' });
      await store.addDismissed({ id: 'suggestion-2', emailId: 'msg2', calendarId: 'evt2' });
      await store.addDismissed({ id: 'suggestion-3', emailId: '', calendarId: 'evt3' });

      const dismissed = store.getDismissed();
      expect(dismissed.ids.size).toBe(3);
      expect(dismissed.emailIds).toEqual(new Set(['msg1', 'msg2']));
      expect(dismissed.calendarIds).toEqual(new Set(['evt2', 'evt3']));
    });

    it('prunes oldest entries when exceeding maxDismissed', async () => {
      const smallStore = createTokenStore(tempDir, 3); // max 3 dismissed

      await smallStore.addDismissed({ id: 'suggestion-1', emailId: 'msg1', calendarId: '' });
      await smallStore.addDismissed({ id: 'suggestion-2', emailId: 'msg2', calendarId: '' });
      await smallStore.addDismissed({ id: 'suggestion-3', emailId: 'msg3', calendarId: '' });
      await smallStore.addDismissed({ id: 'suggestion-4', emailId: 'msg4', calendarId: '' });

      const dismissed = smallStore.getDismissed();
      expect(dismissed.ids.has('suggestion-1')).toBe(false);
      expect(dismissed.ids).toEqual(new Set(['suggestion-2', 'suggestion-3', 'suggestion-4']));
    });

    it('keeps exactly maxDismissed entries after pruning', async () => {
      const smallStore = createTokenStore(tempDir, 2);

      await smallStore.addDismissed('a');
      await smallStore.addDismissed('b');
      await smallStore.addDismissed('c');
      await smallStore.addDismissed('d');

      const dismissed = smallStore.getDismissed();
      expect(dismissed.ids).toEqual(new Set(['c', 'd']));
      expect(dismissed.ids.size).toBe(2);
    });

    it('stores empty strings for missing component IDs', async () => {
      await store.addDismissed({ id: 'sug1', emailId: 'msg1' });
      await store.addDismissed({ id: 'sug2', calendarId: 'evt2' });

      const dismissed = store.getDismissed();
      expect(dismissed.emailIds).toEqual(new Set(['msg1']));
      expect(dismissed.calendarIds).toEqual(new Set(['evt2']));
      // Empty strings should NOT appear in the Sets
      expect(dismissed.emailIds.has('')).toBe(false);
      expect(dismissed.calendarIds.has('')).toBe(false);
    });
  });

  describe('clearDismissed', () => {
    it('clears all dismissed entries', async () => {
      await store.addDismissed({ id: 'sug-1', emailId: 'msg1', calendarId: 'evt1' });
      await store.addDismissed({ id: 'sug-2', emailId: 'msg2', calendarId: '' });

      expect(store.getDismissed().ids.size).toBe(2);

      await store.clearDismissed();

      const dismissed = store.getDismissed();
      expect(dismissed.ids.size).toBe(0);
      expect(dismissed.emailIds.size).toBe(0);
      expect(dismissed.calendarIds.size).toBe(0);
    });

    it('does not throw when no dismissed file exists', async () => {
      await expect(store.clearDismissed()).resolves.not.toThrow();
    });

    it('allows adding new entries after clearing', async () => {
      await store.addDismissed({ id: 'sug-1', emailId: 'msg1', calendarId: '' });
      await store.clearDismissed();
      await store.addDismissed({ id: 'sug-2', emailId: 'msg2', calendarId: 'evt2' });

      const dismissed = store.getDismissed();
      expect(dismissed.ids).toEqual(new Set(['sug-2']));
      expect(dismissed.emailIds).toEqual(new Set(['msg2']));
      expect(dismissed.calendarIds).toEqual(new Set(['evt2']));
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
