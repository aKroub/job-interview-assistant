import { Router } from 'express';

/**
 * Creates the sync router for Google Drive backup/restore of app state.
 *
 * All endpoints require Google authentication. The frontend sends the
 * current app state to save, and receives the stored state on load.
 *
 * @param {Object} deps
 * @param {{ saveState: Function, loadState: Function, getBackupInfo: Function }} deps.driveService
 * @param {{ isAuthenticated: Function }} deps.googleAuth
 * @returns {import('express').Router}
 */
export function createSyncRouter({ driveService, googleAuth }) {
  const router = Router();

  /**
   * GET /api/sync/status
   *
   * Returns whether a backup exists on Google Drive and when it was last saved.
   */
  router.get('/status', async (_req, res) => {
    if (!googleAuth.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const info = await driveService.getBackupInfo();
      res.json(info);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/sync/save
   * Body: { companies: Object[], seenQuestions: string[] }
   *
   * Saves the current app state to Google Drive.
   */
  router.post('/save', async (req, res) => {
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
      const result = await driveService.saveState(payload);
      res.json({ saved: result.saved, savedAt });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/sync/load
   *
   * Loads app state from Google Drive. Returns { exists: false } if no backup exists.
   */
  router.get('/load', async (_req, res) => {
    if (!googleAuth.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const state = await driveService.loadState();
      if (!state) {
        return res.json({ exists: false });
      }
      res.json(state);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
