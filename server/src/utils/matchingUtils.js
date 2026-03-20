/**
 * Pure utility functions for matching and cross-referencing interview signals
 * from Gmail and Google Calendar. No side effects, no I/O.
 */

import { normalizeCompanyName, SCHEDULING_PLATFORM_DOMAINS } from './emailParser.js';

/**
 * Keywords that indicate a calendar event is likely an interview.
 * Checked against event summary (title) and description.
 */
const INTERVIEW_KEYWORDS = [
  'interview',
  'technical screen',
  'phone screen',
  'coding challenge',
  'technical assessment',
  'hiring manager',
  'recruiter call',
  'culture fit',
  'system design',
  'onsite',
  'on-site',
  'hr',
  'panel interview',
];

/**
 * Typical interview durations in minutes.
 * Events outside this range are less likely to be interviews.
 */
const MIN_INTERVIEW_DURATION_MINS = 15;
const MAX_INTERVIEW_DURATION_MINS = 480;

/**
 * Checks if a calendar event title or description contains interview-related keywords.
 *
 * @param {string} summary - event title / summary
 * @param {string} description - event description (may be HTML or plain text)
 * @returns {{ isMatch: boolean, matchedKeywords: string[] }}
 */
export function matchesInterviewKeywords(summary, description) {
  const combined = `${(summary || '').toLowerCase()} ${(description || '').toLowerCase()}`;
  const matchedKeywords = [];

  for (const kw of INTERVIEW_KEYWORDS) {
    if (combined.includes(kw)) {
      matchedKeywords.push(kw);
    }
  }

  return { isMatch: matchedKeywords.length > 0, matchedKeywords };
}

/**
 * Checks if an event's duration falls within typical interview length.
 *
 * @param {string} startIso - ISO 8601 datetime string
 * @param {string} endIso - ISO 8601 datetime string
 * @returns {boolean}
 */
export function isTypicalInterviewDuration(startIso, endIso) {
  if (!startIso || !endIso) return false;

  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();

  if (isNaN(startMs) || isNaN(endMs)) return false;

  const durationMins = (endMs - startMs) / (1000 * 60);
  return durationMins >= MIN_INTERVIEW_DURATION_MINS && durationMins <= MAX_INTERVIEW_DURATION_MINS;
}

/**
 * Checks if the event organizer is external (different domain than the user).
 * External organizers are more likely to be sending interview invitations.
 *
 * @param {string} organizerEmail - the event organizer's email
 * @param {string} userEmail - the authenticated user's email
 * @returns {boolean}
 */
export function isExternalOrganizer(organizerEmail, userEmail) {
  if (!organizerEmail || !userEmail) return false;

  const orgDomain = organizerEmail.split('@')[1]?.toLowerCase();
  const userDomain = userEmail.split('@')[1]?.toLowerCase();

  if (!orgDomain || !userDomain) return false;

  return orgDomain !== userDomain;
}

/**
 * Checks if a calendar event is recurring (e.g. weekly standup).
 * Recurring events are unlikely to be interviews.
 *
 * @param {Object} event - Google Calendar event resource
 * @returns {boolean}
 */
export function isRecurringEvent(event) {
  return !!(event.recurringEventId || event.recurrence);
}

/**
 * Computes a confidence score for a calendar event being an interview.
 *
 * @param {Object} event - Google Calendar event resource
 * @param {string} userEmail - the authenticated user's email
 * @returns {{ score: number, matchedKeywords: string[], reasons: string[] }}
 */
export function scoreCalendarEvent(event, userEmail) {
  const summary = event.summary || '';
  const description = event.description || '';
  const organizerEmail = event.organizer?.email || '';
  const startTime = event.start?.dateTime || '';
  const endTime = event.end?.dateTime || '';

  const reasons = [];
  let score = 0;

  // Recurring events are almost never interviews
  if (isRecurringEvent(event)) {
    return { score: 0.05, matchedKeywords: [], reasons: ['recurring-event'] };
  }

  // Keyword matching (strongest signal)
  const { isMatch, matchedKeywords } = matchesInterviewKeywords(summary, description);
  if (isMatch) {
    // Keywords in title are worth more than in description
    const titleKeywords = matchedKeywords.filter((kw) => summary.toLowerCase().includes(kw));
    score += titleKeywords.length > 0 ? 0.4 : 0.25;
    reasons.push('keyword-match');
  }

  // External organizer bonus
  if (isExternalOrganizer(organizerEmail, userEmail)) {
    score += 0.2;
    reasons.push('external-organizer');
  }

  // Typical interview duration bonus
  if (isTypicalInterviewDuration(startTime, endTime)) {
    score += 0.1;
    reasons.push('typical-duration');
  }

  // Video conferencing link bonus
  const hasVideoLink = !!(
    event.hangoutLink ||
    event.conferenceData ||
    (description && (
      description.toLowerCase().includes('zoom.us') ||
      description.toLowerCase().includes('teams.microsoft.com') ||
      description.toLowerCase().includes('meet.google.com')
    ))
  );
  if (hasVideoLink) {
    score += 0.1;
    reasons.push('video-link');
  }

  // Self-organized events are unlikely interviews
  if (organizerEmail && userEmail &&
      organizerEmail.toLowerCase() === userEmail.toLowerCase()) {
    score = Math.max(score - 0.3, 0);
    reasons.push('self-organized');
  }

  return { score: Math.min(score, 1.0), matchedKeywords, reasons };
}

/**
 * Checks if a Gmail result and a calendar scan result are about the same interview.
 * Matches by domain overlap, company name, and date proximity.
 *
 * Scheduling platform organizer domains (e.g. group.calendar.google.com,
 * comeet-notifications.com) are excluded from domain matching to prevent
 * false positives.
 *
 * @param {Object} emailResult - result from gmailService.scanForInterviews()
 * @param {Object} calendarResult - result from calendarService.scanForInterviews() (flattened shape)
 * @returns {{ isMatch: boolean, confidence: number }}
 */
export function crossReferenceEmailAndEvent(emailResult, calendarResult) {
  const eventOrganizerDomain = (calendarResult.organizerEmail || '').split('@')[1]?.toLowerCase() || '';
  const emailDomain = (emailResult.senderDomain || '').toLowerCase();

  // Skip domain matching when the calendar organizer is a scheduling platform —
  // these domains (e.g. group.calendar.google.com) never match the company's domain.
  const isSchedulingPlatform = SCHEDULING_PLATFORM_DOMAINS.some(
    (pd) => eventOrganizerDomain === pd || eventOrganizerDomain.endsWith('.' + pd)
  );

  // Domain match — exact or subdomain relationship only (not substring)
  const domainMatch = !isSchedulingPlatform &&
    eventOrganizerDomain && emailDomain &&
    (eventOrganizerDomain === emailDomain ||
     eventOrganizerDomain.endsWith('.' + emailDomain) ||
     emailDomain.endsWith('.' + eventOrganizerDomain));

  // Date match — email mentions a date that matches the event date
  const eventDate = calendarResult.date || (calendarResult.startDateTime || '').slice(0, 10);
  const emailDate = emailResult.extractedDate || '';
  const dateMatch = eventDate && emailDate && eventDate === emailDate;

  // Company name match — compare email companyName vs calendar companyName
  const emailCompany = normalizeCompanyName(emailResult.companyName || '');
  const calendarCompany = normalizeCompanyName(calendarResult.companyName || '');
  const companyNameMatch = emailCompany && calendarCompany &&
    (emailCompany === calendarCompany ||
     emailCompany.includes(calendarCompany) ||
     calendarCompany.includes(emailCompany));

  // Time match — email-extracted time matches the calendar event time
  const emailTime = emailResult.extractedTime || '';
  const eventTime = calendarResult.time || '';
  const timeMatch = emailTime && eventTime && emailTime === eventTime;

  // Scoring tiers (descending confidence):
  if (domainMatch && dateMatch && timeMatch) {
    return { isMatch: true, confidence: 0.97 };
  }
  if (domainMatch && dateMatch) {
    return { isMatch: true, confidence: 0.95 };
  }
  if (companyNameMatch && dateMatch && timeMatch) {
    return { isMatch: true, confidence: 0.93 };
  }
  if (companyNameMatch && dateMatch) {
    return { isMatch: true, confidence: 0.9 };
  }
  if (dateMatch && timeMatch) {
    return { isMatch: true, confidence: 0.75 };
  }
  if (domainMatch) {
    return { isMatch: true, confidence: 0.7 };
  }
  if (companyNameMatch) {
    return { isMatch: true, confidence: 0.65 };
  }
  if (dateMatch) {
    return { isMatch: true, confidence: 0.5 };
  }

  return { isMatch: false, confidence: 0 };
}
