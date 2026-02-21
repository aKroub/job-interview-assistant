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

        suggestions.push({
          id: suggestionId,
          source: 'gmail+calendar',
          confidence,
          companyName: capitalise(email.companyName || ''),
          companyDomain: email.senderDomain || '',
          type,
          date,
          time,
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

    // Sort by confidence descending
    suggestions.sort((a, b) => b.confidence - a.confidence);

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
 * Capitalises the first letter of a string.
 *
 * @param {string} str
 * @returns {string}
 */
function capitalise(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
