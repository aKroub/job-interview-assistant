import { google } from 'googleapis';
import { scoreCalendarEvent } from '../utils/matchingUtils.js';

/**
 * Creates a Google Calendar scanning service that searches for interview-related events.
 *
 * @param {import('googleapis').Auth.OAuth2Client} authClient - authenticated OAuth2 client
 * @param {Object} [options]
 * @param {number} [options.lookaheadDays=30] - how many days ahead to scan
 * @param {number} [options.minScore=0.3] - minimum confidence score to include a result
 * @param {Function} [options.getUserEmail=async () => ''] - async function to get user's email for external organizer detection
 * @param {Function} [options.calendarApi] - injectable Calendar API instance for testing
 * @param {Function} [options.nowFn=() => new Date()] - injectable clock for testing
 * @returns {{ scanForInterviews: () => Promise<Object[]> }}
 */
export function createCalendarService(authClient, options = {}) {
  const {
    lookaheadDays = 30,
    minScore = 0.3,
    getUserEmail = async () => '',
    calendarApi = google.calendar({ version: 'v3', auth: authClient }),
    nowFn = () => new Date(),
  } = options;

  /**
   * Fetches events from Google Calendar within the given time range.
   *
   * @param {string} timeMin - ISO 8601 start time
   * @param {string} timeMax - ISO 8601 end time
   * @returns {Promise<Object[]>}
   */
  async function fetchEvents(timeMin, timeMax) {
    try {
      const response = await calendarApi.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
      });
      return response.data.items || [];
    } catch (err) {
      if (err.code === 401 || err.code === 403) {
        throw new Error('Calendar access denied. Please re-authenticate.');
      }
      throw err;
    }
  }

  /**
   * Scans Google Calendar for upcoming interview-related events.
   * Returns scored results above the minimum confidence threshold.
   *
   * @returns {Promise<Array<{
   *   eventId: string,
   *   summary: string,
   *   description: string,
   *   organizerEmail: string,
   *   startDateTime: string,
   *   endDateTime: string,
   *   date: string,
   *   time: string,
   *   score: number,
   *   matchedKeywords: string[],
   *   reasons: string[],
   *   hasVideoLink: boolean,
   * }>>}
   */
  async function scanForInterviews() {
    const now = nowFn();
    const timeMin = now.toISOString();
    const futureDate = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);
    const timeMax = futureDate.toISOString();

    const [events, userEmail] = await Promise.all([
      fetchEvents(timeMin, timeMax),
      getUserEmail(),
    ]);

    const results = [];

    for (const event of events) {
      const { score, matchedKeywords, reasons } = scoreCalendarEvent(event, userEmail);

      if (score >= minScore) {
        const startDateTime = event.start?.dateTime || '';
        const date = startDateTime ? startDateTime.slice(0, 10) : (event.start?.date || '');
        const time = startDateTime ? startDateTime.slice(11, 16) : '';

        results.push({
          eventId: event.id || '',
          summary: event.summary || '',
          description: event.description || '',
          organizerEmail: event.organizer?.email || '',
          startDateTime,
          endDateTime: event.end?.dateTime || '',
          date,
          time,
          score,
          matchedKeywords,
          reasons,
          hasVideoLink: !!(event.hangoutLink || event.conferenceData),
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  return { scanForInterviews };
}
