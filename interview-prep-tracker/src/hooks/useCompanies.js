import { useEffect, useState } from 'react';
import { localStorageService } from '../services/storageService';
import { DEFAULT_PIPELINE } from '../constants/pipelines';
import {
  applyAddInterview,
  applyDeleteInterview,
  applyDelete,
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

  /** Persist and update state together to keep them in sync. */
  function persist(updated) {
    setCompanies(updated);
    storage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  function addCompany(draft) {
    persist([...companies, createCompany(draft)]);
  }

  function updateCompanyStage(companyId, newStage) {
    persist(applyStageUpdate(companies, companyId, newStage));
  }

  function deleteCompany(companyId) {
    persist(applyDelete(companies, companyId));
  }

  function addInterview(companyId, interview) {
    persist(applyAddInterview(companies, companyId, interview));
  }

  function deleteInterview(companyId, interviewId) {
    persist(applyDeleteInterview(companies, companyId, interviewId));
  }

  function updateInterviewStatus(companyId, interviewId, status) {
    persist(applyInterviewStatusUpdate(companies, companyId, interviewId, status));
  }

  function updateInterview(companyId, interviewId, updates) {
    persist(applyInterviewUpdate(companies, companyId, interviewId, updates));
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
    persist(migrateCompanies(companiesArray, DEFAULT_PIPELINE));
  }

  return {
    companies,
    addCompany,
    updateCompanyStage,
    deleteCompany,
    addInterview,
    deleteInterview,
    updateInterviewStatus,
    updateInterview,
    replaceCompanies,
  };
}
