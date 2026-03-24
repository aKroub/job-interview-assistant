import { useEffect, useState } from 'react';
import { localStorageService } from '../services/storageService.js';
import { DEFAULT_PIPELINE } from '../constants/pipelines.js';
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
} from '../utils/companyUtils.js';
import type { Company, CompanyDraft, Interview, InterviewStatus, StageKey, StorageService } from '../types';

const STORAGE_KEY = 'companies';

/**
 * Returns true only if `value` looks like a valid persisted company object.
 * Prevents corrupted or tampered localStorage data from poisoning app state.
 *
 * Exported for unit-testing; not part of the hook's public API.
 */
export function isValidCompany(value: unknown): value is Company {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).id       === 'string' &&
    typeof (value as Record<string, unknown>).name     === 'string' &&
    typeof (value as Record<string, unknown>).position === 'string' &&
    typeof (value as Record<string, unknown>).stage    === 'string' &&
    Array.isArray((value as Record<string, unknown>).interviews)
  );
}

/**
 * Custom hook that owns all company and interview state.
 *
 * Accepts an injectable `storage` implementation so that tests can pass
 * a createMemoryStorage() instance instead of touching the real localStorage.
 */
export function useCompanies(storage: StorageService = localStorageService) {
  const [companies, setCompanies] = useState<Company[]>([]);

  // Load persisted companies on first mount, migrating legacy data if needed
  useEffect(() => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
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
   */
  function persistWith(transform: (prev: Company[]) => Company[]) {
    setCompanies(prev => {
      const updated = transform(prev);
      storage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  function addCompany(draft: CompanyDraft) {
    persistWith(prev => [...prev, createCompany(draft)]);
  }

  function updateCompanyStage(companyId: string, newStage: StageKey) {
    persistWith(prev => applyStageUpdate(prev, companyId, newStage));
  }

  function updateCompany(companyId: string, updates: Partial<Company>) {
    persistWith(prev => applyEditCompany(prev, companyId, updates));
  }

  function deleteCompany(companyId: string) {
    persistWith(prev => applyDelete(prev, companyId));
  }

  function addInterview(companyId: string, interview: Omit<Interview, 'id'>) {
    persistWith(prev => applyAddInterview(prev, companyId, interview));
  }

  function deleteInterview(companyId: string, interviewId: string) {
    persistWith(prev => applyDeleteInterview(prev, companyId, interviewId));
  }

  function updateInterviewStatus(companyId: string, interviewId: string, status: InterviewStatus) {
    persistWith(prev => applyInterviewStatusUpdate(prev, companyId, interviewId, status));
  }

  function updateInterview(companyId: string, interviewId: string, updates: Partial<Interview>) {
    persistWith(prev => applyInterviewUpdate(prev, companyId, interviewId, updates));
  }

  /**
   * Replaces all companies with a cloud-loaded array.
   * Validates each entry before accepting. Migrates legacy entries that are
   * missing the `pipeline` field, then persists to storage.
   */
  function replaceCompanies(companiesArray: unknown[]) {
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
