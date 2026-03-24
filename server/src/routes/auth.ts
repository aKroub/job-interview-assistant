import { Router } from 'express';
import type { Request, Response } from 'express';
import type { GoogleAuth } from '../types';

/**
 * Creates the authentication router for Google OAuth flow.
 */
export function createAuthRouter(googleAuth: GoogleAuth): Router {
  const router = Router();

  /**
   * GET /api/auth/status
   * Returns whether the user has authenticated with Google.
   */
  router.get('/status', (_req: Request, res: Response) => {
    res.json({ authenticated: googleAuth.isAuthenticated() });
  });

  /**
   * GET /api/auth/url
   * Returns the Google OAuth consent URL for the frontend to redirect to.
   */
  router.get('/url', (_req: Request, res: Response) => {
    const url = googleAuth.getAuthUrl();
    res.json({ url });
  });

  /**
   * GET /api/auth/callback
   * Handles the OAuth redirect from Google.
   * Exchanges the authorization code for tokens and shows a success page.
   */
  router.get('/callback', async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;

    if (!code) {
      return res.status(400).send(
        '<html><body><h2>Error</h2><p>No authorization code received.</p></body></html>'
      );
    }

    if (!googleAuth.verifyState(state ?? '')) {
      return res.status(403).send(
        '<html><body style="font-family: sans-serif; text-align: center; padding: 60px;">' +
        '<h2 style="color: #dc2626;">Authorization Failed</h2>' +
        '<p>Invalid or expired state parameter. Please try connecting again.</p>' +
        '</body></html>'
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
    } catch (err: unknown) {
      console.error('[auth] callback failed:', (err as Error).message);
      res.status(500).send(
        '<html><body style="font-family: sans-serif; text-align: center; padding: 60px;">' +
        '<h2 style="color: #dc2626;">Connection Failed</h2>' +
        '<p>Could not complete the authorization. Please try again.</p>' +
        '</body></html>'
      );
    }
  });

  /**
   * POST /api/auth/disconnect
   * Clears stored tokens and disconnects from Google.
   */
  router.post('/disconnect', async (_req: Request, res: Response) => {
    try {
      await googleAuth.disconnect();
      res.json({ authenticated: false });
    } catch (err: unknown) {
      console.error('[auth] disconnect failed:', (err as Error).message);
      res.status(500).json({ error: 'Disconnect failed' });
    }
  });

  return router;
}
