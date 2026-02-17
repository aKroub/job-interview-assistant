import { useState, useEffect } from 'react';
import { localStorageService } from '../services/storageService';
import {
  createCompany,
  applyStageUpdate,
  applyDelete,
  applyAddInterview,
  applyInterviewStatusUpdate,
} from '../utils/companyUtils';

const STORAGE_KEY = 'companies';

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

  // Load persisted companies on first mount
  useEffect(() => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) setCompanies(JSON.parse(raw));
    } catch {
      // No saved data — start fresh (expected on first run)
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

  function updateInterviewStatus(companyId, interviewId, status) {
    persist(applyInterviewStatusUpdate(companies, companyId, interviewId, status));
  }

  return {
    companies,
    addCompany,
    updateCompanyStage,
    deleteCompany,
    addInterview,
    updateInterviewStatus,
  };
}
