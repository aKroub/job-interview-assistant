import { google } from 'googleapis';
import {
  parseGmailMessage,
  extractEmailFromHeader,
  extractDomain,
  extractCompanyFromDomain,
  scoreEmailForInterview,
  extractDateTimeFromText,
  extractCompanyNameFromText,
  extractPlainTextBody,
  detectEmailIntent,
} from '../utils/emailParser.js';

/**
 * Creates a Gmail scanning service that searches for interview-related emails.
 *
 * @param {import('googleapis').Auth.OAuth2Client} authClient - authenticated OAuth2 client
 * @param {Object} [options]
 * @param {number} [options.lookbackDays=1] - how many days back to scan
 * @param {number} [options.minScore=0.3] - minimum confidence score to include a result
 * @param {Function} [options.gmailApi] - injectable Gmail API instance for testing
 * @returns {{ scanForInterviews: () => Promise<Object[]> }}
 */
export function createGmailService(authClient, options = {}) {
  const {
    lookbackDays = 1,
    minScore = 0.3,
    gmailApi = google.gmail({ version: 'v1', auth: authClient }),
  } = options;

  /**
   * Gmail search query targeting interview-related emails.
   * Uses Gmail's search syntax to narrow results before we score them.
   *
   * @param {number} days - number of days to look back
   * @returns {string} Gmail search query
   */
  function buildSearchQuery(days) {
    const keywords = [
      'interview',
      'technical assessment',
      'coding challenge',
      'phone screen',
      'hiring',
      'onsite',
      'interview cancelled',
      'interview canceled',
      'interview rescheduled',
      'cancelled event',
      'canceled event',
      'updated invitation',
    ];
    const keywordQuery = keywords.map((kw) => `"${kw}"`).join(' OR ');
    return `(${keywordQuery}) newer_than:${days}d`;
  }

  /**
   * Scans Gmail for recent interview-related emails.
   * Returns scored results above the minimum confidence threshold.
   *
   * @returns {Promise<Array<{
   *   messageId: string,
   *   subject: string,
   *   snippet: string,
   *   from: string,
   *   senderEmail: string,
   *   senderDomain: string,
   *   companyName: string,
   *   score: number,
   *   matchedKeywords: string[],
   *   extractedDate: string | null,
   *   extractedTime: string | null,
   *   extractedDuration: number | null,
   *   intent: 'add' | 'cancel' | 'update',
   * }>>}
   */
  async function scanForInterviews() {
    const query = buildSearchQuery(lookbackDays);

    let messageIds;
    try {
      const listResponse = await gmailApi.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 20,
      });
      messageIds = (listResponse.data.messages || []).map((m) => m.id);
    } catch (err) {
      if (err.code === 401 || err.code === 403) {
        throw new Error('Gmail access denied. Please re-authenticate.');
      }
      throw err;
    }

    if (messageIds.length === 0) {
      return [];
    }

    // Fetch full message content concurrently.
    // Using format 'full' instead of 'metadata' gives us the email body,
    // which is needed for reliable date/time/duration extraction — the
    // snippet (~200 chars) often truncates this information.
    const messagePromises = messageIds.map((id) =>
      gmailApi.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      })
    );

    const messageResponses = await Promise.allSettled(messagePromises);

    const results = [];

    for (const response of messageResponses) {
      if (response.status !== 'fulfilled') continue;

      const message = response.value.data;
      const { subject, snippet, from, messageId } = parseGmailMessage(message);
      const senderEmail = extractEmailFromHeader(from);
      const senderDomain = extractDomain(senderEmail);

      const combinedText = `${subject} ${snippet}`;
      const companyName = extractCompanyNameFromText(combinedText) || extractCompanyFromDomain(senderDomain);
      const { score, matchedKeywords } = scoreEmailForInterview(subject, snippet, senderEmail);

      // Extract date/time/duration from the full email body when available.
      // The snippet (~200 chars) often truncates this information, causing
      // both missed durations and lower cross-reference confidence.
      const bodyText = extractPlainTextBody(message);
      const dateTimeSource = bodyText ? `${subject} ${bodyText}` : combinedText;
      const { date, time, duration } = extractDateTimeFromText(dateTimeSource);

      // Classify the email's purpose — invitation, cancellation, or reschedule
      const intent = detectEmailIntent(subject, bodyText || snippet);

      if (score >= minScore) {
        results.push({
          messageId,
          subject,
          snippet,
          from,
          senderEmail,
          senderDomain,
          companyName,
          score,
          matchedKeywords,
          extractedDate: date,
          extractedTime: time,
          extractedDuration: duration,
          intent,
        });
      }
    }

    // Sort by score descending (most confident first)
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  return { scanForInterviews };
}
