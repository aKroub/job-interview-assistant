import { Router } from 'express';

/**
 * Creates the authentication router for Google OAuth flow.
 *
 * Routes:
 *   GET  /api/auth/status   — returns { authenticated: boolean }
 *   GET  /api/auth/url      — returns { url: string } for the OAuth consent screen
 *   GET  /api/auth/callback  — handles Google's OAuth redirect
 *   POST /api/auth/disconnect — clears stored tokens
 *
 * @param {{ getAuthUrl: Function, handleCallback: Function, isAuthenticated: Function, disconnect: Function }} googleAuth
 * @returns {import('express').Router}
 */
export function createAuthRouter(googleAuth) {
  const router = Router();

  /**
   * GET /api/auth/status
   * Returns whether the user has authenticated with Google.
   */
  router.get('/status', (_req, res) => {
    res.json({ authenticated: googleAuth.isAuthenticated() });
  });

  /**
   * GET /api/auth/url
   * Returns the Google OAuth consent URL for the frontend to redirect to.
   */
  router.get('/url', (_req, res) => {
    const url = googleAuth.getAuthUrl();
    res.json({ url });
  });

  /**
   * GET /api/auth/callback
   * Handles the OAuth redirect from Google.
   * Exchanges the authorization code for tokens and shows a success page.
   */
  router.get('/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send(
        '<html><body><h2>Error</h2><p>No authorization code received.</p></body></html>'
      );
    }

    try {
      await googleAuth.handleCallback(code);
      res.send(
        '<html><body style="font-family: sans-serif; text-align: center; padding: 60px;">' +
        '<h2 style="color: #16a34a;">Connected!</h2>' +
        '<p>Your Gmail and Calendar are now connected.</p>' +
        '<p>You can close this tab and return to the app.</p>' +
        '</body></html>'
      );
    } catch (err) {
      res.status(500).send(
        '<html><body style="font-family: sans-serif; text-align: center; padding: 60px;">' +
        '<h2 style="color: #dc2626;">Connection Failed</h2>' +
        '<p>Could not complete the authorization. Please try again.</p>' +
        `<p style="color: #6b7280; font-size: 14px;">${err.message}</p>` +
        '</body></html>'
      );
    }
  });

  /**
   * POST /api/auth/disconnect
   * Clears stored tokens and disconnects from Google.
   */
  router.post('/disconnect', (_req, res) => {
    googleAuth.disconnect();
    res.json({ authenticated: false });
  });

  return router;
}
