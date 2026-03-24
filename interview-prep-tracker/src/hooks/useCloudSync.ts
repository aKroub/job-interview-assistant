import { useState, useEffect, useCallback, useRef } from 'react';
import * as defaultApi from '../services/apiService.js';
import type { ApiService, AuthStatus, Company, DriveBackup, SyncStatus } from '../types';

interface UseCloudSyncDeps {
  api?: ApiService;
  replaceCompanies: (companies: unknown[]) => void;
  replaceSeenQuestions: (ids: unknown[]) => void;
  companies: Company[];
  seenQuestions: Set<string>;
  authStatus: AuthStatus;
}

/**
 * Custom hook that manages Google Drive backup/restore operations.
 *
 * Supports multi-version backups: keeps up to 5 versions on Drive.
 * Provides save-to-Drive and load-from-Drive (by fileId) functionality.
 * Fetches the list of available backups on mount when authenticated.
 */
export function useCloudSync({
  api = defaultApi,
  replaceCompanies,
  replaceSeenQuestions,
  companies,
  seenQuestions,
  authStatus,
}: UseCloudSyncDeps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [backups, setBackups]       = useState<DriveBackup[]>([]);
  const [syncError, setSyncError]   = useState<string | null>(null);

  /** Derived from the most recent backup. */
  const lastSaved = backups.length > 0 ? backups[0]!.savedAt : null;

  /** Ref for the success-to-idle auto-reset timeout. */
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Refs to always read the latest state without stale closures. */
  const companiesRef     = useRef(companies);
  const seenQuestionsRef = useRef(seenQuestions);
  companiesRef.current     = companies;
  seenQuestionsRef.current = seenQuestions;

  /** Prevents concurrent save/load operations. */
  const busyRef = useRef(false);

  /** Clears any pending auto-reset timer. */
  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  /**
   * Sets syncStatus to 'success' and auto-resets to 'idle' after 3 seconds.
   */
  const setSuccessWithAutoReset = useCallback(() => {
    clearResetTimer();
    setSyncStatus('success');
    resetTimerRef.current = setTimeout(() => {
      setSyncStatus('idle');
    }, 3000);
  }, [clearResetTimer]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearResetTimer();
  }, [clearResetTimer]);

  // Fetch list of backups on mount when authenticated
  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      try {
        const { backups: list } = await api.fetchBackupStatus();
        if (!cancelled && Array.isArray(list)) {
          setBackups(list);
        }
      } catch {
        // Silently ignore — backup status is informational
      }
    }

    if (authStatus === 'authenticated') {
      checkStatus();
    }

    return () => { cancelled = true; };
  }, [authStatus, api]);

  /**
   * Saves the current app state to Google Drive as a new backup version.
   */
  const saveToDrive = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;

    clearResetTimer();
    setSyncStatus('saving');
    setSyncError(null);

    try {
      const payload = {
        companies: companiesRef.current,
        seenQuestions: [...seenQuestionsRef.current],
      };
      const result = await api.saveToDrive(payload);
      if (Array.isArray(result.backups)) {
        setBackups(result.backups);
      }
      setSuccessWithAutoReset();
    } catch (err) {
      setSyncStatus('error');
      setSyncError((err as Error).message);
    } finally {
      busyRef.current = false;
    }
  }, [api, clearResetTimer, setSuccessWithAutoReset]);

  /**
   * Loads app state from a specific backup version on Google Drive.
   */
  const loadFromDrive = useCallback(async (fileId: string) => {
    if (busyRef.current) return;
    busyRef.current = true;

    clearResetTimer();
    setSyncStatus('loading');
    setSyncError(null);

    try {
      const data = await api.loadFromDrive(fileId);

      if (data.exists === false) {
        setSyncStatus('error');
        setSyncError('No backup found on Google Drive');
        return;
      }

      replaceCompanies(data.companies);
      replaceSeenQuestions(data.seenQuestions);
      setSuccessWithAutoReset();
    } catch (err) {
      setSyncStatus('error');
      setSyncError((err as Error).message);
    } finally {
      busyRef.current = false;
    }
  }, [api, replaceCompanies, replaceSeenQuestions, clearResetTimer, setSuccessWithAutoReset]);

  return {
    syncStatus,
    lastSaved,
    syncError,
    backups,
    saveToDrive,
    loadFromDrive,
  };
}
