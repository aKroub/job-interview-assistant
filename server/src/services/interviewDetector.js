import { crossReferenceEmailAndEvent } from '../utils/matchingUtils.js';

/**
 * Minimum email score required to surface an email-only suggestion.
 * Higher than the gmailService's 0.3 threshold because there is no
 * calendar cross-reference to validate the signal.
 */
const EMAIL_ONLY_MIN_SCORE = 0.5;

/**
 * Scaling factor applied to email scores for email-only suggestions.
 * Ensures email-only confidence is always lower than the minimum
 * cross-reference confidence tier (0.5 for date-only match).
 */
const EMAIL_ONLY_CONFIDENCE_FACTOR = 0.6;

/**
 * Creates an interview detector that cross-references Gmail and Calendar results.
 *
 * PRIMARY RULE: A suggestion is created when BOTH an email AND a calendar event
 * point to the same interview. This prevents false positives from newsletter
 * emails or unrelated calendar events.
 *
 * SECONDARY RULE: High-scoring emails that do NOT match any calendar event are
 * surfaced as lower-confidence "email-only" suggestions (source: 'gmail') so
 * the user does not miss interview invitations that were not auto-added to the
 * calendar.
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
   * suggestions. Cross-referenced (email + calendar) suggestions are created
   * first; remaining high-scoring emails produce lower-confidence email-only
   * suggestions.
   *
   * @returns {Promise<Array<{
   *   id: string,
   *   source: 'gmail+calendar' | 'gmail',
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

    if (emailResults.length === 0) {
      return [];
    }

    const dismissed = new Set(tokenStore.getDismissed());
    const suggestions = [];
    const usedEventIds = new Set();
    const usedMessageIds = new Set();

    // --- Cross-referenced suggestions (email + calendar) ---
    if (calendarResults.length > 0) {
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
    }

    // --- Email-only suggestions ---
    // Emails that did NOT match any calendar event but have a high enough
    // score to stand on their own. These help catch interviews where the
    // sender was unknown and Gmail did not auto-add the event to the calendar.
    for (const email of emailResults) {
      if (usedMessageIds.has(email.messageId)) continue;
      if (email.score < EMAIL_ONLY_MIN_SCORE) continue;

      const suggestionId = `suggestion_gmail_${email.messageId}`;
      if (dismissed.has(suggestionId)) continue;

      suggestions.push({
        id: suggestionId,
        source: 'gmail',
        confidence: email.score * EMAIL_ONLY_CONFIDENCE_FACTOR,
        companyName: capitalise(email.companyName || ''),
        companyDomain: email.senderDomain || '',
        type: guessInterviewTypeFromEmail(email),
        date: email.extractedDate || '',
        time: email.extractedTime || '',
        duration: email.extractedDuration || null,
        subject: email.subject || '',
        emailSnippet: email.snippet || '',
        calendarEventId: '',
        emailMessageId: email.messageId,
        detectedAt: new Date(idFn()).toISOString(),
      });
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
 * Guesses the interview type from email signals only (no calendar event).
 *
 * Without calendar data there is no hasVideoLink signal, so the default
 * is 'Video Interview' (most modern interviews are remote) unless the
 * email text mentions a specific format.
 *
 * @param {Object} email - gmail scan result
 * @returns {string} one of 'Phone Interview', 'Video Interview', 'In-Person Interview'
 */
function guessInterviewTypeFromEmail(email) {
  const combined = `${email.subject || ''} ${email.snippet || ''}`.toLowerCase();

  if (combined.includes('phone')) {
    return 'Phone Interview';
  }
  if (combined.includes('zoom') || combined.includes('meet') ||
      combined.includes('teams') || combined.includes('video')) {
    return 'Video Interview';
  }
  if (combined.includes('onsite') || combined.includes('on-site') ||
      combined.includes('office') || combined.includes('in-person') ||
      combined.includes('in person')) {
    return 'In-Person Interview';
  }

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
