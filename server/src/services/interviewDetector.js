import { crossReferenceEmailAndEvent } from '../utils/matchingUtils.js';

/**
 * Creates an interview detector that cross-references Gmail and Calendar results.
 *
 * CORE RULE: A suggestion is ONLY created when BOTH an email AND a calendar event
 * point to the same interview. Standalone emails or calendar events are never surfaced.
 * This prevents false positives from newsletter emails or unrelated calendar events.
 *
 * @param {Object} deps
 * @param {{ scanForInterviews: Function }} deps.gmailService
 * @param {{ scanForInterviews: Function }} deps.calendarService
 * @param {{ getDismissed: Function }} deps.tokenStore
 * @param {Function} [deps.idFn=Date.now] - injectable ID generator for testing
 * @returns {{ detect: () => Promise<Object[]> }}
 */
export function createInterviewDetector({ gmailService, calendarService, tokenStore, idFn = Date.now }) {

  /**
   * Scans both Gmail and Calendar, cross-references results, and returns
   * only suggestions that are confirmed by BOTH sources.
   *
   * @returns {Promise<Array<{
   *   id: string,
   *   source: 'gmail+calendar',
   *   confidence: number,
   *   companyName: string,
   *   companyDomain: string,
   *   type: string,
   *   date: string,
   *   time: string,
   *   duration: number | null,
   *   subject: string,
   *   emailSnippet: string,
   *   calendarEventId: string,
   *   emailMessageId: string,
   *   detectedAt: string,
   * }>>}
   */
  async function detect() {
    // Run both scans concurrently
    const [emailResults, calendarResults] = await Promise.all([
      gmailService.scanForInterviews(),
      calendarService.scanForInterviews(),
    ]);

    if (emailResults.length === 0 || calendarResults.length === 0) {
      return [];
    }

    const dismissed = new Set(tokenStore.getDismissed());
    const suggestions = [];
    const usedEventIds = new Set();
    const usedMessageIds = new Set();

    // For each email result, find a matching calendar event
    for (const email of emailResults) {
      for (const event of calendarResults) {
        // Skip already-matched events to avoid duplicates
        if (usedEventIds.has(event.eventId) || usedMessageIds.has(email.messageId)) {
          continue;
        }

        const { isMatch, confidence } = crossReferenceEmailAndEvent(email, event);

        if (!isMatch) continue;

        const suggestionId = `suggestion_${email.messageId}_${event.eventId}`;

        // Skip dismissed suggestions
        if (dismissed.has(suggestionId)) continue;

        // Use the calendar event's date/time (more reliable than email extraction)
        const date = event.date || email.extractedDate || '';
        const time = event.time || email.extractedTime || '';

        // Guess the interview type from available signals
        const type = guessInterviewType(email, event);

        // Compute duration from calendar start/end when both are available
        const duration = computeDurationMinutes(event.startDateTime, event.endDateTime);

        suggestions.push({
          id: suggestionId,
          source: 'gmail+calendar',
          confidence,
          companyName: capitalise(email.companyName || event.companyName || ''),
          companyDomain: email.senderDomain || '',
          type,
          date,
          time,
          duration,
          subject: email.subject || event.summary || '',
          emailSnippet: email.snippet || '',
          calendarEventId: event.eventId,
          emailMessageId: email.messageId,
          detectedAt: new Date(idFn()).toISOString(),
        });

        usedEventIds.add(event.eventId);
        usedMessageIds.add(email.messageId);

        // One match per email is enough
        break;
      }
    }

    // Sort by interview date ascending (soonest first) so the most urgent
    // interview is always at the top of the suggestions list.
    suggestions.sort(compareSuggestionsByDate);

    return suggestions;
  }

  return { detect };
}

/**
 * Guesses the interview type from email and calendar signals.
 *
 * @param {Object} email - gmail scan result
 * @param {Object} event - calendar scan result
 * @returns {string} one of 'Phone Interview', 'Video Interview', 'In-Person Interview'
 */
function guessInterviewType(email, event) {
  const combined = `${email.subject || ''} ${email.snippet || ''} ${event.summary || ''} ${event.description || ''}`.toLowerCase();

  if (combined.includes('phone')) {
    return 'Phone Interview';
  }
  if (event.hasVideoLink || combined.includes('zoom') || combined.includes('meet') ||
      combined.includes('teams') || combined.includes('video')) {
    return 'Video Interview';
  }
  if (combined.includes('onsite') || combined.includes('on-site') || combined.includes('office') ||
      combined.includes('in-person') || combined.includes('in person')) {
    return 'In-Person Interview';
  }

  // Default to video since most modern interviews are remote
  return 'Video Interview';
}

/**
 * Computes the duration in minutes between two ISO datetime strings.
 * Returns null when either value is missing or invalid.
 *
 * @param {string} startIso
 * @param {string} endIso
 * @returns {number | null} duration in whole minutes, or null
 */
function computeDurationMinutes(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const startMs = new Date(startIso).getTime();
  const endMs   = new Date(endIso).getTime();
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return null;
  return Math.round((endMs - startMs) / 60000);
}

/**
 * Compares two suggestions for sorting: soonest interview date first.
 *
 * - Primary: date ascending (soonest first). No-date suggestions sink to the bottom.
 * - Secondary: time ascending when dates are equal.
 * - Tertiary: confidence descending as tiebreaker.
 *
 * YYYY-MM-DD and HH:mm formats sort correctly with lexicographic comparison,
 * so no Date parsing is needed.
 *
 * @param {{ date: string, time: string, confidence: number }} a
 * @param {{ date: string, time: string, confidence: number }} b
 * @returns {number} negative if a comes first, positive if b comes first
 */
function compareSuggestionsByDate(a, b) {
  const aHasDate = Boolean(a.date);
  const bHasDate = Boolean(b.date);

  // Suggestions without dates sink to the bottom
  if (aHasDate && !bHasDate) return -1;
  if (!aHasDate && bHasDate) return 1;
  if (!aHasDate && !bHasDate) return b.confidence - a.confidence;

  // Both have dates — compare lexicographically (YYYY-MM-DD sorts correctly)
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;

  // Same date — compare by time
  const aHasTime = Boolean(a.time);
  const bHasTime = Boolean(b.time);

  if (aHasTime && !bHasTime) return -1;
  if (!aHasTime && bHasTime) return 1;
  if (aHasTime && bHasTime && a.time !== b.time) {
    return a.time < b.time ? -1 : 1;
  }

  // Same date and time (or both missing time) — tiebreak by confidence
  return b.confidence - a.confidence;
}

/**
 * Capitalises the first letter of a string.
 *
 * @param {string} str
 * @returns {string}
 */
function capitalise(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
