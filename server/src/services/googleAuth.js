import { google } from 'googleapis';

/**
 * Required OAuth scopes — read-only access to Gmail and Calendar.
 * These are the minimum scopes needed to scan for interview invitations.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

/**
 * Creates a Google OAuth2 service that manages authentication,
 * token exchange, and authorized API client creation.
 *
 * @param {{ clientId: string, clientSecret: string, redirectUri: string }} config
 * @param {{ getTokens: Function, saveTokens: Function }} tokenStore
 * @returns {{ getAuthUrl, handleCallback, isAuthenticated, getAuthClient, disconnect }}
 */
export function createGoogleAuth(config, tokenStore) {
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
  oauth2Client.on('tokens', (tokens) => {
    const current = tokenStore.getTokens() || {};
    const merged = { ...current, ...tokens };
    // Fire and forget — don't block the refresh flow
    tokenStore.saveTokens(merged).catch((err) => {
      console.warn('Failed to persist refreshed tokens:', err.message);
    });
    oauth2Client.setCredentials(merged);
  });

  /**
   * Generates the Google OAuth consent URL that the user visits to authorize access.
   *
   * @returns {string} The authorization URL
   */
  function getAuthUrl() {
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });
  }

  /**
   * Exchanges an authorization code for tokens and persists them.
   *
   * @param {string} code - the authorization code from Google's redirect
   * @returns {Promise<void>}
   */
  async function handleCallback(code) {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    await tokenStore.saveTokens(tokens);
  }

  /**
   * Returns true if valid tokens are loaded (access_token exists).
   * Does not verify token expiry — the googleapis library handles refresh automatically.
   *
   * @returns {boolean}
   */
  function isAuthenticated() {
    const tokens = tokenStore.getTokens();
    return !!(tokens && tokens.access_token);
  }

  /**
   * Returns the configured OAuth2 client for use with Google API services.
   * The client has credentials set and will auto-refresh when needed.
   *
   * @returns {import('googleapis').Auth.OAuth2Client}
   */
  function getAuthClient() {
    return oauth2Client;
  }

  /**
   * Clears stored tokens and resets the OAuth client credentials.
   *
   * @returns {Promise<void>}
   */
  async function disconnect() {
    await tokenStore.clearTokens();
    oauth2Client.setCredentials({});
  }

  return { getAuthUrl, handleCallback, isAuthenticated, getAuthClient, disconnect };
}
