import { localStorageService } from '../services/storageService';
import * as defaultApiService from '../services/apiService';
import { useCompanies } from './useCompanies';
import { useSeenQuestions } from './useSeenQuestions';
import { useInterviewSuggestions } from './useInterviewSuggestions';
import { useCloudSync } from './useCloudSync';

/**
 * Orchestrating hook that composes useCompanies + useSeenQuestions +
 * useInterviewSuggestions + useCloudSync.
 *
 * This is the single hook the top-level InterviewPrepTracker component calls.
 * It passes the same storage instance to both local-state hooks so they share one
 * backing store (and so tests can inject one shared mock storage).
 * The api parameter is forwarded to useInterviewSuggestions and useCloudSync
 * for backend communication.
 *
 * @param {Object} [storage=localStorageService]
 * @param {Object} [api=defaultApiService]
 * @returns {Object} Combined API from all hooks
 */
export function useInterviewTracker(storage = localStorageService, api = defaultApiService) {
  const companiesApi    = useCompanies(storage);
  const questionsApi    = useSeenQuestions(storage);
  const suggestionsApi  = useInterviewSuggestions(api);

  const cloudSyncApi = useCloudSync({
    api,
    replaceCompanies: companiesApi.replaceCompanies,
    replaceSeenQuestions: questionsApi.replaceSeenQuestions,
    companies: companiesApi.companies,
    seenQuestions: questionsApi.seenQuestions,
    authStatus: suggestionsApi.authStatus,
  });

  return {
    ...companiesApi,
    ...questionsApi,
    ...suggestionsApi,
    ...cloudSyncApi,
  };
}
