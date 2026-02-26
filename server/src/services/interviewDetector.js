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
 * Minimum calendar score required to surface a calendar-only suggestion.
 * Mirrors EMAIL_ONLY_MIN_SCORE — calendar-only suggestions need a strong
 * signal since there is no email cross-reference to validate them.
 */
const CALENDAR_ONLY_MIN_SCORE = 0.5;

/**
 * Scaling factor applied to calendar scores for calendar-only suggestions.
 * Ensures calendar-only confidence is always lower than the minimum
 * cross-reference confidence tier (0.5 for date-only match).
 */
const CALENDAR_ONLY_CONFIDENCE_FACTOR = 0.6;

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
 * TERTIARY RULE: High-scoring calendar events that do NOT match any email are
 * surfaced as lower-confidence "calendar-only" suggestions (source: 'calendar')
 * so the user does not miss interviews where the email scored below the Gmail
 * threshold.
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
   *   source: 'gmail+calendar' | 'gmail' | 'calendar',
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

    if (emailResults.length === 0 && calendarResults.length === 0) {
      return [];
    }

    const dismissed = new Set(tokenStore.getDismissed());
    const suggestions = [];
    const usedEventIds = new Set();
    const usedMessageIds = new Set();
    // Events that matched at least one email (regardless of whether the
    // suggestion was dismissed). Calendar-only suggestions should only be
    // created for truly orphaned events — not for events that were already
    // shown as a cross-reference and dismissed by the user.
    const matchedEventIds = new Set();

    // --- Cross-referenced suggestions (email + calendar) ---
    if (calendarResults.length > 0) {
      for (const email of emailResults) {
        // Find the best-matching event for this email (highest confidence)
        let bestMatch = null;

        for (const event of calendarResults) {
          // Skip already-matched events to avoid duplicates
          if (usedEventIds.has(event.eventId) || usedMessageIds.has(email.messageId)) {
            continue;
          }

          const { isMatch, confidence } = crossReferenceEmailAndEvent(email, event);

          if (!isMatch) continue;

          // Track that this event matched an email, even if the suggestion
          // is dismissed — prevents it from appearing as calendar-only later.
          matchedEventIds.add(event.eventId);

          const suggestionId = `suggestion_${email.messageId}_${event.eventId}`;

          // Skip dismissed suggestions
          if (dismissed.has(suggestionId)) continue;

          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { event, confidence, suggestionId };
          }
        }

        if (bestMatch) {
          const { event, confidence, suggestionId } = bestMatch;

          // Use the calendar event's date/time (more reliable than email extraction)
          const date = event.date || email.extractedDate || '';
          const time = event.time || email.extractedTime || '';

          // Guess the interview type from available signals
          const type = guessInterviewType(email, event);

          // Prefer email-extracted duration (explicit text like "15:00-15:20") over
          // calendar slot duration (often padded by scheduling platforms)
          const calendarDuration = computeDurationMinutes(event.startDateTime, event.endDateTime);
          const duration = email.extractedDuration || calendarDuration;

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

    // --- Calendar-only suggestions ---
    // Calendar events that did NOT match any email but have a high enough
    // score to stand on their own. These help catch interviews where the
    // email scored below the Gmail threshold or was not fetched.
    for (const event of calendarResults) {
      if (usedEventIds.has(event.eventId) || matchedEventIds.has(event.eventId)) continue;
      if (event.score < CALENDAR_ONLY_MIN_SCORE) continue;

      const suggestionId = `suggestion_calendar_${event.eventId}`;
      if (dismissed.has(suggestionId)) continue;

      suggestions.push({
        id: suggestionId,
        source: 'calendar',
        confidence: event.score * CALENDAR_ONLY_CONFIDENCE_FACTOR,
        companyName: capitalise(event.companyName || ''),
        companyDomain: '',
        type: guessInterviewTypeFromCalendar(event),
        date: event.date || '',
        time: event.time || '',
        duration: computeDurationMinutes(event.startDateTime, event.endDateTime),
        subject: event.summary || '',
        emailSnippet: '',
        calendarEventId: event.eventId,
        emailMessageId: '',
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
 * Video-conference URL patterns. When `event.location` matches one of these,
 * the location is a join-link, not a physical address.
 */
const VIDEO_URL_PATTERNS = ['zoom.us', 'meet.google.com', 'teams.microsoft.com'];

/**
 * Text patterns that indicate a physical / in-person interview location.
 * Checked against the combined email + calendar text.
 */
const IN_PERSON_PATTERN =
  /\b(onsite|on-site|in-person|in person|office|campus|headquarters|hq|building)\b|floor\s+\d/i;

/**
 * Returns true when the calendar event's location field contains a physical
 * address rather than a video-conference link.
 *
 * @param {string} location - calendar event location field
 * @returns {boolean}
 */
function isPhysicalLocation(location) {
  if (!location) return false;
  const lower = location.toLowerCase();
  if (lower.startsWith('http')) return false;
  return !VIDEO_URL_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Guesses the interview type from email and calendar signals.
 *
 * Priority order:
 * 1. Phone — explicit "phone" keyword
 * 2. In-Person — physical location via event.location or address keywords in text
 * 3. Video — video link on calendar event or video keywords in text
 * 4. Default — Video (most modern interviews are remote)
 *
 * In-person is checked BEFORE video because companies often attach
 * video-conference links (e.g. Zoom room systems) to calendar events
 * that are actually held on-site.
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
  if (isPhysicalLocation(event.location) || IN_PERSON_PATTERN.test(combined)) {
    return 'In-Person Interview';
  }
  if (event.hasVideoLink || combined.includes('zoom') || combined.includes('meet') ||
      combined.includes('teams') || combined.includes('video')) {
    return 'Video Interview';
  }

  // Default to video since most modern interviews are remote
  return 'Video Interview';
}

/**
 * Guesses the interview type from email signals only (no calendar event).
 *
 * Without calendar data there is no hasVideoLink or location signal, so
 * detection relies on text keywords only. Same priority as the full version:
 * phone → in-person → video → default video.
 *
 * @param {Object} email - gmail scan result
 * @returns {string} one of 'Phone Interview', 'Video Interview', 'In-Person Interview'
 */
function guessInterviewTypeFromEmail(email) {
  const combined = `${email.subject || ''} ${email.snippet || ''}`.toLowerCase();

  if (combined.includes('phone')) {
    return 'Phone Interview';
  }
  if (IN_PERSON_PATTERN.test(combined)) {
    return 'In-Person Interview';
  }
  if (combined.includes('zoom') || combined.includes('meet') ||
      combined.includes('teams') || combined.includes('video')) {
    return 'Video Interview';
  }

  return 'Video Interview';
}

/**
 * Guesses the interview type from calendar signals only (no email).
 *
 * Uses event summary, description, location, and video link data.
 * Same priority as the full version: phone → in-person → video → default video.
 *
 * @param {Object} event - calendar scan result
 * @returns {string} one of 'Phone Interview', 'Video Interview', 'In-Person Interview'
 */
function guessInterviewTypeFromCalendar(event) {
  const combined = `${event.summary || ''} ${event.description || ''}`.toLowerCase();

  if (combined.includes('phone')) {
    return 'Phone Interview';
  }
  if (isPhysicalLocation(event.location) || IN_PERSON_PATTERN.test(combined)) {
    return 'In-Person Interview';
  }
  if (event.hasVideoLink || combined.includes('zoom') || combined.includes('meet') ||
      combined.includes('teams') || combined.includes('video')) {
    return 'Video Interview';
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
