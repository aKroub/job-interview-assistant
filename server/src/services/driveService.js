import { google } from 'googleapis';

/**
 * The filename used for the backup file in Google Drive.
 * Only one file with this name is maintained (create-or-update pattern).
 */
const BACKUP_FILENAME = 'interview-tracker-state.json';

/**
 * Creates a Google Drive service for saving/loading app state.
 *
 * Uses the drive.file scope — the app can only access files it created.
 * A single JSON file is maintained in the user's Drive root.
 *
 * @param {import('googleapis').Auth.OAuth2Client} authClient - authenticated OAuth2 client
 * @param {Object} [options]
 * @param {Object} [options.driveApi] - injectable Drive API instance for testing
 * @returns {{ saveState: Function, loadState: Function, getBackupInfo: Function }}
 */
export function createDriveService(authClient, options = {}) {
  const driveApi = options.driveApi || google.drive({ version: 'v3', auth: authClient });

  /**
   * Finds the backup file by name (excluding trashed files).
   * Returns the first match or null.
   *
   * @returns {Promise<{ id: string, modifiedTime: string } | null>}
   */
  async function findBackupFile() {
    const res = await driveApi.files.list({
      q: `name='${BACKUP_FILENAME}' and trashed=false`,
      fields: 'files(id,modifiedTime)',
      spaces: 'drive',
      pageSize: 1,
    });
    const files = res.data.files || [];
    return files.length > 0 ? files[0] : null;
  }

  /**
   * Saves app state to Google Drive. Creates the file on first save,
   * updates it on subsequent saves.
   *
   * @param {Object} data - the state payload (version, savedAt, companies, seenQuestions)
   * @returns {Promise<{ saved: boolean, fileId: string }>}
   */
  async function saveState(data) {
    const existing = await findBackupFile();
    const media = {
      mimeType: 'application/json',
      body: JSON.stringify(data),
    };

    if (existing) {
      await driveApi.files.update({
        fileId: existing.id,
        media,
      });
      return { saved: true, fileId: existing.id };
    }

    const created = await driveApi.files.create({
      requestBody: {
        name: BACKUP_FILENAME,
        mimeType: 'application/json',
      },
      media,
    });
    return { saved: true, fileId: created.data.id };
  }

  /**
   * Loads app state from Google Drive.
   * Returns null if no backup file exists.
   *
   * @returns {Promise<Object | null>}
   */
  async function loadState() {
    const existing = await findBackupFile();
    if (!existing) return null;

    const res = await driveApi.files.get({
      fileId: existing.id,
      alt: 'media',
    });
    return res.data;
  }

  /**
   * Returns metadata about the backup file (whether it exists and when it was last saved).
   *
   * @returns {Promise<{ exists: boolean, lastSaved: string | null }>}
   */
  async function getBackupInfo() {
    const existing = await findBackupFile();
    if (!existing) return { exists: false, lastSaved: null };
    return { exists: true, lastSaved: existing.modifiedTime };
  }

  return { saveState, loadState, getBackupInfo };
}
