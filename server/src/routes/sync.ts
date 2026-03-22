import { Router } from 'express';
import type { Request, Response } from 'express';
import type { DriveService, GoogleAuth } from '../types';

interface SyncRouterDeps {
  driveService: DriveService;
  googleAuth: Pick<GoogleAuth, 'isAuthenticated'>;
}

/**
 * Creates the sync router for Google Drive backup/restore of app state.
 */
export function createSyncRouter({ driveService, googleAuth }: SyncRouterDeps): Router {
  const router = Router();

  /**
   * GET /api/sync/status
   *
   * Returns a list of available backup versions on Google Drive.
   */
  router.get('/status', async (_req: Request, res: Response) => {
    if (!googleAuth.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const result = await driveService.listBackups();
      res.json(result);
    } catch (err: unknown) {
      console.error('[sync] operation failed:', (err as Error).message);
      res.status(500).json({ error: 'Sync operation failed' });
    }
  });

  /**
   * POST /api/sync/save
   * Body: { companies: Object[], seenQuestions: string[] }
   *
   * Saves the current app state as a new backup version on Google Drive.
   * Returns the updated list of available backups.
   */
  router.post('/save', async (req: Request, res: Response) => {
    if (!googleAuth.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { companies, seenQuestions } = req.body;

    if (!Array.isArray(companies) || !Array.isArray(seenQuestions)) {
      return res.status(400).json({ error: 'companies and seenQuestions must be arrays' });
    }

    try {
      const savedAt = new Date().toISOString();
      const payload = { version: 1, savedAt, companies, seenQuestions };
      await driveService.saveState(payload);

      const { backups } = await driveService.listBackups();
      res.json({ saved: true, savedAt, backups });
    } catch (err: unknown) {
      console.error('[sync] operation failed:', (err as Error).message);
      res.status(500).json({ error: 'Sync operation failed' });
    }
  });

  /**
   * GET /api/sync/load?fileId=xxx
   *
   * Loads app state from a specific backup version on Google Drive.
   * Requires a fileId query parameter. Returns { exists: false } if the file is not found.
   */
  router.get('/load', async (req: Request, res: Response) => {
    if (!googleAuth.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const fileId = req.query.fileId as string | undefined;
    if (!fileId) {
      return res.status(400).json({ error: 'fileId query parameter is required' });
    }
    if (typeof fileId !== 'string' || !/^[\w-]{10,80}$/.test(fileId)) {
      return res.status(400).json({ error: 'Invalid fileId format' });
    }

    try {
      const state = await driveService.loadState(fileId);
      if (!state) {
        return res.json({ exists: false });
      }
      res.json(state);
    } catch (err: unknown) {
      console.error('[sync] operation failed:', (err as Error).message);
      res.status(500).json({ error: 'Sync operation failed' });
    }
  });

  return router;
}
