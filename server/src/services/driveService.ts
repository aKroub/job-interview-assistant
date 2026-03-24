import { google } from 'googleapis';
import type { Auth } from 'googleapis';
import type { DriveService, DriveBackup } from '../types';

/**
 * Prefix used for all backup file names in Google Drive.
 * Each save creates a new file: `interview-tracker-state-{timestamp}.json`
 */
const BACKUP_PREFIX = 'interview-tracker-state-';

/** Maximum number of backup versions to keep. Older files are pruned after each save. */
const MAX_BACKUPS = 5;

/**
 * Converts an ISO timestamp to a Drive-safe filename suffix.
 * Replaces colons with dashes (e.g. "2026-02-22T10:00:00.000Z" → "2026-02-22T10-00-00-000Z").
 *
 * @param {string} isoString
 * @returns {string}
 */
function toFilenameSuffix(isoString: string): string {
  return isoString.replace(/:/g, '-');
}

/**
 * Creates a Google Drive service for saving/loading app state.
 *
 * Uses the drive.file scope — the app can only access files it created.
 * Each save creates a new timestamped JSON file in the user's Drive root.
 * Only the most recent MAX_BACKUPS files are kept; older ones are pruned.
 *
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDriveService(authClient: Auth.OAuth2Client, options: { driveApi?: any } = {}): DriveService {
  const driveApi = options.driveApi || google.drive({ version: 'v3', auth: authClient });

  /**
   * Lists all backup files, sorted newest-first by createdTime.
   * Uses a safety buffer of 10 results to cover any race conditions during pruning.
   *
   */
  async function listBackupFiles(): Promise<Array<{ id: string; name: string; createdTime: string }>> {
    const res = await driveApi.files.list({
      q: `name contains '${BACKUP_PREFIX}' and trashed=false`,
      fields: 'files(id,name,createdTime)',
      spaces: 'drive',
      orderBy: 'createdTime desc',
      pageSize: 10,
    });
    return res.data.files || [];
  }

  /**
   * Deletes backup files beyond the MAX_BACKUPS most recent.
   *
   */
  async function pruneOldBackups(sortedFiles: Array<{ id: string }>): Promise<void> {
    const toDelete = sortedFiles.slice(MAX_BACKUPS);
    await Promise.all(toDelete.map((f) => driveApi.files.delete({ fileId: f.id })));
  }

  /**
   * Saves app state to Google Drive as a new timestamped file.
   * After saving, prunes files beyond the MAX_BACKUPS most recent.
   *
   */
  async function saveState(data: Record<string, unknown>): Promise<{ saved: boolean; fileId: string }> {
    const suffix = toFilenameSuffix(data.savedAt as string);
    const fileName = `${BACKUP_PREFIX}${suffix}.json`;

    const created = await driveApi.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'application/json',
      },
      media: {
        mimeType: 'application/json',
        body: JSON.stringify(data),
      },
    });

    // Re-list files after creating the new one, then prune extras
    const allFiles = await listBackupFiles();
    await pruneOldBackups(allFiles);

    return { saved: true, fileId: created.data.id };
  }

  /**
   * Loads app state from a specific backup file on Google Drive.
   * Returns null if the file cannot be found or read.
   *
   */
  async function loadState(fileId: string): Promise<Record<string, unknown> | null> {
    const res = await driveApi.files.get({
      fileId,
      alt: 'media',
    });
    return res.data;
  }

  /**
   * Returns a list of available backup versions, sorted newest-first.
   * Each entry includes the fileId and savedAt timestamp.
   * savedAt is extracted from the file content's savedAt field (encoded in the filename).
   *
   */
  async function listBackups(): Promise<{ backups: DriveBackup[] }> {
    const files = await listBackupFiles();
    const backups = files.slice(0, MAX_BACKUPS).map((f) => ({
      fileId: f.id,
      savedAt: f.createdTime,
    }));
    return { backups };
  }

  return { saveState, loadState, listBackups };
}
