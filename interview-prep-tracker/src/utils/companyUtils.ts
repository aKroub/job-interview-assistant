import type {
  Company,
  CompanyDraft,
  FlattenedInterview,
  DerivedInterviewStatus,
  Interview,
  StageKey,
  PipelineId,
  InterviewStatus,
} from '../types';

/**
 * Pure utility functions for company and interview data transformations.
 *
 * All functions are stateless and free of React or browser globals,
 * making them trivially unit-testable without any setup.
 */

/**
 * Returns true if the company belongs to the given pipeline.
 *
 * Handles both the current array format (`['tel-aviv', 'us']`) and the
 * legacy scalar format (`'tel-aviv'`) for pre-migration data in-flight.
 */
export function isInPipeline(company: Company, pipelineId: PipelineId): boolean {
  return Array.isArray(company.pipeline)
    ? company.pipeline.includes(pipelineId)
    : (company.pipeline as unknown as string) === pipelineId;
}

/**
 * Returns true if the company belongs to more than one pipeline.
 */
export function isMultiPipeline(company: Company): boolean {
  return Array.isArray(company.pipeline) && company.pipeline.length > 1;
}

/**
 * Builds a complete company object from a user-supplied draft.
 *
 * @param draft
 * @param idFn - injectable ID generator (use in tests to get deterministic IDs)
 * @returns Full company object with id, pipeline, interviews, notes, createdAt, and optional domain/customLogoUrl
 */
export function createCompany(draft: CompanyDraft, idFn: () => number = Date.now): Company {
  const company: Company = {
    id:         String(idFn()),
    name:       draft.name,
    position:   draft.position,
    stage:      draft.stage,
    pipeline:   draft.pipeline,
    interviews: [],
    notes:      '',
    createdAt:  new Date().toISOString(),
  };
  if (draft.domain) company.domain = draft.domain;
  if (draft.customLogoUrl) company.customLogoUrl = draft.customLogoUrl;
  return company;
}

/**
 * Returns a new companies array with `pipeline` fields normalised to arrays.
 *
 * Handles three legacy formats:
 *  1. `pipeline` is undefined/falsy → `[defaultPipeline]`
 *  2. `pipeline` is a scalar string → `[pipeline]`
 *  3. `pipeline` is already an array → no change
 *
 * Returns the original array reference when no migration is needed (avoids
 * unnecessary re-renders and storage writes).
 */
export function migrateCompanies(companies: Company[], defaultPipeline: PipelineId): Company[] {
  const needsMigration = companies.some((c) => !Array.isArray(c.pipeline));
  if (!needsMigration) return companies;
  return companies.map((c) => {
    if (Array.isArray(c.pipeline)) return c;
    const pipeline = c.pipeline as unknown;
    if (typeof pipeline === 'string' && pipeline) return { ...c, pipeline: [pipeline as PipelineId] };
    return { ...c, pipeline: [defaultPipeline] };
  });
}

/**
 * Returns a new companies array with one company's stage updated.
 */
export function applyStageUpdate(companies: Company[], companyId: string, newStage: StageKey): Company[] {
  return companies.map((c) =>
    c.id === companyId ? { ...c, stage: newStage } : c
  );
}

/**
 * Returns a new companies array with the specified company's fields updated.
 *
 * @param companies
 * @param companyId
 * @param updates - fields to merge (e.g. { position, pipeline })
 */
export function applyEditCompany(companies: Company[], companyId: string, updates: Partial<Company>): Company[] {
  return companies.map((c) =>
    c.id === companyId ? { ...c, ...updates } : c
  );
}

/**
 * Returns a new companies array with the specified company removed.
 */
export function applyDelete(companies: Company[], companyId: string): Company[] {
  return companies.filter((c) => c.id !== companyId);
}

/**
 * Returns a new companies array with an interview appended to the target company.
 */
export function applyAddInterview(
  companies: Company[],
  companyId: string,
  interview: Omit<Interview, 'id'>,
  idFn: () => number = Date.now,
): Company[] {
  return companies.map((c) =>
    c.id === companyId
      ? { ...c, interviews: [...c.interviews, { ...interview, id: String(idFn()) }] }
      : c
  );
}

/**
 * Returns a new companies array with the specified interview removed.
 */
export function applyDeleteInterview(companies: Company[], companyId: string, interviewId: string): Company[] {
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
 * @param companies
 * @param companyId
 * @param interviewId
 * @param status - 'scheduled' | 'completed' | 'cancelled'
 */
export function applyInterviewStatusUpdate(
  companies: Company[],
  companyId: string,
  interviewId: string,
  status: InterviewStatus,
): Company[] {
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
 */
export function flattenAndSortInterviews(companies: Company[]): FlattenedInterview[] {
  return companies
    .flatMap((company) =>
      company.interviews.map((interview) => ({
        ...interview,
        companyName:      company.name,
        position:         company.position,
        companyId:        company.id,
        companyDomain:    company.domain || null,
        companyCustomLogoUrl: company.customLogoUrl || null,
      }))
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
 * @param interview
 * @param now - injectable for deterministic testing
 */
export function deriveInterviewStatus(
  interview: { date: string; time: string; status: InterviewStatus },
  now: Date = new Date(),
): DerivedInterviewStatus {
  if (interview.status === 'cancelled') return 'cancelled';
  if (interview.status === 'completed') return 'completed';
  const dateTimeStr = interview.time
    ? `${interview.date}T${interview.time}`
    : `${interview.date}T23:59`;
  return new Date(dateTimeStr) < now ? 'passed' : 'scheduled';
}

/**
 * Finds the interview in the user's tracker that best matches a suggestion.
 *
 * Matches by normalised company name (exact or substring) + date. When
 * multiple interviews share the same date, the one with the closest time wins.
 * Exact name matches are preferred over substring matches.
 */
export function matchSuggestionToInterview(
  companies: Company[],
  suggestion: { companyName: string; date: string; time: string },
): { companyId: string; interviewId: string } | null {
  const targetName = normalizeForMatch(suggestion.companyName || '');
  const targetDate = suggestion.date || '';

  if (!targetName || !targetDate) return null;

  let best: { companyId: string; interviewId: string } | null = null;
  let bestTimeDiff = Infinity;
  let bestIsExact = false;

  for (const company of companies) {
    const companyNorm = normalizeForMatch(company.name);
    const isExact = companyNorm === targetName;
    const isSubstring = !isExact && namesMatch(companyNorm, targetName);

    if (!isExact && !isSubstring) continue;

    for (const interview of company.interviews) {
      if (interview.date !== targetDate) continue;
      if (interview.status === 'cancelled') continue;

      const timeDiff = suggestion.time && interview.time
        ? Math.abs(timeToMinutes(suggestion.time) - timeToMinutes(interview.time))
        : 0;

      // Exact name matches always beat substring matches
      if (bestIsExact && !isExact) continue;
      const dominated = best && (isExact === bestIsExact) && timeDiff >= bestTimeDiff;
      if (dominated) continue;

      best = { companyId: company.id, interviewId: interview.id };
      bestTimeDiff = timeDiff;
      bestIsExact = isExact;
    }
  }

  return best;
}

/**
 * Finds the first company whose name fuzzy-matches the given name.
 *
 * Uses the same normalisation and substring logic as
 * matchSuggestionToInterview so that all suggestion actions
 * (add, cancel, update) resolve company names consistently.
 */
export function findCompanyByFuzzyName(companies: Company[], name: string): Company | null {
  const target = normalizeForMatch(name);
  if (!target) return null;

  const exact = companies.find((c) => normalizeForMatch(c.name) === target);
  if (exact) return exact;

  return companies.find((c) => namesMatch(normalizeForMatch(c.name), target)) || null;
}

/**
 * Relaxed version of matchSuggestionToInterview that matches by
 * company name only (ignoring date).
 *
 * Used as a fallback for 'update' and 'cancel' actions where the interview
 * date may have changed — the tracker still holds the old date so the strict
 * name+date match fails.
 *
 * Among all non-cancelled interviews for the matched company, picks the one
 * closest to the suggestion's date+time. When two interviews are on the
 * same date, time proximity is used as a tiebreaker so each interview can
 * be matched independently.
 */
export function matchByNameOnly(
  companies: Company[],
  suggestion: { companyName: string; date?: string; time?: string },
): { companyId: string; interviewId: string } | null {
  const company = findCompanyByFuzzyName(companies, suggestion.companyName);
  if (!company) return null;

  const active = company.interviews.filter((i) => i.status !== 'cancelled');
  if (active.length === 0) return null;

  if (active.length === 1) {
    return { companyId: company.id, interviewId: active[0]!.id };
  }

  // Multiple active interviews — pick the one closest by date, then by time
  if (suggestion.date) {
    const targetMs = new Date(suggestion.date).getTime();
    const targetTimeMin = suggestion.time ? timeToMinutes(suggestion.time) : null;

    let closest = active[0]!;
    let closestDateDiff = Math.abs(new Date(closest.date).getTime() - targetMs);
    let closestTimeDiff = targetTimeMin !== null && closest.time
      ? Math.abs(timeToMinutes(closest.time) - targetTimeMin)
      : Infinity;

    for (let i = 1; i < active.length; i++) {
      const interview = active[i]!;
      const dateDiff = Math.abs(new Date(interview.date).getTime() - targetMs);
      const timeDiff = targetTimeMin !== null && interview.time
        ? Math.abs(timeToMinutes(interview.time) - targetTimeMin)
        : Infinity;

      // Prefer closer date; on date tie, prefer closer time
      if (dateDiff < closestDateDiff ||
          (dateDiff === closestDateDiff && timeDiff < closestTimeDiff)) {
        closest = interview;
        closestDateDiff = dateDiff;
        closestTimeDiff = timeDiff;
      }
    }
    return { companyId: company.id, interviewId: closest.id };
  }

  // No date on suggestion — return the first active interview
  return { companyId: company.id, interviewId: active[0]!.id };
}

/**
 * Returns a new companies array with one interview's fields updated.
 *
 * @param companies
 * @param companyId
 * @param interviewId
 * @param updates - fields to merge (e.g. { date, time, duration })
 */
export function applyInterviewUpdate(
  companies: Company[],
  companyId: string,
  interviewId: string,
  updates: Partial<Interview>,
): Company[] {
  return companies.map((c) =>
    c.id === companyId
      ? {
          ...c,
          interviews: c.interviews.map((i) =>
            i.id === interviewId ? { ...i, ...updates } : i
          ),
        }
      : c
  );
}

/**
 * Returns true when two normalised company names are close enough to match.
 *
 * Checks whether either string contains the other — handles the common case
 * where the backend extracts a short domain name (e.g. "checkpoint") while the
 * user entered a longer form (e.g. "checkpointsoftwaretechnologies").
 *
 * Requires the shorter string to be at least 3 characters to avoid
 * false positives on very short strings like "at" matching "meta".
 */
function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const shorter = a.length <= b.length ? a : b;
  if (shorter.length < 3) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * Normalises a company name for fuzzy matching: lowercase, strip
 * whitespace, punctuation, and common suffixes (ltd, inc, etc.).
 */
function normalizeForMatch(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[.\-_,!'"()]/g, '')
    .replace(/\b(ltd|inc|corp|llc|gmbh|co)\b/g, '')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Returns today's upcoming scheduled interviews, sorted by time ascending.
 *
 * Flattens all interviews from all companies, filters to those whose date
 * matches today and whose derived status is 'scheduled' (not completed,
 * cancelled, or passed), and sorts by time ascending. Interviews without
 * a time are sorted after timed interviews.
 *
 * @param companies - the full companies array with nested interviews
 * @param now - injectable for deterministic testing
 * @returns Flat interview objects with companyName, companyId, position
 */
export function getTodaysUpcomingInterviews(companies: Company[], now: Date = new Date()): FlattenedInterview[] {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  return flattenAndSortInterviews(companies)
    .filter((interview) =>
      interview.date === todayStr &&
      deriveInterviewStatus(interview, now) === 'scheduled'
    )
    .sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });
}

/**
 * Converts "HH:mm" to total minutes since midnight.
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
