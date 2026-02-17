import { localStorageService } from '../services/storageService';
import { useCompanies } from './useCompanies';
import { useSeenQuestions } from './useSeenQuestions';

/**
 * Orchestrating hook that composes useCompanies + useSeenQuestions.
 *
 * This is the single hook the top-level InterviewPrepTracker component calls.
 * It passes the same storage instance to both sub-hooks so they share one
 * backing store (and so tests can inject one shared mock storage).
 *
 * @param {Object} [storage=localStorageService]
 * @returns {Object} Combined API from both hooks
 */
export function useInterviewTracker(storage = localStorageService) {
  const companiesApi    = useCompanies(storage);
  const questionsApi    = useSeenQuestions(storage);

  return {
    ...companiesApi,
    ...questionsApi,
  };
}
