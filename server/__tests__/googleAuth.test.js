import { describe, it, expect, beforeEach } from '@jest/globals';
import { createGoogleAuth } from '../src/services/googleAuth.js';

/**
 * Creates a mock token store for testing.
 * Mirrors the interface of the real createTokenStore.
 */
function createMockTokenStore(initialTokens = null) {
  let tokens = initialTokens;
  return {
    getTokens: () => tokens,
    saveTokens: (t) => { tokens = t; },
    clearTokens: () => { tokens = null; },
    _getInternal: () => tokens,
  };
}

const TEST_CONFIG = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'http://localhost:3001/api/auth/callback',
};

describe('createGoogleAuth', () => {
  let tokenStore;
  let auth;

  beforeEach(() => {
    tokenStore = createMockTokenStore();
    auth = createGoogleAuth(TEST_CONFIG, tokenStore);
  });

  describe('getAuthUrl', () => {
    it('returns a Google accounts URL', () => {
      const url = auth.getAuthUrl();
      expect(url).toContain('accounts.google.com');
    });

    it('includes the gmail.readonly scope', () => {
      const url = auth.getAuthUrl();
      expect(url).toContain('gmail.readonly');
    });

    it('includes the calendar.readonly scope', () => {
      const url = auth.getAuthUrl();
      expect(url).toContain('calendar.readonly');
    });

    it('includes access_type=offline for refresh tokens', () => {
      const url = auth.getAuthUrl();
      expect(url).toContain('access_type=offline');
    });

    it('includes the redirect URI', () => {
      const url = auth.getAuthUrl();
      expect(url).toContain(encodeURIComponent(TEST_CONFIG.redirectUri));
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when no tokens are stored', () => {
      expect(auth.isAuthenticated()).toBe(false);
    });

    it('returns true when tokens with access_token are stored', () => {
      tokenStore.saveTokens({ access_token: 'abc' });
      expect(auth.isAuthenticated()).toBe(true);
    });

    it('returns false after disconnect', () => {
      tokenStore.saveTokens({ access_token: 'abc' });
      auth.disconnect();
      expect(auth.isAuthenticated()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('clears stored tokens', () => {
      tokenStore.saveTokens({ access_token: 'abc', refresh_token: 'xyz' });
      auth.disconnect();
      expect(tokenStore.getTokens()).toBeNull();
    });
  });

  describe('getAuthClient', () => {
    it('returns an OAuth2 client object', () => {
      const client = auth.getAuthClient();
      expect(client).toBeDefined();
      expect(typeof client.generateAuthUrl).toBe('function');
    });

    it('loads existing tokens into the client on initialization', () => {
      const existingTokens = { access_token: 'existing', refresh_token: 'refresh' };
      const storeWithTokens = createMockTokenStore(existingTokens);
      const authWithTokens = createGoogleAuth(TEST_CONFIG, storeWithTokens);

      const client = authWithTokens.getAuthClient();
      expect(client.credentials.access_token).toBe('existing');
    });
  });

  describe('handleCallback', () => {
    it('is a function', () => {
      expect(typeof auth.handleCallback).toBe('function');
    });

    // Note: Actually testing handleCallback requires mocking the Google OAuth2
    // getToken endpoint, which is covered in integration tests.
    // Here we verify the interface exists and is callable.
  });
});
