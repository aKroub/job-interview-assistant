/**
 * Utilities for merging LLM-extracted fields into regex-extracted
 * email/event results. Each merge function returns a new object
 * (immutable — the original is never mutated).
 *
 * @module llmEnrichment
 */

/**
 * Maps free-form LLM interview_type strings to the detector's
 * canonical format values. Round-type descriptions (e.g. "technical")
 * are intentionally unmapped because they describe content, not format —
 * the regex heuristic based on video links and physical locations is
 * more reliable for format detection.
 *
 * @type {Record<string, string>}
 */
const TYPE_MAP = {
  'phone': 'Phone Interview',
  'phone screen': 'Phone Interview',
  'phone interview': 'Phone Interview',
  'phone call': 'Phone Interview',
  'video': 'Video Interview',
  'video interview': 'Video Interview',
  'video call': 'Video Interview',
  'virtual': 'Video Interview',
  'remote': 'Video Interview',
  'zoom': 'Video Interview',
  'google meet': 'Video Interview',
  'teams': 'Video Interview',
  'in-person': 'In-Person Interview',
  'in person': 'In-Person Interview',
  'onsite': 'In-Person Interview',
  'on-site': 'In-Person Interview',
  'on site': 'In-Person Interview',
  'office': 'In-Person Interview',
};

const VALID_INTENTS = ['add', 'cancel', 'update'];

/**
 * Normalises a free-form LLM interview_type string to one of the
 * detector's canonical values: "Phone Interview", "Video Interview",
 * or "In-Person Interview".
 *
 * Returns null when the type is unrecognised or describes a round
 * (e.g. "technical", "behavioral") rather than a format, so the
 * caller can fall back to the regex-based guess.
 *
 * @param {string|null|undefined} llmType - raw interview_type from the LLM
 * @returns {string|null} canonical type or null
 */
export function normalizeInterviewType(llmType) {
  if (!llmType || typeof llmType !== 'string') return null;
  return TYPE_MAP[llmType.toLowerCase().trim()] ?? null;
}

/**
 * Computes the duration in minutes between two HH:MM time strings.
 * Returns null when either value is missing or the end is not after the start.
 *
 * @param {string|null|undefined} startTime - start time in HH:MM format
 * @param {string|null|undefined} endTime - end time in HH:MM format
 * @returns {number|null} duration in minutes, or null
 */
function computeDurationFromTimes(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const start = new Date(`1970-01-01T${startTime}:00`);
  const end = new Date(`1970-01-01T${endTime}:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const diffMs = end - start;
  return diffMs > 0 ? diffMs / 60000 : null;
}

/**
 * Merges LLM-extracted fields into a regex-extracted email result.
 * Only non-null, non-empty LLM fields override the regex values.
 *
 * The LLM returns raw `start_time` and `end_time` strings. Duration is
 * computed here (business logic) rather than asking the LLM to calculate it.
 *
 * @param {Object} emailResult - regex-extracted email from gmailService
 * @param {Object|null} llmExtraction - unwrapped extraction from llmExtractor
 *   (i.e. the `.extraction` property, not the `{ dryModePrompt, extraction }` wrapper)
 * @returns {Object} enriched email result (new object, original not mutated)
 */
export function mergeEmailExtraction(emailResult, llmExtraction) {
  if (!llmExtraction) return emailResult;

  const llmDuration = computeDurationFromTimes(
    llmExtraction.start_time,
    llmExtraction.end_time,
  );

  return {
    ...emailResult,
    companyName: llmExtraction.company_name || emailResult.companyName,
    extractedDate: llmExtraction.date || emailResult.extractedDate,
    extractedTime: llmExtraction.start_time || emailResult.extractedTime,
    extractedDuration: llmDuration ?? emailResult.extractedDuration,
    intent: VALID_INTENTS.includes(llmExtraction.intent)
      ? llmExtraction.intent
      : emailResult.intent,
    llmInterviewType: llmExtraction.interview_type || null,
  };
}

/**
 * Merges LLM-extracted fields into a regex-extracted calendar result.
 * Calendar events already have structured date/time/duration from the
 * Calendar API, so only company_name and interview_type are enriched.
 *
 * @param {Object} calendarResult - regex-extracted event from calendarService
 * @param {Object|null} llmExtraction - unwrapped extraction from llmExtractor
 * @returns {Object} enriched calendar result (new object, original not mutated)
 */
export function mergeCalendarExtraction(calendarResult, llmExtraction) {
  if (!llmExtraction) return calendarResult;

  return {
    ...calendarResult,
    companyName: llmExtraction.company_name || calendarResult.companyName,
    llmInterviewType: llmExtraction.interview_type || null,
  };
}
