import { useState, useEffect, useCallback, useRef } from 'react';
import * as defaultApi from '../services/apiService';

/**
 * Custom hook that manages Google Drive backup/restore operations.
 *
 * Provides manual save-to-Drive and load-from-Drive functionality.
 * Checks backup status on mount when authenticated.
 *
 * @param {Object} deps
 * @param {Object}   [deps.api=defaultApi] - injectable API service
 * @param {Function} deps.replaceCompanies - from useCompanies
 * @param {Function} deps.replaceSeenQuestions - from useSeenQuestions
 * @param {Object[]} deps.companies - current companies state
 * @param {Set}      deps.seenQuestions - current seen-questions state
 * @param {string}   deps.authStatus - 'checking' | 'authenticated' | 'unauthenticated'
 * @returns {{ syncStatus: string, lastSaved: string|null, syncError: string|null, saveToDrive: Function, loadFromDrive: Function }}
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
  const [lastSaved, setLastSaved]   = useState(null);
  const [syncError, setSyncError]   = useState(null);

  /** Ref for the success-to-idle auto-reset timeout. */
  const resetTimerRef = useRef(null);

  /** Clears any pending auto-reset timer. */
  function clearResetTimer() {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }

  /**
   * Sets syncStatus to 'success' and auto-resets to 'idle' after 3 seconds.
   */
  function setSuccessWithAutoReset() {
    clearResetTimer();
    setSyncStatus('success');
    resetTimerRef.current = setTimeout(() => {
      setSyncStatus('idle');
    }, 3000);
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearResetTimer();
  }, []);

  // Check backup status on mount when authenticated
  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      try {
        const info = await api.fetchBackupStatus();
        if (!cancelled && info.exists) {
          setLastSaved(info.lastSaved);
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
   * Saves the current app state to Google Drive.
   */
  const saveToDrive = useCallback(async () => {
    clearResetTimer();
    setSyncStatus('saving');
    setSyncError(null);

    try {
      const payload = {
        companies,
        seenQuestions: [...seenQuestions],
      };
      const { savedAt } = await api.saveToDrive(payload);
      setLastSaved(savedAt);
      setSuccessWithAutoReset();
    } catch (err) {
      setSyncStatus('error');
      setSyncError(err.message);
    }
  }, [companies, seenQuestions, api]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Loads app state from Google Drive, replacing all local data.
   */
  const loadFromDrive = useCallback(async () => {
    clearResetTimer();
    setSyncStatus('loading');
    setSyncError(null);

    try {
      const data = await api.loadFromDrive();

      if (data.exists === false) {
        setSyncStatus('error');
        setSyncError('No backup found on Google Drive');
        return;
      }

      replaceCompanies(data.companies);
      replaceSeenQuestions(data.seenQuestions);
      setLastSaved(data.savedAt);
      setSuccessWithAutoReset();
    } catch (err) {
      setSyncStatus('error');
      setSyncError(err.message);
    }
  }, [api, replaceCompanies, replaceSeenQuestions]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    syncStatus,
    lastSaved,
    syncError,
    saveToDrive,
    loadFromDrive,
  };
}
