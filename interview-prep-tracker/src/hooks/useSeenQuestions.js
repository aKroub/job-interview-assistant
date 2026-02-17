import { useState, useEffect } from 'react';
import { localStorageService } from '../services/storageService';
import {
  getAvailableQuestions,
  getTotalSeen,
  addSeenQuestion,
  resetCompanyQuestions,
} from '../utils/questionUtils';
import { SYSTEM_DESIGN_QUESTIONS } from '../constants/questions';

const STORAGE_KEY = 'seenQuestions';

/**
 * Custom hook that owns all "seen questions" state.
 *
 * Accepts an injectable `storage` implementation so that tests can pass
 * a createMemoryStorage() instance instead of touching the real localStorage.
 *
 * @param {Object} [storage=localStorageService]
 * @returns {{ seenQuestions, markQuestionSeen, resetCompanyQuestionsFor, getAvailableQuestionsFor, getTotalSeenFor }}
 */
export function useSeenQuestions(storage = localStorageService) {
  const [seenQuestions, setSeenQuestions] = useState(new Set());

  // Load persisted seen-question IDs on first mount
  useEffect(() => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Only accept an array of strings — rejects injected non-string values
        if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')) {
          setSeenQuestions(new Set(parsed));
        }
        // If shape is invalid, silently discard and start fresh
      }
    } catch {
      // Malformed JSON — start fresh
    }
  }, [storage]);

  /** Persist and update state together to keep them in sync. */
  function persist(updatedSet) {
    setSeenQuestions(updatedSet);
    storage.setItem(STORAGE_KEY, JSON.stringify([...updatedSet]));
  }

  function markQuestionSeen(questionId) {
    persist(addSeenQuestion(seenQuestions, questionId));
  }

  function resetCompanyQuestionsFor(companyName) {
    const companyQuestions = SYSTEM_DESIGN_QUESTIONS[companyName] ?? [];
    persist(resetCompanyQuestions(seenQuestions, companyQuestions));
  }

  /** Convenience selector — wraps the pure utility with current state. */
  function getAvailableQuestionsFor(companyName) {
    return getAvailableQuestions(SYSTEM_DESIGN_QUESTIONS, seenQuestions, companyName);
  }

  /** Convenience selector — wraps the pure utility with current state. */
  function getTotalSeenFor(companyName) {
    return getTotalSeen(SYSTEM_DESIGN_QUESTIONS, seenQuestions, companyName);
  }

  return {
    seenQuestions,
    markQuestionSeen,
    resetCompanyQuestionsFor,
    getAvailableQuestionsFor,
    getTotalSeenFor,
  };
}
