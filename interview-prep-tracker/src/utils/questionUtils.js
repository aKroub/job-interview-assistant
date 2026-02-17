/**
 * Pure utility functions for system design question state management.
 *
 * All functions are stateless and free of React or browser globals,
 * making them trivially unit-testable without any setup.
 */

/**
 * Returns the next unseen questions for a given company, up to `limit`.
 *
 * @param {Object}  allQuestions - The full SYSTEM_DESIGN_QUESTIONS map
 * @param {Set}     seenSet      - Set of question IDs the user has already seen
 * @param {string}  companyName
 * @param {number}  [limit=3]
 * @returns {Object[]} Array of question objects
 */
export function getAvailableQuestions(allQuestions, seenSet, companyName, limit = 3) {
  const questions = allQuestions[companyName] ?? [];
  return questions.filter((q) => !seenSet.has(q.id)).slice(0, limit);
}

/**
 * Returns the count of questions the user has already seen for a company.
 *
 * @param {Object} allQuestions
 * @param {Set}    seenSet
 * @param {string} companyName
 * @returns {number}
 */
export function getTotalSeen(allQuestions, seenSet, companyName) {
  const questions = allQuestions[companyName] ?? [];
  return questions.filter((q) => seenSet.has(q.id)).length;
}

/**
 * Returns a new Set with the given question ID added.
 *
 * @param {Set}    seenSet
 * @param {string} questionId
 * @returns {Set}
 */
export function addSeenQuestion(seenSet, questionId) {
  return new Set([...seenSet, questionId]);
}

/**
 * Returns a new Set with all question IDs for the given company removed.
 * Used when the user clicks "Reset" to start a company's questions fresh.
 *
 * @param {Set}      seenSet
 * @param {Object[]} companyQuestions - Array of question objects for the company
 * @returns {Set}
 */
export function resetCompanyQuestions(seenSet, companyQuestions) {
  const idsToRemove = new Set(companyQuestions.map((q) => q.id));
  return new Set([...seenSet].filter((id) => !idsToRemove.has(id)));
}
