import { useEffect, useState } from 'react';
import { localStorageService } from '../services/storageService';
import { DEFAULT_PIPELINE } from '../constants/pipelines';
import {
  applyAddInterview,
  applyDeleteInterview,
  applyDelete,
  applyEditCompany,
  applyInterviewStatusUpdate,
  applyInterviewUpdate,
  applyStageUpdate,
  createCompany,
  migrateCompanies,
} from '../utils/companyUtils';

const STORAGE_KEY = 'companies';

/**
 * Returns true only if `value` looks like a valid persisted company object.
 * Prevents corrupted or tampered localStorage data from poisoning app state.
 *
 * Exported for unit-testing; not part of the hook's public API.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidCompany(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.id       === 'string' &&
    typeof value.name     === 'string' &&
    typeof value.position === 'string' &&
    typeof value.stage    === 'string' &&
    Array.isArray(value.interviews)
  );
}

/**
 * Custom hook that owns all company and interview state.
 *
 * Accepts an injectable `storage` implementation so that tests can pass
 * a createMemoryStorage() instance instead of touching the real localStorage.
 *
 * @param {Object} [storage=localStorageService]
 * @returns {{ companies, addCompany, updateCompanyStage, deleteCompany, addInterview, updateInterviewStatus }}
 */
export function useCompanies(storage = localStorageService) {
  const [companies, setCompanies] = useState([]);

  // Load persisted companies on first mount, migrating legacy data if needed
  useEffect(() => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every(isValidCompany)) {
          const migrated = migrateCompanies(parsed, DEFAULT_PIPELINE);
          setCompanies(migrated);
          if (migrated !== parsed) {
            storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          }
        }
        // If shape is invalid, silently discard and start fresh
      }
    } catch {
      // Malformed JSON — start fresh (expected on first run)
    }
  }, [storage]);

  /**
   * Apply a transform to the current companies state, persist the result,
   * and update React state — all via a functional updater so the transform
   * always reads the latest state (no stale closure).
   *
   * @param {(prev: Object[]) => Object[]} transform
   */
  function persistWith(transform) {
    setCompanies(prev => {
      const updated = transform(prev);
      storage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  function addCompany(draft) {
    persistWith(prev => [...prev, createCompany(draft)]);
  }

  function updateCompanyStage(companyId, newStage) {
    persistWith(prev => applyStageUpdate(prev, companyId, newStage));
  }

  function updateCompany(companyId, updates) {
    persistWith(prev => applyEditCompany(prev, companyId, updates));
  }

  function deleteCompany(companyId) {
    persistWith(prev => applyDelete(prev, companyId));
  }

  function addInterview(companyId, interview) {
    persistWith(prev => applyAddInterview(prev, companyId, interview));
  }

  function deleteInterview(companyId, interviewId) {
    persistWith(prev => applyDeleteInterview(prev, companyId, interviewId));
  }

  function updateInterviewStatus(companyId, interviewId, status) {
    persistWith(prev => applyInterviewStatusUpdate(prev, companyId, interviewId, status));
  }

  function updateInterview(companyId, interviewId, updates) {
    persistWith(prev => applyInterviewUpdate(prev, companyId, interviewId, updates));
  }

  /**
   * Replaces all companies with a cloud-loaded array.
   * Validates each entry before accepting. Migrates legacy entries that are
   * missing the `pipeline` field, then persists to storage.
   *
   * @param {Object[]} companiesArray - the full companies array from cloud backup
   */
  function replaceCompanies(companiesArray) {
    if (!Array.isArray(companiesArray) || !companiesArray.every(isValidCompany)) {
      return;
    }
    persistWith(() => migrateCompanies(companiesArray, DEFAULT_PIPELINE));
  }

  return {
    companies,
    addCompany,
    updateCompany,
    updateCompanyStage,
    deleteCompany,
    addInterview,
    deleteInterview,
    updateInterviewStatus,
    updateInterview,
    replaceCompanies,
  };
}
