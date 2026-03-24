import { useState, useEffect } from 'react';
import { localStorageService } from '../services/storageService.js';
import {
  getAvailableQuestions,
  getTotalSeen,
  addSeenQuestion,
  resetCompanyQuestions,
} from '../utils/questionUtils.js';
import { SYSTEM_DESIGN_QUESTIONS } from '../constants/questions.js';
import type { StorageService, SystemDesignQuestion } from '../types';

const STORAGE_KEY = 'seenQuestions';

/**
 * Custom hook that owns all "seen questions" state.
 *
 * Accepts an injectable `storage` implementation so that tests can pass
 * a createMemoryStorage() instance instead of touching the real localStorage.
 */
export function useSeenQuestions(storage: StorageService = localStorageService) {
  const [seenQuestions, setSeenQuestions] = useState<Set<string>>(new Set());

  // Load persisted seen-question IDs on first mount
  useEffect(() => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        // Only accept an array of strings — rejects injected non-string values
        if (Array.isArray(parsed) && parsed.every((id): id is string => typeof id === 'string')) {
          setSeenQuestions(new Set(parsed));
        }
        // If shape is invalid, silently discard and start fresh
      }
    } catch {
      // Malformed JSON — start fresh
    }
  }, [storage]);

  /** Persist and update state together to keep them in sync. */
  function persist(updatedSet: Set<string>) {
    setSeenQuestions(updatedSet);
    storage.setItem(STORAGE_KEY, JSON.stringify([...updatedSet]));
  }

  function markQuestionSeen(questionId: string) {
    persist(addSeenQuestion(seenQuestions, questionId));
  }

  function resetCompanyQuestionsFor(companyName: string) {
    const companyQuestions: SystemDesignQuestion[] = SYSTEM_DESIGN_QUESTIONS[companyName] ?? [];
    persist(resetCompanyQuestions(seenQuestions, companyQuestions));
  }

  /** Convenience selector — wraps the pure utility with current state. */
  function getAvailableQuestionsFor(companyName: string) {
    return getAvailableQuestions(SYSTEM_DESIGN_QUESTIONS, seenQuestions, companyName);
  }

  /** Convenience selector — wraps the pure utility with current state. */
  function getTotalSeenFor(companyName: string) {
    return getTotalSeen(SYSTEM_DESIGN_QUESTIONS, seenQuestions, companyName);
  }

  /**
   * Replaces all seen-question IDs with a cloud-loaded array.
   * Validates that all entries are strings before accepting.
   */
  function replaceSeenQuestions(idsArray: unknown[]) {
    if (!Array.isArray(idsArray) || !idsArray.every((id): id is string => typeof id === 'string')) {
      return;
    }
    persist(new Set(idsArray));
  }

  return {
    seenQuestions,
    markQuestionSeen,
    resetCompanyQuestionsFor,
    getAvailableQuestionsFor,
    getTotalSeenFor,
    replaceSeenQuestions,
  };
}
