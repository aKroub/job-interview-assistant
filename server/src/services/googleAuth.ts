import { randomBytes } from 'crypto';
import { google } from 'googleapis';
import type { Auth } from 'googleapis';
import type { GoogleAuth, TokenStore, OAuthTokens } from '../types';

/**
 * Required OAuth scopes — read-only access to Gmail and Calendar,
 * plus Drive file access for cloud backup/restore of app state.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.file',
];

interface AuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Creates a Google OAuth2 service that manages authentication,
 * token exchange, and authorized API client creation.
 */
export function createGoogleAuth(config: AuthConfig, tokenStore: Pick<TokenStore, 'getTokens' | 'saveTokens' | 'clearTokens'>): GoogleAuth {
  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  // Load existing tokens on initialization (synchronous read from cache)
  const existingTokens = tokenStore.getTokens();
  if (existingTokens && existingTokens.access_token) {
    oauth2Client.setCredentials(existingTokens);
  }

  // Refresh tokens automatically and persist the new ones (async write)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  oauth2Client.on('tokens', (tokens: any) => {
    const current = tokenStore.getTokens() || {};
    const merged = { ...current, ...tokens };
    // Fire and forget — don't block the refresh flow
    tokenStore.saveTokens(merged).catch((err) => {
      console.warn('Failed to persist refreshed tokens:', err.message);
    });
    oauth2Client.setCredentials(merged);
  });

  /** Pending CSRF state token — consumed once in verifyState(). */
  let pendingState: string | null = null;

  /**
   * Generates the Google OAuth consent URL that the user visits to authorize access.
   * Includes a random `state` parameter to prevent CSRF attacks.
   *
   */
  function getAuthUrl(): string {
    pendingState = randomBytes(32).toString('hex');
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      state: pendingState,
    });
  }

  /**
   * Verifies that the state parameter from the OAuth callback matches the
   * one generated in getAuthUrl(). Consumes the token so it can only be
   * used once.
   *
   */
  function verifyState(state: string): boolean {
    if (!pendingState || !state || state !== pendingState) {
      return false;
    }
    pendingState = null;
    return true;
  }

  /**
   * Exchanges an authorization code for tokens and persists them.
   *
   */
  async function handleCallback(code: string): Promise<void> {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    await tokenStore.saveTokens(tokens as OAuthTokens);
  }

  /**
   * Returns true if valid tokens are loaded (access_token exists).
   * Does not verify token expiry — the googleapis library handles refresh automatically.
   *
   */
  function isAuthenticated(): boolean {
    const tokens = tokenStore.getTokens();
    return !!(tokens && tokens.access_token);
  }

  /**
   * Returns the configured OAuth2 client for use with Google API services.
   * The client has credentials set and will auto-refresh when needed.
   *
   */
  function getAuthClient(): Auth.OAuth2Client {
    return oauth2Client;
  }

  /**
   * Clears stored tokens and resets the OAuth client credentials.
   *
   */
  async function disconnect(): Promise<void> {
    await tokenStore.clearTokens();
    oauth2Client.setCredentials({});
  }

  return { getAuthUrl, handleCallback, isAuthenticated, getAuthClient, disconnect, verifyState };
}
