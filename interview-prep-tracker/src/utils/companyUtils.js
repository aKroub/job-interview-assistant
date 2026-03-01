/**
 * Pure utility functions for company and interview data transformations.
 *
 * All functions are stateless and free of React or browser globals,
 * making them trivially unit-testable without any setup.
 */

/**
 * Builds a complete company object from a user-supplied draft.
 *
 * @param {{ name: string, position: string, stage: string, pipeline: string }} draft
 * @param {() => number} [idFn=Date.now] - injectable ID generator (use in tests to get deterministic IDs)
 * @returns {Object} Full company object with id, pipeline, interviews, notes, createdAt
 */
export function createCompany(draft, idFn = Date.now) {
  return {
    id:         String(idFn()),
    name:       draft.name,
    position:   draft.position,
    stage:      draft.stage,
    pipeline:   draft.pipeline,
    interviews: [],
    notes:      '',
    createdAt:  new Date().toISOString(),
  };
}

/**
 * Returns a new companies array with missing `pipeline` fields backfilled.
 *
 * Companies created before the pipeline feature won't have a `pipeline` field.
 * This function adds the default pipeline to those entries so storage stays
 * normalised after the first load.
 *
 * Returns the original array reference when no migration is needed (avoids
 * unnecessary re-renders and storage writes).
 *
 * @param {Object[]} companies
 * @param {string}   defaultPipeline - the pipeline value to assign when missing
 * @returns {Object[]}
 */
export function migrateCompanies(companies, defaultPipeline) {
  const needsMigration = companies.some((c) => !c.pipeline);
  if (!needsMigration) return companies;
  return companies.map((c) =>
    c.pipeline ? c : { ...c, pipeline: defaultPipeline }
  );
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

export function applyADeleteInterview(companies, companyId, interviewId) {
  return companies.map(company => {
    if (company.id !== companyId) return company;
      return {
        ...company,
        interviews: company.interviews.filter(i => i.id !== interviewId)
      };
  })
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

/**
 * Derives the display status for an interview without mutating persisted data.
 *
 * Rules (in priority order):
 *  1. 'cancelled' — always stays cancelled regardless of datetime
 *  2. 'completed' — always stays completed regardless of datetime
 *  3. If status is 'scheduled' and the interview datetime is in the past → 'passed'
 *  4. Otherwise → 'scheduled'
 *
 * @param {{ date: string, time: string, status: string }} interview
 * @param {Date} [now=new Date()] - injectable for deterministic testing
 * @returns {'scheduled' | 'passed' | 'completed' | 'cancelled'}
 */
export function deriveInterviewStatus(interview, now = new Date()) {
  if (interview.status === 'cancelled') return 'cancelled';
  if (interview.status === 'completed') return 'completed';
  const dateTimeStr = interview.time
    ? `${interview.date}T${interview.time}`
    : `${interview.date}T23:59`;
  return new Date(dateTimeStr) < now ? 'passed' : 'scheduled';
}
