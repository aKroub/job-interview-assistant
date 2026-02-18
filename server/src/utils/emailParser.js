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

  // Check if sender is from a noise domain — heavily penalise
  const isNoise = NOISE_DOMAINS.some((nd) => domain.includes(nd));
  if (isNoise) {
    return { score: 0.1, matchedKeywords: [] };
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
  const isRecruiting = RECRUITING_DOMAINS.some((rd) => domain.includes(rd));
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
 * Attempts to extract a date and time from email text.
 * Looks for common date/time patterns in the subject and body.
 *
 * @param {string} text - combined subject + body text
 * @returns {{ date: string | null, time: string | null }} - ISO date (YYYY-MM-DD) and time (HH:mm) if found
 */
export function extractDateTimeFromText(text) {
  if (!text || typeof text !== 'string') return { date: null, time: null };

  let date = null;
  let time = null;

  // Month name → zero-based index lookup (avoids timezone issues with Date constructor)
  const MONTH_MAP = {
    january: '01', jan: '01', february: '02', feb: '02', march: '03', mar: '03',
    april: '04', apr: '04', may: '05', june: '06', jun: '06',
    july: '07', jul: '07', august: '08', aug: '08', september: '09', sep: '09',
    october: '10', oct: '10', november: '11', nov: '11', december: '12', dec: '12',
  };

  // Match patterns like "January 15, 2025" or "Jan 15 2025"
  const monthNamePattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2}),?\s*(\d{4})\b/i;
  const monthMatch = text.match(monthNamePattern);
  if (monthMatch) {
    const mm = MONTH_MAP[monthMatch[1].toLowerCase()];
    const dd = monthMatch[2].padStart(2, '0');
    const yyyy = monthMatch[3];
    if (mm) {
      date = `${yyyy}-${mm}-${dd}`;
    }
  }

  // Match patterns like "2025-01-15" or "01/15/2025"
  if (!date) {
    const isoPattern = /\b(\d{4})-(\d{2})-(\d{2})\b/;
    const isoMatch = text.match(isoPattern);
    if (isoMatch) {
      date = isoMatch[0];
    }
  }

  if (!date) {
    const slashPattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
    const slashMatch = text.match(slashPattern);
    if (slashMatch) {
      const parsed = new Date(`${slashMatch[3]}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`);
      if (!isNaN(parsed.getTime())) {
        date = parsed.toISOString().split('T')[0];
      }
    }
  }

  // Match time patterns like "2:30 PM", "14:30", "2:30pm"
  const timePattern = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i;
  const timeMatch = text.match(timePattern);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2];
    const ampm = (timeMatch[3] || '').toLowerCase();

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    time = `${String(hours).padStart(2, '0')}:${minutes}`;
  }

  return { date, time };
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
