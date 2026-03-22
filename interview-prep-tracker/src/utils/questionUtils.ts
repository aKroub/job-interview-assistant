import type { SystemDesignQuestion } from '../types';

/**
 * Pure utility functions for system design question state management.
 *
 * All functions are stateless and free of React or browser globals,
 * making them trivially unit-testable without any setup.
 */

/**
 * Returns the next unseen questions for a given company, up to `limit`.
 *
 * @param allQuestions - The full SYSTEM_DESIGN_QUESTIONS map
 * @param seenSet - Set of question IDs the user has already seen
 * @param companyName
 * @param limit
 * @returns Array of question objects
 */
export function getAvailableQuestions(
  allQuestions: Record<string, SystemDesignQuestion[]>,
  seenSet: Set<string>,
  companyName: string,
  limit = 3,
): SystemDesignQuestion[] {
  const questions = allQuestions[companyName] ?? [];
  return questions.filter((q) => !seenSet.has(q.id)).slice(0, limit);
}

/**
 * Returns the count of questions the user has already seen for a company.
 */
export function getTotalSeen(
  allQuestions: Record<string, SystemDesignQuestion[]>,
  seenSet: Set<string>,
  companyName: string,
): number {
  const questions = allQuestions[companyName] ?? [];
  return questions.filter((q) => seenSet.has(q.id)).length;
}

/**
 * Returns a new Set with the given question ID added.
 */
export function addSeenQuestion(seenSet: Set<string>, questionId: string): Set<string> {
  return new Set([...seenSet, questionId]);
}

/**
 * Returns a new Set with all question IDs for the given company removed.
 * Used when the user clicks "Reset" to start a company's questions fresh.
 */
export function resetCompanyQuestions(
  seenSet: Set<string>,
  companyQuestions: SystemDesignQuestion[],
): Set<string> {
  const idsToRemove = new Set(companyQuestions.map((q) => q.id));
  return new Set([...seenSet].filter((id) => !idsToRemove.has(id)));
}
