/**
 * Pure utility functions for parsing interview-related data from email content.
 * No side effects, no I/O — all functions take input and return output.
 */

/**
 * Keywords that strongly suggest an email is about a job interview.
 * Ordered roughly by specificity (most specific first).
 */
const STRONG_KEYWORDS = [
  'interview invitation',
  'interview scheduled',
  'interview confirmation',
  'technical interview',
  'phone screen',
  'phone interview',
  'video interview',
  'onsite interview',
  'on-site interview',
  'coding challenge',
  'technical assessment',
  'hiring manager',
  'recruiter',
];

/**
 * Keywords that weakly suggest an email is interview-related.
 * These alone are not enough — they need additional context.
 */
const WEAK_KEYWORDS = [
  'interview',
  'schedule',
  'assessment',
  'candidate',
  'position',
  'role',
  'application',
];

/**
 * Domains commonly used by job boards and recruiting platforms.
 * Emails from these domains are more likely interview-related.
 */
const RECRUITING_DOMAINS = [
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'workday.com',
  'icims.com',
  'smartrecruiters.com',
  'myworkday.com',
  'breezy.hr',
  'recruiterbox.com',
  'jazz.co',
  'comeet-notifications.com',
  'comeet.co',
  'calendly.com',
  'goodtime.io',
  'modernloop.io',
  'prelude.co',
  'resource.io',
  'sparkhire.com',
];

/**
 * Domains used by scheduling platforms to organize calendar events
 * on behalf of hiring companies. The organizer email domain will NOT
 * match the company's actual domain, so domain matching should be skipped.
 */
export const SCHEDULING_PLATFORM_DOMAINS = [
  'calendar.google.com',
  'group.calendar.google.com',
  'comeet-notifications.com',
  'comeet.co',
  'calendly.com',
  'goodtime.io',
  'modernloop.io',
  'prelude.co',
  'resource.io',
];

/**
 * Multi-word phrases that indicate an interview has been cancelled.
 * Checked against the combined subject + body text.
 * Uses partial stems (e.g. "cancel" not "cancelled") to match both
 * US and UK spellings (cancelled/canceled).
 */
const CANCEL_PHRASES = [
  'interview has been cancel',
  'interview is cancel',
  'interview was cancel',
  'interview cancellation',
  'cancel your interview',
  'cancelled event',
  'canceled event',
  'cancellation notice',
  'cancellation',
  'no longer moving forward',
  'position has been filled',
  'decided not to proceed',
  'regret to inform',
  'we will not be moving forward',
  'will not be proceeding',
  'not moving forward with your',
  'withdraw',
];

/**
 * Keywords that indicate an interview has been rescheduled or updated.
 * Checked against the combined subject + body text.
 */
const UPDATE_PHRASES = [
  'rescheduled',
  'reschedule',
  'new time',
  'updated time',
  'moved to',
  'changed to',
  'new date',
  'time has been changed',
  'date has been changed',
  'interview has been updated',
  'interview has been moved',
];

/**
 * Domains that send non-interview emails matching interview keywords.
 * Emails from these are likely newsletters or marketing, not real invitations.
 */
const NOISE_DOMAINS = [
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'noreply',
  'newsletter',
  'marketing',
  'notifications',
];

/**
 * Extracts the domain from an email address.
 *
 * @param {string} email - e.g. "recruiter@google.com"
 * @returns {string} - e.g. "google.com", or empty string if invalid
 */
export function extractDomain(email) {
  if (!email || typeof email !== 'string') return '';
  const match = email.match(/@([a-zA-Z0-9.-]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Extracts the company name from a sender's email domain.
 * Strips common TLDs and subdomains to get the core company name.
 *
 * @param {string} domain - e.g. "mail.google.com"
 * @returns {string} - e.g. "google"
 */
export function extractCompanyFromDomain(domain) {
  if (!domain || typeof domain !== 'string') return '';
  const parts = domain.toLowerCase().split('.');
  // Remove TLD and common subdomains
  const filtered = parts.filter(
    (p) => !['com', 'org', 'net', 'io', 'co', 'ai', 'dev', 'mail', 'smtp', 'email', 'hr', 'jobs', 'recruit'].includes(p)
  );
  // Take the most significant part (usually the company name)
  return filtered.length > 0 ? filtered[filtered.length - 1] : parts[0] || '';
}

/**
 * Computes a confidence score (0–1) indicating how likely an email is
 * about a job interview based on its subject and body text.
 *
 * @param {string} subject - email subject line
 * @param {string} body - email body text (plain text, not HTML)
 * @param {string} senderEmail - sender's email address
 * @returns {{ score: number, matchedKeywords: string[] }}
 */
export function scoreEmailForInterview(subject, body, senderEmail) {
  const subjectLower = (subject || '').toLowerCase();
  const bodyLower = (body || '').toLowerCase();
  const combined = `${subjectLower} ${bodyLower}`;
  const domain = extractDomain(senderEmail);

  const matchedKeywords = [];
  let score = 0;

  // Check recruiting platforms BEFORE noise domains — a domain like
  // comeet-notifications.com contains "notifications" which is in NOISE_DOMAINS,
  // but it's a legitimate scheduling platform, not noise.
  const isRecruiting = RECRUITING_DOMAINS.some((rd) => domain.includes(rd));

  // Check if sender is from a noise domain — heavily penalise
  // (skip this check if the sender is a known recruiting platform)
  if (!isRecruiting) {
    const isNoise = NOISE_DOMAINS.some((nd) => domain.includes(nd));
    if (isNoise) {
      return { score: 0.1, matchedKeywords: [] };
    }
  }

  // Strong keywords in subject are worth more
  for (const kw of STRONG_KEYWORDS) {
    if (subjectLower.includes(kw)) {
      score += 0.25;
      matchedKeywords.push(kw);
    } else if (bodyLower.includes(kw)) {
      score += 0.15;
      matchedKeywords.push(kw);
    }
  }

  // Weak keywords contribute less
  for (const kw of WEAK_KEYWORDS) {
    if (combined.includes(kw) && !matchedKeywords.includes(kw)) {
      score += 0.05;
      matchedKeywords.push(kw);
    }
  }

  // Bonus: sender is from a known recruiting platform
  if (isRecruiting) {
    score += 0.2;
    matchedKeywords.push(`recruiting-platform:${domain}`);
  }

  // Bonus: email mentions specific interview types
  if (combined.includes('zoom') || combined.includes('google meet') || combined.includes('teams meeting')) {
    score += 0.1;
    matchedKeywords.push('video-link');
  }

  // Bonus: mentions a specific date/time pattern
  if (/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(combined) || /\b\d{1,2}:\d{2}\s*(am|pm)?\b/i.test(combined)) {
    score += 0.1;
    matchedKeywords.push('date-time-mention');
  }

  // Cap at 1.0
  return { score: Math.min(score, 1.0), matchedKeywords };
}

/**
 * Converts a regex time match into an HH:mm string.
 *
 * @param {RegExpMatchArray} match - a match from the time pattern regex
 * @returns {string} time in HH:mm format
 */
function parseTimeMatch(match) {
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = (match[3] || '').toLowerCase();

  if (ampm === 'pm' && hours < 12) hours += 12;
  if (ampm === 'am' && hours === 12) hours = 0;

  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

/**
 * Converts an HH:mm time string to total minutes since midnight.
 *
 * @param {string} timeStr - time in HH:mm format
 * @returns {number} minutes since midnight
 */
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Checks whether two adjacent time matches form a time range
 * (e.g. "11:30 until 11:45") rather than a rescheduling pattern
 * (e.g. "Originally 2:00 PM, changed to 3:30 PM").
 *
 * @param {string} fullText - the full text being parsed
 * @param {RegExpMatchArray} firstMatch - the earlier time match
 * @param {RegExpMatchArray} secondMatch - the later time match
 * @returns {{ startTime: string, duration: number } | null}
 *          non-null when a valid range is detected
 */
function detectTimeRange(fullText, firstMatch, secondMatch) {
  const startTime = parseTimeMatch(firstMatch);
  const endTime = parseTimeMatch(secondMatch);

  // End time must be after start time for a valid same-day range
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (endMinutes <= startMinutes) return null;

  // Extract the text between the two time matches
  const betweenStart = firstMatch.index + firstMatch[0].length;
  const betweenEnd = secondMatch.index;
  const between = fullText.slice(betweenStart, betweenEnd);

  // Check for rescheduling keywords — if present, this is NOT a range.
  // Look both between the two times AND in a short window before the first
  // time, because phrases like "moved from 2:00 PM to 4:00 PM" place the
  // rescheduling keyword before the range, not inside it.
  const reschedulePattern = /\b(changed|rescheduled|moved|updated|originally|previously|was|now)\b/i;
  const beforeFirst = fullText.slice(Math.max(0, firstMatch.index - 30), firstMatch.index);
  if (reschedulePattern.test(between) || reschedulePattern.test(beforeFirst)) return null;

  // Check for range connectors — the connector must be the only content
  // between the two times (aside from whitespace) to avoid false positives
  const rangeConnectorPattern = /^\s*(?:to|until|till|[-\u2013\u2014])\s*$/i;
  if (!rangeConnectorPattern.test(between)) return null;

  const duration = endMinutes - startMinutes;
  return { startTime, duration };
}

/**
 * Attempts to extract a date, time, and duration from email text.
 * Looks for common date/time patterns in the subject and body.
 * When multiple dates are found, returns the LAST one (for rescheduled emails).
 * When exactly two times are found with a range connector between them
 * (e.g. "11:30 until 11:45", "2:00-2:45 PM"), returns the FIRST time
 * as the start and computes the duration in minutes.
 * When two times appear without a range connector (rescheduling),
 * returns the LAST time and duration = null.
 *
 * @param {string} text - combined subject + body text
 * @returns {{ date: string | null, time: string | null, duration: number | null }}
 */
export function extractDateTimeFromText(text) {
  if (!text || typeof text !== 'string') return { date: null, time: null, duration: null };

  let date = null;
  let time = null;
  let duration = null;

  // Month name → zero-based index lookup (avoids timezone issues with Date constructor)
  const MONTH_MAP = {
    january: '01', jan: '01', february: '02', feb: '02', march: '03', mar: '03',
    april: '04', apr: '04', may: '05', june: '06', jun: '06',
    july: '07', jul: '07', august: '08', aug: '08', september: '09', sep: '09',
    october: '10', oct: '10', november: '11', nov: '11', december: '12', dec: '12',
  };

  // Match patterns like "January 15, 2025" or "Jan 15 2025" — use LAST match
  const monthNamePattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2}),?\s*(\d{4})\b/gi;
  const monthMatches = Array.from(text.matchAll(monthNamePattern));
  if (monthMatches.length > 0) {
    const lastMatch = monthMatches[monthMatches.length - 1];
    const mm = MONTH_MAP[lastMatch[1].toLowerCase()];
    const dd = lastMatch[2].padStart(2, '0');
    const yyyy = lastMatch[3];
    if (mm) {
      date = `${yyyy}-${mm}-${dd}`;
    }
  }

  // Match patterns like "2025-01-15" — use LAST match
  if (!date) {
    const isoPattern = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    const isoMatches = Array.from(text.matchAll(isoPattern));
    if (isoMatches.length > 0) {
      const lastMatch = isoMatches[isoMatches.length - 1];
      date = lastMatch[0];
    }
  }

  // Match patterns like "01/15/2025" — use LAST match
  if (!date) {
    const slashPattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
    const slashMatches = Array.from(text.matchAll(slashPattern));
    if (slashMatches.length > 0) {
      const lastMatch = slashMatches[slashMatches.length - 1];
      const parsed = new Date(`${lastMatch[3]}-${lastMatch[1].padStart(2, '0')}-${lastMatch[2].padStart(2, '0')}`);
      if (!isNaN(parsed.getTime())) {
        date = parsed.toISOString().split('T')[0];
      }
    }
  }

  // Match time patterns like "2:30 PM", "14:30", "2:30pm"
  const timePattern = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/gi;
  const timeMatches = Array.from(text.matchAll(timePattern));

  if (timeMatches.length >= 2) {
    // Check ALL consecutive pairs from the end, stopping at the first valid
    // range.  This handles cases like "3:15 PM - 4:45 PM. Please arrive by
    // 3:00 PM" where the last two times do NOT form a range but an earlier
    // pair does.
    for (let i = timeMatches.length - 1; i >= 1; i--) {
      const rangeResult = detectTimeRange(text, timeMatches[i - 1], timeMatches[i]);
      if (rangeResult) {
        time = rangeResult.startTime;
        duration = rangeResult.duration;
        break;
      }
    }
    if (!duration) {
      // No valid range found — rescheduling or unrelated; use last time
      time = parseTimeMatch(timeMatches[timeMatches.length - 1]);
    }
  } else if (timeMatches.length === 1) {
    time = parseTimeMatch(timeMatches[0]);
  }

  return { date, time, duration };
}

/**
 * Extracts the decoded subject and snippet from a Gmail message payload.
 *
 * @param {Object} message - Gmail API message resource
 * @returns {{ subject: string, snippet: string, from: string, messageId: string }}
 */
export function parseGmailMessage(message) {
  const headers = message.payload?.headers || [];
  const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '';
  const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value || '';
  const snippet = message.snippet || '';
  const messageId = message.id || '';

  return { subject, snippet, from, messageId };
}

/**
 * Extracts the email address from a "From" header value.
 * Handles formats like "John Doe <john@example.com>" and plain "john@example.com".
 *
 * @param {string} fromHeader - the From header value
 * @returns {string} - the email address, or the original string if no match
 */
export function extractEmailFromHeader(fromHeader) {
  if (!fromHeader || typeof fromHeader !== 'string') return '';
  const match = fromHeader.match(/<([^>]+)>/);
  return match ? match[1] : fromHeader.trim();
}

/**
 * Extracts a company name from free-form text (calendar title, email subject, etc.)
 * by matching common patterns like "Interview with {Company}" or "{Company} Interview Confirmation".
 *
 * @param {string} text - free-form text to search for company names
 * @returns {string} lowercase company name, or empty string if none found
 */
export function extractCompanyNameFromText(text) {
  if (!text || typeof text !== 'string') return '';

  // COMPANY_TAIL — for patterns where the company name is the LAST capture
  // (nothing follows it in the regex). Uses lazy matching + a lookahead to
  // stop at punctuation, end-of-string, or common English stop words.
  // This prevents the capture from absorbing entire sentences when subject
  // and snippet are concatenated.
  const TAIL = '([a-z0-9][a-z0-9 ._-]*?[a-z0-9])(?=\\s*[,!?.:;\\n\\r()\\[\\]{}|]|\\s*$|\\s+(?:for|on|in|via|from|to|we|you|your|is|are|has|have|had|will|would|this|that|the|a|an|i|hi|hello|dear|regarding|about|please|just|and|or|but|so|if|at|with|by)\\b)';

  // COMPANY_HEAD — for patterns where the company name is followed by more
  // regex (e.g. "Interview Confirmation"). Uses the original greedy match
  // because the following pattern naturally stops the capture.
  const HEAD = '([a-z0-9][a-z0-9 ._-]*[a-z0-9])';

  const patterns = [
    // "on behalf of Dream" — recruiting platforms (e.g. Spark Hire) send emails
    // on behalf of the hiring company. Checked first to avoid false matches
    // from "interview ... with {PersonName}" crossing subject–snippet boundaries.
    new RegExp(`on\\s+behalf\\s+of\\s+${TAIL}`, 'i'),
    // "Interview for the ... role at Dream", "interview scheduled with Google" (any words between keyword and preposition)
    new RegExp(`(?:interview|meeting|call|chat|screen)\\s+.+?\\s+(?:with|at)\\s+${TAIL}`, 'i'),
    // "interview with Torq", "meeting with Pango", "call with Google"
    new RegExp(`(?:interview|meeting|call|chat|screen)\\s+(?:with|at)\\s+${TAIL}`, 'i'),
    // "Torq Interview Confirmation", "SentinelOne Interview Scheduled"
    new RegExp(`${HEAD}\\s+interview\\s+(?:confirmation|scheduled|invitation)`, 'i'),
    // "Torq - Interview" or "Interview - Torq"
    new RegExp(`${HEAD}\\s+[-\u2013\u2014]\\s+(?:interview|technical screen|phone screen)`, 'i'),
    new RegExp(`(?:interview|technical screen|phone screen)\\s+[-\u2013\u2014]\\s+${TAIL}`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim()
        .replace(/\s+(team|group|ltd|inc|corp|llc|gmbh)$/i, '')
        .trim();
      if (candidate.length >= 2) {
        return candidate.toLowerCase();
      }
    }
  }

  return '';
}

/**
 * Normalizes a company name for comparison purposes.
 * Collapses separators, strips common suffixes, and lowercases.
 *
 * @param {string} name - company name from any source
 * @returns {string} normalized lowercase name for comparison
 */
export function normalizeCompanyName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[.\-_\s]+/g, '')
    .replace(/(inc|ltd|corp|llc|gmbh|co)$/, '')
    .trim();
}

/**
 * Extracts the plain-text body from a Gmail API message fetched with
 * `format: 'full'`. Recursively searches the MIME tree for a `text/plain`
 * part and base64url-decodes its content.
 *
 * @param {Object} message - Gmail API message resource (format: 'full')
 * @returns {string} decoded plain-text body, or empty string if none found
 */
export function extractPlainTextBody(message) {
  const payload = message?.payload;
  if (!payload) return '';

  /**
   * Recursively find the first text/plain part in the MIME tree.
   *
   * @param {Object} part - a MIME part node
   * @returns {string | null} base64url-encoded data, or null
   */
  function findPlainText(part) {
    if (!part) return null;

    if (part.mimeType === 'text/plain' && part.body?.data) {
      return part.body.data;
    }

    if (part.parts) {
      for (const child of part.parts) {
        const found = findPlainText(child);
        if (found) return found;
      }
    }

    return null;
  }

  const encoded = findPlainText(payload);
  if (!encoded) return '';

  return Buffer.from(encoded, 'base64url').toString('utf-8');
}

/**
 * Detects the intent of an interview-related email by scanning for
 * cancellation and rescheduling phrases.
 *
 * Priority: cancel > update > add.
 * Cancel phrases are checked first because an email that says
 * "your interview has been cancelled — we will reschedule" should
 * be treated as a cancellation, not an update.
 *
 * @param {string} subject - email subject line
 * @param {string} body - email body text (plain text preferred)
 * @returns {'add' | 'cancel' | 'update'}
 */
export function detectEmailIntent(subject, body) {
  const subjectLower = (subject || '').toLowerCase();
  const bodyLower = (body || '').toLowerCase();
  const combined = `${subjectLower} ${bodyLower}`;

  for (const phrase of CANCEL_PHRASES) {
    if (combined.includes(phrase)) {
      return 'cancel';
    }
  }

  for (const phrase of UPDATE_PHRASES) {
    if (combined.includes(phrase)) {
      return 'update';
    }
  }

  return 'add';
}
