import { localStorageService } from '../services/storageService.js';
import * as defaultApiService from '../services/apiService.js';
import { useCompanies } from './useCompanies.js';
import { useSeenQuestions } from './useSeenQuestions.js';
import { useInterviewSuggestions } from './useInterviewSuggestions.js';
import { useCloudSync } from './useCloudSync.js';
import type { ApiService, StorageService } from '../types';

/**
 * Orchestrating hook that composes useCompanies + useSeenQuestions +
 * useInterviewSuggestions + useCloudSync.
 *
 * This is the single hook the top-level InterviewPrepTracker component calls.
 * It passes the same storage instance to both local-state hooks so they share one
 * backing store (and so tests can inject one shared mock storage).
 * The api parameter is forwarded to useInterviewSuggestions and useCloudSync
 * for backend communication.
 */
export function useInterviewTracker(storage: StorageService = localStorageService, api: ApiService = defaultApiService) {
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
