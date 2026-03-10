import { useState, useEffect, useCallback, useRef } from 'react';
import * as defaultApi from '../services/apiService';

/**
 * Custom hook that manages Google Drive backup/restore operations.
 *
 * Supports multi-version backups: keeps up to 5 versions on Drive.
 * Provides save-to-Drive and load-from-Drive (by fileId) functionality.
 * Fetches the list of available backups on mount when authenticated.
 *
 * @param {Object} deps
 * @param {Object}   [deps.api=defaultApi] - injectable API service
 * @param {Function} deps.replaceCompanies - from useCompanies
 * @param {Function} deps.replaceSeenQuestions - from useSeenQuestions
 * @param {Object[]} deps.companies - current companies state
 * @param {Set}      deps.seenQuestions - current seen-questions state
 * @param {string}   deps.authStatus - 'checking' | 'authenticated' | 'unauthenticated'
 * @returns {{ syncStatus: string, lastSaved: string|null, syncError: string|null, backups: Array, saveToDrive: Function, loadFromDrive: Function }}
 */
export function useCloudSync({
  api = defaultApi,
  replaceCompanies,
  replaceSeenQuestions,
  companies,
  seenQuestions,
  authStatus,
}) {
  const [syncStatus, setSyncStatus] = useState('idle');
  const [backups, setBackups]       = useState([]);
  const [syncError, setSyncError]   = useState(null);

  /** Derived from the most recent backup. */
  const lastSaved = backups.length > 0 ? backups[0].savedAt : null;

  /** Ref for the success-to-idle auto-reset timeout. */
  const resetTimerRef = useRef(null);

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
      setSyncError(err.message);
    } finally {
      busyRef.current = false;
    }
  }, [api, clearResetTimer, setSuccessWithAutoReset]);

  /**
   * Loads app state from a specific backup version on Google Drive.
   *
   * @param {string} fileId - the Google Drive file ID to load
   */
  const loadFromDrive = useCallback(async (fileId) => {
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
      setSyncError(err.message);
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
