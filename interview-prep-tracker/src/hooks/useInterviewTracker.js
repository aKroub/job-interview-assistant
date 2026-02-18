import { localStorageService } from '../services/storageService';
import * as defaultApiService from '../services/apiService';
import { useCompanies } from './useCompanies';
import { useSeenQuestions } from './useSeenQuestions';
import { useInterviewSuggestions } from './useInterviewSuggestions';

/**
 * Orchestrating hook that composes useCompanies + useSeenQuestions + useInterviewSuggestions.
 *
 * This is the single hook the top-level InterviewPrepTracker component calls.
 * It passes the same storage instance to both local-state hooks so they share one
 * backing store (and so tests can inject one shared mock storage).
 * The api parameter is forwarded to useInterviewSuggestions for backend communication.
 *
 * @param {Object} [storage=localStorageService]
 * @param {Object} [api=defaultApiService]
 * @returns {Object} Combined API from all hooks
 */
export function useInterviewTracker(storage = localStorageService, api = defaultApiService) {
  const companiesApi    = useCompanies(storage);
  const questionsApi    = useSeenQuestions(storage);
  const suggestionsApi  = useInterviewSuggestions(api);

  return {
    ...companiesApi,
    ...questionsApi,
    ...suggestionsApi,
  };
}
