/**
 * Pure utility functions for company and interview data transformations.
 *
 * All functions are stateless and free of React or browser globals,
 * making them trivially unit-testable without any setup.
 */

/**
 * Builds a complete company object from a user-supplied draft.
 *
 * @param {{ name: string, position: string, stage: string }} draft
 * @param {() => number} [idFn=Date.now] - injectable ID generator (use in tests to get deterministic IDs)
 * @returns {Object} Full company object with id, interviews, notes, createdAt
 */
export function createCompany(draft, idFn = Date.now) {
  return {
    id:         String(idFn()),
    name:       draft.name,
    position:   draft.position,
    stage:      draft.stage,
    interviews: [],
    notes:      '',
    createdAt:  new Date().toISOString(),
  };
}

/**
 * Returns a new companies array with one company's stage updated.
 *
 * @param {Object[]} companies
 * @param {string}   companyId
 * @param {string}   newStage
 * @returns {Object[]}
 */
export function applyStageUpdate(companies, companyId, newStage) {
  return companies.map((c) =>
    c.id === companyId ? { ...c, stage: newStage } : c
  );
}

/**
 * Returns a new companies array with the specified company removed.
 *
 * @param {Object[]} companies
 * @param {string}   companyId
 * @returns {Object[]}
 */
export function applyDelete(companies, companyId) {
  return companies.filter((c) => c.id !== companyId);
}

/**
 * Returns a new companies array with an interview appended to the target company.
 *
 * @param {Object[]} companies
 * @param {string}   companyId
 * @param {{ type: string, date: string, time: string, status: string }} interview
 * @param {() => number} [idFn=Date.now]
 * @returns {Object[]}
 */
export function applyAddInterview(companies, companyId, interview, idFn = Date.now) {
  return companies.map((c) =>
    c.id === companyId
      ? { ...c, interviews: [...c.interviews, { ...interview, id: String(idFn()) }] }
      : c
  );
}

/**
 * Returns a new companies array with a single interview's status updated.
 *
 * @param {Object[]} companies
 * @param {string}   companyId
 * @param {string}   interviewId
 * @param {string}   status  - 'scheduled' | 'completed' | 'cancelled'
 * @returns {Object[]}
 */
export function applyInterviewStatusUpdate(companies, companyId, interviewId, status) {
  return companies.map((c) =>
    c.id === companyId
      ? {
          ...c,
          interviews: c.interviews.map((i) =>
            i.id === interviewId ? { ...i, status } : i
          ),
        }
      : c
  );
}

/**
 * Flattens all interviews from all companies into a single chronologically-sorted array.
 * Each entry is decorated with companyName, position, and companyId for display purposes.
 *
 * @param {Object[]} companies
 * @returns {Object[]} Sorted interview objects
 */
export function flattenAndSortInterviews(companies) {
  return companies
    .flatMap((company) =>
      company.interviews.map((interview) => ({
        ...interview,
        companyName: company.name,
        position:    company.position,
        companyId:   company.id,
      }))
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}
